// parse-calendar-file
//
// Accepts a base64-encoded file (pdf / xlsx / xls / csv / txt), converts it
// to highly-legible text (Markdown tables for CSV, raw row arrays for sheets,
// extracted text for PDFs via unpdf), then asks Lovable AI to detect
// categories + events using strict tool-calling JSON output. Each event
// includes a reasoning_confidence (1-100). The frontend filters >= 80.

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-pro";

// --- helpers --------------------------------------------------------------

function base64ToUint8Array(b64: string): Uint8Array {
  const stripped = b64.includes(",") ? b64.split(",", 2)[1] : b64;
  const bin = atob(stripped);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type Kind = "pdf" | "spreadsheet" | "csv" | "text";

function classify(name: string, mime: string): Kind {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf") || mime.includes("pdf")) return "pdf";
  if (n.endsWith(".xlsx") || n.endsWith(".xls") || mime.includes("spreadsheet") || mime.includes("excel"))
    return "spreadsheet";
  if (n.endsWith(".csv") || mime.includes("csv")) return "csv";
  return "text";
}

function fromSpreadsheet(bytes: Uint8Array): string {
  const wb = XLSX.read(bytes, { type: "array", cellDates: true });
  const out: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
    out.push(`Sheet: ${sheetName}`);
    out.push(JSON.stringify(rows, null, 2));
  }
  return out.join("\n\n");
}

/** Convert CSV into a Markdown table — gives the LLM clear column structure. */
function fromCsv(bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes);
  const rows = text
    .split(/\r?\n/)
    .filter((r) => r.trim().length > 0)
    .map((row) => row.split(",").map((cell) => cell.trim()));
  if (rows.length === 0) return "";
  const header = rows[0];
  const sep = header.map(() => "---");
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...rows.slice(1).map((cols) => `| ${cols.join(" | ")} |`),
  ];
  return lines.join("\n");
}

async function fromPdf(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : (text as string);
}

async function extractContent(bytes: Uint8Array, name: string, mime: string): Promise<string> {
  const kind = classify(name, mime);
  let out = "";
  if (kind === "pdf") out = await fromPdf(bytes);
  else if (kind === "spreadsheet") out = fromSpreadsheet(bytes);
  else if (kind === "csv") out = fromCsv(bytes);
  else out = new TextDecoder().decode(bytes);
  return out.slice(0, 80_000);
}

// --- AI tool schema -------------------------------------------------------

const PARSE_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_parsed_calendar",
    description: "Submit categories and events extracted from a sports schedule document.",
    parameters: {
      type: "object",
      properties: {
        detected_categories: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "snake_case identifier, e.g. xc_skiing" },
              name: { type: "string" },
            },
            required: ["id", "name"],
            additionalProperties: false,
          },
        },
        events: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              start_time: {
                type: "string",
                description: "ISO 8601 local datetime, e.g. 2026-11-20T10:00:00.",
              },
              end_time: { type: "string", description: "ISO 8601 local datetime, optional." },
              category: { type: "string", description: "Must reference a detected_categories id." },
              description: { type: "string" },
              reasoning_confidence: {
                type: "number",
                description:
                  "Integer 1-100. How confident you are this event is real and the date/time is correct, based ONLY on explicit content in the source.",
              },
            },
            required: ["title", "start_time", "category", "reasoning_confidence"],
            additionalProperties: false,
          },
        },
      },
      required: ["detected_categories", "events"],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `You are an advanced administrative sports assistant in Scandinavia. Your task is to extract exact calendar events and deadlines from the provided file content.

EVALUATION DIRECTIVES:
- Analyze the raw text/table only. Extract exact dates, event titles, descriptions, and deduce categories based on row labels, section headers, sheet names, or repeating prefixes (e.g., XC Skiing, Football).
- Do NOT infer, guess, or invent events based on the file name, mime type, or external assumptions. The filename is provided for context only.
- Focus heavily on visual table alignments (Markdown tables or array-of-array rows).
- Each extracted event REQUIRES a "reasoning_confidence" integer between 1 and 100. Use 90+ only when both the date AND the title are explicitly present in the source. Use 80-89 when small inference is needed (e.g., year resolved from a season header). Use <80 when guessing.
- If an event lacks an explicit or clearly deducible date in the text, OMIT it entirely. Never fabricate dates.
- If the content has no concrete dates, return empty arrays.
- Use snake_case category ids. Default start_time to 12:00 local if a time is not given. Leave end_time unset unless specified.

Output strictly via the submit_parsed_calendar tool. Never include explanatory prose.`;

