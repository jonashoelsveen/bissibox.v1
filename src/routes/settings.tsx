import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { RolesPanel } from "@/components/RolesPanel";
import { ChevronDown, Plus, X, User as UserIcon, Users as UsersIcon, Building2, Network } from "lucide-react";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Settings · Raceline" }] }),
});

interface Profile {
  first_name: string | null;
  last_name: string | null;
  gender: string | null;
  birth_date: string | null;
  anonymous: boolean;
  club: string | null;
  company_club: string | null;
  team: string | null;
  team_group: string | null;
  default_class: string | null;
  license: string | null;
  address: string | null;
  postal_code: string | null;
  postal_place: string | null;
  country: string | null;
  nationality: string | null;
  mobile: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
  athlete_active: boolean;
  is_photographer: boolean;
  photographer_active: boolean;
  photographer_bio: string | null;
}

interface Team {
  id: string;
  name: string;
  nif_id: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  description: string | null;
  address: string | null;
  postal_code: string | null;
  postal_place: string | null;
  country: string | null;
  active: boolean;
}

interface RegistrationRow {
  id: string;
  race_type: string;
  status: string;
  events: { id: string; title: string; starts_at: string; location: string } | null;
}

interface LikedRow {
  id: string;
  events: { id: string; title: string; starts_at: string; location: string } | null;
}

type Tab = "general" | "address" | "races" | "liked" | "roles" | "profiles" | "entity-profile" | "desk" | "signout";

interface EntityRow {
  id: string;
  name: string;
  entity_type: "team" | "company" | "cooperation";
}

