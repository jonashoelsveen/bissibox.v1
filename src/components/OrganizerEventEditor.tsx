import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { DEFAULT_CLASSES } from "@/lib/classes";
import { ChevronDown, Plus, Trash2, Save, FileText, Layers, ListTree, Map as MapIcon, GripVertical, ArrowLeft, Globe, Users, Image as ImageIcon, Timer, Info } from "lucide-react";

import { CourseMapEditor, type LatLng, type SplitPoint } from "@/components/CourseMapEditor";
import { ElevationProfile } from "@/components/ElevationProfile";
import { ParticipantsPanel } from "@/components/ParticipantsPanel";
import { CoOrganizersManager } from "@/components/CoOrganizersManager";
import { EventMediaTab } from "@/components/EventMediaTab";

type Mode = "create" | "edit";

interface SubeventDraft {
  id?: string;
  name: string;
  starts_at: string; // local datetime input
  distance_km: string;
  bib_from: string;
  bib_to: string;
  max_participants: string;
  class_codes: string[];
  sort_order: number;
  course_path: LatLng[];
  split_points: SplitPoint[];
}

interface Props {
  mode: Mode;
  eventId?: string;
  onSaved?: (id: string) => void;
}

const RACE_TYPE_OPTIONS = ["Road", "Trail", "Marathon", "Half Marathon", "10K", "5K", "Triathlon", "Relay"];

