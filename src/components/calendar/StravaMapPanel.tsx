/**
 * StravaMapPanel — renders an interactive Mapbox GL map for a Strava
 * activity (decoded summary polyline) plus a synthetic elevation graph.
 *
 * Real per-point elevation/time streams are not pulled (deferred to a
 * later round); we use total_elevation_gain to render a smooth profile.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { loadMapbox } from "@/lib/mapbox";
import { useMapStyle, MAP_STYLES } from "@/lib/mapbox";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";

// Google polyline decoder (Encoded Polyline Algorithm Format)
function decodePolyline(str: string): [number, number][] {
  let index = 0, lat = 0, lng = 0;
  const coords: [number, number][] = [];
  while (index < str.length) {
    let b: number, shift = 0, result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;
    shift = 0; result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;
    coords.push([lng / 1e5, lat / 1e5]);
  }
  return coords;
}

export function StravaMapPanel({
  polyline,
  elevationGainM,
  distanceKm,
  stravaActivityId,
}: {
  polyline?: string | null;
  elevationGainM?: number | null;
  distanceKm?: number | null;
  stravaActivityId?: number | null;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [styleId] = useMapStyle("strava-activity");
  const [streams, setStreams] = useState<{ altitude: number[]; distance: number[] } | null>(null);

  const coords = useMemo(() => (polyline ? decodePolyline(polyline) : []), [polyline]);

  useEffect(() => {
    let cancelled = false;
    setStreams(null);
    if (!stravaActivityId) return;
    (async () => {
      const { data, error } = await supabase.functions.invoke("strava-activity-streams", {
        body: { activityId: stravaActivityId },
      });
      if (cancelled || error || !data?.altitude?.length) return;
      setStreams({ altitude: data.altitude, distance: data.distance ?? [] });
    })();
    return () => { cancelled = true; };
  }, [stravaActivityId]);

  useEffect(() => {
    let map: any = null;
    let cancelled = false;
    if (!ref.current || coords.length < 2) return;
    (async () => {
      const mod = await loadMapbox();
      if (cancelled || !ref.current) return;
      const mapboxgl = (mod as any).default;
      const lons = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      const bounds: [[number, number], [number, number]] = [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ];
      map = new mapboxgl.Map({
        container: ref.current,
        style: MAP_STYLES[styleId].url,
        bounds,
        fitBoundsOptions: { padding: 24, duration: 0 },
        attributionControl: false,
      });
      map.on("load", () => {
        map.addSource("route", {
          type: "geojson",
          data: { type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} },
        });
        // Casing for a polished look
        map.addLayer({
          id: "route-casing",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.85 },
        });
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#fc4c02", "line-width": 3.5 },
        });
        // Start / end markers
        new mapboxgl.Marker({ color: "#16a34a" }).setLngLat(coords[0]).addTo(map);
        new mapboxgl.Marker({ color: "#dc2626" }).setLngLat(coords[coords.length - 1]).addTo(map);
      });
    })();
    return () => { cancelled = true; if (map) map.remove(); };
  }, [coords, styleId]);

  // Real elevation profile from Strava streams. We deliberately skip the
  // synthetic-fallback curve when an activity id is present so we never flash
  // a fake "bell curve" before the real streams arrive.
  const elevationData = useMemo(() => {
    if (streams && streams.altitude.length > 1) {
      const alt = streams.altitude;
      const dist = streams.distance;
      const haveDist = dist.length === alt.length;
      const N = Math.min(200, alt.length);
      const step = alt.length / N;
      const points: { km: number; m: number }[] = [];
      for (let i = 0; i < N; i++) {
        const idx = Math.min(alt.length - 1, Math.floor(i * step));
        const km = haveDist ? dist[idx] / 1000 : (i / (N - 1)) * (distanceKm || 1);
        points.push({ km: Number(km.toFixed(2)), m: Math.round(alt[idx]) });
      }
      return points;
    }
    // If we have an activity id, wait for streams instead of drawing a fake.
    if (stravaActivityId) return [];
    if (!elevationGainM || elevationGainM <= 0) return [];
    const N = 60;
    const km = distanceKm || 1;
    return Array.from({ length: N }, (_, i) => {
      const x = i / (N - 1);
      const y = elevationGainM * Math.sin(Math.PI * x);
      return { km: Number((x * km).toFixed(2)), m: Math.round(y) };
    });
  }, [streams, elevationGainM, distanceKm, stravaActivityId]);

  const elevationLoading = !!stravaActivityId && !streams;

  if (!polyline) {
    return (
      <div className="grid place-items-center rounded-lg border border-dashed border-hairline bg-muted/20 py-16 text-center text-sm text-muted-foreground">
        No GPS track for this activity.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        ref={ref}
        className="h-[320px] w-full overflow-hidden rounded-lg border border-hairline"
        onWheel={(e) => e.stopPropagation()}
      />
      {elevationLoading && (
        <div className="flex h-[140px] w-full items-center justify-center rounded-lg border border-hairline bg-card text-[11px] text-muted-foreground">
          Loading elevation…
        </div>
      )}
      {!elevationLoading && elevationData.length > 0 && (
        <div className="h-[140px] w-full rounded-lg border border-hairline bg-card p-2">
          <div className="mb-1 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
            <span className="mono uppercase tracking-widest">Elevation</span>
            <span>+{Math.round(elevationGainM || 0)} m</span>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={elevationData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fc4c02" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#fc4c02" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis dataKey="km" tickLine={false} axisLine={false} fontSize={10} />
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip
                contentStyle={{ fontSize: 11, padding: "4px 8px" }}
                formatter={(v: any) => [`${v} m`, "Elev"]}
                labelFormatter={(v) => `${v} km`}
              />
              <Area type="monotone" dataKey="m" stroke="#fc4c02" strokeWidth={2} fill="url(#elevGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
