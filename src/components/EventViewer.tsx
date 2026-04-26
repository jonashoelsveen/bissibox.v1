import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, FileText, Heart, Image as ImageIcon, Map as MapIcon, MapPin, Share2, Users, X } from "lucide-react";
import { ReadOnlyCourseMap } from "@/components/ReadOnlyCourseMap";
import { ReadOnlyPinMap } from "@/components/ReadOnlyPinMap";
import { MapLocationLabel } from "@/components/MapLocationLabel";
import { ElevationProfile } from "@/components/ElevationProfile";
import { PublicParticipantsPanel } from "@/components/PublicParticipantsPanel";
import { EventMediaTab } from "@/components/EventMediaTab";
import { VerificationDialog } from "@/components/VerificationDialog";
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
  pin_lat: number | null;
  pin_lng: number | null;
  pin_description: string | null;
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
  const [tab, setTab] = useState<"details" | "map" | "participants" | "media">("details");
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [classes, setClasses] = useState<string[]>([]);
  const [subevents, setSubevents] = useState<SubeventRow[]>([]);
  const [openSub, setOpenSub] = useState<number | null>(0);
  const [activeMapSub, setActiveMapSub] = useState(0);
  const [mapMode, setMapMode] = useState<"location" | "race">("location");
  const [expandedSubMap, setExpandedSubMap] = useState<Record<number, boolean>>({ 0: true });
  const [selectedSplitId, setSelectedSplitId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<LatLng | null>(null);
  const [registered, setRegistered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [chosenSubId, setChosenSubId] = useState<string | null>(null);
  const [chosenClass, setChosenClass] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: e } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
      if (e) {
        setEvent(e as EventRow);
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
      const { data: like } = await supabase
        .from("event_likes")
        .select("id")
        .eq("user_id", user.id)
        .eq("event_id", eventId)
        .maybeSingle();
      setLiked(!!like);
    })();
  }, [user, event, eventId]);

  const toggleLike = async () => {
    if (!user) {
      nav({ to: "/auth", search: { redirect: `/events/${eventId}` } });
      return;
    }
    if (likeBusy) return;
    setLikeBusy(true);
    if (liked) {
      await supabase.from("event_likes").delete().eq("user_id", user.id).eq("event_id", eventId);
      setLiked(false);
    } else {
      const { error } = await supabase.from("event_likes").insert({ user_id: user.id, event_id: eventId } as never);
      if (!error) setLiked(true);
    }
    setLikeBusy(false);
  };

  const shareInvite = async () => {
    const url = `${window.location.origin}/events/${eventId}`;
    const title = event?.title ?? "Race";
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({ title, text: `Join me at ${title}`, url });
        return;
      }
    } catch {
      // user cancelled — fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied to clipboard.");
    } catch {
      toast.error("Could not copy link.");
    }
  };

  const openSignup = () => {
    if (!user) {
      nav({ to: "/auth", search: { redirect: `/events/${eventId}` } });
      return;
    }
    setChosenSubId(subevents[0]?.id ?? null);
    setChosenClass(null);
    setConsent(false);
    setSignupOpen(true);
  };

  const submitSignup = () => {
    if (!user || !chosenSubId) return;
    const sub = subevents.find((s) => s.id === chosenSubId);
    if (!sub) return;
    setSignupOpen(false);
    setVerifyOpen(true);
    void sub;
  };

  const onVerified = () => {
    setRegistered(true);
    setVerifyOpen(false);
    toast.success("You're signed up.");
  };

  const subForMeta = subevents.find((s) => s.id === chosenSubId);

  if (!event) {
    return <div className="px-6 py-16 text-muted-foreground">Loading…</div>;
  }

  const isMap = tab === "map";
  const subevForSignup = subevents.find((s) => s.id === chosenSubId);
  const classOptions = subevForSignup?.class_codes?.length ? subevForSignup.class_codes : classes;

  return (
    <div className={isMap ? "flex min-h-[calc(100vh-2rem)] flex-col px-4 md:px-6" : "px-4 md:px-6"}>
      <div>
        <header className="flex flex-wrap items-start justify-between gap-4 pt-3">
          <div className="flex items-start gap-3">
            <button
              onClick={() => nav({ to: "/" })}
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
          <div className="flex items-center gap-2">
            <button
              onClick={shareInvite}
              className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-hairline bg-card text-muted-foreground transition hover:border-muted-foreground/40 hover:text-ink"
              aria-label="Invite a friend"
              title="Invite a friend"
            >
              <Share2 className="h-4 w-4" />
            </button>
            <button
              onClick={toggleLike}
              disabled={likeBusy}
              className={`inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border transition disabled:opacity-50 ${
                liked
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-500 hover:bg-rose-500/15"
                  : "border-hairline bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-ink"
              }`}
              aria-label={liked ? "Unlike" : "Like"}
              title={liked ? "Liked" : "Like"}
            >
              <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
            </button>
            <button
              onClick={openSignup}
              disabled={submitting || registered}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {registered ? "Signed up" : "Sign up"}
            </button>
          </div>
        </header>

        <nav className="mt-7 flex border-b border-hairline">
          <TabBtn active={tab === "details"} onClick={() => setTab("details")} icon={<FileText className="h-3.5 w-3.5" />}>
            Event details
          </TabBtn>
          <TabBtn active={tab === "map"} onClick={() => setTab("map")} icon={<MapIcon className="h-3.5 w-3.5" />}>
            Map
          </TabBtn>
          <TabBtn active={tab === "participants"} onClick={() => setTab("participants")} icon={<Users className="h-3.5 w-3.5" />}>
            Participants
          </TabBtn>
          <TabBtn active={tab === "media"} onClick={() => setTab("media")} icon={<ImageIcon className="h-3.5 w-3.5" />}>
            Media
          </TabBtn>
        </nav>
      </div>

      {tab === "media" && (
        <EventMediaTab
          eventId={eventId}
          ownerUserId=""
          currentUserId={user?.id ?? ""}
          organizerMode={false}
        />
      )}

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

      {tab === "participants" && <PublicParticipantsPanel eventId={eventId} subevents={subevents.map((s) => ({ id: s.id, name: s.name, sort_order: s.sort_order, class_codes: s.class_codes }))} eventClasses={classes} />}

      {tab === "map" && (
        <div className="mt-5 flex flex-1 overflow-hidden rounded-lg border border-hairline bg-card">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-[480px] flex-1">
              {subevents.length === 0 ? (
                <div className="flex h-full min-h-[480px] items-center justify-center p-10 text-center text-sm text-muted-foreground">
                  No course map available.
                </div>
              ) : (
                <>
                  <ReadOnlyCourseMap
                    key={activeMapSub}
                    path={subevents[activeMapSub]?.course_path ?? []}
                    splits={subevents[activeMapSub]?.split_points ?? []}
                    selectedSplitId={selectedSplitId}
                    hoverPosition={hoverPos}
                  />
                  <MapLocationLabel
                    point={
                      subevents[activeMapSub]?.course_path?.[0] ??
                      subevents[activeMapSub]?.split_points?.[0]?.position ??
                      null
                    }
                  />
                </>
              )}
            </div>
            {subevents.length > 0 && (subevents[activeMapSub]?.course_path?.length ?? 0) > 0 && (
              <div className="border-t border-hairline p-3">
                <ElevationProfile
                  path={subevents[activeMapSub]?.course_path ?? []}
                  splits={subevents[activeMapSub]?.split_points ?? []}
                  selectedSplitId={selectedSplitId}
                  onSelectSplit={(id) => {
                    setSelectedSplitId(id);
                    setExpandedSubMap((m) => ({ ...m, [activeMapSub]: true }));
                  }}
                  onHover={setHoverPos}
                />
              </div>
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
                    <div className="flex w-full items-center gap-2 px-3 py-3 text-left select-none">
                      <button
                        onClick={() => {
                          if (active) {
                            setExpandedSubMap((m) => ({ ...m, [i]: !m[i] }));
                          } else {
                            setActiveMapSub(i);
                            setSelectedSplitId(null);
                          }
                        }}
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

      {signupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setSignupOpen(false)} />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-hairline bg-card shadow-2xl">
            <header className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
              <div>
                <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Sign up</p>
                <h2 className="mt-0.5 text-lg text-ink">{event.title}</h2>
              </div>
              <button
                onClick={() => setSignupOpen(false)}
                aria-label="Close"
                className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="space-y-5 px-5 py-5">
              <div>
                <label className="mono mb-1.5 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Subevent
                </label>
                <select
                  value={chosenSubId ?? ""}
                  onChange={(e) => {
                    setChosenSubId(e.target.value);
                    setChosenClass(null);
                  }}
                  className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
                >
                  {subevents.length === 0 && <option value="">No subevents available</option>}
                  {subevents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.distance_km ? ` · ${s.distance_km} km` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mono mb-1.5 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Class
                </label>
                <select
                  value={chosenClass ?? ""}
                  onChange={(e) => setChosenClass(e.target.value || null)}
                  className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
                >
                  <option value="">Select class…</option>
                  {classOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <label className="flex items-start gap-3 rounded-md border border-hairline bg-background/60 px-3 py-3 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>
                  I agree to share my profile information (name, date of birth, contact details, club)
                  with the event organizer for the purpose of running this race.
                </span>
              </label>
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-hairline bg-background/60 px-5 py-3">
              <button
                onClick={() => setSignupOpen(false)}
                className="rounded-md border border-hairline bg-card px-4 py-1.5 text-sm text-ink transition hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={submitSignup}
                disabled={submitting || !chosenSubId || !chosenClass || !consent}
                className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Signing up…" : "Confirm signup"}
              </button>
            </footer>
          </div>
        </div>
      )}

      <VerificationDialog
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        onVerified={onVerified}
        title={`Sign up · ${event.title}`}
        subtitle={subForMeta?.name}
        targetKind="event_registration"
        targetId={eventId}
        targetMeta={{
          subevent_id: chosenSubId,
          class_code: chosenClass,
          race_type: subForMeta?.name ?? "",
          consent_share_data: consent,
        }}
      />
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
