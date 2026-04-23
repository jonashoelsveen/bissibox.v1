import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { RolesPanel } from "@/components/RolesPanel";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Profile · Raceline" }] }),
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

type Tab = "general" | "address" | "races" | "liked" | "roles" | "profiles";

function ProfilePage() {
  const { user, loading: authLoading, mode, setMode, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [regs, setRegs] = useState<RegistrationRow[]>([]);
  const [liked, setLiked] = useState<LikedRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("general");
  const [hasTeam, setHasTeam] = useState(false);

  const isTeamMode = mode === "team" || mode === "organizer";

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (data) setProfile(data as Profile);
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
      const { data: t } = await supabase
        .from("teams")
        .select("id, name, nif_id, contact_email, contact_phone, website, description, address, postal_code, postal_place, country")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (t) setTeam(t as Team);
      setHasTeam(!!t);
    })();
  }, [user]);

  // If user loses team status while in team mode, drop back to participant
  useEffect(() => {
    if (!hasTeam && (mode === "team" || mode === "organizer")) setMode("participant");
  }, [hasTeam, mode, setMode]);

  // Switch off team-only / individual-only tabs when mode changes
  useEffect(() => {
    if (isTeamMode && (tab === "races" || tab === "liked" || tab === "profiles")) setTab("general");
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

  const updateTeam = (k: keyof Team, v: string | null) =>
    setTeam((t) => (t ? { ...t, [k]: v } : t));

  const save = async () => {
    if (!user) return;
    setSaving(true);
    if (isTeamMode && team) {
      const { id, ...rest } = team;
      const { error } = await supabase.from("teams").update(rest).eq("id", id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Team saved.");
    } else if (profile) {
      const { error } = await supabase.from("profiles").update(profile).eq("id", user.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Profile saved.");
    } else {
      setSaving(false);
    }
  };

  if (!user || !profile) {
    return <div className="mx-auto max-w-3xl px-6 py-20 text-muted-foreground">Loading…</div>;
  }

  const tabs: Tab[] = isTeamMode
    ? ["general", "address", "roles"]
    : ["general", "address", "roles", "profiles", "races", "liked"];

  return (
    <div className="px-4 md:px-6">
      <div className="flex justify-end gap-2 pt-4 pr-14">
        <ModeToggle mode={mode} setMode={setMode} hasTeam={hasTeam} />
        <button
          onClick={async () => {
            await signOut();
            navigate({ to: "/" });
          }}
          className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink"
        >
          Sign out
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
              {t === "general"
                ? "General"
                : t === "address"
                  ? "Contact & address"
                  : t === "roles"
                    ? "Roles"
                    : t === "profiles"
                      ? "Profile"
                      : t === "races"
                        ? "My races"
                        : "Liked races"}
            </button>
          ))}
        </nav>

        <div>
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
        </div>
      </div>
    </div>
  );
}

type ModeT = "participant" | "organizer" | "team";

function ModeToggle({
  mode,
  setMode,
  hasTeam,
}: {
  mode: ModeT;
  setMode: (m: ModeT) => void;
  hasTeam: boolean;
}) {
  // Without a team, the user is just a participant — no toggle needed.
  if (!hasTeam) return null;
  const options: ModeT[] = ["participant", "team"];
  const current: ModeT = mode === "organizer" ? "team" : mode;
  return (
    <div className="flex rounded-full border border-hairline bg-card p-1">
      {options.map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className={`rounded-full px-3 py-1.5 text-[10px] uppercase tracking-widest transition ${
            current === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-ink"
          }`}
        >
          {m}
        </button>
      ))}
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