function SettingsPage() {
  const { user, loading: authLoading, activeEntityId, setActiveEntity, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [regs, setRegs] = useState<RegistrationRow[]>([]);
  const [liked, setLiked] = useState<LikedRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("general");
  const [createOpen, setCreateOpen] = useState(false);

  // Active selection: null = individual profile, otherwise the entity id.
  const isTeamMode = !!activeEntityId;

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  // Load profile + entity list on mount
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (p) setProfile(p as Profile);

      const { data: r } = await supabase
        .from("registrations")
        .select("id, race_type, status, events(id, title, starts_at, location)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setRegs((r as unknown as RegistrationRow[]) ?? []);

      const { data: l } = await supabase
        .from("event_likes")
        .select("id, events(id, title, starts_at, location)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setLiked((l as unknown as LikedRow[]) ?? []);

      const { data: ts } = await supabase
        .from("teams")
        .select("id, name, entity_type")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true });
      const list = (ts ?? []) as EntityRow[];
      setEntities(list);

      // If the stored active entity no longer exists, fall back to individual.
      if (activeEntityId && !list.some((e) => e.id === activeEntityId)) {
        setActiveEntity(null);
      }
    })();
  }, [user]);

  // Load the currently-selected entity's editable fields
  useEffect(() => {
    if (!user) return;
    if (!activeEntityId) {
      setTeam(null);
      return;
    }
    (async () => {
      const { data: t } = await supabase
        .from("teams")
        .select("id, name, nif_id, contact_email, contact_phone, website, description, address, postal_code, postal_place, country, active")
        .eq("id", activeEntityId)
        .maybeSingle();
      if (t) setTeam(t as Team);
    })();
  }, [user, activeEntityId]);

  useEffect(() => {
    if (isTeamMode && (tab === "races" || tab === "liked" || tab === "profiles" || tab === "desk")) setTab("general");
    if (!isTeamMode && tab === "entity-profile") setTab("general");
  }, [isTeamMode, tab]);

  const [userRoles, setUserRoles] = useState<{ role: "organizer" | "photographer" | "timekeeper" }[]>([]);
  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => setUserRoles((data ?? []) as { role: "organizer" | "photographer" | "timekeeper" }[]));
  }, [user, tab]);

  const unlike = async (likeId: string) => {
    const { error } = await supabase.from("event_likes").delete().eq("id", likeId);
    if (error) return toast.error(error.message);
    setLiked((prev) => prev.filter((x) => x.id !== likeId));
  };

  const updateProfile = (k: keyof Profile, v: string | boolean | null) =>
    setProfile((p) => (p ? { ...p, [k]: v } : p));

  const updateTeam = (k: keyof Team, v: string | boolean | null) =>
    setTeam((t) => (t ? { ...t, [k]: v } : t));

  const save = async () => {
    if (!user) return;
    setSaving(true);
    if (isTeamMode && team) {
      const { id, ...rest } = team;
      const { error } = await supabase.from("teams").update(rest).eq("id", id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Saved.");
      // Refresh entity name in dropdown list
      setEntities((prev) => prev.map((e) => (e.id === id ? { ...e, name: team.name } : e)));
    } else if (profile) {
      const { error } = await supabase.from("profiles").update(profile).eq("id", user.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Settings saved.");
    } else {
      setSaving(false);
    }
  };

  const onEntityCreated = (row: EntityRow) => {
    setEntities((prev) => [...prev, row]);
    setActiveEntity(row.id);
    setCreateOpen(false);
    setTab("general");
  };

  if (!user || !profile) {
    return <div className="mx-auto max-w-3xl px-6 py-20 text-muted-foreground">Loading…</div>;
  }

  const tabs: Tab[] = isTeamMode
    ? ["entity-profile", "general", "address", "roles"]
    : ["general", "address", "roles", "profiles", "desk", "races", "liked"];

  const activeEntity = entities.find((e) => e.id === activeEntityId) ?? null;

  const tabLabel = (t: Tab) =>
    t === "general"
      ? "General"
      : t === "address"
        ? "Contact & address"
        : t === "roles"
          ? "Roles"
          : t === "profiles"
            ? "Profile"
            : t === "entity-profile"
              ? "Profile"
              : t === "desk"
                ? "Desk"
                : t === "races"
                  ? "My races"
                  : t === "liked"
                    ? "Liked races"
                    : "Sign out";

  return (
    <div className="px-4 md:px-6">
      <div>
        <div className="flex items-center justify-between gap-2 pt-4 pr-14">
          <div className="flex items-baseline gap-2">
            <span className="mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              Account
            </span>
            <ProfileSelector
              entities={entities}
              activeEntity={activeEntity}
              individualName={
                [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
                user.email ||
                "Individual profile"
              }
              onSelect={(id) => {
                setActiveEntity(id);
                setTab(id ? "entity-profile" : "general");
              }}
            />
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-ink px-4 py-2 text-xs font-medium text-background transition hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Create new entity
          </button>
        </div>

        <div className="mt-8 grid gap-10 md:grid-cols-[180px_1fr]">
          <nav className="-ml-2 flex flex-row gap-1 md:flex-col md:gap-0.5">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-2 text-left text-sm transition ${
                  tab === t
                    ? "bg-secondary font-medium text-ink"
                    : "text-muted-foreground hover:text-ink"
                }`}
              >
                {tabLabel(t)}
              </button>
            ))}
            <div className="my-1 hidden h-px w-full bg-hairline md:block" />
            <button
              onClick={async () => {
                await signOut();
                navigate({ to: "/" });
              }}
              className="rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition hover:text-destructive"
            >
              Sign out
            </button>
          </nav>

          <div>
            {tab === "entity-profile" && isTeamMode && team && (
              <Card>
                <p className="text-xs text-muted-foreground">
                  When inactive, this profile page calmly shows that it is not active. The entity is hidden from public browsing.
                </p>
                <div className="mt-4">
                  <ToggleRow
                    title="Profile active"
                    description="Visible publicly and able to accept members."
                    checked={team.active}
                    onChange={(v) => updateTeam("active", v)}
                  />
                </div>
                <SaveBar saving={saving} onSave={save} />
              </Card>
            )}

            {tab === "general" && isTeamMode && team && (
              <Card>
                <Grid>
                  <Field label="Team name" value={team.name ?? ""} onChange={(v) => updateTeam("name", v)} />
                  <Field label="NIF ID" value={team.nif_id ?? ""} onChange={(v) => updateTeam("nif_id", v || null)} />
                  <Field label="Website" value={team.website ?? ""} onChange={(v) => updateTeam("website", v || null)} />
                </Grid>
                <div className="mt-4">
                  <label className="block">
                    <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Description</span>
                    <textarea
                      value={team.description ?? ""}
                      onChange={(e) => updateTeam("description", e.target.value || null)}
                      rows={3}
                      className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none transition focus:border-primary"
                    />
                  </label>
                </div>
                <SaveBar saving={saving} onSave={save} />
              </Card>
            )}

            {tab === "general" && !isTeamMode && (
              <Card>
                <Grid>
                  <Field label="First name" value={profile.first_name ?? ""} onChange={(v) => updateProfile("first_name", v)} />
                  <Field label="Last name" value={profile.last_name ?? ""} onChange={(v) => updateProfile("last_name", v)} />
                  <Select
                    label="Gender"
                    value={profile.gender ?? ""}
                    onChange={(v) => updateProfile("gender", v || null)}
                    options={[
                      { value: "", label: "—" },
                      { value: "male", label: "Male" },
                      { value: "female", label: "Female" },
                      { value: "other", label: "Other" },
                    ]}
                  />
                  <Field
                    label="Birth date"
                    type="date"
                    value={profile.birth_date ?? ""}
                    onChange={(v) => updateProfile("birth_date", v || null)}
                  />
                  <Field label="Team" value={profile.team ?? ""} onChange={(v) => updateProfile("team", v)} />
                  <Field label="License" value={profile.license ?? ""} onChange={(v) => updateProfile("license", v)} />
                </Grid>
                <Anonymous value={profile.anonymous} onChange={(v) => updateProfile("anonymous", v)} />
                <SaveBar saving={saving} onSave={save} />
              </Card>
            )}

            {tab === "address" && isTeamMode && team && (
              <Card>
                <Grid>
                  <Field label="Address" value={team.address ?? ""} onChange={(v) => updateTeam("address", v || null)} />
                  <Field label="Postal code" value={team.postal_code ?? ""} onChange={(v) => updateTeam("postal_code", v || null)} />
                  <Field label="Postal place" value={team.postal_place ?? ""} onChange={(v) => updateTeam("postal_place", v || null)} />
                  <Field label="Country" value={team.country ?? ""} onChange={(v) => updateTeam("country", v || null)} />
                  <Field label="Contact email" value={team.contact_email ?? ""} onChange={(v) => updateTeam("contact_email", v || null)} />
                  <Field label="Contact phone" value={team.contact_phone ?? ""} onChange={(v) => updateTeam("contact_phone", v || null)} />
                </Grid>
                <SaveBar saving={saving} onSave={save} />
              </Card>
            )}

            {tab === "address" && !isTeamMode && (
              <Card>
                <Grid>
                  <Field label="Address" value={profile.address ?? ""} onChange={(v) => updateProfile("address", v)} />
                  <Field label="Postal code" value={profile.postal_code ?? ""} onChange={(v) => updateProfile("postal_code", v)} />
                  <Field label="Postal place" value={profile.postal_place ?? ""} onChange={(v) => updateProfile("postal_place", v)} />
                  <Field label="Country" value={profile.country ?? ""} onChange={(v) => updateProfile("country", v)} />
                  <Field label="Nationality" value={profile.nationality ?? ""} onChange={(v) => updateProfile("nationality", v)} />
                  <Field label="Mobile" value={profile.mobile ?? ""} onChange={(v) => updateProfile("mobile", v)} />
                  <Field
                    label="Emergency contact"
                    value={profile.emergency_contact ?? ""}
                    onChange={(v) => updateProfile("emergency_contact", v)}
                  />
                  <Field
                    label="Emergency phone"
                    value={profile.emergency_phone ?? ""}
                    onChange={(v) => updateProfile("emergency_phone", v)}
                  />
                </Grid>
                <SaveBar saving={saving} onSave={save} />
              </Card>
            )}

            {tab === "profiles" && !isTeamMode && (
              <ProfilesPanel
                profile={profile}
                userRoles={userRoles}
                updateProfile={updateProfile}
                saving={saving}
                onSave={save}
                goToRoles={() => setTab("roles")}
              />
            )}

            {tab === "roles" && <RolesPanel userId={user.id} viewMode={isTeamMode ? "team" : "individual"} />}

            {tab === "races" && !isTeamMode && (
              <Card>
                {regs.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-muted-foreground">No races yet.</p>
                    <Link
                      to="/"
                      className="mt-4 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground"
                    >
                      Find a race
                    </Link>
                  </div>
                ) : (
                  <ul className="divide-y divide-hairline">
                    {regs.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 py-4">
                        <div className="min-w-0">
                          <Link
                            to="/events/$eventId"
                            params={{ eventId: r.events?.id ?? "" }}
                            className="block truncate text-ink hover:underline"
                          >
                            {r.events?.title ?? "Race"}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {r.race_type} · {r.events?.location}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="num text-sm text-ink">
                            {r.events ? formatDate(r.events.starts_at) : ""}
                          </span>
                          <span
                            className={`mono text-[10px] uppercase tracking-widest ${
                              r.status === "confirmed"
                                ? "text-ink"
                                : r.status === "cancelled"
                                  ? "text-destructive"
                                  : "text-accent"
                            }`}
                          >
                            {r.status}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {tab === "liked" && !isTeamMode && (
              <Card>
                {liked.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-muted-foreground">No liked races yet.</p>
                    <Link
                      to="/"
                      className="mt-4 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground"
                    >
                      Discover races
                    </Link>
                  </div>
                ) : (
                  <ul className="divide-y divide-hairline">
                    {liked.map((l) => (
                      <li key={l.id} className="flex items-center justify-between gap-3 py-4">
                        <div className="min-w-0">
                          <Link
                            to="/events/$eventId"
                            params={{ eventId: l.events?.id ?? "" }}
                            className="block truncate text-ink hover:underline"
                          >
                            {l.events?.title ?? "Race"}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {l.events?.location}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="num text-sm text-ink">
                            {l.events ? formatDate(l.events.starts_at) : ""}
                          </span>
                          <button
                            onClick={() => unlike(l.id)}
                            className="mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-destructive"
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {tab === "desk" && !isTeamMode && <DeskSettingsPanel />}
          </div>
        </div>
      </div>

      {createOpen && user && (
        <CreateEntityModal
          ownerId={user.id}
          onClose={() => setCreateOpen(false)}
          onCreated={onEntityCreated}
        />
      )}
    </div>
  );
}

type EntityType = "team" | "company" | "cooperation";

const ENTITY_LABEL: Record<EntityType, string> = {
  team: "Team",
  company: "Company",
  cooperation: "Cooperation",
};

function ProfileSelector({
  entities,
  activeEntity,
  individualName,
  onSelect,
}: {
  entities: EntityRow[];
  activeEntity: EntityRow | null;
  individualName: string;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  const label = activeEntity ? activeEntity.name : individualName;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-baseline gap-1.5 text-2xl font-semibold text-ink transition hover:text-ink/80 md:text-3xl"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-4 w-4 translate-y-[-2px] text-muted-foreground" strokeWidth={2.25} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-40 mt-2 w-64 border border-ink/15 bg-card shadow-lg">
            <button
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-secondary ${
                !activeEntity ? "bg-secondary/60 text-ink" : "text-ink"
              }`}
            >
              <span className="truncate">{individualName}</span>
              <span className="mono ml-2 shrink-0 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                Personal
              </span>
            </button>
            {entities.length > 0 && <div className="h-px w-full bg-hairline" />}
            {entities.map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  onSelect(e.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between border-t border-hairline/60 px-3 py-2 text-left text-sm transition hover:bg-secondary ${
                  activeEntity?.id === e.id ? "bg-secondary/60 text-ink" : "text-ink"
                }`}
              >
                <span className="truncate">{e.name}</span>
                <span className="mono ml-2 shrink-0 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                  {ENTITY_LABEL[e.entity_type]}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CreateEntityModal({
  ownerId,
  onClose,
  onCreated,
}: {
  ownerId: string;
  onClose: () => void;
  onCreated: (row: EntityRow) => void;
}) {
  const [name, setName] = useState("");
  const [entityType, setEntityType] = useState<EntityType>("team");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("teams")
        .insert({ name: name.trim(), entity_type: entityType, owner_id: ownerId } as never)
        .select("id, name, entity_type")
        .single();
      if (error) throw error;
      onCreated(data as EntityRow);
      toast.success(`${ENTITY_LABEL[entityType]} created.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-hairline bg-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Profile</p>
            <h2 className="mt-0.5 text-lg text-ink">Create new entity</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5">
          <p className="text-xs text-muted-foreground">
            Just the basics to get started. You can edit everything else after the entity is created.
          </p>

          <label className="block">
            <span className="mono mb-1.5 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Name
            </span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Raufoss IL Langrenn"
              className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
          </label>

          <label className="block">
            <span className="mono mb-1.5 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Entity type
            </span>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value as EntityType)}
              className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            >
              <option value="team">Team</option>
              <option value="company">Company</option>
              <option value="cooperation">Cooperation</option>
            </select>
          </label>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-hairline bg-background/60 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-hairline bg-card px-4 py-1.5 text-sm text-ink transition hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            onClick={create}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {busy ? "Creating…" : "Create"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-2xl border border-hairline bg-card p-6 md:p-8">{children}</section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none transition focus:border-primary"
      />
    </label>
  );
}

function Select({
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
      <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none transition focus:border-primary"
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

function Anonymous({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mt-4 flex items-center gap-3">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-primary"
      />
      <span className="text-sm text-ink">Show as Anonymous in start lists</span>
    </label>
  );
}

function SaveBar({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  return (
    <div className="mt-6 flex justify-end">
      <button
        onClick={onSave}
        disabled={saving}
        className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-hairline bg-background px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm text-ink">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          checked ? "bg-primary" : "bg-secondary"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function ProfilesPanel({
  profile,
  userRoles,
  updateProfile,
  saving,
  onSave,
  goToRoles,
}: {
  profile: Profile;
  userRoles: { role: "organizer" | "photographer" | "timekeeper" }[];
  updateProfile: (k: keyof Profile, v: string | boolean | null) => void;
  saving: boolean;
  onSave: () => void;
  goToRoles: () => void;
}) {
  const [editing, setEditing] = useState<null | "athlete" | "photographer">(null);
  const hasRole = (r: "organizer" | "photographer" | "timekeeper") =>
    userRoles.some((x) => x.role === r);

  const cards: {
    key: "athlete" | "photographer" | "timekeeper" | "organizer";
    label: string;
    active: boolean;
    onToggle?: (v: boolean) => void;
    editable: boolean;
  }[] = [
    {
      key: "athlete",
      label: "Athlete",
      active: profile.athlete_active,
      onToggle: (v) => updateProfile("athlete_active", v),
      editable: true,
    },
  ];
  if (hasRole("photographer") || profile.is_photographer) {
    cards.push({
      key: "photographer",
      label: "Photographer",
      active: profile.photographer_active,
      onToggle: (v) => updateProfile("photographer_active", v),
      editable: true,
    });
  }
  if (hasRole("timekeeper")) {
    cards.push({ key: "timekeeper", label: "Timekeeper", active: true, editable: false });
  }
  if (hasRole("organizer")) {
    cards.push({ key: "organizer", label: "Organizer", active: true, editable: false });
  }

  return (
    <Card>
      <p className="text-xs text-muted-foreground">
        One profile per role. Toggle <span className="text-ink">Active</span> to control whether
        you appear in search and can perform that role's actions.
      </p>

      <div className="mt-4 space-y-3">
        {cards.map((c) => (
          <div
            key={c.key}
            className="flex items-center justify-between gap-4 rounded-xl border border-hairline bg-background px-4 py-3"
          >
            <div className="min-w-0 flex items-center gap-3">
              <span className="mono rounded-full border border-hairline px-3 py-1 text-[10px] uppercase tracking-widest text-ink">
                {c.label}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {c.editable && (
                <button
                  onClick={() => setEditing(c.key as "athlete" | "photographer")}
                  className="rounded-full border border-hairline bg-card px-3 py-1.5 text-xs text-ink hover:bg-secondary"
                >
                  Edit profile
                </button>
              )}
              {c.onToggle ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={c.active}
                  onClick={() => c.onToggle!(!c.active)}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                    c.active ? "bg-primary" : "bg-secondary"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                      c.active ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </button>
              ) : (
                <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  via company
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 text-xs text-muted-foreground">
        Want another role? <button onClick={goToRoles} className="text-ink underline">Visit Roles</button>.
      </div>

      {editing === "athlete" && (
        <div className="mt-6 rounded-xl border border-hairline bg-background p-4">
          <h4 className="text-sm font-semibold text-ink">Athlete profile</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Required to register for races and to appear in search.
          </p>
          <div className="mt-3">
            <ToggleRow
              title="Athlete profile active"
              description="Visible in user search and able to register."
              checked={profile.athlete_active}
              onChange={(v) => updateProfile("athlete_active", v)}
            />
          </div>
        </div>
      )}

      {editing === "photographer" && (
        <div className="mt-6 rounded-xl border border-hairline bg-background p-4">
          <h4 className="text-sm font-semibold text-ink">Photographer profile</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Required to upload media and to appear in photographer search.
          </p>
          <div className="mt-3 space-y-3">
            <ToggleRow
              title="I am a photographer"
              description="Enables a separate photographer profile."
              checked={profile.is_photographer}
              onChange={(v) => {
                updateProfile("is_photographer", v);
                if (!v) updateProfile("photographer_active", false);
              }}
            />
            {profile.is_photographer && (
              <>
                <ToggleRow
                  title="Photographer profile active"
                  description="Visible in photographer search."
                  checked={profile.photographer_active}
                  onChange={(v) => updateProfile("photographer_active", v)}
                />
                <label className="block">
                  <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Photographer bio
                  </span>
                  <textarea
                    value={profile.photographer_bio ?? ""}
                    onChange={(e) => updateProfile("photographer_bio", e.target.value || null)}
                    rows={3}
                    placeholder="Tell people about your work."
                    className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none transition focus:border-primary"
                  />
                </label>
              </>
            )}
          </div>
        </div>
      )}

      <SaveBar saving={saving} onSave={onSave} />
    </Card>
  );
}

const DESK_MATERIALS: Record<string, { label: string; surface: string }> = {
  oak: {
    label: "Oak",
    surface:
      "repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0 2px, transparent 2px 6px), linear-gradient(135deg, #d6b07a 0%, #b88753 60%, #8d6033 100%)",
  },
  steel: {
    label: "Stainless steel",
    surface:
      "repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 4px), linear-gradient(135deg, #e3e7ec 0%, #b3bac4 55%, #777e88 100%)",
  },
};

function DeskSettingsPanel() {
  const [material, setMaterial] = useState<string>(() => {
    if (typeof window === "undefined") return "oak";
    return localStorage.getItem("desk:material") || "oak";
  });
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("desk:material", material);
  }, [material]);

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    if (!list.length) return;
    setFiles((prev) => [
      ...prev,
      ...list.map((f) => ({ name: f.name, size: f.size })),
    ]);
    toast.success(`Added ${list.length} file${list.length > 1 ? "s" : ""} to desk access`);
    e.target.value = "";
  };

  const mat = DESK_MATERIALS[material] ?? DESK_MATERIALS.oak;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-ink">Desk material</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Pick the surface for your desk. The material themes the workspace background.
            </p>
          </div>
        </div>

        <div
          className="mt-4 aspect-[16/6] w-full overflow-hidden rounded-2xl border border-hairline shadow-inner"
          style={{ background: mat.surface }}
        >
          <div className="h-full w-full bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.18),transparent_60%)]" />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(DESK_MATERIALS).map(([key, m]) => (
            <button
              key={key}
              onClick={() => setMaterial(key)}
              className={`rounded-full border px-4 py-2 text-xs transition ${
                material === key
                  ? "border-ink bg-ink text-background"
                  : "border-hairline text-muted-foreground hover:text-ink"
              }`}
            >
              {m.label}
            </button>
          ))}
          <span className="rounded-full border border-dashed border-hairline px-4 py-2 text-xs text-muted-foreground">
            More coming later
          </span>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-ink">Files</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Pick files from your computer that the desk should have access to.
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Add files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onPickFiles}
          />
        </div>

        {files.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-hairline bg-card/40 py-10 text-center text-xs text-muted-foreground">
            No files yet. Click "Add files" to choose files from your computer.
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-hairline rounded-xl border border-hairline">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <span className="truncate text-ink">{f.name}</span>
                <button
                  onClick={() => setFiles((arr) => arr.filter((_, idx) => idx !== i))}
                  className="mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-destructive"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
