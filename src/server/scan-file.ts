import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type ScanStatus = "pending" | "safe" | "infected" | "error";

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
  const analysisId = json?.data?.id;
  if (!analysisId) throw new Error("VirusTotal did not return an analysis id");
  return analysisId;
}

async function pollAnalysis(
  apiKey: string,
  analysisId: string,
): Promise<{ status: ScanStatus; stats: VtAnalysisStats; raw: unknown }> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${VT_BASE}/analyses/${analysisId}`, {
      headers: { "x-apikey": apiKey },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`VirusTotal poll failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as {
      data?: { attributes?: { status?: string; stats?: VtAnalysisStats } };
    };
    const status = json?.data?.attributes?.status;
    const stats = json?.data?.attributes?.stats ?? {};

    if (status === "completed") {
      const malicious = stats.malicious ?? 0;
      const suspicious = stats.suspicious ?? 0;
      const verdict: ScanStatus =
        malicious > 0 || suspicious > 0 ? "infected" : "safe";
      return { status: verdict, stats, raw: json };
    }

    await new Promise((r) => setTimeout(r, POLL_DELAY_MS));
  }
  return { status: "pending", stats: {}, raw: null };
}

export const scanFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileId: string }) => {
    if (!input?.fileId || typeof input.fileId !== "string") {
      throw new Error("fileId is required");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env.VIRUSTOTAL_API_KEY;
    if (!apiKey) throw new Error("VIRUSTOTAL_API_KEY is not configured");

    const { userId } = context;

    // Load the file row (RLS ensures the user owns it)
    const { data: fileRow, error: fileErr } = await context.supabase
      .from("files")
      .select("id, user_id, storage_path, file_name")
      .eq("id", data.fileId)
      .single();

    if (fileErr || !fileRow) {
      throw new Error(fileErr?.message ?? "File not found");
    }
    if (fileRow.user_id !== userId) {
      throw new Error("Forbidden");
    }

    // Mark pending
    await supabaseAdmin
      .from("files")
      .update({ scan_status: "pending" })
      .eq("id", fileRow.id);

    try {
      // Download file via admin client (bucket is private)
      const { data: blob, error: dlErr } = await supabaseAdmin.storage
        .from("documents")
        .download(fileRow.storage_path);

      if (dlErr || !blob) {
        throw new Error(dlErr?.message ?? "Failed to download file");
      }

      const analysisId = await uploadToVirusTotal(
        apiKey,
        blob,
        fileRow.file_name,
      );
      const result = await pollAnalysis(apiKey, analysisId);

      await supabaseAdmin
        .from("files")
        .update({
          scan_status: result.status,
          scanned_at: new Date().toISOString(),
          scan_details: {
            provider: "virustotal",
            analysis_id: analysisId,
            stats: result.stats as Record<string, number>,
          } as never,
        })
        .eq("id", fileRow.id);

      return { status: result.status, stats: result.stats };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from("files")
        .update({
          scan_status: "error",
          scanned_at: new Date().toISOString(),
          scan_details: { provider: "virustotal", error: message },
        })
        .eq("id", fileRow.id);
      throw new Error(message);
    }
  });
