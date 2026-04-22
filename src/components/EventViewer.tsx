import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, FileText, Layers, ListTree, Map as MapIcon } from "lucide-react";
import { ReadOnlyCourseMap } from "@/components/ReadOnlyCourseMap";
import { ElevationProfile } from "@/components/ElevationProfile";
import type { LatLng, SplitPoint } from "@/components/CourseMapEditor";
import { formatDateLong, formatMoney, formatTime } from "@/lib/format";

interface EventRow {
  id: string;
  title: string;
  organizer: string;
  description: string | null;
  location: string | null;
  region: string | null;
  country: string | null;
  starts_at: string;
  signup_deadline: string | null;
  signup_fee: number;
  currency: string;
  race_types: string[];
  world_athletics_certified: boolean;
}

interface SubeventRow {
  id: string;
  name: string;
  starts_at: string | null;
  distance_km: number | null;
  class_codes: string[];
  course_path: LatLng[];
  split_points: SplitPoint[];
  sort_order: number;
}

export function EventViewer({ eventId }: { eventId: string }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<"details" | "classes" | "subevents" | "map">("details");
  const [event, setEvent] = useState<EventRow | null>(null);
  const [classes, setClasses] = useState<string[]>([]);
  const [subevents, setSubevents] = useState<SubeventRow[]>([]);
  const [openSub, setOpenSub] = useState<number | null>(0);
  const [activeMapSub, setActiveMapSub] = useState(0);
  const [expandedSubMap, setExpandedSubMap] = useState<Record<number, boolean>>({ 0: true });
  const [selectedSplitId, setSelectedSplitId] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data: e } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
      if (e) {
        setEvent(e as EventRow);
        setChosen((e.race_types ?? [])[0] ?? null);
      }
      const { data: cls } = await supabase
        .from("event_classes")
        .select("code,sort_order")
        .eq("event_id", eventId)
        .order("sort_order", { ascending: true });
      setClasses((cls ?? []).map((c) => c.code));
      const { data: subs } = await supabase
        .from("event_subevents")
        .select("*")
        .eq("event_id", eventId)
        .order("sort_order", { ascending: true });
      setSubevents(
        (subs ?? []).map((s: any) => ({
          id: s.id,
          name: s.name,
          starts_at: s.starts_at,
          distance_km: s.distance_km,
          class_codes: s.class_codes ?? [],
          course_path: Array.isArray(s.course_path) ? s.course_path : [],
          split_points: Array.isArray(s.split_points) ? s.split_points : [],
          sort_order: s.sort_order ?? 0,
        }))
      );
    })();
  }, [eventId]);

  useEffect(() => {
    if (!user || !event) return;
    void (async () => {
      const { data } = await supabase
        .from("registrations")
        .select("id")
        .eq("user_id", user.id)
        .eq("event_id", eventId)
        .maybeSingle();
      if (data) setRegistered(true);
    })();
  }, [user, event, eventId]);

  const handleSignup = async () => {
    if (!user) {
      nav({ to: "/auth", search: { redirect: `/events/${eventId}` } });
      return;
    }
    if (!chosen) return;
    setSubmitting(true);
    const { error } = await supabase.from("registrations").insert({
      user_id: user.id,
      event_id: eventId,
      race_type: chosen,
      status: "pending",
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    setRegistered(true);
    toast.success("You're signed up.");
  };

  if (!event) {
    return <div className="px-6 py-16 text-muted-foreground">Loading…</div>;
  }

  const isMap = tab === "map";

  return (
    <div className={isMap ? "flex min-h-[calc(100vh-2rem)] flex-col px-4 md:px-6" : "px-4 md:px-6"}>
      <div>
        <header className="flex flex-wrap items-start justify-between gap-4 pt-3">
          <div className="flex items-start gap-3">
            <button
              onClick={() => nav({ to: "/search" })}
              className="-ml-2 inline-flex items-center justify-center p-2 text-muted-foreground transition hover:text-ink"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <p className="mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Race · {event.organizer}
              </p>
              <h1 className="mt-2 text-3xl text-ink md:text-4xl">{event.title}</h1>
            </div>
          </div>
          <button
            onClick={handleSignup}
            disabled={submitting || registered || !chosen}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {registered ? "Signed up" : submitting ? "Signing up…" : "Sign up"}
          </button>
        </header>

        <nav className="mt-7 flex border-b border-hairline">
          <TabBtn active={tab === "details"} onClick={() => setTab("details")} icon={<FileText className="h-3.5 w-3.5" />}>
            Event details
          </TabBtn>
          <TabBtn active={tab === "classes"} onClick={() => setTab("classes")} icon={<Layers className="h-3.5 w-3.5" />}>
            Classes
          </TabBtn>
          <TabBtn active={tab === "subevents"} onClick={() => setTab("subevents")} icon={<ListTree className="h-3.5 w-3.5" />}>
            Subevents
          </TabBtn>
          <TabBtn active={tab === "map"} onClick={() => setTab("map")} icon={<MapIcon className="h-3.5 w-3.5" />}>
            Map
          </TabBtn>
        </nav>
      </div>

      {tab === "details" && (
        <Panel>
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
            <Field label="Name">{event.title}</Field>
            <Field label="Organizer">{event.organizer}</Field>
            <Field label="Date & start">
              <span className="num">{formatDateLong(event.starts_at)} · {formatTime(event.starts_at)}</span>
            </Field>
            <Field label="Signup deadline">
              {event.signup_deadline ? (
                <span className="num">{formatDateLong(event.signup_deadline)} · {formatTime(event.signup_deadline)}</span>
              ) : "—"}
            </Field>
            <Field label="Location">{event.location ?? "—"}</Field>
            <Field label="Region">{event.region ?? "—"}</Field>
            <Field label="Country">{event.country ?? "—"}</Field>
            <Field label="Signup fee">
              <span className="num">{formatMoney(Number(event.signup_fee), event.currency)}</span>
            </Field>
            <Field label="Discipline / type" full>
              <div className="flex flex-wrap gap-1.5">
                {(event.race_types ?? []).map((t) => (
                  <span key={t} className="rounded-md border border-hairline bg-background px-2.5 py-1 text-xs text-ink">
                    {t}
                  </span>
                ))}
              </div>
            </Field>
            {event.description && (
              <Field label="Description" full>
                <p className="leading-relaxed">{event.description}</p>
              </Field>
            )}
            <Field label="Course" full>
              {event.world_athletics_certified ? "World Athletics certified course" : "—"}
            </Field>
          </div>
        </Panel>
      )}

      {tab === "classes" && (
        <Panel>
          <p className="text-sm text-muted-foreground">Classes available for this event.</p>
          {classes.length === 0 ? (
            <p className="mt-5 text-sm text-muted-foreground">No classes defined.</p>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3">
              {classes.map((code) => (
                <div key={code} className="num text-base text-ink">{code}</div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {tab === "subevents" && (
        <Panel>
          <p className="text-sm text-muted-foreground">Races within this event.</p>
          <div className="mt-5 space-y-2">
            {subevents.length === 0 && (
              <div className="rounded-lg border border-hairline px-5 py-8 text-center text-sm text-muted-foreground">
                No races yet.
              </div>
            )}
            {subevents.map((s, idx) => {
              const open = openSub === idx;
              return (
                <div key={s.id} className="overflow-hidden rounded-lg border border-hairline bg-card">
                  <button
                    onClick={() => setOpenSub((o) => (o === idx ? null : idx))}
                    className="flex w-full items-center gap-3 bg-secondary/40 px-4 py-3 text-left transition hover:bg-secondary"
                  >
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition ${open ? "rotate-0" : "-rotate-90"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base text-ink">{s.name || `Race ${idx + 1}`}</p>
                      <p className="mono mt-0.5 text-[10px] text-muted-foreground">
                        {s.distance_km ? `${s.distance_km} km` : "—"}
                        {s.starts_at ? ` · ${formatTime(s.starts_at)}` : ""}
                      </p>
                    </div>
                  </button>
                  {open && (
                    <div className="grid grid-cols-1 gap-x-8 gap-y-3 px-5 py-5 md:grid-cols-2">
                      <Field label="Name">{s.name || `Race ${idx + 1}`}</Field>
                      <Field label="Start">
                        {s.starts_at ? (
                          <span className="num">{formatDateLong(s.starts_at)} · {formatTime(s.starts_at)}</span>
                        ) : "—"}
                      </Field>
                      <Field label="Distance">{s.distance_km ? `${s.distance_km} km` : "—"}</Field>
                      <Field label="Classes" full>
                        {s.class_codes.length === 0 ? "—" : (
                          <div className="flex flex-wrap gap-1.5">
                            {s.class_codes.map((c) => (
                              <span key={c} className="num rounded border border-hairline bg-background px-2 py-0.5 text-xs text-ink">
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </Field>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {tab === "map" && (
        <div className="mt-5 flex flex-1 overflow-hidden rounded-lg border border-hairline bg-card">
          <div className="relative min-h-[600px] flex-1">
            {subevents.length === 0 ? (
              <div className="flex h-full min-h-[600px] items-center justify-center p-10 text-center text-sm text-muted-foreground">
                No course map available.
              </div>
            ) : (
              <ReadOnlyCourseMap
                key={activeMapSub}
                path={subevents[activeMapSub]?.course_path ?? []}
                splits={subevents[activeMapSub]?.split_points ?? []}
                selectedSplitId={selectedSplitId}
              />
            )}
          </div>

          <aside className="w-96 shrink-0 overflow-y-auto border-l border-hairline bg-background px-3 py-3">
            <div className="border-b border-hairline px-1 pb-3">
              <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Races</p>
              <p className="mt-0.5 text-sm text-ink">Select a race</p>
            </div>
            <div className="flex flex-col gap-2 pt-3">
              {subevents.map((s, i) => {
                const active = i === activeMapSub;
                const expanded = !!expandedSubMap[i];
                const points = s.split_points ?? [];
                return (
                  <div
                    key={s.id}
                    className={`overflow-hidden rounded-md border ${active ? "border-primary bg-primary/5" : "border-hairline bg-card"}`}
                  >
                    <div className="flex w-full items-center gap-2 px-3 py-3 text-left">
                      <button
                        onClick={() => { setActiveMapSub(i); setSelectedSplitId(null); }}
                        className="flex min-w-0 flex-1 items-center"
                      >
                        <div className="min-w-0 flex-1 text-left">
                          <p className={`truncate text-base ${active ? "text-ink font-semibold" : "text-ink font-medium"}`}>
                            {s.name || `Race ${i + 1}`}
                          </p>
                          <p className="mono mt-0.5 text-[10px] text-muted-foreground">
                            {s.distance_km ? `${s.distance_km} km · ` : ""}
                            {s.course_path?.length ?? 0} pts · {points.length} markers
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={() => setExpandedSubMap((m) => ({ ...m, [i]: !m[i] }))}
                        className="rounded p-1 text-muted-foreground hover:text-ink"
                        aria-label={expanded ? "Collapse" : "Expand"}
                      >
                        <ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-0" : "-rotate-90"}`} />
                      </button>
                    </div>

                    {expanded && active && (
                      <div className="bg-card/50 px-3 pb-3 pt-2">
                        {points.length === 0 ? (
                          <p className="px-2 py-3 text-xs text-muted-foreground">No splits or markers.</p>
                        ) : (
                          <ul className="space-y-2">
                            {points.map((p) => {
                              const sel = p.id === selectedSplitId;
                              const dot =
                                p.kind === "split" ? "#2563eb" :
                                p.kind === "fuel" ? "#f59e0b" :
                                p.kind === "start" ? "#16a34a" :
                                p.kind === "finish" ? "#dc2626" : "#7c3aed";
                              const kindLabel = p.kind.charAt(0).toUpperCase() + p.kind.slice(1);
                              return (
                                <li
                                  key={p.id}
                                  onClick={() => setSelectedSplitId(p.id)}
                                  className={`relative flex items-center gap-2 overflow-hidden rounded-md border bg-card px-3 py-3 shadow-sm transition cursor-pointer ${
                                    sel ? "border-primary shadow-md" : "border-hairline hover:border-muted-foreground/40"
                                  }`}
                                >
                                  <span aria-hidden className="absolute left-0 top-0 h-full w-1" style={{ background: dot }} />
                                  <div className="ml-1 flex min-w-0 flex-1 flex-col">
                                    <span className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                      {kindLabel}
                                    </span>
                                    <span className="mt-0.5 truncate text-sm font-medium text-ink">{p.label}</span>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {subevents.length === 0 && (
                <p className="px-4 py-6 text-xs text-muted-foreground">No races yet.</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active, onClick, icon, children,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm transition ${
        active ? "border-primary text-ink" : "border-transparent text-muted-foreground hover:text-ink"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="mt-5 rounded-lg border border-hairline bg-card p-6 md:p-8">{children}</section>;
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`flex items-start gap-4 ${full ? "md:col-span-2" : ""}`}>
      <span className="mt-0.5 w-32 shrink-0 text-right text-sm text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1 text-sm text-ink">{children}</div>
    </div>
  );
}
