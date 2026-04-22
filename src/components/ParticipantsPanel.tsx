import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, Search, X, User2, Mail, Save } from "lucide-react";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";

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

// Born → digits only, e.g. 19850427
function formatBornDigits(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = iso.slice(0, 10).replace(/-/g, "");
  return /^\d{8}$/.test(d) ? d : "";
}

// "19850427" → "1985-04-27"
function digitsToIso(d: string): string | null {
  const v = d.replace(/\D/g, "");
  if (v.length !== 8) return null;
  const iso = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  if (Number.isNaN(Date.parse(iso))) return null;
  return iso;
}

export function ParticipantsPanel({ eventId }: { eventId: string }) {
  const [subevents, setSubevents] = useState<Subevent[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [filterSub, setFilterSub] = useState<string>("all");
  const [filterClass, setFilterClass] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!eventId) return;
    void (async () => {
      const [{ data: subs }, { data: cls }, { data: rs }] = await Promise.all([
        supabase
          .from("event_subevents")
          .select("id,name,sort_order")
          .eq("event_id", eventId)
          .order("sort_order"),
        supabase
          .from("event_classes")
          .select("code,sort_order")
          .eq("event_id", eventId)
          .order("sort_order"),
        supabase
          .from("registrations")
          .select("*")
          .eq("event_id", eventId)
          .order("created_at", { ascending: true }),
      ]);
      setSubevents((subs ?? []) as Subevent[]);
      setClasses((cls ?? []).map((c) => c.code));
      const regsArr = (rs ?? []) as Registration[];
      setRegs(regsArr);

      const consentingIds = Array.from(
        new Set(regsArr.filter((r) => r.consent_share_data).map((r) => r.user_id)),
      );
      if (consentingIds.length) {
        const { data: profs } = await supabase.from("profiles").select("*").in("id", consentingIds);
        const map: Record<string, Profile> = {};
        for (const p of (profs ?? []) as Profile[]) map[p.id] = p;
        setProfiles(map);
      } else {
        setProfiles({});
      }
    })();
  }, [eventId, reload]);

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

  return (
    <div>
      {/* Filters bar */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, bib, class…"
            className="h-10 w-full rounded-lg border border-hairline bg-card pl-8 pr-3 text-sm text-ink outline-none focus:border-primary"
          />
        </div>
        <Selector
          label="Subevent"
          value={filterSub}
          onChange={setFilterSub}
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
            ...classes.map((c) => ({ value: c, label: c })),
          ]}
        />
        <span className="ml-auto mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {filtered.length} / {regs.length}
        </span>
      </div>

      {/* Table */}
      <section className="mt-3 overflow-hidden rounded-lg border border-hairline bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
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
                    No participants yet.
                  </td>
                </tr>
              )}
              {filtered.map((r, i) => {
                const p = profiles[r.user_id];
                const consented = r.consent_share_data;
                const first = consented ? p?.first_name : null;
                const last = consented ? p?.last_name : null;
                const born = consented ? formatBornDigits(p?.birth_date) || "—" : "—";
                return (
                  <tr
                    key={r.id}
                    className={`group border-b border-hairline transition last:border-b-0 hover:bg-secondary/40 ${
                      i % 2 === 0 ? "bg-card" : "bg-background/40"
                    }`}
                  >
                    <td className="w-10 px-2 py-1">
                      <button
                        onClick={() => setSelectedId(r.id)}
                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-ink"
                        aria-label="Edit participant"
                        title="Edit participant"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    <td className="px-3 py-1 text-ink">
                      {first ?? (consented ? "—" : <Anon />)}
                    </td>
                    <td className="px-3 py-1 text-ink">{last ?? (consented ? "—" : "")}</td>
                    <td className="px-3 py-1 num text-ink">{born}</td>
                    <td className="px-3 py-1 text-ink">
                      {subevById[r.subevent_id ?? ""]?.name ?? r.race_type ?? "—"}
                    </td>
                    <td className="px-3 py-1 num text-ink">{r.class_code ?? "—"}</td>
                    <td className="px-3 py-1 num text-muted-foreground">{r.bib_number ?? "—"}</td>
                    <td className="px-3 py-1">
                      <StatusPill status={r.status} />
                    </td>
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

      {selected && (
        <ParticipantDrawer
          registration={selected}
          profile={selectedProfile}
          subevents={subevents}
          classes={classes}
          onClose={() => setSelectedId(null)}
          onSaved={() => {
            setSelectedId(null);
            setReload((n) => n + 1);
          }}
        />
      )}
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
    <span
      className={`mono inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-widest ${cls}`}
    >
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
        className="cursor-pointer rounded-md border border-hairline bg-background px-2 py-1.5 text-sm text-ink outline-none focus:border-primary"
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

// ─────────────────────────────────────────────────────────────────────────────
// Editable drawer
// ─────────────────────────────────────────────────────────────────────────────

interface RegEdit {
  bib_number: string;
  class_code: string;
  subevent_id: string;
  status: string;
}

interface ProfileEdit {
  first_name: string;
  last_name: string;
  gender: string;
  birth_date_digits: string;
  club: string;
  team: string;
  license: string;
  address: string;
  address2: string;
  postal_code: string;
  postal_place: string;
  country: string;
  nationality: string;
  mobile: string;
  email: string;
  emergency_contact: string;
  emergency_phone: string;
  companion: string;
}

function ParticipantDrawer({
  registration,
  profile,
  subevents,
  classes,
  onClose,
  onSaved,
}: {
  registration: Registration;
  profile: Profile | null;
  subevents: Subevent[];
  classes: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<"general" | "contact">("general");
  const consented = registration.consent_share_data;
  const [busy, setBusy] = useState(false);

  const [reg, setReg] = useState<RegEdit>({
    bib_number: registration.bib_number ?? "",
    class_code: registration.class_code ?? "",
    subevent_id: registration.subevent_id ?? "",
    status: registration.status,
  });

  const [prof, setProf] = useState<ProfileEdit>({
    first_name: profile?.first_name ?? "",
    last_name: profile?.last_name ?? "",
    gender: profile?.gender ?? "",
    birth_date_digits: formatBornDigits(profile?.birth_date),
    club: profile?.club ?? "",
    team: profile?.team ?? "",
    license: profile?.license ?? "",
    address: profile?.address ?? "",
    address2: profile?.address2 ?? "",
    postal_code: profile?.postal_code ?? "",
    postal_place: profile?.postal_place ?? "",
    country: profile?.country ?? "",
    nationality: profile?.nationality ?? "",
    mobile: profile?.mobile ?? "",
    email: profile?.email ?? "",
    emergency_contact: profile?.emergency_contact ?? "",
    emergency_phone: profile?.emergency_phone ?? "",
    companion: profile?.companion ?? "",
  });

  const fullName =
    consented && (prof.first_name || prof.last_name)
      ? `${prof.first_name} ${prof.last_name}`.trim()
      : "Participant";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    setBusy(true);
    try {
      // Update registration
      const regPayload = {
        bib_number: reg.bib_number.trim() || null,
        class_code: reg.class_code || null,
        subevent_id: reg.subevent_id || null,
        status: reg.status,
      };
      const { error: rErr } = await supabase
        .from("registrations")
        .update(regPayload as never)
        .eq("id", registration.id);
      if (rErr) throw rErr;

      // Update profile if consented
      if (consented && profile) {
        const iso = prof.birth_date_digits ? digitsToIso(prof.birth_date_digits) : null;
        if (prof.birth_date_digits && !iso) {
          throw new Error("Date of birth must be 8 digits (YYYYMMDD).");
        }
        const profPayload = {
          first_name: prof.first_name.trim() || null,
          last_name: prof.last_name.trim() || null,
          gender: prof.gender || null,
          birth_date: iso,
          club: prof.club.trim() || null,
          team: prof.team.trim() || null,
          license: prof.license.trim() || null,
          address: prof.address.trim() || null,
          address2: prof.address2.trim() || null,
          postal_code: prof.postal_code.trim() || null,
          postal_place: prof.postal_place.trim() || null,
          country: prof.country.trim() || null,
          nationality: prof.nationality.trim() || null,
          mobile: prof.mobile.trim() || null,
          email: prof.email.trim() || null,
          emergency_contact: prof.emergency_contact.trim() || null,
          emergency_phone: prof.emergency_phone.trim() || null,
          companion: prof.companion.trim() || null,
        };
        const { error: pErr } = await supabase
          .from("profiles")
          .update(profPayload as never)
          .eq("id", profile.id);
        if (pErr) throw pErr;
      }

      toast.success("Participant updated.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-[min(86vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-hairline bg-card shadow-2xl">
        {/* Header */}
        <header className="flex items-center justify-between gap-4 border-b border-hairline bg-background/60 px-5 py-3.5">
          <div className="min-w-0">
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {reg.bib_number ? `#${reg.bib_number} · ` : ""}Participant
            </p>
            <h2 className="mt-0.5 truncate text-lg text-ink">{fullName}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Tabs */}
        <nav className="flex border-b border-hairline px-3">
          <DrawerTab
            active={tab === "general"}
            onClick={() => setTab("general")}
            icon={<User2 className="h-3.5 w-3.5" />}
          >
            General
          </DrawerTab>
          <DrawerTab
            active={tab === "contact"}
            onClick={() => setTab("contact")}
            icon={<Mail className="h-3.5 w-3.5" />}
          >
            Address / Contact
          </DrawerTab>
        </nav>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {!consented && (
            <div className="mb-5 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
              This participant did not consent to share personal data. You can still edit
              registration details (bib, class, subevent, status).
            </div>
          )}

          {tab === "general" && (
            <FormGrid>
              <Field
                label="First name"
                value={prof.first_name}
                onChange={(v) => setProf((s) => ({ ...s, first_name: v }))}
                disabled={!consented}
              />
              <Field
                label="Surname"
                value={prof.last_name}
                onChange={(v) => setProf((s) => ({ ...s, last_name: v }))}
                disabled={!consented}
              />
              <SelectField
                label="Gender"
                value={prof.gender}
                onChange={(v) => setProf((s) => ({ ...s, gender: v }))}
                disabled={!consented}
                options={[
                  { value: "", label: "—" },
                  { value: "F", label: "F" },
                  { value: "M", label: "M" },
                  { value: "X", label: "X" },
                ]}
              />
              <Field
                label="Date of birth"
                value={prof.birth_date_digits}
                onChange={(v) =>
                  setProf((s) => ({ ...s, birth_date_digits: v.replace(/\D/g, "").slice(0, 8) }))
                }
                disabled={!consented}
                mono
                placeholder="YYYYMMDD"
                inputMode="numeric"
                maxLength={8}
              />
              <Field
                label="Club"
                value={prof.club}
                onChange={(v) => setProf((s) => ({ ...s, club: v }))}
                disabled={!consented}
              />
              <Field
                label="Team"
                value={prof.team}
                onChange={(v) => setProf((s) => ({ ...s, team: v }))}
                disabled={!consented}
              />
              <Field
                label="License"
                value={prof.license}
                onChange={(v) => setProf((s) => ({ ...s, license: v }))}
                disabled={!consented}
              />
              <SelectField
                label="Class"
                value={reg.class_code}
                onChange={(v) => setReg((s) => ({ ...s, class_code: v }))}
                options={[
                  { value: "", label: "—" },
                  ...classes.map((c) => ({ value: c, label: c })),
                ]}
                mono
              />
              <SelectField
                label="Subevent"
                value={reg.subevent_id}
                onChange={(v) => setReg((s) => ({ ...s, subevent_id: v }))}
                options={[
                  { value: "", label: "—" },
                  ...subevents.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
              <Field
                label="Bib number"
                value={reg.bib_number}
                onChange={(v) => setReg((s) => ({ ...s, bib_number: v }))}
                mono
                inputMode="numeric"
              />
              <SelectField
                label="Status"
                value={reg.status}
                onChange={(v) => setReg((s) => ({ ...s, status: v }))}
                options={[
                  { value: "pending", label: "pending" },
                  { value: "confirmed", label: "confirmed" },
                  { value: "cancelled", label: "cancelled" },
                ]}
              />
              <Field
                label="Registered"
                value={formatDate(registration.created_at)}
                onChange={() => {}}
                disabled
                mono
              />
            </FormGrid>
          )}

          {tab === "contact" && (
            <FormGrid>
              <Field
                label="Address"
                value={prof.address}
                onChange={(v) => setProf((s) => ({ ...s, address: v }))}
                disabled={!consented}
                full
              />
              <Field
                label="Address 2"
                value={prof.address2}
                onChange={(v) => setProf((s) => ({ ...s, address2: v }))}
                disabled={!consented}
                full
              />
              <Field
                label="Postal code"
                value={prof.postal_code}
                onChange={(v) => setProf((s) => ({ ...s, postal_code: v }))}
                disabled={!consented}
                mono
                inputMode="numeric"
              />
              <Field
                label="Postal place"
                value={prof.postal_place}
                onChange={(v) => setProf((s) => ({ ...s, postal_place: v }))}
                disabled={!consented}
              />
              <Field
                label="Country"
                value={prof.country}
                onChange={(v) => setProf((s) => ({ ...s, country: v }))}
                disabled={!consented}
              />
              <Field
                label="Nationality"
                value={prof.nationality}
                onChange={(v) => setProf((s) => ({ ...s, nationality: v }))}
                disabled={!consented}
              />
              <Field
                label="Mobile"
                value={prof.mobile}
                onChange={(v) => setProf((s) => ({ ...s, mobile: v }))}
                disabled={!consented}
                mono
                inputMode="tel"
              />
              <Field
                label="Email"
                value={prof.email}
                onChange={(v) => setProf((s) => ({ ...s, email: v }))}
                disabled={!consented}
                inputMode="email"
              />
              <Field
                label="Emergency contact"
                value={prof.emergency_contact}
                onChange={(v) => setProf((s) => ({ ...s, emergency_contact: v }))}
                disabled={!consented}
              />
              <Field
                label="Emergency phone"
                value={prof.emergency_phone}
                onChange={(v) => setProf((s) => ({ ...s, emergency_phone: v }))}
                disabled={!consented}
                mono
                inputMode="tel"
              />
              <Field
                label="Companion"
                value={prof.companion}
                onChange={(v) => setProf((s) => ({ ...s, companion: v }))}
                disabled={!consented}
                full
              />
            </FormGrid>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-hairline bg-background/60 px-5 py-3">
          <button
            onClick={onClose}
            className="cursor-pointer rounded-md border border-hairline bg-card px-4 py-1.5 text-sm text-ink transition hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {busy ? "Saving…" : "Save changes"}
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
      className={`-mb-px inline-flex cursor-pointer items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm transition ${
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

function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">{children}</div>;
}

function FieldShell({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="mono mb-1 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </label>
      <div className="rounded-md border border-hairline bg-background focus-within:border-primary">
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  mono,
  full,
  placeholder,
  inputMode,
  maxLength,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  full?: boolean;
  placeholder?: string;
  inputMode?: "numeric" | "tel" | "email";
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <FieldShell label={label} full={full}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder ?? "—"}
        inputMode={inputMode}
        maxLength={maxLength}
        className={`h-9 w-full bg-transparent px-3 text-sm text-ink outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-60 ${
          mono ? "num" : ""
        }`}
      />
    </FieldShell>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  mono,
  full,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  mono?: boolean;
  full?: boolean;
  disabled?: boolean;
}) {
  return (
    <FieldShell label={label} full={full}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`h-9 w-full cursor-pointer bg-transparent px-3 text-sm text-ink outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
          mono ? "num" : ""
        }`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
