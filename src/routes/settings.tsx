import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { RolesPanel } from "@/components/RolesPanel";
import { ChevronDown, ChevronRight, Plus, X, User as UserIcon, Users as UsersIcon, Building2, Network, Settings as SettingsIcon } from "lucide-react";

import { TopBarColorPicker } from "@/components/appearance/TopBarColorPicker";
import {
  PROFILE_VISIBILITY_ITEMS,
  useProfileVisibility,
  notesAutosaveKey,
  meetingsAutosaveKey,
  useLibrarySetting,
} from "@/lib/library-settings";
import { MapSettingsPanel } from "@/components/settings/MapSettingsPanel";
import { Footprints, Check } from "lucide-react";
import { SESSION_TILE_DESIGNS, useSessionTileDesign, type SessionTileDesign } from "@/lib/session-tile-design";
import { useDistanceUnit, type DistanceUnit } from "@/lib/units";
import stravaLogo from "@/assets/strava-logo.png";
import eqTimingLogo from "@/assets/eq-timing-logo.png";

const CONNECTOR_LOGOS: Record<string, string> = {
  "Strava": stravaLogo,
  "EQ Timing": eqTimingLogo,
};

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Settings · Raceline" }] }),
});

function SettingsPage() {
  return <SettingsView />;
}

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

type Tab =
  | "account"
  | "profiles"
  | "calendar"
  | "diary"
  | "library"
  | "connectors"
  | "system"
  | "appearance"
  | "entity-profile"
  | "entity-general"
  | "entity-organization"
  | "entity-calendar"
  | "entity-map"
  | "entity-events"
  | "entity-library";

type DividerKey = `divider-${number}`;
type NavItem = Tab | DividerKey;

interface EntityRow {
  id: string;
  name: string;
  entity_type: "team" | "company" | "cooperation";
}