export function OrganizerEventEditor({ mode, eventId, onSaved }: Props) {
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();

  // Top-level
  const [tab, setTab] = useState<"details" | "classes" | "subevents" | "map" | "participants" | "media">("details");
  const [detailsSection, setDetailsSection] = useState<"about" | "timing" | "media">("about");
  const [timingCompanyId, setTimingCompanyId] = useState<string | null>(null);
  const [timingCompanies, setTimingCompanies] = useState<{ id: string; name: string }[]>([]);
  const [activeMapSub, setActiveMapSub] = useState<number>(0);
  const [expandedSubMap, setExpandedSubMap] = useState<Record<number, boolean>>({ 0: true });
  const [selectedSplitId, setSelectedSplitId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<LatLng | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragHandleId, setDragHandleId] = useState<string | null>(null);

  // Event details
  const [title, setTitle] = useState("");
  const [organizer, setOrganizer] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("NO");
  const [startsAt, setStartsAt] = useState("");
  const [signupDeadline, setSignupDeadline] = useState("");
  const [signupFee, setSignupFee] = useState("0");
  const [currency, setCurrency] = useState("NOK");
  const [raceTypes, setRaceTypes] = useState<string[]>([]);
  const [waCertified, setWaCertified] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);

  // Classes
  const [classes, setClasses] = useState<string[]>([...DEFAULT_CLASSES]);

  // Subevents
  const [subevents, setSubevents] = useState<SubeventDraft[]>([]);
  const [openSub, setOpenSub] = useState<number | null>(0);

  const [savedId, setSavedId] = useState<string | undefined>(eventId);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) nav({ to: "/auth" });
  }, [authLoading, user, nav]);

  useEffect(() => {
    if (mode !== "edit" || !eventId) return;
    void (async () => {
      const { data: e } = await supabase.from("events").select("*").eq("id", eventId).single();
      if (e) {
        setTitle(e.title ?? "");
        setOrganizer(e.organizer ?? "");
        setDescription(e.description ?? "");
        setLocation(e.location ?? "");
        setRegion(e.region ?? "");
        setCountry(e.country ?? "NO");
        setStartsAt(toLocalInput(e.starts_at));
        setSignupDeadline(e.signup_deadline ? toLocalInput(e.signup_deadline) : "");
        setSignupFee(String(e.signup_fee ?? 0));
        setCurrency(e.currency ?? "NOK");
        setRaceTypes(e.race_types ?? []);
        setWaCertified(!!e.world_athletics_certified);
        setPublished(!!(e as any).published);
        setOwnerId((e as any).owner_id ?? null);
        setTimingCompanyId(((e as any).timing_company_id as string | null) ?? null);
      }
      const { data: cls } = await supabase
        .from("event_classes")
        .select("code,sort_order")
        .eq("event_id", eventId)
        .order("sort_order", { ascending: true });
      if (cls && cls.length) setClasses(cls.map((c) => c.code));

      const { data: subs } = await supabase
        .from("event_subevents")
        .select("*")
        .eq("event_id", eventId)
        .order("sort_order", { ascending: true });
      if (subs)
        setSubevents(
          subs.map((s, i) => ({
            id: s.id,
            name: s.name,
            starts_at: s.starts_at ? toLocalInput(s.starts_at) : "",
            distance_km: s.distance_km != null ? String(s.distance_km) : "",
            bib_from: s.bib_from != null ? String(s.bib_from) : "",
            bib_to: s.bib_to != null ? String(s.bib_to) : "",
            max_participants: s.max_participants != null ? String(s.max_participants) : "",
            class_codes: s.class_codes ?? [],
            sort_order: s.sort_order ?? i,
            course_path: Array.isArray((s as any).course_path) ? ((s as any).course_path as LatLng[]) : [],
            split_points: Array.isArray((s as any).split_points) ? ((s as any).split_points as SplitPoint[]) : [],
          }))
        );
    })();
  }, [mode, eventId]);

  const canSave = useMemo(() => title.trim() && organizer.trim() && startsAt, [title, organizer, startsAt]);

  const save = async () => {
    if (!user) return;
    if (!canSave) {
      toast.error("Name, organizer and date are required.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        organizer: organizer.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        region: region.trim() || null,
        country: country.trim() || "NO",
        starts_at: new Date(startsAt).toISOString(),
        signup_deadline: signupDeadline ? new Date(signupDeadline).toISOString() : null,
        signup_fee: Number(signupFee || 0),
        currency: currency.trim() || "NOK",
        race_types: raceTypes,
        world_athletics_certified: waCertified,
        owner_id: user.id,
      };

      let id = savedId;
      if (mode === "create" && !id) {
        const { data, error } = await supabase.from("events").insert(payload as never).select("id").single();
        if (error) throw error;
        id = data!.id;
      } else if (id) {
        const { error } = await supabase.from("events").update(payload as never).eq("id", id);
        if (error) throw error;
      }
      if (!id) throw new Error("No event id");

      // Replace classes
      await supabase.from("event_classes").delete().eq("event_id", id);
      if (classes.length)
        await supabase.from("event_classes").insert(
          classes.map((code, i) => ({ event_id: id!, code, sort_order: i })) as never
        );

      // Replace subevents
      await supabase.from("event_subevents").delete().eq("event_id", id);
      if (subevents.length)
        await supabase.from("event_subevents").insert(
          subevents.map((s, i) => ({
            event_id: id!,
            name: s.name.trim() || `Race ${i + 1}`,
            starts_at: s.starts_at ? new Date(s.starts_at).toISOString() : null,
            distance_km: s.distance_km ? Number(s.distance_km) : null,
            bib_from: s.bib_from ? Number(s.bib_from) : null,
            bib_to: s.bib_to ? Number(s.bib_to) : null,
            max_participants: s.max_participants ? Number(s.max_participants) : null,
            class_codes: s.class_codes,
            sort_order: i,
            course_path: s.course_path,
            split_points: s.split_points,
          })) as never
        );

      setSavedId(id);
      toast.success(mode === "create" ? "Event created." : "Event saved.");
      onSaved?.(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  if (!user) return <div className="mx-auto max-w-4xl px-6 py-16 text-muted-foreground">Loading…</div>;

  const isMap = tab === "map";

  return (
    <div className={isMap ? "flex min-h-[calc(100vh-2rem)] flex-col px-4 md:px-6" : "px-4 md:px-6"}>
      <div>
        <header className="flex flex-wrap items-start justify-between gap-4 pt-3">
          <div className="flex items-start gap-3">
            <button
              onClick={() => nav({ to: "/organizer/library" })}
              aria-label="Back to your events"
              title="Back to your events"
              className="-ml-2 inline-flex items-center justify-center p-2 text-muted-foreground transition hover:text-ink"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <p className="mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Organizer · {mode === "create" ? "New event" : "Edit event"}
              </p>
              <h1 className="mt-2 text-3xl text-ink md:text-4xl">{title || "Untitled event"}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={busy || !canSave}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {busy ? "Saving…" : mode === "create" ? "Create event" : "Save"}
            </button>
            {mode === "edit" && savedId && (
              <button
                onClick={async () => {
                  if (!savedId) return;
                  setPublishBusy(true);
                  const next = !published;
                  const { error } = await supabase
                    .from("events")
                    .update({ published: next } as never)
                    .eq("id", savedId);
                  setPublishBusy(false);
                  if (error) return toast.error(error.message);
                  setPublished(next);
                  toast.success(next ? "Event published." : "Event unpublished.");
                }}
                disabled={publishBusy}
                className={`inline-flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-medium transition disabled:opacity-50 ${
                  published
                    ? "border-hairline bg-card text-ink hover:bg-secondary"
                    : "border-primary bg-card text-primary hover:bg-primary/5"
                }`}
              >
                <Globe className="h-4 w-4" />
                {publishBusy ? "…" : published ? "Unpublish" : "Publish"}
              </button>
            )}
          </div>
        </header>

        {/* Tab strip — Excel-like, trustworthy */}
        <nav className="mt-7 flex border-b border-hairline">
          <TabBtn active={tab === "details"} onClick={() => setTab("details")} icon={<FileText className="h-3.5 w-3.5" />}>
            Event details
          </TabBtn>
          <TabBtn active={tab === "classes"} onClick={() => setTab("classes")} icon={<Layers className="h-3.5 w-3.5" />}>
            Classes
          </TabBtn>
          <TabBtn
            active={tab === "subevents"}
            onClick={() => setTab("subevents")}
            icon={<ListTree className="h-3.5 w-3.5" />}
          >
            Subevents
          </TabBtn>
          <TabBtn active={tab === "map"} onClick={() => setTab("map")} icon={<MapIcon className="h-3.5 w-3.5" />}>
            Map
          </TabBtn>
          {mode === "edit" && savedId && (
            <>
              <TabBtn
                active={tab === "participants"}
                onClick={() => setTab("participants")}
                icon={<Users className="h-3.5 w-3.5" />}
              >
                Participants
              </TabBtn>
              <TabBtn
                active={tab === "media"}
                onClick={() => setTab("media")}
                icon={<ImageIcon className="h-3.5 w-3.5" />}
              >
                Media
              </TabBtn>
            </>
          )}
        </nav>
      </div>

      {tab === "details" && (
        <Panel>
          <FormGrid>
            <Row label="Name">
              <Text value={title} onChange={setTitle} placeholder="Perseløpet #7 - 2026" />
            </Row>
            <Row label="Organizer">
              <Text value={organizer} onChange={setOrganizer} placeholder="Feiring IL" />
            </Row>
            <Row label="Date & start">
              <Text type="datetime-local" value={startsAt} onChange={setStartsAt} />
            </Row>
            <Row label="Signup deadline">
              <Text type="datetime-local" value={signupDeadline} onChange={setSignupDeadline} />
            </Row>
            <Row label="Location">
              <Text value={location} onChange={setLocation} placeholder="Oslo" />
            </Row>
            <Row label="Region">
              <Text value={region} onChange={setRegion} placeholder="Oslo" />
            </Row>
            <Row label="Country">
              <Text value={country} onChange={setCountry} placeholder="NO" />
            </Row>
            <Row label="Signup fee">
              <div className="flex gap-2">
                <Text value={signupFee} onChange={setSignupFee} type="number" />
                <Text value={currency} onChange={setCurrency} placeholder="NOK" />
              </div>
            </Row>
            <Row label="Discipline / type" full>
              <div className="flex flex-wrap gap-1.5">
                {RACE_TYPE_OPTIONS.map((t) => {
                  const on = raceTypes.includes(t);
                  return (
                    <button
                      key={t}
                      onClick={() => setRaceTypes((arr) => (on ? arr.filter((x) => x !== t) : [...arr, t]))}
                      className={`rounded-md border px-2.5 py-1 text-xs transition ${
                        on ? "border-primary bg-primary text-primary-foreground" : "border-hairline bg-background text-muted-foreground hover:text-ink"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </Row>
            <Row label="Description" full>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
                placeholder="What runners need to know."
              />
            </Row>
            <Row label="Course" full>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={waCertified}
                  onChange={(e) => setWaCertified(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                World Athletics certified course
              </label>
            </Row>
            <Row label="Co-organizers" full>
              <CoOrganizersManager
                eventId={savedId}
                ownerId={ownerId ?? user.id}
                currentUserId={user.id}
              />
            </Row>
          </FormGrid>
        </Panel>
      )}

      {tab === "classes" && (
        <Panel>
          <p className="text-sm text-muted-foreground">
            Classes available for this event. Subevents will pick from this list.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3">
            {[...new Set([...DEFAULT_CLASSES, ...classes])].map((code) => {
              const on = classes.includes(code);
              return (
                <label key={code} className="flex items-center gap-3 text-base text-ink">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setClasses((arr) => (on ? arr.filter((c) => c !== code) : [...arr, code]))
                    }
                    className="h-5 w-5 accent-primary"
                  />
                  <span className="num">{code}</span>
                </label>
              );
            })}
          </div>
          <AddClass onAdd={(c) => setClasses((arr) => (arr.includes(c) ? arr : [...arr, c]))} />
        </Panel>
      )}

      {tab === "subevents" && (
        <Panel>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Races within this event (e.g. 5K, 10K, Marathon). Pick which classes apply to each.
            </p>
            <button
              onClick={() => {
                setSubevents((arr) => [
                  ...arr,
                  {
                    name: "",
                    starts_at: startsAt,
                    distance_km: "",
                    bib_from: "",
                    bib_to: "",
                    max_participants: "",
                    class_codes: [...classes],
                    sort_order: arr.length,
                    course_path: [],
                    split_points: [],
                  },
                ]);
                setOpenSub(subevents.length);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-background px-3 py-1.5 text-xs text-ink hover:bg-secondary"
            >
              <Plus className="h-3.5 w-3.5" /> Add race
            </button>
          </div>

          <div className="mt-5 space-y-2">
            {subevents.length === 0 && (
              <div className="rounded-lg border border-hairline px-5 py-8 text-center text-sm text-muted-foreground">
                No races yet. Add a 5K, 10K, Half Marathon…
              </div>
            )}
            {subevents.map((s, idx) => {
              const dragKey = `sub-${idx}`;
              const isOver = dragOverId === dragKey && dragId !== null && dragId !== dragKey;
              return (
                <div
                  key={idx}
                  draggable={dragHandleId === dragKey}
                  onDragStart={(e) => {
                    if (dragHandleId !== dragKey) {
                      e.preventDefault();
                      return;
                    }
                    setDragId(dragKey);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    if (!dragId || !dragId.startsWith("sub-")) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverId(dragKey);
                  }}
                  onDragLeave={() => {
                    if (dragOverId === dragKey) setDragOverId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!dragId || !dragId.startsWith("sub-")) return;
                    const fromIdx = Number(dragId.replace("sub-", ""));
                    const toIdx = idx;
                    if (fromIdx === toIdx) return;
                    setSubevents((arr) => {
                      const next = [...arr];
                      const [moved] = next.splice(fromIdx, 1);
                      next.splice(toIdx, 0, moved);
                      return next.map((x, i) => ({ ...x, sort_order: i }));
                    });
                    setOpenSub(toIdx);
                    setDragId(null);
                    setDragOverId(null);
                    setDragHandleId(null);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragOverId(null);
                    setDragHandleId(null);
                  }}
                  className={`overflow-hidden rounded-lg border transition ${
                    isOver ? "border-primary bg-primary/5" : "border-hairline bg-card"
                  }`}
                >
                  <SubeventRow
                    sub={s}
                    open={openSub === idx}
                    onToggle={() => setOpenSub((o) => (o === idx ? null : idx))}
                    allClasses={classes}
                    onChange={(patch) =>
                      setSubevents((arr) => arr.map((x, i) => (i === idx ? { ...x, ...patch } : x)))
                    }
                    onDelete={() => {
                      setSubevents((arr) => arr.filter((_, i) => i !== idx));
                      setOpenSub(null);
                    }}
                    onHandleDown={() => setDragHandleId(dragKey)}
                    onHandleUp={() => setDragHandleId(null)}
                  />
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {tab === "map" && (
        <div className="mt-5 flex flex-1 overflow-hidden rounded-lg border border-hairline bg-card">
          {/* Left: map + elevation profile stacked */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-[480px] flex-1">
              {subevents.length === 0 ? (
                <div className="flex h-full min-h-[480px] items-center justify-center p-10 text-center text-sm text-muted-foreground">
                  Add a race in the Subevents tab to draw its course map.
                </div>
              ) : (
                <CourseMapEditor
                  key={activeMapSub}
                  title={subevents[activeMapSub]?.name || `Race ${activeMapSub + 1}`}
                  path={subevents[activeMapSub]?.course_path ?? []}
                  splits={subevents[activeMapSub]?.split_points ?? []}
                  selectedSplitId={selectedSplitId}
                  hoverPosition={hoverPos}
                  onSelectSplit={(id) => {
                    setSelectedSplitId(id);
                    if (id != null)
                      setExpandedSubMap((m) => ({ ...m, [activeMapSub]: true }));
                  }}
                  onChange={({ path, splits }) =>
                    setSubevents((arr) =>
                      arr.map((x, i) =>
                        i === activeMapSub ? { ...x, course_path: path, split_points: splits } : x
                      )
                    )
                  }
                  onSave={save}
                  saving={busy}
                  onDelete={() =>
                    setSubevents((arr) =>
                      arr.map((x, i) =>
                        i === activeMapSub ? { ...x, course_path: [], split_points: [] } : x
                      )
                    )
                  }
                />
              )}
            </div>
            {subevents.length > 0 && (
              <div className="border-t border-hairline p-3">
                <ElevationProfile
                  path={subevents[activeMapSub]?.course_path ?? []}
                  splits={subevents[activeMapSub]?.split_points ?? []}
                  selectedSplitId={selectedSplitId}
                  onSelectSplit={(id) => {
                    setSelectedSplitId(id);
                    if (id != null)
                      setExpandedSubMap((m) => ({ ...m, [activeMapSub]: true }));
                  }}
                  onHover={setHoverPos}
                />
              </div>
            )}
          </div>

          {/* Right sidebar — subevent headers with collapsible points */}
          <aside className="w-96 shrink-0 overflow-y-auto border-l border-hairline bg-background px-3 py-3">
            <div className="border-b border-hairline px-1 pb-3">
              <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Races</p>
              <p className="mt-0.5 text-sm text-ink">Select a race to draw</p>
            </div>
            <div className="flex flex-col gap-2 pt-3">
              {subevents.map((s, i) => {
                const active = i === activeMapSub;
                const expanded = !!expandedSubMap[i];
                const points = s.split_points ?? [];
                return (
                  <div
                    key={i}
                    className={`overflow-hidden rounded-md border ${
                      active ? "border-primary bg-primary/5" : "border-hairline bg-card"
                    }`}
                  >
                    <div
                      className={`flex w-full items-center gap-2 px-3 py-3 text-left transition select-none ${
                        active ? "" : "hover:bg-secondary"
                      }`}
                    >
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
                        onClick={() =>
                          setExpandedSubMap((m) => ({ ...m, [i]: !m[i] }))
                        }
                        className="rounded p-1 text-muted-foreground hover:text-ink"
                        aria-label={expanded ? "Collapse" : "Expand"}
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition ${expanded ? "rotate-0" : "-rotate-90"}`}
                        />
                      </button>
                    </div>

                    {expanded && active && (
                      <div className="bg-card/50 px-3 pb-3 pt-4">
                        {points.length === 0 ? (
                          <p className="px-2 py-3 text-xs text-muted-foreground">
                            No splits or fuel points yet. Pick a tool and click the map.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {points.map((p) => {
                              const sel = p.id === selectedSplitId;
                              const dot =
                                p.kind === "split"
                                  ? "#2563eb"
                                  : p.kind === "fuel"
                                  ? "#f59e0b"
                                  : p.kind === "start"
                                  ? "#16a34a"
                                  : p.kind === "finish"
                                  ? "#dc2626"
                                  : "#7c3aed";
                              const kindLabel =
                                p.kind.charAt(0).toUpperCase() + p.kind.slice(1);
                              const isDragging = dragId === p.id;
                              const isOver = dragOverId === p.id && dragId !== p.id;
                              return (
                                <li
                                  key={p.id}
                                  draggable={dragHandleId === p.id}
                                  onDragStart={(e) => {
                                    if (dragHandleId !== p.id) {
                                      e.preventDefault();
                                      return;
                                    }
                                    setDragId(p.id);
                                    e.dataTransfer.effectAllowed = "move";
                                    e.dataTransfer.setData("text/plain", p.id);
                                  }}
                                  onDragEnter={(e) => {
                                    e.preventDefault();
                                    if (dragId && dragId !== p.id) {
                                      // Live reorder: move dragged item to this index
                                      setSubevents((arr) =>
                                        arr.map((x, ix) => {
                                          if (ix !== i) return x;
                                          const list = [...x.split_points];
                                          const from = list.findIndex((sp) => sp.id === dragId);
                                          const to = list.findIndex((sp) => sp.id === p.id);
                                          if (from < 0 || to < 0 || from === to) return x;
                                          const [moved] = list.splice(from, 1);
                                          list.splice(to, 0, moved);
                                          return { ...x, split_points: list };
                                        })
                                      );
                                      setDragOverId(p.id);
                                    }
                                  }}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                  }}
                                  onDragEnd={() => {
                                    setDragId(null);
                                    setDragOverId(null);
                                    setDragHandleId(null);
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    setDragId(null);
                                    setDragOverId(null);
                                    setDragHandleId(null);
                                  }}
                                  onClick={() => setSelectedSplitId(p.id)}
                                  className={`group relative flex items-center gap-2 overflow-hidden rounded-md border bg-card pl-3 pr-3 py-3 shadow-sm transition cursor-pointer ${
                                    sel
                                      ? "border-primary shadow-md"
                                      : "border-hairline hover:border-muted-foreground/40 hover:shadow"
                                  } ${isDragging ? "opacity-40" : ""} ${isOver ? "ring-2 ring-primary/40" : ""}`}
                                >
                                  <span
                                    aria-hidden
                                    className="absolute left-0 top-0 h-full w-1"
                                    style={{ background: dot }}
                                  />
                                  <span
                                    className="ml-1 grid h-7 w-5 shrink-0 cursor-grab place-items-center text-muted-foreground hover:text-ink active:cursor-grabbing"
                                    onMouseDown={() => setDragHandleId(p.id)}
                                    onMouseUp={() => setDragHandleId(null)}
                                    onMouseLeave={() => {
                                      // only clear if not currently dragging
                                      if (!dragId) setDragHandleId(null);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    title="Drag to reorder"
                                    aria-label="Drag to reorder"
                                  >
                                    <GripVertical className="h-4 w-4" />
                                  </span>
                                  <div className="flex min-w-0 flex-1 flex-col">
                                    <span className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                      {kindLabel}
                                    </span>
                                    <input
                                      value={p.label}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setSubevents((arr) =>
                                          arr.map((x, ix) =>
                                            ix === i
                                              ? {
                                                  ...x,
                                                  split_points: x.split_points.map((sp) =>
                                                    sp.id === p.id ? { ...sp, label: v } : sp
                                                  ),
                                                }
                                              : x
                                          )
                                        );
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="mt-0.5 w-full bg-transparent text-sm font-medium text-ink outline-none"
                                    />
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSubevents((arr) =>
                                        arr.map((x, ix) =>
                                          ix === i
                                            ? {
                                                ...x,
                                                split_points: x.split_points.filter(
                                                  (sp) => sp.id !== p.id
                                                ),
                                              }
                                            : x
                                        )
                                      );
                                      if (sel) setSelectedSplitId(null);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 text-muted-foreground transition hover:text-destructive"
                                    aria-label="Remove"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
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

      {tab === "participants" && savedId && (
        <ParticipantsPanel eventId={savedId} />
      )}

      {tab === "media" && savedId && (
        <EventMediaTab
          eventId={savedId}
          ownerUserId={ownerId ?? user.id}
          currentUserId={user.id}
          organizerMode={true}
        />
      )}

      {mode === "edit" && savedId && (
        <button
          onClick={async () => {
            if (!savedId) return;
            const ok = window.confirm(
              `Delete event "${title || "Untitled"}"? This cannot be undone.`
            );
            if (!ok) return;
            setBusy(true);
            const { error } = await supabase.from("events").delete().eq("id", savedId);
            setBusy(false);
            if (error) return toast.error(error.message);
            toast.success("Event deleted.");
            nav({ to: "/organizer/library" });
          }}
          disabled={busy}
          aria-label="Delete event"
          title="Delete event"
          className="fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 rounded-full border border-destructive/40 bg-card px-4 py-2.5 text-sm font-medium text-destructive shadow-lg transition hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          Delete event
        </button>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm transition ${
        active
          ? "border-primary text-ink"
          : "border-transparent text-muted-foreground hover:text-ink"
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

function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">{children}</div>;
}

function Row({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`flex items-start gap-4 ${full ? "md:col-span-2" : ""}`}>
      <span className="mt-2 w-32 shrink-0 text-right text-sm text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </label>
  );
}

function Text({
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none transition focus:border-primary"
    />
  );
}

function AddClass({ onAdd }: { onAdd: (code: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="mt-6 flex items-center gap-2 border-t border-hairline pt-4">
      <span className="text-sm text-muted-foreground">Add custom class</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value.toUpperCase())}
        placeholder="e.g. Elite"
        className="rounded-md border border-hairline bg-background px-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
      />
      <button
        onClick={() => {
          if (v.trim()) {
            onAdd(v.trim());
            setV("");
          }
        }}
        className="rounded-md border border-hairline bg-background px-3 py-1.5 text-xs text-ink hover:bg-secondary"
      >
        Add
      </button>
    </div>
  );
}

function SubeventRow({
  sub,
  open,
  onToggle,
  onChange,
  onDelete,
  allClasses,
  onHandleDown,
  onHandleUp,
}: {
  sub: SubeventDraft;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<SubeventDraft>) => void;
  onDelete: () => void;
  allClasses: string[];
  onHandleDown?: () => void;
  onHandleUp?: () => void;
}) {
  return (
    <div>
      <div className="flex w-full items-center gap-2 bg-secondary/40 px-3 py-3 transition hover:bg-secondary">
        <span
          onMouseDown={onHandleDown}
          onMouseUp={onHandleUp}
          onMouseLeave={onHandleUp}
          className="flex h-7 w-7 cursor-grab items-center justify-center rounded-md border border-hairline bg-background text-muted-foreground hover:text-ink active:cursor-grabbing"
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <button
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-0" : "-rotate-90"}`}
          />
          <span className="truncate text-sm font-medium text-ink">{sub.name || "Untitled race"}</span>
          {sub.distance_km && (
            <span className="mono text-xs text-muted-foreground">· {sub.distance_km} km</span>
          )}
          <span className="mono text-xs text-muted-foreground">
            · {sub.class_codes.length} classes
          </span>
        </button>
        <button
          aria-label="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="rounded p-1 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="px-5 py-5">
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
            <Row label="Name">
              <Text value={sub.name} onChange={(v) => onChange({ name: v })} placeholder="Marathon" />
            </Row>
            <Row label="Start time">
              <DateTimeField value={sub.starts_at} onChange={(v) => onChange({ starts_at: v })} />
            </Row>
            <Row label="Distance (km)">
              <Text type="number" value={sub.distance_km} onChange={(v) => onChange({ distance_km: v })} />
            </Row>
          </div>

          <div className="mt-5 border-t border-hairline pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink">Classes</span>
              <div className="flex gap-2">
                <button
                  onClick={() => onChange({ class_codes: [...allClasses] })}
                  className="text-xs text-muted-foreground hover:text-ink"
                >
                  Select all
                </button>
                <button
                  onClick={() => onChange({ class_codes: [] })}
                  className="text-xs text-muted-foreground hover:text-ink"
                >
                  Clear
                </button>
              </div>
            </div>
            {allClasses.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Define classes in the Classes tab first.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 md:grid-cols-4">
                {allClasses.map((c) => {
                  const on = sub.class_codes.includes(c);
                  return (
                    <label key={c} className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          onChange({
                            class_codes: on
                              ? sub.class_codes.filter((x) => x !== c)
                              : [...sub.class_codes, c],
                          })
                        }
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="num">{c}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DateTimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  // Display: DD.MM.YYYY HH:MM ; storage: YYYY-MM-DDTHH:MM
  const toDisplay = (v: string): string => {
    if (!v) return "";
    const [d, t] = v.split("T");
    const [y, mo, da] = (d ?? "").split("-");
    if (!y || !mo || !da) return "";
    return `${da}.${mo}.${y}${t ? ` ${t.slice(0, 5)}` : ""}`;
  };
  const fromDigits = (digits: string): string | null => {
    if (digits.length < 8) return null;
    const da = digits.slice(0, 2);
    const mo = digits.slice(2, 4);
    const y = digits.slice(4, 8);
    const hh = digits.slice(8, 10).padEnd(2, "0");
    const mi = digits.slice(10, 12).padEnd(2, "0");
    if (Number(mo) < 1 || Number(mo) > 12) return null;
    if (Number(da) < 1 || Number(da) > 31) return null;
    return `${y}-${mo}-${da}T${hh}:${mi}`;
  };
  const formatLive = (raw: string): string => {
    const d = raw.replace(/\D/g, "").slice(0, 12);
    let out = "";
    if (d.length > 0) out += d.slice(0, Math.min(2, d.length));
    if (d.length >= 3) out += "." + d.slice(2, Math.min(4, d.length));
    if (d.length >= 5) out += "." + d.slice(4, Math.min(8, d.length));
    if (d.length >= 9) out += " " + d.slice(8, Math.min(10, d.length));
    if (d.length >= 11) out += ":" + d.slice(10, Math.min(12, d.length));
    return out;
  };
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? toDisplay(value);
  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="DD.MM.YYYY HH:MM"
      value={display}
      onChange={(e) => {
        const formatted = formatLive(e.target.value);
        const digits = formatted.replace(/\D/g, "");
        const parsed = fromDigits(digits);
        if (parsed && digits.length >= 12) {
          setDraft(null);
          onChange(parsed);
        } else if (formatted === "") {
          setDraft(null);
          onChange("");
        } else {
          setDraft(formatted);
          if (parsed) onChange(parsed);
        }
      }}
      onBlur={() => setDraft(null)}
      className="w-full rounded-xl border border-hairline bg-background px-3 py-2 text-sm text-ink shadow-sm outline-none transition focus:border-primary"
    />
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
