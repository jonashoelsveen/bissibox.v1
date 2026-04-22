import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { DEFAULT_CLASSES } from "@/lib/classes";
import { ChevronDown, Plus, Trash2, Save, FileText, Layers, ListTree, Map as MapIcon } from "lucide-react";
import { CourseMapEditor, type LatLng, type SplitPoint } from "@/components/CourseMapEditor";

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
  const [tab, setTab] = useState<"details" | "classes" | "subevents" | "map">("details");
  const [activeMapSub, setActiveMapSub] = useState<number>(0);
  const [expandedSubMap, setExpandedSubMap] = useState<Record<number, boolean>>({ 0: true });
  const [selectedSplitId, setSelectedSplitId] = useState<string | null>(null);

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

  // Classes
  const [classes, setClasses] = useState<string[]>([...DEFAULT_CLASSES]);

  // Subevents
  const [subevents, setSubevents] = useState<SubeventDraft[]>([]);
  const [openSub, setOpenSub] = useState<number | null>(0);

  const [savedId, setSavedId] = useState<string | undefined>(eventId);
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
    <div className={isMap ? "flex min-h-[calc(100vh-2rem)] flex-col" : "mx-auto max-w-4xl px-6 md:px-10"}>
      <div className={isMap ? "mx-auto w-full max-w-7xl px-6 md:px-10" : ""}>
        <header className="flex flex-wrap items-end justify-between gap-4 pt-4">
          <div>
            <p className="mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Organizer · {mode === "create" ? "New event" : "Edit event"}
            </p>
            <h1 className="mt-2 text-3xl text-ink md:text-4xl">{title || "Untitled event"}</h1>
          </div>
          <button
            onClick={save}
            disabled={busy || !canSave}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {busy ? "Saving…" : mode === "create" ? "Create event" : "Save"}
          </button>
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

          <div className="mt-5 overflow-hidden rounded-md border border-hairline">
            {subevents.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                No races yet. Add a 5K, 10K, Half Marathon…
              </div>
            )}
            {subevents.map((s, idx) => (
              <SubeventRow
                key={idx}
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
              />
            ))}
          </div>
        </Panel>
      )}

      {tab === "map" && (
        <div className="mt-5 flex flex-1 overflow-hidden rounded-lg border border-hairline bg-card">
          {/* Map area */}
          <div className="relative min-h-[600px] flex-1">
            {subevents.length === 0 ? (
              <div className="flex h-full min-h-[600px] items-center justify-center p-10 text-center text-sm text-muted-foreground">
                Add a race in the Subevents tab to draw its course map.
              </div>
            ) : (
              <CourseMapEditor
                key={activeMapSub}
                title={subevents[activeMapSub]?.name || `Race ${activeMapSub + 1}`}
                path={subevents[activeMapSub]?.course_path ?? []}
                splits={subevents[activeMapSub]?.split_points ?? []}
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

          {/* Right sidebar — subevent headers */}
          <aside className="w-72 shrink-0 border-l border-hairline bg-background">
            <div className="border-b border-hairline px-4 py-3">
              <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Races</p>
              <p className="mt-0.5 text-sm text-ink">Select a race to draw</p>
            </div>
            <div className="divide-y divide-hairline">
              {subevents.map((s, i) => {
                const active = i === activeMapSub;
                const drawn = (s.course_path?.length ?? 0) > 1;
                return (
                  <button
                    key={i}
                    onClick={() => setActiveMapSub(i)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${
                      active ? "bg-primary/10 border-l-2 border-primary" : "border-l-2 border-transparent hover:bg-secondary"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`truncate text-sm ${active ? "text-ink font-medium" : "text-ink"}`}>
                        {s.name || `Race ${i + 1}`}
                      </p>
                      <p className="mono mt-0.5 text-[10px] text-muted-foreground">
                        {s.distance_km ? `${s.distance_km} km · ` : ""}
                        {s.course_path?.length ?? 0} pts · {s.split_points?.length ?? 0} markers
                      </p>
                    </div>
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${drawn ? "bg-primary" : "bg-muted-foreground/30"}`}
                      title={drawn ? "Course drawn" : "No course"}
                    />
                  </button>
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
}: {
  sub: SubeventDraft;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<SubeventDraft>) => void;
  onDelete: () => void;
  allClasses: string[];
}) {
  return (
    <div className="border-b border-hairline last:border-b-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 bg-secondary/40 px-5 py-3 text-left transition hover:bg-secondary"
      >
        <div className="flex items-center gap-3">
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition ${open ? "rotate-0" : "-rotate-90"}`}
          />
          <span className="text-sm font-medium text-ink">{sub.name || "Untitled race"}</span>
          {sub.distance_km && (
            <span className="mono text-xs text-muted-foreground">· {sub.distance_km} km</span>
          )}
          <span className="mono text-xs text-muted-foreground">
            · {sub.class_codes.length} classes
          </span>
        </div>
        <span
          role="button"
          aria-label="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="rounded p-1 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </span>
      </button>
      {open && (
        <div className="px-5 py-5">
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
            <Row label="Name">
              <Text value={sub.name} onChange={(v) => onChange({ name: v })} placeholder="Marathon" />
            </Row>
            <Row label="Start time">
              <Text type="datetime-local" value={sub.starts_at} onChange={(v) => onChange({ starts_at: v })} />
            </Row>
            <Row label="Distance (km)">
              <Text type="number" value={sub.distance_km} onChange={(v) => onChange({ distance_km: v })} />
            </Row>
            <Row label="Max participants">
              <Text type="number" value={sub.max_participants} onChange={(v) => onChange({ max_participants: v })} />
            </Row>
            <Row label="Bib numbers">
              <div className="flex items-center gap-2">
                <Text type="number" value={sub.bib_from} onChange={(v) => onChange({ bib_from: v })} placeholder="from" />
                <span className="text-muted-foreground">–</span>
                <Text type="number" value={sub.bib_to} onChange={(v) => onChange({ bib_to: v })} placeholder="to" />
              </div>
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

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
