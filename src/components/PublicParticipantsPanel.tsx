import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search } from "lucide-react";
import { formatDate } from "@/lib/format";

interface Subevent {
  id: string;
  name: string;
  sort_order: number;
  class_codes?: string[];
}

interface Registration {
  id: string;
  user_id: string;
  subevent_id: string | null;
  class_code: string | null;
  race_type: string;
  status: string;
  bib_number: string | null;
  consent_share_data: boolean;
  created_at: string;
}

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  birth_date: string | null;
  club: string | null;
}

function formatBornDigits(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = iso.slice(0, 10).replace(/-/g, "");
  return /^\d{8}$/.test(d) ? d : "";
}

export function PublicParticipantsPanel({
  eventId,
  subevents: subevProp,
  eventClasses: classesProp,
}: {
  eventId: string;
  subevents?: Subevent[];
  eventClasses?: string[];
}) {
  const [subevents, setSubevents] = useState<Subevent[]>(subevProp ?? []);
  const [classes, setClasses] = useState<string[]>(classesProp ?? []);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [filterSub, setFilterSub] = useState<string>("all");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Sync from parent props when provided
  useEffect(() => {
    if (subevProp) setSubevents(subevProp);
  }, [subevProp]);
  useEffect(() => {
    if (classesProp) setClasses(classesProp);
  }, [classesProp]);

  useEffect(() => {
    if (!eventId) return;
    void (async () => {
      const fetchSubs = !subevProp;
      const fetchCls = !classesProp;
      const [subsRes, clsRes, { data: rs }] = await Promise.all([
        fetchSubs
          ? supabase
              .from("event_subevents")
              .select("id,name,sort_order,class_codes")
              .eq("event_id", eventId)
              .order("sort_order")
          : Promise.resolve({ data: null } as any),
        fetchCls
          ? supabase
              .from("event_classes")
              .select("code,sort_order")
              .eq("event_id", eventId)
              .order("sort_order")
          : Promise.resolve({ data: null } as any),
        supabase
          .from("registrations")
          .select("id,user_id,subevent_id,class_code,race_type,status,bib_number,consent_share_data,created_at")
          .eq("event_id", eventId)
          .order("created_at", { ascending: true }),
      ]);
      if (fetchSubs && subsRes.data) setSubevents(subsRes.data as Subevent[]);
      if (fetchCls && clsRes.data) setClasses((clsRes.data as { code: string }[]).map((c) => c.code));
      const regsArr = (rs ?? []) as Registration[];
      setRegs(regsArr);

      const consentingIds = Array.from(
        new Set(regsArr.filter((r) => r.consent_share_data).map((r) => r.user_id)),
      );
      if (consentingIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,first_name,last_name,birth_date,club")
          .in("id", consentingIds);
        const map: Record<string, Profile> = {};
        for (const p of (profs ?? []) as Profile[]) map[p.id] = p;
        setProfiles(map);
      } else {
        setProfiles({});
      }
    })();
  }, [eventId, subevProp, classesProp]);

  const subevById = useMemo(() => {
    const m: Record<string, Subevent> = {};
    for (const s of subevents) m[s.id] = s;
    return m;
  }, [subevents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return regs.filter((r) => {
      if (filterSub !== "all" && r.subevent_id !== filterSub) return false;
      if (filterClass !== "all" && r.class_code !== filterClass) return false;
      if (q) {
        const p = profiles[r.user_id];
        const hay = [
          p?.first_name,
          p?.last_name,
          p?.club,
          r.bib_number,
          r.class_code,
          r.race_type,
          subevById[r.subevent_id ?? ""]?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [regs, filterSub, filterClass, search, profiles, subevById]);

  return (
    <div>
      {/* Filters */}
      <div className="mt-5 space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Selector
            label="Subevent / Distance"
            value={filterSub}
            onChange={(v) => {
              setFilterSub(v);
              setFilterClass("all");
            }}
            options={[
              { value: "all", label: "All subevents" },
              ...subevents.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <Selector
            label="Class"
            value={filterClass}
            onChange={setFilterClass}
            options={[
              { value: "all", label: "All classes" },
              ...(filterSub !== "all"
                ? (subevents.find((s) => s.id === filterSub)?.class_codes ?? [])
                : classes
              ).map((c) => ({ value: c, label: c })),
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search athlete, club, bib, class…"
              className="h-10 w-full rounded-lg border border-hairline bg-card pl-8 pr-3 text-sm text-ink outline-none focus:border-primary"
            />
          </div>
          <span className="mono shrink-0 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {filtered.length} / {regs.length}
          </span>
        </div>
      </div>

      <section className="mt-3 overflow-hidden rounded-lg border border-hairline bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-hairline bg-secondary/50 text-left">
                <Th>First name</Th>
                <Th>Surname</Th>
                <Th className="w-24">Born</Th>
                <Th>Club</Th>
                <Th>Subevent</Th>
                <Th className="w-24">Class</Th>
                <Th className="w-28">Bib</Th>
                <Th className="w-32">Registered</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No participants yet.
                  </td>
                </tr>
              )}
              {filtered.map((r, i) => {
                const p = profiles[r.user_id];
                const consented = r.consent_share_data;
                const first = consented ? p?.first_name ?? "—" : <Anon />;
                const last = consented ? p?.last_name ?? "" : "";
                const born = consented ? formatBornDigits(p?.birth_date) || "—" : "—";
                const club = consented ? p?.club ?? "—" : "—";
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-hairline transition last:border-b-0 hover:bg-secondary/40 ${
                      i % 2 === 0 ? "bg-card" : "bg-background/40"
                    }`}
                  >
                    <td className="px-3 py-1 text-ink">{first}</td>
                    <td className="px-3 py-1 text-ink">{last}</td>
                    <td className="px-3 py-1 num text-ink">{born}</td>
                    <td className="px-3 py-1 text-ink">{club}</td>
                    <td className="px-3 py-1 text-ink">
                      {subevById[r.subevent_id ?? ""]?.name ?? r.race_type ?? "—"}
                    </td>
                    <td className="px-3 py-1 num text-ink">{r.class_code ?? "—"}</td>
                    <td className="px-3 py-1 num text-muted-foreground">{r.bib_number ?? "—"}</td>
                    <td className="px-3 py-1 num text-muted-foreground">
                      {formatDate(r.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`mono px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Anon() {
  return <span className="italic text-muted-foreground">Private</span>;
}

function Selector({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mono mb-1 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full cursor-pointer rounded-lg border border-hairline bg-card px-3 text-sm text-ink outline-none focus:border-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
