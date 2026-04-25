import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type ScanStatus = "pending" | "safe" | "infected" | "error";
type ScanKind = "file" | "media";

interface VtAnalysisStats {
  malicious?: number;
  suspicious?: number;
  harmless?: number;
  undetected?: number;
  timeout?: number;
  failure?: number;
  "type-unsupported"?: number;
}

const VT_BASE = "https://www.virustotal.com/api/v3";
// Module re-exports: scanFile, pollScan

function tableFor(kind: ScanKind) {
  return kind === "file" ? "files" : "media_items";
}
function bucketFor(kind: ScanKind) {
  return kind === "file" ? "documents" : "media";
}

async function uploadToVirusTotal(
  apiKey: string,
  fileBlob: Blob,
  fileName: string,
): Promise<string> {
  const form = new FormData();
  form.append("file", fileBlob, fileName);
  const res = await fetch(`${VT_BASE}/files`, {
    method: "POST",
    headers: { "x-apikey": apiKey },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`VirusTotal upload failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { data?: { id?: string } };
  const id = json.data?.id;
  if (!id) throw new Error("VirusTotal returned no analysis id");
  return id;
}

/**
 * Submit a file/media item to VirusTotal and return immediately.
 * Stores the analysis_id on the row so pollScan can later check status.
 * Designed to finish within ~3-5s (single upload, no polling).
 */
export const scanFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: ScanKind; id: string }) => {
    if (!input?.id || typeof input.id !== "string") {
      throw new Error("id is required");
    }
    if (input.kind !== "file" && input.kind !== "media") {
      throw new Error("kind must be 'file' or 'media'");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env.VIRUSTOTAL_API_KEY;
    if (!apiKey) throw new Error("VIRUSTOTAL_API_KEY is not configured");

    const { userId } = context;
    const isFile = data.kind === "file";
    const table = tableFor(data.kind);
    const bucket = bucketFor(data.kind);

    const selectCols = isFile
      ? "id, user_id, storage_path, file_name"
      : "id, user_id, storage_path";

    const { data: row, error: rowErr } = await context.supabase
      .from(table)
      .select(selectCols)
      .eq("id", data.id)
      .single<{
        id: string;
        user_id: string;
        storage_path: string;
        file_name?: string;
      }>();

    if (rowErr || !row) throw new Error(rowErr?.message ?? "Item not found");
    if (row.user_id !== userId) throw new Error("Forbidden");

    const displayName =
      row.file_name ?? row.storage_path.split("/").pop() ?? "upload";

    // Mark pending up front
    await supabaseAdmin
      .from(table)
      .update({ scan_status: "pending" as never })
      .eq("id", row.id);

    try {
      const { data: blob, error: dlErr } = await supabaseAdmin.storage
        .from(bucket)
        .download(row.storage_path);
      if (dlErr || !blob) throw new Error(dlErr?.message ?? "Failed to download");

      const analysisId = await uploadToVirusTotal(apiKey, blob, displayName);

      await supabaseAdmin
        .from(table)
        .update({
          scan_status: "pending" as never,
          scan_details: {
            provider: "virustotal",
            analysis_id: analysisId,
            submitted_at: new Date().toISOString(),
          } as never,
        })
        .eq("id", row.id);

      return { status: "pending" as ScanStatus, analysisId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from(table)
        .update({
          scan_status: "error" as never,
          scanned_at: new Date().toISOString() as never,
          scan_details: { provider: "virustotal", error: message } as never,
        })
        .eq("id", row.id);
      throw new Error(message);
    }
  });

/**
 * Check the VirusTotal analysis status once and persist the outcome if ready.
 * Called by the client on a short interval until the row reaches a terminal state.
 */
export const pollScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: ScanKind; id: string }) => {
    if (!input?.id || typeof input.id !== "string") {
      throw new Error("id is required");
    }
    if (input.kind !== "file" && input.kind !== "media") {
      throw new Error("kind must be 'file' or 'media'");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env.VIRUSTOTAL_API_KEY;
    if (!apiKey) throw new Error("VIRUSTOTAL_API_KEY is not configured");

    const { userId } = context;
    const table = tableFor(data.kind);

    const { data: row, error: rowErr } = await context.supabase
      .from(table)
      .select("id, user_id, scan_status, scan_details")
      .eq("id", data.id)
      .single<{
        id: string;
        user_id: string;
        scan_status: ScanStatus;
        scan_details: { analysis_id?: string } | null;
      }>();

    if (rowErr || !row) throw new Error(rowErr?.message ?? "Item not found");
    if (row.user_id !== userId) throw new Error("Forbidden");

    // Already finalized
    if (row.scan_status === "safe" || row.scan_status === "infected" || row.scan_status === "error") {
      return { status: row.scan_status };
    }

    const analysisId = row.scan_details?.analysis_id;
    if (!analysisId) {
      return { status: "pending" as ScanStatus };
    }

    const res = await fetch(`${VT_BASE}/analyses/${analysisId}`, {
      headers: { "x-apikey": apiKey },
    });
    if (!res.ok) {
      return { status: "pending" as ScanStatus };
    }
    const json = (await res.json()) as {
      data?: { attributes?: { status?: string; stats?: VtAnalysisStats } };
    };
    const vtStatus = json.data?.attributes?.status;
    const stats = json.data?.attributes?.stats ?? {};

    if (vtStatus !== "completed") {
      return { status: "pending" as ScanStatus };
    }

    const malicious = stats.malicious ?? 0;
    const finalStatus: ScanStatus = malicious > 0 ? "infected" : "safe";

    await supabaseAdmin
      .from(table)
      .update({
        scan_status: finalStatus as never,
        scanned_at: new Date().toISOString() as never,
        scan_details: {
          provider: "virustotal",
          analysis_id: analysisId,
          stats: stats as Record<string, number>,
        } as never,
      })
      .eq("id", row.id);

    return { status: finalStatus, stats };
  });
