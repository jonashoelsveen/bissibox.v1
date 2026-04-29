/**
 * Settings → Map tab
 *
 * - Map type selector (Outdoors / Satellite Streets / Light) that updates the
 *   GLOBAL default style for any map without a per-instance override.
 * - Indoor / Outdoor location sub-sections (collapsible, same fold/unfold
 *   pattern as the rest of the settings panels) — placeholders for future
 *   indoor floor-plans and outdoor venue rosters.
 */

import { useState } from "react";
import { ChevronDown, Check, Mountain, Image as ImageIcon, Sun, Building2, TreePine } from "lucide-react";
import {
  MAP_STYLES,
  type MapStyleId,
  useMapStyle,
} from "@/lib/mapbox";

const STYLE_PREVIEW: Record<MapStyleId, { Icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  outdoors: { Icon: Mountain, tone: "from-emerald-500/20 to-amber-500/20" },
  "satellite-streets": { Icon: ImageIcon, tone: "from-slate-500/30 to-blue-500/20" },
  light: { Icon: Sun, tone: "from-zinc-200 to-zinc-100" },
};

export function MapSettingsPanel() {
  // Global scope = `null` — applies to every map without its own override.
  const [globalStyle, setGlobalStyle] = useMapStyle(null);

  return (
    <section className="mt-6 space-y-4">
      <Card>
        <header className="mb-4">
          <h3 className="text-sm font-semibold text-ink">Map type</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Default basemap for every map across the app. You can still override
            this on any individual map using the layer picker in the corner.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(Object.keys(MAP_STYLES) as MapStyleId[]).map((id) => {
            const s = MAP_STYLES[id];
            const { Icon, tone } = STYLE_PREVIEW[id];
            const active = id === globalStyle;
            return (
              <button
                key={id}
                onClick={() => setGlobalStyle(id)}
                className={`group relative overflow-hidden rounded-xl border text-left transition ${
                  active
                    ? "border-primary shadow-md ring-2 ring-primary/30"
                    : "border-hairline hover:border-ink/30"
                }`}
              >
                <div className={`relative flex h-24 items-center justify-center bg-gradient-to-br ${tone}`}>
                  <Icon className="h-9 w-9 text-ink/70" />
                  {active && (
                    <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <div className="bg-card px-3 py-2.5">
                  <div className="text-sm font-medium text-ink">{s.label}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {s.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Collapsible
        title="Indoor"
        Icon={Building2}
        description="Define indoor venues — meeting rooms, halls, floors. (Coming soon.)"
      >
        <div className="rounded-md border border-dashed border-hairline bg-card/50 p-6 text-center text-sm text-muted-foreground">
          Indoor location management will appear here.
        </div>
      </Collapsible>

      <Collapsible
        title="Outdoor"
        Icon={TreePine}
        description="Define outdoor venues — parks, race courses, training areas. (Coming soon.)"
      >
        <div className="rounded-md border border-dashed border-hairline bg-card/50 p-6 text-center text-sm text-muted-foreground">
          Outdoor location management will appear here.
        </div>
      </Collapsible>
    </section>
  );
}

/* ─────────── primitives ─────────── */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-hairline bg-card p-6 md:p-8">
      {children}
    </section>
  );
}

function Collapsible({
  title,
  Icon,
  description,
  children,
}: {
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  description: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="overflow-hidden rounded-2xl border border-hairline bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left transition hover:bg-secondary/40"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-ink">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-semibold text-ink">{title}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-hairline px-6 py-5">{children}</div>}
    </section>
  );
}
