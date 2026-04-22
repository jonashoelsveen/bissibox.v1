// AI course drawing — generates a precise running/cycling course from a natural-language description.
// Uses Lovable AI for reasoning + waypoint extraction, then snaps the waypoints to roads/paths via OSRM.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
}

async function geocode(query: string, viewboxBias?: { lat: number; lng: number }): Promise<[number, number] | null> {
  try {
    const params = new URLSearchParams({ format: "json", q: query, limit: "1" });
    if (viewboxBias) {
      const { lat, lng } = viewboxBias;
      // ~50km box around bias point
      const d = 0.5;
      params.set("viewbox", `${lng - d},${lat + d},${lng + d},${lat - d}`);
      params.set("bounded", "0");
    }
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "Raceline/1.0 (course-ai)" },
    });
    if (!r.ok) return null;
    const arr: NominatimHit[] = await r.json();
    if (!arr[0]) return null;
    return [parseFloat(arr[0].lat), parseFloat(arr[0].lon)];
  } catch {
    return null;
  }
}

// Snap a sequence of waypoints to roads/paths using OSRM. Profile "foot" works well for runs.
async function snapToRoads(waypoints: [number, number][], profile: "foot" | "bike" | "car" = "foot"): Promise<[number, number][] | null> {
  if (waypoints.length < 2) return waypoints;
  try {
    const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=geojson&steps=false`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const route = data?.routes?.[0];
    if (!route?.geometry?.coordinates) return null;
    return route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, contextCenter } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Missing prompt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // 1. Use Lovable AI to extract a sequence of named waypoints + race metadata.
    const systemPrompt = `You are an expert race course designer with deep knowledge of running, cycling and triathlon courses across Norway and the world (including Sentrumsløpet, Holmenkollstafetten, Oslo Maraton, Birkebeinerrennet, Bergen City Marathon and similar). When given a description of a race course, output an ordered list of geographic waypoints (real, named places — streets, intersections, landmarks, parks, monuments) that an athlete would pass through in order, plus a Start point and a Finish point.

Rules:
- Use 6 to 25 waypoints. More waypoints = more precise routing.
- Each waypoint name MUST be searchable on OpenStreetMap. Prefer "Karl Johans gate, Oslo" over just "Karl Johan".
- Always include a city/country suffix (e.g. ", Oslo, Norway") on every waypoint to disambiguate.
- The first waypoint is Start, the last is Finish. If the user says it's a loop, make Start ≈ Finish.
- If the user mentions split points or fuel stations, include them as splits with the appropriate kind.
- Be geographically realistic: don't jump across the country between consecutive waypoints.`;

    const tool = {
      type: "function",
      function: {
        name: "draw_course",
        description: "Return an ordered list of named waypoints and split markers for a race course.",
        parameters: {
          type: "object",
          properties: {
            waypoints: {
              type: "array",
              description: "Ordered list of named places the course passes through, from Start to Finish.",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Searchable place name including city, e.g. 'Slottet, Oslo, Norway'" },
                },
                required: ["name"],
                additionalProperties: false,
              },
            },
            splits: {
              type: "array",
              description: "Optional split / fuel markers along the course. Position is described by name.",
              items: {
                type: "object",
                properties: {
                  kind: { type: "string", enum: ["split", "fuel"] },
                  label: { type: "string" },
                  near: { type: "string", description: "Searchable place name for this marker" },
                },
                required: ["kind", "label", "near"],
                additionalProperties: false,
              },
            },
            notes: { type: "string", description: "Short explanation of the course (1-2 sentences)" },
          },
          required: ["waypoints"],
          additionalProperties: false,
        },
      },
    };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "draw_course" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI gateway error", aiRes.status, t);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached. Please wait a moment and try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI request failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const call = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) {
      return new Response(JSON.stringify({ error: "AI did not return a course" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const args = JSON.parse(call.function.arguments);
    const waypointNames: string[] = (args.waypoints ?? []).map((w: any) => w.name).filter(Boolean);
    const splitDescs: { kind: "split" | "fuel"; label: string; near: string }[] = args.splits ?? [];

    if (waypointNames.length < 2) {
      return new Response(JSON.stringify({ error: "AI returned too few waypoints" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Geocode every waypoint (sequentially, with small delay to respect Nominatim rate limits).
    const waypointCoords: [number, number][] = [];
    let bias = contextCenter && typeof contextCenter.lat === "number" ? contextCenter : undefined;
    for (const name of waypointNames) {
      const c = await geocode(name, bias);
      if (c) {
        waypointCoords.push(c);
        // Bias subsequent lookups toward the area of the previous successful hit.
        bias = { lat: c[0], lng: c[1] };
      }
      await new Promise((res) => setTimeout(res, 250));
    }

    if (waypointCoords.length < 2) {
      return new Response(JSON.stringify({ error: "Could not geocode enough waypoints. Try a more specific description." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Snap waypoint chain to roads/paths via OSRM.
    const snapped = (await snapToRoads(waypointCoords, "foot")) ?? waypointCoords;

    // 4. Geocode split markers near the chain (also biased to the route center).
    const center = waypointCoords[Math.floor(waypointCoords.length / 2)];
    const splitsOut: { kind: "split" | "fuel"; label: string; position: [number, number] }[] = [];
    for (const s of splitDescs) {
      const c = await geocode(s.near, { lat: center[0], lng: center[1] });
      if (c) splitsOut.push({ kind: s.kind, label: s.label, position: c });
      await new Promise((res) => setTimeout(res, 250));
    }

    return new Response(
      JSON.stringify({
        path: snapped,
        startPosition: waypointCoords[0],
        finishPosition: waypointCoords[waypointCoords.length - 1],
        splits: splitsOut,
        notes: args.notes ?? "",
        waypointCount: waypointCoords.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ai-draw-course error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
