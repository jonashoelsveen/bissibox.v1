// AI course drawing — generates a precise running/cycling course from a natural-language description.
// Uses Lovable AI for reasoning + waypoint extraction, then snaps the waypoints to roads/paths via OSRM.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    const { prompt, contextCenter, anchors } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Missing prompt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // User-placed anchors that the route MUST pass through, in order.
    type Anchor = { kind: "start" | "finish" | "split" | "fuel" | "marker"; label?: string; position: [number, number] };
    const userAnchors: Anchor[] = Array.isArray(anchors)
      ? anchors
          .filter((a: any) => a && Array.isArray(a.position) && a.position.length === 2)
          .map((a: any) => ({
            kind: a.kind,
            label: typeof a.label === "string" ? a.label : undefined,
            position: [Number(a.position[0]), Number(a.position[1])] as [number, number],
          }))
      : [];

    // Order anchors: start first, finish last, others in given order between.
    const startAnchor = userAnchors.find((a) => a.kind === "start");
    const finishAnchor = userAnchors.find((a) => a.kind === "finish");
    const middleAnchors = userAnchors.filter((a) => a.kind !== "start" && a.kind !== "finish");
    const orderedAnchors: Anchor[] = [
      ...(startAnchor ? [startAnchor] : []),
      ...middleAnchors,
      ...(finishAnchor ? [finishAnchor] : []),
    ];
    const anchorBlock = orderedAnchors.length
      ? `\n\nThe user has already placed ${orderedAnchors.length} fixed point(s) on the map. You MUST treat these as hard anchors — your route must pass through them in the exact order given, and the named extra waypoints you add should fall geographically BETWEEN consecutive anchors. Do not move, skip, or reorder anchors.\n\nAnchors (in order):\n${orderedAnchors
          .map((a, i) => `  ${i + 1}. [${a.kind}${a.label ? ` "${a.label}"` : ""}] lat=${a.position[0].toFixed(6)}, lng=${a.position[1].toFixed(6)}`)
          .join("\n")}`
      : "";

    // 1. Use Lovable AI to extract a sequence of named waypoints + race metadata.
    const systemPrompt = `You are an expert race course designer with deep knowledge of running, cycling and triathlon courses across Norway and the world (including Sentrumsløpet, Holmenkollstafetten, Oslo Maraton, Birkebeinerrennet, Bergen City Marathon and similar). When given a description of a race course, output an ordered list of geographic waypoints (real, named places — streets, intersections, landmarks, parks, monuments) that an athlete would pass through in order, plus a Start point and a Finish point.

Rules:
- Use 6 to 25 waypoints. More waypoints = more precise routing.
- Each waypoint name MUST be searchable on OpenStreetMap. Prefer "Karl Johans gate, Oslo" over just "Karl Johan".
- Always include a city/country suffix (e.g. ", Oslo, Norway") on every waypoint to disambiguate.
- The first waypoint is Start, the last is Finish. If the user says it's a loop, make Start ≈ Finish.
- If the user mentions split points or fuel stations, include them as splits with the appropriate kind.
- Be geographically realistic: don't jump across the country between consecutive waypoints.
- If the user has placed anchor points (see below), your generated waypoints must respect those anchors as fixed pass-through points in the given order. Insert named intermediate waypoints between consecutive anchors to shape the route.${anchorBlock}`;

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

    if (waypointNames.length < 2 && orderedAnchors.length < 2) {
      return new Response(JSON.stringify({ error: "AI returned too few waypoints" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Geocode every AI waypoint (sequentially, respecting Nominatim rate limits).
    const aiCoords: [number, number][] = [];
    // If user placed anchors, bias initial geocoding to their centroid; else use map center.
    const anchorCentroid: { lat: number; lng: number } | undefined = orderedAnchors.length
      ? {
          lat: orderedAnchors.reduce((s, a) => s + a.position[0], 0) / orderedAnchors.length,
          lng: orderedAnchors.reduce((s, a) => s + a.position[1], 0) / orderedAnchors.length,
        }
      : undefined;
    let bias =
      anchorCentroid ?? (contextCenter && typeof contextCenter.lat === "number" ? contextCenter : undefined);
    for (const name of waypointNames) {
      const c = await geocode(name, bias);
      if (c) {
        aiCoords.push(c);
        bias = { lat: c[0], lng: c[1] };
      }
      await new Promise((res) => setTimeout(res, 250));
    }

    // 3. Build the routing chain. If user anchors exist, they are FIXED and ordered.
    // Insert AI waypoints into the segment whose endpoints they fall geographically between.
    const dist2 = (a: [number, number], b: [number, number]) => {
      const dx = a[0] - b[0];
      const dy = a[1] - b[1];
      return dx * dx + dy * dy;
    };
    let routingChain: [number, number][];
    if (orderedAnchors.length >= 2) {
      const anchorPts = orderedAnchors.map((a) => a.position);
      // For each AI coord, pick the segment [i, i+1] minimizing midpoint distance.
      const buckets: [number, number][][] = anchorPts.slice(0, -1).map(() => []);
      for (const c of aiCoords) {
        let bestI = 0;
        let bestD = Infinity;
        for (let i = 0; i < anchorPts.length - 1; i++) {
          const mid: [number, number] = [
            (anchorPts[i][0] + anchorPts[i + 1][0]) / 2,
            (anchorPts[i][1] + anchorPts[i + 1][1]) / 2,
          ];
          const d = dist2(c, mid);
          if (d < bestD) {
            bestD = d;
            bestI = i;
          }
        }
        buckets[bestI].push(c);
      }
      // Sort each bucket so coords progress from anchor[i] toward anchor[i+1].
      buckets.forEach((bucket, i) => {
        bucket.sort((a, b) => dist2(a, anchorPts[i]) - dist2(b, anchorPts[i]));
      });
      routingChain = [];
      for (let i = 0; i < anchorPts.length - 1; i++) {
        routingChain.push(anchorPts[i]);
        for (const c of buckets[i]) routingChain.push(c);
      }
      routingChain.push(anchorPts[anchorPts.length - 1]);
    } else if (orderedAnchors.length === 1) {
      // Single anchor: prepend it and route through AI coords.
      routingChain = [orderedAnchors[0].position, ...aiCoords];
    } else {
      routingChain = aiCoords;
    }

    if (routingChain.length < 2) {
      return new Response(JSON.stringify({ error: "Could not geocode enough waypoints. Try a more specific description or place anchor points." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Snap chain to roads/paths via OSRM.
    const snapped = (await snapToRoads(routingChain, "foot")) ?? routingChain;

    // 5. Geocode AI-suggested split markers (skip if user already supplied splits/fuel anchors).
    const userHasSplits = orderedAnchors.some((a) => a.kind === "split" || a.kind === "fuel");
    const center = routingChain[Math.floor(routingChain.length / 2)];
    const splitsOut: { kind: "split" | "fuel"; label: string; position: [number, number] }[] = [];
    if (!userHasSplits) {
      for (const s of splitDescs) {
        const c = await geocode(s.near, { lat: center[0], lng: center[1] });
        if (c) splitsOut.push({ kind: s.kind, label: s.label, position: c });
        await new Promise((res) => setTimeout(res, 250));
      }
    }

    // Start/finish: prefer user-placed anchors when present.
    const startPosition = startAnchor?.position ?? routingChain[0];
    const finishPosition = finishAnchor?.position ?? routingChain[routingChain.length - 1];

    return new Response(
      JSON.stringify({
        path: snapped,
        startPosition,
        finishPosition,
        splits: splitsOut,
        notes: args.notes ?? "",
        waypointCount: routingChain.length,
        usedAnchors: orderedAnchors.length,
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