export function SettingsView({ onClose }: { onClose?: () => void } = {}) {
  const { user, loading: authLoading, activeEntityId, setActiveEntity, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileBaseline, setProfileBaseline] = useState<string>("");
  const [team, setTeam] = useState<Team | null>(null);
  const [teamBaseline, setTeamBaseline] = useState<string>("");
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [regs, setRegs] = useState<RegistrationRow[]>([]);
  const [liked, setLiked] = useState<LikedRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("account");
  const [createOpen, setCreateOpen] = useState(false);
  const [profileEntities, setProfileEntities] = useState<
    { id: string; name: string; entity_type: string; roles: string[] }[]
  >([]);

  // Active selection: null = individual profile, otherwise the entity id.
  const isTeamMode = !!activeEntityId;

  const isDirty = isTeamMode
    ? !!team && JSON.stringify(team) !== teamBaseline
    : !!profile && JSON.stringify(profile) !== profileBaseline;

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  // Load profile + entity list on mount
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (p) {
        setProfile(p as Profile);
        setProfileBaseline(JSON.stringify(p));
      }

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
      setTeamBaseline("");
      return;
    }
    (async () => {
      const { data: t } = await supabase
        .from("teams")
        .select("id, name, nif_id, contact_email, contact_phone, website, description, address, postal_code, postal_place, country, active")
        .eq("id", activeEntityId)
        .maybeSingle();
      if (t) {
        setTeam(t as Team);
        setTeamBaseline(JSON.stringify(t));
      }
    })();
  }, [user, activeEntityId]);

  useEffect(() => {
    if (isTeamMode && (tab === "account" || tab === "profiles" || tab === "diary" || tab === "library" || tab === "connectors")) {
      setTab("entity-profile");
    }
    if (
      !isTeamMode &&
      (tab === "entity-profile" ||
        tab === "entity-organization" ||
        tab === "entity-calendar" ||
        tab === "entity-map" ||
        tab === "entity-events" ||
        tab === "entity-library")
    )
      setTab("account");
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
    if (!isDirty) return;
    setSaving(true);
    if (isTeamMode && team) {
      const { id, ...rest } = team;
      const { error } = await supabase.from("teams").update(rest).eq("id", id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Saved.");
      setTeamBaseline(JSON.stringify(team));
      // Refresh entity name in dropdown list
      setEntities((prev) => prev.map((e) => (e.id === id ? { ...e, name: team.name } : e)));
    } else if (profile) {
      const { error } = await supabase.from("profiles").update(profile).eq("id", user.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Settings saved.");
      setProfileBaseline(JSON.stringify(profile));
    } else {
      setSaving(false);
    }
  };

  const onEntityCreated = (row: EntityRow) => {
    setEntities((prev) => [...prev, row]);
    setActiveEntity(row.id);
    setCreateOpen(false);
    setTab("entity-profile");
  };

  // Load entities the user belongs to + their roles within each (for the Account tab list).
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: owned }, { data: members }, { data: board }, { data: groups }] = await Promise.all([
        supabase.from("teams").select("id, name, entity_type").eq("owner_id", user.id),
        supabase.from("team_members").select("team_id, accepted").eq("user_id", user.id).eq("accepted", true),
        supabase.from("team_board_members").select("team_id, role, status").eq("user_id", user.id).eq("status", "accepted"),
        supabase.from("team_group_members").select("team_id, group_id").eq("user_id", user.id),
      ]);
      const map = new Map<string, { id: string; name: string; entity_type: string; roles: Set<string> }>();
      const ensure = async (teamId: string) => {
        if (map.has(teamId)) return map.get(teamId)!;
        const { data: t } = await supabase.from("teams").select("id, name, entity_type").eq("id", teamId).maybeSingle();
        if (!t) return null;
        const v = { id: t.id, name: t.name, entity_type: t.entity_type, roles: new Set<string>() };
        map.set(teamId, v);
        return v;
      };
      for (const o of owned ?? []) {
        const v = { id: o.id, name: o.name, entity_type: o.entity_type, roles: new Set<string>(["Admin"]) };
        map.set(o.id, v);
      }
      for (const m of members ?? []) {
        const v = await ensure(m.team_id);
        if (v) v.roles.add("Member");
      }
      for (const b of board ?? []) {
        const v = await ensure(b.team_id);
        if (v) v.roles.add(b.role || "Board");
      }
      // group leader heuristic: any group membership where user is recorded as leader-like.
      for (const g of groups ?? []) {
        const v = await ensure(g.team_id);
        if (v) v.roles.add("Group leader");
      }
      setProfileEntities(
        Array.from(map.values()).map((v) => ({
          id: v.id,
          name: v.name,
          entity_type: v.entity_type,
          roles: Array.from(v.roles),
        })),
      );
    })();
  }, [user, entities.length]);

  if (!user || !profile) {
    return <div className="mx-auto max-w-3xl px-6 py-20 text-muted-foreground">Loading…</div>;
  }

  const navItems: NavItem[] = isTeamMode
    ? [
        "appearance",
        "entity-general",
        "divider-1",
        "entity-profile",
        "entity-organization",
        "entity-calendar",
        "entity-map",
        "entity-events",
        "entity-library",
      ]
    : [
        "account",
        "divider-1",
        "profiles",
        "calendar",
        "diary",
        "library",
        "divider-2",
        "connectors",
        "system",
        "appearance",
      ];

  const tabLabel = (t: Tab): string => {
    switch (t) {
      case "account": return "Account";
      case "profiles": return "Profile";
      case "calendar": return "Calendar";
      case "diary": return "Diary";
      case "library": return "Library";
      case "connectors": return "Connectors";
      case "system": return "System";
      case "appearance": return "Appearance";
      case "entity-profile": return "Profile";
      case "entity-general": return "General";
      case "entity-organization": return "Organization";
      case "entity-calendar": return "Calendar";
      case "entity-map": return "Map";
      case "entity-events": return "Events";
      case "entity-library": return "Library";
    }
  };

  const headerActions = (
    <div className="flex items-center gap-2">
      {!isTeamMode && (
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-ink px-4 py-2 text-xs font-medium text-background transition hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          Create new entity
        </button>
      )}
      <button
        onClick={save}
        disabled={saving || !isDirty}
        className={`inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-xs font-medium transition ${
          isDirty && !saving
            ? "border-ink bg-ink text-background hover:opacity-90"
            : "border-hairline bg-secondary text-muted-foreground cursor-not-allowed"
        }`}
      >
        {saving ? "Saving…" : isDirty ? "Save" : "Saved"}
      </button>
    </div>
  );

  const navEl = (
    <nav className="-ml-2 flex flex-row gap-1 md:flex-col md:gap-0.5">
      {navItems.map((item) =>
        item.startsWith("divider-") ? (
          <div key={item} className="my-1 hidden h-px w-full bg-hairline md:block" />
        ) : (
          <button
            key={item}
            onClick={() => setTab(item as Tab)}
            className={`rounded-md px-3 py-2 text-left text-sm transition ${
              tab === item
                ? "bg-secondary font-medium text-ink"
                : "text-muted-foreground hover:text-ink"
            }`}
          >
            {tabLabel(item as Tab)}
          </button>
        ),
      )}
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
  );

  const contentEl = (
    <div>
      {tab === "account" && !isTeamMode && (
        <div className="space-y-6">
          <Card>
            <h3 className="mono text-[10px] uppercase tracking-widest text-muted-foreground">General</h3>
            <div className="mt-4">
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
            </div>
          </Card>

          <Card>
            <h3 className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Contact &amp; address</h3>
            <div className="mt-4">
              <Grid>
                <Field label="Address" value={profile.address ?? ""} onChange={(v) => updateProfile("address", v)} />
                <Field label="Postal code" value={profile.postal_code ?? ""} onChange={(v) => updateProfile("postal_code", v)} />
                <Field label="Postal place" value={profile.postal_place ?? ""} onChange={(v) => updateProfile("postal_place", v)} />
                <Field label="Country" value={profile.country ?? ""} onChange={(v) => updateProfile("country", v)} />
                <Field label="Nationality" value={profile.nationality ?? ""} onChange={(v) => updateProfile("nationality", v)} />
                <Field label="Mobile" value={profile.mobile ?? ""} onChange={(v) => updateProfile("mobile", v)} />
                <Field label="Emergency contact" value={profile.emergency_contact ?? ""} onChange={(v) => updateProfile("emergency_contact", v)} />
                <Field label="Emergency phone" value={profile.emergency_phone ?? ""} onChange={(v) => updateProfile("emergency_phone", v)} />
              </Grid>
            </div>
          </Card>

          <Card>
            <h3 className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Profiles</h3>
            <div className="mt-4 space-y-2">
              {profileEntities.length === 0 ? (
                <p className="text-xs text-muted-foreground">You are not part of any entity yet.</p>
              ) : (
                profileEntities.map((e) => (
                  <div key={e.id} className="flex items-center justify-between rounded-xl border border-hairline bg-background px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-ink">{e.name}</div>
                      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {ENTITY_LABEL[e.entity_type as EntityType] ?? e.entity_type}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {e.roles.join(", ")}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {tab === "entity-profile" && isTeamMode && team && (
        <div className="space-y-6">
          <ProfileVisibilityPanel
            scopeKey={`entity:${team.id}`}
            active={team.active}
            onActiveChange={async (v) => {
              updateTeam("active", v);
              await supabase.from("teams").update({ active: v }).eq("id", team.id);
            }}
          />
        </div>
      )}

      {tab === "entity-general" && isTeamMode && team && (
        <div className="space-y-6">
          <Card>
            <h3 className="mono text-[10px] uppercase tracking-widest text-muted-foreground">About</h3>
            <div className="mt-4">
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
            </div>
          </Card>
          <Card>
            <h3 className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Contact &amp; address</h3>
            <div className="mt-4">
              <Grid>
                <Field label="Address" value={team.address ?? ""} onChange={(v) => updateTeam("address", v || null)} />
                <Field label="Postal code" value={team.postal_code ?? ""} onChange={(v) => updateTeam("postal_code", v || null)} />
                <Field label="Postal place" value={team.postal_place ?? ""} onChange={(v) => updateTeam("postal_place", v || null)} />
                <Field label="Country" value={team.country ?? ""} onChange={(v) => updateTeam("country", v || null)} />
                <Field label="Contact email" value={team.contact_email ?? ""} onChange={(v) => updateTeam("contact_email", v || null)} />
                <Field label="Contact phone" value={team.contact_phone ?? ""} onChange={(v) => updateTeam("contact_phone", v || null)} />
              </Grid>
            </div>
          </Card>
        </div>
      )}

      {tab === "profiles" && !isTeamMode && (
        <ProfileVisibilityPanel
          scopeKey={`user:${user.id}`}
          active={profile.athlete_active}
          onActiveChange={async (v) => {
            updateProfile("athlete_active", v);
            await supabase.from("profiles").update({ athlete_active: v }).eq("id", user.id);
          }}
        />
      )}

      {tab === "calendar" && !isTeamMode && (
        <Card>
          <h3 className="text-sm font-semibold text-ink">Calendar</h3>
          <p className="mt-2 text-xs text-muted-foreground">Calendar settings will appear here.</p>
        </Card>
      )}

      {tab === "diary" && !isTeamMode && (
        <DiarySettingsPanel scopeKey={`user:${user.id}`} />
      )}

      {tab === "library" && !isTeamMode && (
        <LibrarySettingsPanel scopeKey={`user:${user.id}`} />
      )}


      {tab === "connectors" && <ConnectorsPanel />}

      {tab === "system" && <SystemPanel />}

      {tab === "appearance" && <AppearancePanel />}

      {tab === "entity-organization" && isTeamMode && (
        <Card>
          <h3 className="text-sm font-semibold text-ink">Organization</h3>
          <p className="mt-2 text-xs text-muted-foreground">
            Settings related to your organization page will appear here.
          </p>
        </Card>
      )}

      {tab === "entity-calendar" && isTeamMode && (
        <Card>
          <h3 className="text-sm font-semibold text-ink">Calendar</h3>
          <p className="mt-2 text-xs text-muted-foreground">Calendar settings will appear here.</p>
        </Card>
      )}

      {tab === "entity-map" && isTeamMode && <MapSettingsPanel />}

      {tab === "entity-events" && isTeamMode && (
        <Card>
          <h3 className="text-sm font-semibold text-ink">Events</h3>
          <p className="mt-2 text-xs text-muted-foreground">
            Settings related to events will appear here.
          </p>
        </Card>
      )}

      {tab === "entity-library" && isTeamMode && team && (
        <LibrarySettingsPanel scopeKey={`entity:${team.id}`} />
      )}
    </div>
  );

  const createModalEl = createOpen && user && (
    <CreateEntityModal
      ownerId={user.id}
      onClose={() => setCreateOpen(false)}
      onCreated={onEntityCreated}
    />
  );

  if (onClose) {
    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative grid h-[85vh] w-[min(1100px,95vw)] grid-cols-[220px_1fr] overflow-hidden rounded-xl bg-background shadow-2xl"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
          <aside className="overflow-y-auto border-r border-hairline bg-secondary/60 px-3 py-5">
            <div className="px-2 pb-3 text-sm font-semibold text-ink">Settings</div>
            {navEl}
          </aside>
          <section className="overflow-y-auto bg-background">
            <div className="sticky top-0 z-[1] flex items-center justify-end gap-2 border-b border-hairline bg-background px-6 py-3 pr-14">
              {headerActions}
            </div>
            <div className="px-6 pb-10 pt-6">{contentEl}</div>
          </section>
        </div>
        {createModalEl}
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6">
      <div>
        <div className="flex items-center justify-between gap-2 pt-4 pr-14">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-semibold text-ink">Settings</span>
          </div>
          {headerActions}
        </div>

        <div className="mt-8 grid gap-10 md:grid-cols-[180px_1fr]">
          {navEl}
          {contentEl}
        </div>
      </div>

      {createModalEl}
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
        className="inline-flex items-baseline gap-1.5 text-base font-semibold text-ink transition hover:text-ink/80"
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

function SystemPanel() {
  const [unit, setUnit] = useDistanceUnit();
  const options: { value: DistanceUnit; label: string; hint: string }[] = [
    { value: "km", label: "Kilometers", hint: "km" },
    { value: "mi", label: "Miles", hint: "mi" },
  ];
  return (
    <Card>
      <h3 className="text-sm font-semibold text-ink">Measurement units</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Choose how distances are displayed across the platform.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const active = unit === o.value;
          return (
            <button
              key={o.value}
              onClick={() => setUnit(o.value)}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                active
                  ? "border-primary bg-primary/5 text-ink"
                  : "border-hairline bg-card text-ink hover:bg-secondary"
              }`}
            >
              <div>
                <div className="text-sm font-medium">{o.label}</div>
                <div className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {o.hint}
                </div>
              </div>
              {active && <Check className="h-4 w-4 text-primary" strokeWidth={2.5} />}
            </button>
          );
        })}
      </div>
    </Card>
  );
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

function AppearancePanel() {
  const { user, activeEntityId } = useAuth();
  const [open, setOpen] = useState(false);
  const [currentColor, setCurrentColor] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    if (!user) return;
    (async () => {
      if (activeEntityId) {
        const { data } = await supabase
          .from("teams")
          .select("top_bar_color")
          .eq("id", activeEntityId)
          .maybeSingle();
        if (!cancel) setCurrentColor((data?.top_bar_color as string | null) ?? null);
      } else {
        const { data } = await supabase
          .from("profiles")
          .select("top_bar_color")
          .eq("id", user.id)
          .maybeSingle();
        if (!cancel) setCurrentColor((data?.top_bar_color as string | null) ?? null);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [user, activeEntityId]);

  return (
    <div className="space-y-3">
      <Card>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <span
              className="h-4 w-4 border border-hairline"
              style={{ background: currentColor || "transparent" }}
            />
            <h3 className="text-sm font-semibold text-ink">Top bar color</h3>
          </div>
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" strokeWidth={2.25} />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" strokeWidth={2.25} />
          )}
        </button>
        {open && (
          <div className="mt-4">
            <TopBarColorPicker
              initial={currentColor}
              onSaved={(hex) => setCurrentColor(hex)}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

/* PROFILE_VISIBILITY_ITEMS now imported from @/lib/library-settings */
function ProfileVisibilityPanel({
  scopeKey,
  active,
  onActiveChange,
}: {
  scopeKey: string;
  active: boolean;
  onActiveChange: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useProfileVisibility(scopeKey);

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex w-full items-center gap-3">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <h3 className="text-sm font-semibold text-ink">Profile</h3>
          </button>
          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              role="switch"
              aria-checked={active}
              onClick={() => onActiveChange(!active)}
              className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                active ? "bg-primary" : "bg-secondary"
              }`}
              aria-label="Toggle profile active"
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                  active ? "left-[18px]" : "left-0.5"
                }`}
              />
            </button>
            <button
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Collapse" : "Expand"}
              className="text-muted-foreground hover:text-ink"
            >
              {open ? (
                <ChevronDown className="h-4 w-4" strokeWidth={2.25} />
              ) : (
                <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
              )}
            </button>
          </div>
        </div>
        {open && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              The following tabs will be included and visible in the profile page.
            </p>
            <ul className="divide-y divide-hairline rounded-xl border border-hairline">
              {PROFILE_VISIBILITY_ITEMS.map((item) => (
                <li key={item} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-ink">{item}</span>
                  <input
                    type="checkbox"
                    checked={checked[item] ?? true}
                    onChange={(e) =>
                      setChecked({ ...checked, [item]: e.target.checked })
                    }
                    className="h-4 w-4 accent-primary"
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ───────── Library category settings (autosave per category) ───────── */

function MediaSettingsPanel() {
  return (
    <div className="space-y-3">
      <AlbumBackgroundCard />
    </div>
  );
}

function AlbumBackgroundCard() {
  const [open, setOpen] = useState(true);
  const [bg, setBg] = useLibrarySetting<"light" | "dark">("media:album-bg", "light");
  const options: Array<{ id: "light" | "dark"; label: string; description: string }> = [
    { id: "light", label: "Light", description: "Bright background, ideal for daytime browsing." },
    { id: "dark", label: "Dark", description: "Dim background, easier on the eyes in low light." },
  ];
  return (
    <Card>
      <div className="flex w-full items-center gap-3">
        <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <h3 className="text-sm font-semibold text-ink">Album background</h3>
        </button>
        <button onClick={() => setOpen((v) => !v)} aria-label={open ? "Collapse" : "Expand"} className="text-muted-foreground hover:text-ink">
          {open ? <ChevronDown className="h-4 w-4" strokeWidth={2.25} /> : <ChevronRight className="h-4 w-4" strokeWidth={2.25} />}
        </button>
      </div>
      {open && (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Color of the album backdrop and frozen top bar. Affects gallery and opened items.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {options.map((o) => {
              const active = o.id === bg;
              const isDark = o.id === "dark";
              return (
                <button
                  key={o.id}
                  onClick={() => setBg(o.id)}
                  className={`group relative overflow-hidden rounded-xl border text-left transition ${
                    active ? "border-primary shadow-md ring-2 ring-primary/30" : "border-hairline hover:border-ink/30"
                  }`}
                >
                  <div className={`relative h-28 px-3 py-2 ${isDark ? "bg-zinc-950" : "bg-background"}`}>
                    <div className={`mb-2 flex h-3 items-center justify-end gap-1 rounded-sm ${isDark ? "bg-zinc-900" : "bg-secondary/60"}`}>
                      <span className={`mr-1 h-1.5 w-1.5 rounded-full ${isDark ? "bg-zinc-600" : "bg-zinc-400"}`} />
                      <span className={`mr-1 h-1.5 w-1.5 rounded-full ${isDark ? "bg-zinc-600" : "bg-zinc-400"}`} />
                      <span className={`mr-1 h-1.5 w-1.5 rounded-full ${isDark ? "bg-zinc-600" : "bg-zinc-400"}`} />
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className={`aspect-square rounded-[2px] ${isDark ? "bg-zinc-800" : "bg-zinc-300"}`} />
                      ))}
                    </div>
                    {active && (
                      <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <div className="bg-card px-3 py-2.5">
                    <div className="text-sm font-medium text-ink">{o.label}</div>
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{o.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

function LibrarySettingsPanel({ scopeKey }: { scopeKey: string }) {
  return (
    <div className="space-y-3">
      <CategoryAutosaveCard
        title="Notes"
        storageKey={notesAutosaveKey(scopeKey)}
        description="Automatically save your note as you type. When off, you'll see a Save button."
      />
      <CategoryAutosaveCard
        title="Meetings"
        storageKey={meetingsAutosaveKey(scopeKey)}
        description="Automatically save meeting notes as you type. When off, you'll see a Save button."
      />
    </div>
  );
}

function CategoryAutosaveCard({
  title,
  storageKey,
  description,
}: {
  title: string;
  storageKey: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useLibrarySetting<boolean>(storageKey, false);
  return (
    <Card>
      <div className="flex w-full items-center gap-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
        </button>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition ${
              enabled ? "bg-primary" : "bg-secondary"
            }`}
            aria-label={`Toggle ${title} autosave`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                enabled ? "left-[18px]" : "left-0.5"
              }`}
            />
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse" : "Expand"}
            className="text-muted-foreground hover:text-ink"
          >
            {open ? (
              <ChevronDown className="h-4 w-4" strokeWidth={2.25} />
            ) : (
              <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
            )}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">{description}</p>
          <label className="flex items-center justify-between rounded-xl border border-hairline px-4 py-3">
            <span className="text-sm text-ink">Enable autosave</span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>
        </div>
      )}
    </Card>
  );
}

/* ───────── Diary category settings ───────── */

function DiarySettingsPanel({ scopeKey: _scopeKey }: { scopeKey: string }) {
  return (
    <div className="space-y-3">
      <DiaryCategoryCard
        title="Training"
        items={["Units", "Activitytypes"]}
      />
      <DiaryCategoryCard title="Notes" items={[]} />
      <SessionTileDesignCard />
      <DiarySessionDetailsCard />
    </div>
  );
}

function SessionTileDesignCard() {
  const [open, setOpen] = useState(true);
  const [design, setDesign] = useSessionTileDesign();
  return (
    <Card>
      <div className="flex w-full items-center gap-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <h3 className="text-sm font-semibold text-ink">Session tile design</h3>
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Collapse" : "Expand"}
          className="text-muted-foreground hover:text-ink"
        >
          {open ? (
            <ChevronDown className="h-4 w-4" strokeWidth={2.25} />
          ) : (
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
          )}
        </button>
      </div>
      {open && (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            How logged sessions appear in the Diary week view.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {SESSION_TILE_DESIGNS.map((d) => {
              const active = d.id === design;
              return (
                <button
                  key={d.id}
                  onClick={() => setDesign(d.id)}
                  className={`group relative overflow-hidden rounded-xl border text-left transition ${
                    active
                      ? "border-primary shadow-md ring-2 ring-primary/30"
                      : "border-hairline hover:border-ink/30"
                  }`}
                >
                  <div className="relative flex h-24 items-center justify-center bg-[#B8B8FF]/25 px-2">
                    <SessionTilePreview design={d.id} />
                    {active && (
                      <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <div className="bg-card px-3 py-2.5">
                    <div className="text-sm font-medium text-ink">{d.label}</div>
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {d.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

function SessionTilePreview({ design }: { design: SessionTileDesign }) {
  const accent = "#5b5bff";
  if (design === "icon") {
    return (
      <div className="flex h-14 w-full items-center justify-center rounded-[3px] bg-white/70 ring-1 ring-black/5">
        <Footprints className="h-6 w-6" strokeWidth={2.25} style={{ color: accent }} />
      </div>
    );
  }
  if (design === "stacked") {
    return (
      <div className="flex h-14 w-full items-stretch overflow-hidden rounded-[3px] bg-white/70 ring-1 ring-black/5">
        <div className="flex w-1/2 items-center justify-center" style={{ background: "rgba(184,184,255,0.45)" }}>
          <Footprints className="h-6 w-6" strokeWidth={2.25} style={{ color: accent }} />
        </div>
        <div className="flex w-1/2 flex-col justify-center px-1.5 leading-tight">
          <span className="truncate text-[9px] font-semibold text-ink">Morning run</span>
          <span className="text-[8px] tabular-nums text-ink/70">45 min</span>
          <span className="text-[8px] tabular-nums text-ink/70">8.2 km</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-14 w-full items-stretch overflow-hidden rounded-[3px] bg-white/70 ring-1 ring-black/5">
      <div className="flex w-1/2 items-center justify-center" style={{ background: "rgba(184,184,255,0.45)" }}>
        <Footprints className="h-7 w-7" strokeWidth={2.25} style={{ color: accent }} />
      </div>
      <div
        className="flex w-1/2 items-center justify-center text-ink"
        style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 18 }}
      >
        8.2
      </div>
    </div>
  );
}

function DiarySessionDetailsCard() {
  const [open, setOpen] = useState(false);
  const [autosync, setAutosync] = useLibrarySetting<boolean>(
    "diary:autosync:global",
    false,
  );
  return (
    <Card>
      <div className="flex w-full items-center gap-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <h3 className="text-sm font-semibold text-ink">Session details</h3>
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Collapse" : "Expand"}
          className="text-muted-foreground hover:text-ink"
        >
          {open ? (
            <ChevronDown className="h-4 w-4" strokeWidth={2.25} />
          ) : (
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
          )}
        </button>
      </div>
      {open && (
        <div className="mt-4 space-y-2">
          <label className="flex items-center justify-between rounded-xl border border-hairline px-4 py-3">
            <div className="flex flex-col">
              <span className="text-sm text-ink">Autosync</span>
              <span className="text-xs text-muted-foreground">
                Automatically save changes to session details.
              </span>
            </div>
            <input
              type="checkbox"
              checked={autosync}
              onChange={(e) => setAutosync(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-primary"
            />
          </label>
        </div>
      )}
    </Card>
  );
}

function DiaryCategoryCard({ title, items }: { title: string; items: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <div className="flex w-full items-center gap-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Collapse" : "Expand"}
          className="text-muted-foreground hover:text-ink"
        >
          {open ? (
            <ChevronDown className="h-4 w-4" strokeWidth={2.25} />
          ) : (
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
          )}
        </button>
      </div>
      {open && items.length > 0 && (
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <div
              key={item}
              className="flex items-center justify-between rounded-xl border border-hairline px-4 py-3"
            >
              <span className="text-sm text-ink">{item}</span>
            </div>
          ))}
        </div>
      )}
      {open && items.length === 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Settings will appear here.
        </p>
      )}
    </Card>
  );
}

/* ───────── Connectors panel ───────── */

const CONNECTOR_GROUPS: { title: string; items: { name: string; tag: string }[] }[] = [
  {
    title: "Sports & timing",
    items: [
      { name: "Strava", tag: "fitness" },
      { name: "EQ Timing", tag: "timing" },
    ],
  },
  {
    title: "Cloud storage",
    items: [
      { name: "One Drive", tag: "storage" },
      { name: "iCloud", tag: "storage" },
      { name: "Google Drive", tag: "storage" },
      { name: "Dropbox", tag: "storage" },
    ],
  },
  {
    title: "Email",
    items: [
      { name: "Outlook", tag: "email" },
      { name: "Hotmail", tag: "email" },
      { name: "Gmail", tag: "email" },
    ],
  },
];

function ConnectorsPanel() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const [stravaConnected, setStravaConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) { if (active) setStravaConnected(false); return; }
      const { data } = await supabase
        .from("strava_auth")
        .select("user_id")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (active) setStravaConnected(!!data);
    })();
    // Surface OAuth result toast
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const r = url.searchParams.get("strava");
      if (r === "connected") { toast.success("Strava connected. Syncing the last 90 days…"); url.searchParams.delete("strava"); window.history.replaceState({}, "", url.toString()); }
      else if (r === "denied") { toast.error("Strava connection denied."); url.searchParams.delete("strava"); window.history.replaceState({}, "", url.toString()); }
      else if (r) { toast.error("Strava connection failed."); url.searchParams.delete("strava"); window.history.replaceState({}, "", url.toString()); }
    }
    return () => { active = false; };
  }, []);

  const handleStravaConnect = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("strava-oauth-start", {
        body: { redirect_to: window.location.origin + "/settings/connectors" },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (e: any) {
      toast.error(e?.message || "Could not start Strava connection");
    } finally {
      setBusy(false);
    }
  };

  const handleStravaDisconnect = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("strava-disconnect", { body: {} });
      if (error) throw error;
      setStravaConnected(false);
      toast.success("Strava disconnected.");
    } catch (e: any) {
      toast.error(e?.message || "Disconnect failed");
    } finally {
      setBusy(false);
    }
  };

  const handleStravaResync = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("strava-sync-recent", { body: { days: 90 } });
      if (error) throw error;
      toast.success("Re-syncing recent activities…");
    } catch (e: any) {
      toast.error(e?.message || "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  const renderRow = (name: string, key?: string) => {
    if (name === "Strava") {
      return (
        <div className="rounded-xl border border-hairline px-4 py-3" key={key || name}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={stravaLogo} alt="Strava" className="h-9 w-9 rounded-lg object-cover" />
              <div>
              <div className="text-sm text-ink">Strava</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Auto-syncs your activities into the Diary. Recent activities cover the <strong>last 90 days</strong>.
              </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {stravaConnected && (
                <button
                  type="button"
                  onClick={handleStravaResync}
                  disabled={busy}
                  className="rounded-md border border-hairline px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-ink hover:text-ink disabled:opacity-50"
                >
                  Re-sync
                </button>
              )}
              <button
                type="button"
                onClick={stravaConnected ? handleStravaDisconnect : handleStravaConnect}
                disabled={busy || stravaConnected === null}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                  stravaConnected
                    ? "border-hairline text-muted-foreground hover:border-ink hover:text-ink"
                    : "border-ink bg-ink text-background hover:opacity-90"
                }`}
              >
                {stravaConnected ? "Disconnect" : "Connect"}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return <ConnectorRow key={key || name} name={name} />;
  };

  const allItems = CONNECTOR_GROUPS.flatMap((g) =>
    g.items.map((it) => ({ ...it, group: g.title })),
  );
  const matches = q ? allItems.filter((it) => it.name.toLowerCase().includes(q)) : [];

  return (
    <div className="space-y-6">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search connectors…"
          className="w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none transition focus:border-primary"
        />
      </div>

      {matches.length > 0 && (
        <Card>
          <h3 className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Matches
          </h3>
          <div className="mt-3 space-y-2">
            {matches.map((it) => renderRow(it.name, `m-${it.name}`))}
          </div>
        </Card>
      )}

      {CONNECTOR_GROUPS.map((g) => (
        <Card key={g.title}>
          <h3 className="text-sm font-semibold text-ink">{g.title}</h3>
          <div className="mt-3 space-y-2">
            {g.items.map((it) => renderRow(it.name))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function ConnectorRow({ name }: { name: string }) {
  const logo = CONNECTOR_LOGOS[name];
  return (
    <div className="flex items-center justify-between rounded-xl border border-hairline px-4 py-3">
      <div className="flex items-center gap-3">
        {logo && <img src={logo} alt={name} className="h-9 w-9 rounded-lg object-cover" />}
        <span className="text-sm text-ink">{name}</span>
      </div>
      <button
        type="button"
        className="rounded-md border border-hairline px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-ink hover:text-ink"
      >
        Connect
      </button>
    </div>
  );
}

