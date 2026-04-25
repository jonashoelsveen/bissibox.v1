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
const POLL_MAX_ATTEMPTS = 10;
const POLL_DELAY_MS = 3000;

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

async function pollAnalysis(
  apiKey: string,
  analysisId: string,
): Promise<{ status: ScanStatus; stats: VtAnalysisStats }> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${VT_BASE}/analyses/${analysisId}`, {
      headers: { "x-apikey": apiKey },
    });
    if (!res.ok) {
      await new Promise((r) => setTimeout(r, POLL_DELAY_MS));
      continue;
    }
    const json = (await res.json()) as {
      data?: { attributes?: { status?: string; stats?: VtAnalysisStats } };
    };
    const status = json.data?.attributes?.status;
    const stats = json.data?.attributes?.stats ?? {};
    if (status === "completed") {
      const malicious = stats.malicious ?? 0;
      return { status: malicious > 0 ? "infected" : "safe", stats };
    }
    await new Promise((r) => setTimeout(r, POLL_DELAY_MS));
  }
  return { status: "pending", stats: {} };
}

interface ScanInput {
  kind: ScanKind;
  id: string;
}

export const scanFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ScanInput) => {
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
    const table = isFile ? "files" : "media_items";
    const bucket = isFile ? "documents" : "media";

    // Load row (RLS ensures the user owns it)
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

    if (rowErr || !row) {
      throw new Error(rowErr?.message ?? "Item not found");
    }
    if (row.user_id !== userId) {
      throw new Error("Forbidden");
    }

    const displayName = row.file_name ?? row.storage_path.split("/").pop() ?? "upload";

    // Mark pending
    await supabaseAdmin
      .from(table)
      .update({ scan_status: "pending" as never })
      .eq("id", row.id);

    try {
      const { data: blob, error: dlErr } = await supabaseAdmin.storage
        .from(bucket)
        .download(row.storage_path);

      if (dlErr || !blob) {
        throw new Error(dlErr?.message ?? "Failed to download");
      }

      const analysisId = await uploadToVirusTotal(apiKey, blob, displayName);
      const result = await pollAnalysis(apiKey, analysisId);

      await supabaseAdmin
        .from(table)
        .update({
          scan_status: result.status as never,
          scanned_at: new Date().toISOString() as never,
          scan_details: {
            provider: "virustotal",
            analysis_id: analysisId,
            stats: result.stats as Record<string, number>,
          } as never,
        })
        .eq("id", row.id);

      return { status: result.status, stats: result.stats };
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
