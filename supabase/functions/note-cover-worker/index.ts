// Drains the note_cover_jobs queue: analyses each note + attachments with
// Gemini, generates cover art with Nano Banana 2, uploads to Storage,
// and updates the note row.
//
// Triggered by pg_cron every minute. Idempotent.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const TEXT_MODEL = "google/gemini-3-flash-preview";
const IMAGE_MODEL = "google/gemini-3.1-flash-image-preview"; // Nano Banana 2

const MAX_JOBS_PER_RUN = 5;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface Job {
  id: string;
  note_id: string;
  user_id: string;
  team_id: string | null;
  attempts: number;
}

async function fetchAttachmentsAsParts(noteId: string) {
  const { data: atts } = await admin
    .from("note_attachments")
    .select("storage_path, mime_type, file_name")
    .eq("note_id", noteId)
    .limit(4);

  const parts: Array<{ type: string; image_url?: { url: string }; text?: string }> = [];
  if (!atts) return parts;

  for (const a of atts) {
    const mime = a.mime_type ?? "";
    if (!mime.startsWith("image/")) {
      parts.push({ type: "text", text: `Attached file: ${a.file_name}` });
      continue;
    }
    const { data, error } = await admin.storage
      .from("note-attachments")
      .download(a.storage_path);
    if (error || !data) continue;
    const buf = new Uint8Array(await data.arrayBuffer());
    // base64 encode
    let binary = "";
    for (let i = 0; i < buf.byteLength; i++) binary += String.fromCharCode(buf[i]);
    const b64 = btoa(binary);
    parts.push({ type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } });
  }
  return parts;
}

async function analyseNote(body: string, attachmentParts: Array<{ type: string; image_url?: { url: string }; text?: string }>): Promise<string> {
  const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    {
      type: "text",
      text: `Analyse this note and any attachments. Summarise the core visual theme into a single, 5-word descriptive noun phrase suitable for image generation (e.g. "vintage typewriter on wooden desk" or "geometric mountain landscape"). Reply with ONLY the phrase — no quotes, no punctuation.\n\nNOTE TEXT:\n${body.slice(0, 8000)}`,
    },
    ...attachmentParts,
  ];

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages: [
        { role: "system", content: "You are a precise visual concept extractor. Output exactly one short noun phrase (3-6 words). No preamble." },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini analysis failed (${res.status}): ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = (json?.choices?.[0]?.message?.content ?? "").toString().trim();
  // Sanitise to a single line, strip quotes
  const phrase = text.split("\n")[0].replace(/^["'`\s]+|["'`\s]+$/g, "");
  if (!phrase) throw new Error("Empty summary from Gemini");
  return phrase;
}

async function generateImage(summary: string): Promise<{ mime: string; bytes: Uint8Array }> {
  const prompt = `Professional minimalist black and white line art, narrow black lines, pure white background, no shading, architectural sketch style, subject: ${summary}.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Image generation failed (${res.status}): ${t.slice(0, 200)}`);
  }
  const json = await res.json();
  const url: string | undefined = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url || !url.startsWith("data:")) throw new Error("No image returned");

  const m = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("Malformed data URL");
  const mime = m[1];
  const b64 = m[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime, bytes };
}

async function processJob(job: Job): Promise<void> {
  // Mark processing
  await admin
    .from("note_cover_jobs")
    .update({ status: "processing", started_at: new Date().toISOString(), attempts: job.attempts + 1 })
    .eq("id", job.id);
  await admin.from("notes").update({ cover_status: "generating" }).eq("id", job.note_id);

  try {
    const { data: note, error: noteErr } = await admin
      .from("notes")
      .select("id, body, cover_image_url")
      .eq("id", job.note_id)
      .maybeSingle();
    if (noteErr || !note) throw new Error("Note not found");
    if (note.cover_image_url) {
      await admin.from("note_cover_jobs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", job.id);
      await admin.from("notes").update({ cover_status: "done" }).eq("id", job.note_id);
      return;
    }

    const attachmentParts = await fetchAttachmentsAsParts(job.note_id);
    const summary = await analyseNote(note.body ?? "", attachmentParts);
    const { mime, bytes } = await generateImage(summary);

    const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
    const path = `${job.user_id}/${job.note_id}/${Date.now()}.${ext}`;
    const { error: upErr } = await admin.storage
      .from("note-covers")
      .upload(path, bytes, { contentType: mime, upsert: true });
    if (upErr) throw upErr;

    const { data: pub } = admin.storage.from("note-covers").getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    await admin
      .from("notes")
      .update({ cover_image_url: publicUrl, cover_status: "done" })
      .eq("id", job.note_id);
    await admin
      .from("note_cover_jobs")
      .update({ status: "done", finished_at: new Date().toISOString(), last_error: null })
      .eq("id", job.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Job failed", job.id, msg);
    await admin
      .from("note_cover_jobs")
      .update({ status: "failed", finished_at: new Date().toISOString(), last_error: msg })
      .eq("id", job.id);
    await admin.from("notes").update({ cover_status: "failed" }).eq("id", job.note_id);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Only allow invocations carrying the service role key (internal cron / RPC).
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!serviceRoleKey || token !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Pull a small batch of queued jobs
    const { data: jobs, error } = await admin
      .from("note_cover_jobs")
      .select("id, note_id, user_id, team_id, attempts")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(MAX_JOBS_PER_RUN);

    if (error) throw error;
    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process sequentially to be friendly to rate limits
    for (const job of jobs as Job[]) {
      await processJob(job);
    }

    return new Response(JSON.stringify({ processed: jobs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("worker error", msg);
    // Always 200 so pg_net doesn't pile up retries; payload signals fallback
    return new Response(JSON.stringify({ error: msg, fallback: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
