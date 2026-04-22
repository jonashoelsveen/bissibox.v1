import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ArrowLeft, Pencil, Search, X, User2, Mail } from "lucide-react";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/organizer/$eventId/participants")({
  component: ParticipantsPage,
  head: () => ({ meta: [{ title: "Participants · Raceline Organizer" }] }),
});

interface Subevent {
  id: string;
  name: string;
  sort_order: number;
}

interface Registration {
  id: string;
  user_id: string;
  event_id: string;
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
  gender: string | null;
  email: string | null;
  mobile: string | null;
  nationality: string | null;
  country: string | null;
  postal_code: string | null;
  postal_place: string | null;
  address: string | null;
  address2: string | null;
  club: string | null;
  team: string | null;
  license: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
  companion: string | null;
}

function ParticipantsPage() {
  const { eventId } = Route.useParams();
  const { user, loading } = useAuth();
  const nav = useNavigate();

  const [eventTitle, setEventTitle] = useState("");
  const [subevents, setSubevents] = useState<Subevent[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [filterSub, setFilterSub] = useState<string>("all");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const [{ data: ev }, { data: subs }, { data: cls }, { data: rs }] = await Promise.all([
        supabase.from("events").select("title,owner_id").eq("id", eventId).maybeSingle(),
        supabase.from("event_subevents").select("id,name,sort_order").eq("event_id", eventId).order("sort_order"),
        supabase.from("event_classes").select("code,sort_order").eq("event_id", eventId).order("sort_order"),
        supabase.from("registrations").select("*").eq("event_id", eventId).order("created_at", { ascending: true }),
      ]);
      setEventTitle(ev?.title ?? "");
      setSubevents((subs ?? []) as Subevent[]);
      setClasses((cls ?? []).map((c) => c.code));
      const regsArr = (rs ?? []) as Registration[];
      setRegs(regsArr);

      // Fetch profiles for consenting users
      const consentingIds = Array.from(
        new Set(regsArr.filter((r) => r.consent_share_data).map((r) => r.user_id))
      );
      if (consentingIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("*")
          .in("id", consentingIds);
        const map: Record<string, Profile> = {};
        for (const p of (profs ?? []) as Profile[]) map[p.id] = p;
        setProfiles(map);
      }
    })();
  }, [user, eventId]);

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

  const selected = selectedId ? regs.find((r) => r.id === selectedId) ?? null : null;
  const selectedProfile = selected ? profiles[selected.user_id] ?? null : null;

  if (!user) return <div className="mx-auto max-w-4xl px-6 py-16 text-muted-foreground">Loading…</div>;

  return (
    <div className="px-4 md:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4 pt-3">
        <div className="flex items-start gap-3">
          <button
            onClick={() => nav({ to: "/organizer/library" })}
            aria-label="Back"
            className="-ml-2 inline-flex items-center justify-center p-2 text-muted-foreground transition hover:text-ink"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <p className="mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Organizer · Participants
            </p>
            <h1 className="mt-2 text-3xl text-ink md:text-4xl">{eventTitle || "Event"}</h1>
          </div>
        </div>
        <Link
          to="/organizer/$eventId/edit"
          params={{ eventId }}
          className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-card px-4 py-2.5 text-sm text-ink transition hover:bg-secondary"
        >
          Edit event
        </Link>
      </header>

      {/* Filters bar */}
      <div className="mt-7 flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-card px-3 py-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, bib, class…"
            className="w-full rounded-md border border-hairline bg-background pl-8 pr-3 py-1.5 text-sm text-ink outline-none focus:border-primary"
          />
        </div>
        <Selector
          label="Subevent"
          value={filterSub}
          onChange={setFilterSub}
          options={[{ value: "all", label: "All subevents" }, ...subevents.map((s) => ({ value: s.id, label: s.name }))]}
        />
        <Selector
          label="Class"
          value={filterClass}
          onChange={setFilterClass}
          options={[{ value: "all", label: "All classes" }, ...classes.map((c) => ({ value: c, label: c }))]}
        />
        <span className="ml-auto mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {filtered.length} / {regs.length}
        </span>
      </div>

      {/* Table */}
      <section className="mt-3 overflow-hidden rounded-lg border border-hairline bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-secondary/50 text-left">
                <Th className="w-10"></Th>
                <Th>First name</Th>
                <Th>Surname</Th>
                <Th className="w-24">Born</Th>
                <Th>Subevent</Th>
                <Th className="w-24">Class</Th>
                <Th className="w-28">Bib</Th>
                <Th className="w-28">Status</Th>
                <Th className="w-32">Registered</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No participants match.
                  </td>
                </tr>
              )}
              {filtered.map((r, i) => {
                const p = profiles[r.user_id];
                const consented = r.consent_share_data;
                const first = consented ? p?.first_name : "—";
                const last = consented ? p?.last_name : "—";
                const born = consented && p?.birth_date ? formatDate(p.birth_date) : "—";
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`cursor-pointer border-b border-hairline last:border-b-0 transition hover:bg-secondary/40 ${
                      i % 2 === 0 ? "bg-card" : "bg-background/40"
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(r.id);
                        }}
                        className="rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-ink"
                        aria-label="Edit participant"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-ink">{first || (consented ? "—" : <Anon />)}</td>
                    <td className="px-3 py-2.5 text-ink">{last || (consented ? "—" : "")}</td>
                    <td className="px-3 py-2.5 num text-ink">{born}</td>
                    <td className="px-3 py-2.5 text-ink">
                      {subevById[r.subevent_id ?? ""]?.name ?? r.race_type ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 num text-ink">{r.class_code ?? "—"}</td>
                    <td className="px-3 py-2.5 num text-muted-foreground">{r.bib_number ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-3 py-2.5 num text-muted-foreground">{formatDate(r.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <ParticipantDrawer
          registration={selected}
          profile={selectedProfile}
          subevent={selected.subevent_id ? subevById[selected.subevent_id] ?? null : null}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`mono px-3 py-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Anon() {
  return <span className="italic text-muted-foreground">Not shared</span>;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    confirmed: "bg-primary/10 text-primary border-primary/20",
    cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  };
  const cls = map[status] ?? "bg-secondary text-muted-foreground border-hairline";
  return (
    <span className={`mono inline-flex items-center rounded px-1.5 py-0.5 text-[10px] uppercase tracking-widest border ${cls}`}>
      {status}
    </span>
  );
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
    <label className="flex items-center gap-2 text-xs">
      <span className="mono uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-hairline bg-background px-2 py-1.5 text-sm text-ink outline-none focus:border-primary"
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

function ParticipantDrawer({
  registration,
  profile,
  subevent,
  onClose,
}: {
  registration: Registration;
  profile: Profile | null;
  subevent: Subevent | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"general" | "contact">("general");
  const consented = registration.consent_share_data;
  const fullName =
    consented && (profile?.first_name || profile?.last_name)
      ? `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim()
      : "Participant";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-[min(86vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-hairline bg-card shadow-2xl">
        {/* Header */}
        <header className="flex items-center justify-between gap-4 border-b border-hairline bg-background/60 px-5 py-3.5">
          <div className="min-w-0">
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {registration.bib_number ? `#${registration.bib_number} · ` : ""}Participant
            </p>
            <h2 className="mt-0.5 truncate text-lg text-ink">{fullName}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Tabs */}
        <nav className="flex border-b border-hairline px-3">
          <DrawerTab active={tab === "general"} onClick={() => setTab("general")} icon={<User2 className="h-3.5 w-3.5" />}>
            General
          </DrawerTab>
          <DrawerTab active={tab === "contact"} onClick={() => setTab("contact")} icon={<Mail className="h-3.5 w-3.5" />}>
            Address / Contact
          </DrawerTab>
        </nav>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {!consented && (
            <div className="mb-5 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
              This participant did not consent to share personal data with the organizer.
              Only registration details are visible.
            </div>
          )}

          {tab === "general" && (
            <FormGrid>
              <Row label="First name">{consented ? profile?.first_name ?? "—" : "—"}</Row>
              <Row label="Surname">{consented ? profile?.last_name ?? "—" : "—"}</Row>
              <Row label="Gender">{consented ? profile?.gender ?? "—" : "—"}</Row>
              <Row label="Date of birth">
                <span className="num">{consented && profile?.birth_date ? formatDate(profile.birth_date) : "—"}</span>
              </Row>
              <Row label="Club">{consented ? profile?.club ?? "—" : "—"}</Row>
              <Row label="Team">{consented ? profile?.team ?? "—" : "—"}</Row>
              <Row label="License">{consented ? profile?.license ?? "—" : "—"}</Row>
              <Row label="Class">
                <span className="num">{registration.class_code ?? "—"}</span>
              </Row>
              <Row label="Subevent">{subevent?.name ?? registration.race_type ?? "—"}</Row>
              <Row label="Bib number">
                <span className="num">{registration.bib_number ?? "—"}</span>
              </Row>
              <Row label="Status">
                <StatusPill status={registration.status} />
              </Row>
              <Row label="Registered">
                <span className="num">{formatDate(registration.created_at)}</span>
              </Row>
            </FormGrid>
          )}

          {tab === "contact" && (
            <FormGrid>
              <Row label="Address">{consented ? profile?.address ?? "—" : "—"}</Row>
              <Row label="Address 2">{consented ? profile?.address2 ?? "—" : "—"}</Row>
              <Row label="Postal code">
                <span className="num">{consented ? profile?.postal_code ?? "—" : "—"}</span>
              </Row>
              <Row label="Postal place">{consented ? profile?.postal_place ?? "—" : "—"}</Row>
              <Row label="Country">{consented ? profile?.country ?? "—" : "—"}</Row>
              <Row label="Nationality">{consented ? profile?.nationality ?? "—" : "—"}</Row>
              <Row label="Mobile">
                <span className="num">{consented ? profile?.mobile ?? "—" : "—"}</span>
              </Row>
              <Row label="Email">{consented ? profile?.email ?? "—" : "—"}</Row>
              <Row label="Emergency contact">{consented ? profile?.emergency_contact ?? "—" : "—"}</Row>
              <Row label="Emergency phone">
                <span className="num">{consented ? profile?.emergency_phone ?? "—" : "—"}</span>
              </Row>
              <Row label="Companion">{consented ? profile?.companion ?? "—" : "—"}</Row>
            </FormGrid>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-hairline bg-background/60 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-hairline bg-card px-4 py-1.5 text-sm text-ink transition hover:bg-secondary"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

function DrawerTab({
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
        active ? "border-primary text-ink" : "border-transparent text-muted-foreground hover:text-ink"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">{children}</div>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span className="mt-0.5 w-32 shrink-0 text-right text-sm text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1 text-sm text-ink">{children}</div>
    </div>
  );
}
