// parse-calendar-file
//
// Accepts a base64-encoded file (xlsx / xls / csv / pdf / txt) plus its
// filename + mime type, extracts a structured text representation, then
// asks Lovable AI to detect categories + events using tool calling for
// strict JSON output.
//
// Returns:
//   {
//     total_events_found: number,
//     detected_categories: { id, name, count }[],
//     events: { title, start_time, end_time, category, description }[]
//   }

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

// --- helpers --------------------------------------------------------------

function base64ToUint8Array(b64: string): Uint8Array {
  // Strip data: URL prefix if present.
  const stripped = b64.includes(",") ? b64.split(",", 2)[1] : b64;
  const bin = atob(stripped);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function classifyMime(name: string, mime: string): "spreadsheet" | "csv" | "text" {
  const n = name.toLowerCase();
  if (n.endsWith(".xlsx") || n.endsWith(".xls") || mime.includes("spreadsheet") || mime.includes("excel"))
    return "spreadsheet";
  if (n.endsWith(".csv") || mime.includes("csv")) return "csv";
  return "text";
}

function extractFromSpreadsheet(bytes: Uint8Array): string {
  const wb = XLSX.read(bytes, { type: "array", cellDates: true });
  const out: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    out.push(`### Sheet: ${sheetName}`);
    // CSV-like rendering preserves row/column structure for the LLM.
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false, FS: " | " });
    out.push(csv);
  }
  return out.join("\n\n").slice(0, 50_000);
}

function extractFromCsv(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes).slice(0, 50_000);
}

function extractFromText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes).slice(0, 50_000);
}

// Best-effort PDF text extraction without heavy deps. Falls back to
// returning a stub that signals to the AI that only the filename is
// available — the model can still produce something usable in many cases.
function extractFromPdf(bytes: Uint8Array, fileName: string): string {
  const text = new TextDecoder("latin1").decode(bytes);
  const chunks: string[] = [];
  // Naive parenthesised string extraction from PDF content streams.
  const re = /\(((?:[^()\\]|\\.)*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const s = m[1].replace(/\\(\d{3}|.)/g, (_, esc) => {
      if (esc.length === 3) return String.fromCharCode(parseInt(esc, 8));
      const map: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
      return map[esc] ?? esc;
    });
    if (/[\p{L}\d]/u.test(s)) chunks.push(s);
    if (chunks.join(" ").length > 50_000) break;
  }
  const joined = chunks.join(" ").trim();
  if (joined.length < 50) {
    return `[PDF: ${fileName}]\nUnable to extract text reliably. Use the filename and any inferred season-schedule context to produce events.`;
  }
  return joined.slice(0, 50_000);
}

function extractContent(bytes: Uint8Array, fileName: string, mime: string): string {
  const kind = classifyMime(fileName, mime);
  if (kind === "spreadsheet") return extractFromSpreadsheet(bytes);
  if (kind === "csv") return extractFromCsv(bytes);
  if (kind === "pdf") return extractFromPdf(bytes, fileName);
  return extractFromText(bytes);
}

// --- AI tool schema -------------------------------------------------------

const PARSE_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_parsed_calendar",
    description:
      "Submit the structured list of categories and events detected in the uploaded sports schedule.",
    parameters: {
      type: "object",
      properties: {
        detected_categories: {
          type: "array",
          description:
            "Distinct event categories found in the file. Use snake_case ids and human-readable names.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "snake_case identifier, e.g. xc_skiing" },
              name: { type: "string", description: "Human-friendly label, e.g. XC Skiing" },
            },
            required: ["id", "name"],
            additionalProperties: false,
          },
        },
        events: {
          type: "array",
          description: "Every event detected in the file.",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              start_time: {
                type: "string",
                description:
                  "ISO 8601 local datetime, e.g. 2026-11-20T10:00:00. Use the year hinted by the document; default to the current upcoming season if ambiguous.",
              },
              end_time: {
                type: "string",
                description: "ISO 8601 local datetime. Optional — leave empty if not specified.",
              },
              category: {
                type: "string",
                description: "Must reference one of the detected_categories ids.",
              },
              description: { type: "string", description: "Optional longer description." },
            },
            required: ["title", "start_time", "category"],
            additionalProperties: false,
          },
        },
      },
      required: ["detected_categories", "events"],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `You parse sports season schedules from raw spreadsheet/CSV/PDF dumps.

Goals:
1. Detect every concrete event (race, practice, game, meeting, training session).
2. Group events into categories by recognising patterns: repeating prefixes ("XC – ", "Football: "), explicit section headers, dedicated columns/sheets per sport, indentation, repeating colour blocks, etc.
3. Emit a compact set of categories (typically 1–6); reuse one id per category and assign every event a category id.
4. Resolve dates: if only month/day is present, infer the year from the document context; if still ambiguous, prefer the upcoming season.
5. Times: if a time is present, include it; otherwise default to 09:00 local for the start_time. Leave end_time empty unless specified or strongly implied.

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
    const content = extractContent(bytes, fileName, mimeType ?? "");
    if (!content || content.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: "Could not extract text from the file." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userMsg = [
      `Filename: ${fileName}`,
      `Mime: ${mimeType ?? "unknown"}`,
      `Today: ${new Date().toISOString().slice(0, 10)}`,
      ``,
      `Raw extracted content:`,
      content,
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
            error:
              "AI credits exhausted. Add credits in Settings → Workspace → Usage to continue.",
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

    // Normalise: drop events with bad dates, count categories, dedupe ids.
    const events = (parsed.events ?? []).filter(
      (e) => e && typeof e.title === "string" && Number.isFinite(Date.parse(e.start_time)),
    );
    const categoryIds = new Set(parsed.detected_categories?.map((c) => c.id) ?? []);
    // Ensure every event's category exists.
    for (const e of events) {
      if (!categoryIds.has(e.category)) {
        categoryIds.add(e.category);
        parsed.detected_categories.push({
          id: e.category,
          name: e.category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        });
      }
    }
    const counts = new Map<string, number>();
    for (const e of events) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    const detected_categories = parsed.detected_categories
      .filter((c) => counts.get(c.id) ?? 0)
      .map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }));

    return new Response(
      JSON.stringify({
        total_events_found: events.length,
        detected_categories,
        events,
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