// --- main handler ---------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { fileName, mimeType, base64 } = body as {
      fileName?: string;
      mimeType?: string;
      base64?: string;
    };
    if (!fileName || !base64) {
      return new Response(JSON.stringify({ error: "Missing fileName or base64" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bytes = base64ToUint8Array(base64);
    const content = await extractContent(bytes, fileName, mimeType ?? "");
    if (!content || content.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: "Could not extract text from the file." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userMsg = [
      `Filename (CONTEXT ONLY — do not derive events from this): ${fileName}`,
      `Today: ${new Date().toISOString().slice(0, 10)}`,
      ``,
      `Process this extracted document content. Return data via the submit_parsed_calendar tool. Only events explicitly present below are valid.`,
      ``,
      `"""`,
      content,
      `"""`,
    ].join("\n");

    const aiRes = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
        tools: [PARSE_TOOL],
        tool_choice: { type: "function", function: { name: "submit_parsed_calendar" } },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI rate limit reached. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({
            error: "AI credits exhausted. Add credits in Settings → Workspace → Usage to continue.",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await aiRes.text();
      console.error("AI gateway error", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== "submit_parsed_calendar") {
      console.error("Missing tool call", JSON.stringify(aiJson).slice(0, 800));
      return new Response(JSON.stringify({ error: "AI did not return structured output." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: {
      detected_categories: { id: string; name: string }[];
      events: {
        title: string;
        start_time: string;
        end_time?: string;
        category: string;
        description?: string;
        reasoning_confidence: number;
      }[];
    };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Bad tool args", e);
      return new Response(JSON.stringify({ error: "Could not parse AI response." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalise: drop events with bad dates, ensure categories exist, count.
    const events = (parsed.events ?? []).filter(
      (e) =>
        e &&
        typeof e.title === "string" &&
        Number.isFinite(Date.parse(e.start_time)) &&
        typeof e.reasoning_confidence === "number",
    );
    const categoryIds = new Set(parsed.detected_categories?.map((c) => c.id) ?? []);
    for (const e of events) {
      if (!categoryIds.has(e.category)) {
        categoryIds.add(e.category);
        parsed.detected_categories.push({
          id: e.category,
          name: e.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        });
      }
    }
    // Past-event detection. Only count events with high confidence (>= 80) so
    // the signal is trustworthy. "Past" means start_time strictly before today.
    const now = Date.now();
    const highConf = events.filter((e) => (e.reasoning_confidence ?? 0) >= 80);
    const pastHigh = highConf.filter((e) => Date.parse(e.start_time) < now);
    const futureHigh = highConf.filter((e) => Date.parse(e.start_time) >= now);
    const pastRatio = highConf.length > 0 ? pastHigh.length / highConf.length : 0;
    let past_status: "all_past" | "partly_past" | "none" = "none";
    if (highConf.length > 0 && pastRatio >= 0.8) past_status = "all_past";
    else if (pastHigh.length > 0 && futureHigh.length > 0) past_status = "partly_past";

    // Filter events visible to the UI: if the file is mostly past, keep all so
    // user sees what was detected; otherwise hide individual past events and
    // only surface upcoming ones.
    const visibleEvents = past_status === "all_past" ? events : events.filter((e) => Date.parse(e.start_time) >= now);

    const counts = new Map<string, number>();
    for (const e of visibleEvents) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    const detected_categories = parsed.detected_categories
      .filter((c) => (counts.get(c.id) ?? 0) > 0)
      .map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }));

    return new Response(
      JSON.stringify({
        total_events_found: visibleEvents.length,
        detected_categories,
        events: visibleEvents,
        past_status,
        past_events_count: pastHigh.length,
        future_events_count: futureHigh.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("parse-calendar-file error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
