import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { colorForStravaSportType } from "@/lib/activity-colors";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

import { ChevronDown, ChevronRight, ChevronLeft, Plus, X, User as UserIcon, Users as UsersIcon, Building2, Network, Settings as SettingsIcon, PanelLeft } from "lucide-react";

import { TopBarColorPicker } from "@/components/appearance/TopBarColorPicker";
import {
  PROFILE_VISIBILITY_ITEMS,
  useProfileVisibility,
  notesAutosaveKey,
  meetingsAutosaveKey,
  useLibrarySetting,
} from "@/lib/library-settings";
import { MapSettingsPanel } from "@/components/settings/MapSettingsPanel";
import { CoachesPanel, type CoachesPanelHandle } from "@/components/settings/CoachesPanel";
import { ClientsPanel } from "@/components/settings/ClientsPanel";
import { Footprints, Check, Bike, Dumbbell } from "lucide-react";
import { SESSION_TILE_DESIGNS, useSessionTileDesign, useDiarySimpleView, type SessionTileDesign, COMBINED_SESSION_TILE_DESIGNS, useCombinedSessionTileDesign, type CombinedSessionTileDesign } from "@/lib/session-tile-design";
import { Switch } from "@/components/ui/switch";
import { MONTH_TILE_DESIGNS, useMonthTileDesign, type MonthTileDesign } from "@/lib/month-tile-design";
import { useDistanceUnit, type DistanceUnit } from "@/lib/units";
import {
  usePriorityMetric,
  useMetricColor,
} from "@/components/calendar/metricsSettings";
import { useWeekViewHours, clampWeekViewHours } from "@/lib/week-view-hours";
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
  | "coaches"
  | "clients"
  | "connectors"
  | "system"
  | "appearance"
  | "entity-profile"
  | "entity-general"
  | "entity-organization"
  | "entity-calendar"
  | "entity-map"
  | "entity-events"
  | "entity-library"
  | "entity-clients";

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
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  type DeleteStep = "request" | "code" | "confirm";
  const [deleteStep, setDeleteStep] = useState<DeleteStep>("request");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSending, setDeleteSending] = useState(false);
  const [deleteAttemptId, setDeleteAttemptId] = useState<string | null>(null);
  const [deleteMasked, setDeleteMasked] = useState("");
  const [deleteDigits, setDeleteDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [deleteResendIn, setDeleteResendIn] = useState(0);
  const [deleteVerifying, setDeleteVerifying] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const deleteInputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (deleteResendIn <= 0) return;
    const t = setTimeout(() => setDeleteResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [deleteResendIn]);

  const openDeleteFlow = () => {
    setDeleteStep("request");
    setDeleteAttemptId(null);
    setDeleteDigits(["", "", "", "", "", ""]);
    setDeleteError(null);
    setDeleteResendIn(0);
    setDeleteOpen(true);
  };
  const closeDeleteFlow = () => setDeleteOpen(false);

  const sendDeleteCode = async () => {
    if (!user) return;
    setDeleteSending(true);
    setDeleteError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("send-verification-otp", {
        body: {
          channel: "email",
          destination: user.email!,
          target_kind: "account_signup",
          target_id: user.id,
          target_meta: {},
        },
      });
      if (fnErr) throw fnErr;
      const payload = data as { error?: string; attempt_id?: string; masked?: string };
      if (payload?.error) throw new Error(payload.error);
      if (!payload?.attempt_id) throw new Error("Failed to send code");
      setDeleteAttemptId(payload.attempt_id);
      setDeleteMasked(payload.masked ?? user.email ?? "");
      setDeleteResendIn(60);
      setDeleteStep("code");
      setTimeout(() => deleteInputsRef.current[0]?.focus(), 80);
    } catch (e) {
      setDeleteError((e as Error).message || "Failed to send code");
    } finally {
      setDeleteSending(false);
    }
  };

  const verifyDeleteCode = async (codeStr?: string) => {
    const code = codeStr ?? deleteDigits.join("");
    if (code.length !== 6 || !deleteAttemptId) return;
    setDeleteVerifying(true);
    setDeleteError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("verify-otp", {
        body: { attempt_id: deleteAttemptId, code },
      });
      if (fnErr) throw fnErr;
      const payload = data as { error?: string; ok?: boolean };
      if (payload?.error) throw new Error(payload.error);
      setDeleteStep("confirm");
      setDeleteError(null);
    } catch (e) {
      setDeleteError((e as Error).message || "Verification failed");
      setDeleteDigits(["", "", "", "", "", ""]);
      deleteInputsRef.current[0]?.focus();
    } finally {
      setDeleteVerifying(false);
    }
  };

  const handleDeleteDigitChange = (idx: number, val: string) => {
    const clean = val.replace(/\D/g, "");
    if (clean.length > 1) {
      // paste
      const chars = clean.slice(0, 6).split("");
      const next = ["", "", "", "", "", ""];
      chars.forEach((c, i) => (next[i] = c));
      setDeleteDigits(next);
      const lastIdx = Math.min(chars.length, 6) - 1;
      if (chars.length >= 6) {
        deleteInputsRef.current[5]?.blur();
        void verifyDeleteCode(next.join(""));
      } else {
        deleteInputsRef.current[lastIdx + 1]?.focus();
      }
      return;
    }
    const next = [...deleteDigits];
    next[idx] = clean;
    setDeleteDigits(next);
    if (clean && idx < 5) deleteInputsRef.current[idx + 1]?.focus();
    if (clean && idx === 5 && next.every((d) => d)) {
      void verifyDeleteCode(next.join(""));
    }
  };

  const handleDeleteDigitKey = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !deleteDigits[idx] && idx > 0) {
      deleteInputsRef.current[idx - 1]?.focus();
    }
  };
  const [profileEntities, setProfileEntities] = useState<
    { id: string; name: string; entity_type: string; roles: string[] }[]
  >([]);

  // Active selection: null = individual profile, otherwise the entity id.
  const isTeamMode = !!activeEntityId;

  const coachesRef = useRef<CoachesPanelHandle | null>(null);
  const [coachesDirty, setCoachesDirty] = useState(false);

  const isDirty = isTeamMode
    ? !!team && JSON.stringify(team) !== teamBaseline
    : (!!profile && JSON.stringify(profile) !== profileBaseline) || coachesDirty;

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
    if (isTeamMode && (tab === "account" || tab === "profiles" || tab === "diary" || tab === "library" || tab === "coaches" || tab === "clients" || tab === "connectors")) {
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
      const profileChanged = JSON.stringify(profile) !== profileBaseline;
      if (profileChanged) {
        const { error } = await supabase.from("profiles").update(profile).eq("id", user.id);
        if (error) {
          setSaving(false);
          return toast.error(error.message);
        }
        setProfileBaseline(JSON.stringify(profile));
      }
      if (coachesRef.current?.isDirty()) {
        await coachesRef.current.save();
      }
      setSaving(false);
      if (profileChanged) toast.success("Settings saved.");
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

  const tabLabel = (t: Tab): string => {
    switch (t) {
      case "account": return "Account";
      case "profiles": return "Profile";
      case "calendar": return "Calendar";
      case "diary": return "Diary";
      case "library": return "Photos";
      case "coaches": return "Coaches";
      case "clients": return "Clients";
      case "connectors": return "Connectors";
      case "system": return "System";
      case "appearance": return "Appearance";
      case "entity-profile": return "Profile";
      case "entity-general": return "About";
      case "entity-organization": return "Organization";
      case "entity-calendar": return "Calendar";
      case "entity-map": return "Map";
      case "entity-events": return "Events";
      case "entity-library": return "Photos";
      case "entity-clients": return "Clients";
    }
  };

  /** Switch to a "Me" (individual) sub-tab. Clears active entity. */
  const selectMeTab = (t: Tab) => {
    if (activeEntityId) setActiveEntity(null);
    setTab(t);
  };
  /** Switch to a sub-tab of one of the user's other-profile entities. */
  const selectEntityTab = (entityId: string, t: Tab) => {
    if (activeEntityId !== entityId) setActiveEntity(entityId);
    setTab(t);
  };

  const meTabs: Tab[] = [
    "calendar",
    "diary",
    "library",
    "profiles",
    "coaches",
    "clients",
    "connectors",
    "system",
    "appearance",
  ];
  // Override label for the Me-Profile entry per spec.
  const meTabLabel = (t: Tab) => (t === "profiles" ? "Profile" : tabLabel(t));

  const entityTabsFor = (e: { entity_type: string; roles: string[] }): Tab[] => {
    const roles = e.roles.map((r) => r.toLowerCase());
    const out: Tab[] = [];
    if (roles.includes("admin")) {
      out.push("entity-general", "entity-profile", "entity-calendar", "entity-organization");
    }
    if (roles.some((r) => r.includes("coach"))) {
      out.push("entity-clients");
    }
    if (roles.some((r) => r.includes("photographer"))) {
      out.push("entity-library");
    }
    // Every profile gets its own System + Appearance per spec.
    out.push("system", "appearance");
    // De-dupe in case admin already added something.
    return Array.from(new Set(out));
  };

  /** Active-state predicate for left-panel rows. */
  const isMeActive = (t: Tab) => !activeEntityId && tab === t;
  const isEntityActive = (eid: string, t: Tab) => activeEntityId === eid && tab === t;

  const sideRowClass = (active: boolean) =>
    `flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs transition ${
      active
        ? "bg-secondary font-medium text-ink"
        : "text-ink/80 hover:bg-secondary/60 hover:text-ink"
    }`;


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

          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={openDeleteFlow}
              className="text-xs font-medium text-destructive hover:underline"
            >
              Delete account
            </button>
          </div>
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
        <div className="space-y-3">
          <WeekViewCard app="calendar" />
        </div>
      )}

      {tab === "diary" && !isTeamMode && (
        <DiarySettingsPanel scopeKey={`user:${user.id}`} />
      )}

      {tab === "library" && !isTeamMode && (
        <LibrarySettingsPanel scopeKey={`user:${user.id}`} />
      )}


      {tab === "coaches" && !isTeamMode && (
        <CoachesPanel ref={coachesRef} onDirtyChange={setCoachesDirty} />
      )}

      {tab === "clients" && !isTeamMode && <ClientsPanel />}

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

      {tab === "entity-clients" && isTeamMode && (
        <Card>
          <h3 className="text-sm font-semibold text-ink">Clients</h3>
          <p className="mt-2 text-xs text-muted-foreground">Coach client management will appear here.</p>
        </Card>
      )}
    </div>
  );

  // Active tab label shown in the sticky top frozen bar of the content area.
  const activeTabLabel = tabLabel(tab);

  const sideNavEl = (
    <nav className="flex h-full min-h-0 flex-col gap-1 overflow-y-auto pb-4 pt-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ink/15 hover:[&::-webkit-scrollbar-thumb]:bg-ink/30">
      {/* Account (top-level) */}
      <button
        type="button"
        onClick={() => selectMeTab("account")}
        className={sideRowClass(isMeActive("account"))}
      >
        <span className="min-w-0 flex-1 truncate">Account</span>
      </button>

      <div className="my-1.5 h-px w-full bg-hairline" />

      {/* Me group */}
      <SettingsGroup id="me" title="Me" defaultOpen>
        {meTabs.map((t) => (
          <button
            key={`me:${t}`}
            type="button"
            onClick={() => selectMeTab(t)}
            className={sideRowClass(isMeActive(t))}
          >
            <span className="min-w-0 flex-1 truncate">{meTabLabel(t)}</span>
          </button>
        ))}
      </SettingsGroup>

      {/* Other-profile groups */}
      {profileEntities.map((e) => {
        const tabs = entityTabsFor(e);
        return (
          <SettingsGroup key={`ent:${e.id}`} id={`ent:${e.id}`} title={e.name}>
            {tabs.map((t) => (
              <button
                key={`${e.id}:${t}`}
                type="button"
                onClick={() => selectEntityTab(e.id, t)}
                className={sideRowClass(isEntityActive(e.id, t))}
              >
                <span className="min-w-0 flex-1 truncate">{tabLabel(t)}</span>
              </button>
            ))}
          </SettingsGroup>
        );
      })}

      <div className="my-1.5 h-px w-full bg-hairline" />

      <button
        type="button"
        onClick={async () => {
          await signOut();
          void navigate({ to: "/" });
        }}
        className={sideRowClass(false) + " hover:text-destructive"}
      >
        <span className="min-w-0 flex-1 truncate">Sign out</span>
      </button>
    </nav>
  );

  const panelOpen = sidePanelOpen;
  return (
    <div className="h-full overflow-hidden bg-white">
      <div
        className="relative grid h-full overflow-hidden transition-[grid-template-columns] duration-300 ease-out"
        style={{ gridTemplateColumns: panelOpen ? "256px 1fr" : "0px 1fr" }}
      >
        <aside className="relative md:h-full overflow-hidden">
          <div
            className="relative h-full pl-2 pr-2 py-2 transition-transform duration-300 ease-out"
            style={{
              width: 256,
              transform: panelOpen ? "translateX(0)" : "translateX(-100%)",
            }}
          >
            <div className="mac-panel relative h-full overflow-hidden rounded-lg border border-hairline shadow-sm">
              <div className="h-full overflow-hidden px-1.5 pt-[48px]">
                {sideNavEl}
              </div>
              <div className="mac-panel-fade pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-lg" />
            </div>
          </div>
        </aside>

        <button
          type="button"
          onClick={() => setSidePanelOpen(!panelOpen)}
          aria-label={panelOpen ? "Hide panel" : "Show panel"}
          title={panelOpen ? "Hide panel" : "Show panel"}
          className="absolute left-3 top-[12px] z-40 grid h-7 w-7 place-items-center rounded-md bg-white/0 text-muted-foreground hover:bg-secondary/60 hover:text-ink"
        >
          <PanelLeft className="h-4 w-4" />
        </button>

        <section
          className={`relative min-w-0 md:h-full md:overflow-hidden transition-[padding-left] duration-300 ease-out ${
            panelOpen ? "pl-0" : "pl-2"
          }`}
        >
          {/* Frozen top bar showing the active tab name */}
          <div className="sticky top-0 z-[1] flex h-[48px] items-center gap-2 bg-white px-6">
            <span className="text-base font-semibold text-ink">{activeTabLabel}</span>
          </div>

          <div className="h-[calc(100%-48px)] overflow-y-auto px-6 pb-10 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ink/15 hover:[&::-webkit-scrollbar-thumb]:bg-ink/30">
            {contentEl}
          </div>
        </section>
      </div>
      {deleteOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            if (deleteStep === "code") return;
            if (deleteSending || deleteVerifying || deletingAccount) return;
            closeDeleteFlow();
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {deleteStep === "request" && (
              <>
                <h2 className="text-base font-semibold text-ink">
                  Request to delete your account
                </h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Before we proceed, please understand what will be permanently removed:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>Your profile and personal information</li>
                  <li>All calendar and diary entries</li>
                  <li>Your photos and media</li>
                  <li>Event registrations and history</li>
                  <li>Team memberships and roles</li>
                  <li>Any entities you own</li>
                </ul>
                <p className="mt-3 text-sm text-muted-foreground">
                  To confirm your identity, we'll send a 6‑digit verification code to{" "}
                  <strong className="text-ink">{user?.email}</strong>.
                </p>
                {deleteError && (
                  <p className="mt-3 text-sm text-destructive">{deleteError}</p>
                )}
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={deleteSending}
                    onClick={closeDeleteFlow}
                    className="rounded-md border border-hairline px-4 py-2 text-sm text-ink hover:bg-secondary/60 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deleteSending}
                    onClick={sendDeleteCode}
                    className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {deleteSending ? "Sending…" : "Send verification code"}
                  </button>
                </div>
              </>
            )}

            {deleteStep === "code" && (
              <>
                <h2 className="text-base font-semibold text-ink">Enter verification code</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  We sent a 6‑digit code to <strong className="text-ink">{deleteMasked}</strong>.
                  Enter it below to verify your identity.
                </p>
                <div className="mt-5 flex justify-center gap-2">
                  {deleteDigits.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        deleteInputsRef.current[i] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={d}
                      disabled={deleteVerifying}
                      onChange={(e) => handleDeleteDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleDeleteDigitKey(i, e)}
                      className="h-12 w-11 rounded-xl border border-hairline bg-background text-center text-xl text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  ))}
                </div>
                {deleteError && (
                  <p className="mt-3 text-center text-sm text-destructive">{deleteError}</p>
                )}
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <button
                    type="button"
                    disabled={deleteResendIn > 0 || deleteSending}
                    onClick={sendDeleteCode}
                    className="text-ink hover:underline disabled:text-muted-foreground disabled:no-underline"
                  >
                    {deleteResendIn > 0 ? `Resend code in ${deleteResendIn}s` : "Resend code"}
                  </button>
                  <span>Check your spam folder if you don't see it.</span>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={deleteVerifying}
                    onClick={closeDeleteFlow}
                    className="rounded-md border border-hairline px-4 py-2 text-sm text-ink hover:bg-secondary/60 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deleteVerifying || deleteDigits.some((c) => !c)}
                    onClick={() => verifyDeleteCode()}
                    className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {deleteVerifying ? "Verifying…" : "Verify"}
                  </button>
                </div>
              </>
            )}

            {deleteStep === "confirm" && (
              <>
                <h2 className="text-base font-semibold text-ink">
                  Delete your Aponna account
                </h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Your identity has been verified. Review what will be permanently deleted:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>Your profile and personal information</li>
                  <li>All calendar and diary entries</li>
                  <li>Your photos and media</li>
                  <li>Event registrations and history</li>
                  <li>Team memberships and roles</li>
                  <li>Any entities you own</li>
                </ul>
                <p className="mt-3 text-sm font-medium text-ink">
                  This action is permanent and cannot be undone.
                </p>
                {deleteError && (
                  <p className="mt-3 text-sm text-destructive">{deleteError}</p>
                )}
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={deletingAccount}
                    onClick={closeDeleteFlow}
                    className="rounded-md border border-hairline px-4 py-2 text-sm text-ink hover:bg-secondary/60 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deletingAccount}
                    onClick={async () => {
                      setDeletingAccount(true);
                      setDeleteError(null);
                      try {
                        const { data: sessionData } = await supabase.auth.getSession();
                        const accessToken = sessionData.session?.access_token ?? "";
                        const res = await fetch("/api/auth/delete-account", {
                          method: "POST",
                          credentials: "include",
                          headers: {
                            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                          },
                        });
                        const body = (await res.json().catch(() => ({}))) as {
                          error?: string;
                        };
                        if (!res.ok) {
                          setDeleteError(body.error ?? "Failed to delete account");
                          setDeletingAccount(false);
                          return;
                        }
                        await signOut();
                        closeDeleteFlow();
                        toast.success("Your account has been deleted.");
                        navigate({ to: "/" });
                      } catch (e) {
                        setDeleteError(
                          e instanceof Error ? e.message : "Network error",
                        );
                        setDeletingAccount(false);
                      }
                    }}
                    className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {deletingAccount ? "Deleting…" : "Delete account"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


/** Collapsible nav group used in the settings left panel — same chevron
 *  style as the calendar category sections. */
function SettingsGroup({
  id,
  title,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const storageKey = `settings:sidenav:groupOpen:${id}`;
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    try {
      const v = window.localStorage.getItem(storageKey);
      if (v === "1") return true;
      if (v === "0") return false;
    } catch {
      /* ignore */
    }
    return defaultOpen;
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open, storageKey]);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-sm text-ink transition hover:bg-secondary/60"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-90" : ""
          }`}
        />
        <span className="min-w-0 flex-1 truncate text-left font-medium">{title}</span>
      </button>
      {open && <div className="ml-3 flex flex-col border-l border-hairline pl-1">{children}</div>}
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
      <ThemeSettingsPanel />
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

function ThemeSettingsPanel() {
  const [selectedTheme, setSelectedTheme] = useState<"light" | "dark">("light");

  return (
    <Card>
      <header className="mb-4">
        <h3 className="text-sm font-semibold text-ink">Theme</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose between light and dark mode for the platform.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Light theme tile */}
        <button
          onClick={() => setSelectedTheme("light")}
          className={`group relative overflow-hidden rounded-xl border text-left transition ${
            selectedTheme === "light"
              ? "border-primary shadow-md ring-2 ring-primary/30"
              : "border-hairline hover:border-ink/30"
          }`}
        >
          <div className="relative flex h-32 items-center justify-center bg-[#f5f3ee] p-4">
            {/* Miniature light platform preview */}
            <div className="h-24 w-40 overflow-hidden bg-white">
              {/* Top tab bar — thin */}
              <div className="h-1.5 w-full bg-[#e8e4dd]" />
              {/* Body: sidebar island + main */}
              <div className="flex h-[calc(100%-0.375rem)] p-1">
                <div className="h-full w-7 rounded-sm bg-[#e8e4dd]" />
                <div className="h-full flex-1 bg-white" />
              </div>
            </div>
            {selectedTheme === "light" && (
              <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                <Check className="h-3 w-3" />
              </span>
            )}
          </div>
          <div className="bg-card px-3 py-2.5">
            <div className="text-sm font-medium text-ink">Light</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Light grey top bar and sidebar with a white main window.
            </div>
          </div>
        </button>

        {/* Dark theme tile */}
        <button
          onClick={() => setSelectedTheme("dark")}
          className={`group relative overflow-hidden rounded-xl border text-left transition ${
            selectedTheme === "dark"
              ? "border-primary shadow-md ring-2 ring-primary/30"
              : "border-hairline hover:border-ink/30"
          }`}
        >
          <div className="relative flex h-32 items-center justify-center bg-[#f5f3ee] p-4">
            {/* Miniature dark platform preview */}
            <div className="h-24 w-40 overflow-hidden bg-white">
              {/* Top tab bar — thin */}
              <div className="h-1.5 w-full bg-[#2d2d2d]" />
              {/* Body: sidebar island + main */}
              <div className="flex h-[calc(100%-0.375rem)] p-1">
                <div className="h-full w-7 rounded-sm bg-[#2d2d2d]" />
                <div className="h-full flex-1 bg-white" />
              </div>
            </div>
            {selectedTheme === "dark" && (
              <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                <Check className="h-3 w-3" />
              </span>
            )}
          </div>
          <div className="bg-card px-3 py-2.5">
            <div className="text-sm font-medium text-ink">Dark</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Dark top bar and sidebar with a white main window.
            </div>
          </div>
        </button>
      </div>
    </Card>
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
      <WeekViewCard app="diary" />
      <SessionTileDesignCard />
      <MonthSessionTileDesignCard />
      <DiarySessionDetailsCard />
      <DiaryChartCard />
    </div>
  );
}

function WeekViewCard({ app }: { app: "calendar" | "diary" }) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useWeekViewHours(app);
  const [fromStr, setFromStr] = useState<string>(() => String(hours.startHour).padStart(2, "0") + ":00");
  const [toStr, setToStr] = useState<string>(() => String(hours.endHour).padStart(2, "0") + ":00");

  // Keep local inputs in sync if hours change elsewhere.
  useEffect(() => {
    setFromStr(String(hours.startHour).padStart(2, "0") + ":00");
    setToStr(String(hours.endHour).padStart(2, "0") + ":00");
  }, [hours.startHour, hours.endHour]);

  const parseHour = (s: string): number | null => {
    const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (!m) return null;
    const h = Number(m[1]);
    if (!Number.isFinite(h)) return null;
    return h;
  };

  const commitFrom = () => {
    const h = parseHour(fromStr);
    if (h === null) {
      setFromStr(String(hours.startHour).padStart(2, "0") + ":00");
      return;
    }
    const next = clampWeekViewHours({ startHour: Math.max(0, Math.min(12, h)), endHour: hours.endHour });
    setHours(next);
  };
  const commitTo = () => {
    const h = parseHour(toStr);
    if (h === null) {
      setToStr(String(hours.endHour).padStart(2, "0") + ":00");
      return;
    }
    const next = clampWeekViewHours({ startHour: hours.startHour, endHour: Math.max(13, Math.min(24, h)) });
    setHours(next);
  };

  return (
    <Card>
      <div className="flex w-full items-center gap-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <h3 className="text-sm font-semibold text-ink">Week-view</h3>
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
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-hairline p-3">
            <div className="text-sm font-medium text-ink">Day timeframe</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Sets the start and end hour shown in the week view day columns. From: 00:00–12:00. To: 13:00–24:00.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-10">From</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={fromStr}
                  onChange={(e) => setFromStr(e.target.value)}
                  onBlur={commitFrom}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
                  className="h-8 w-20 rounded-md border border-hairline bg-card px-2 text-center text-sm tabular-nums text-ink shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-10">To</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={toStr}
                  onChange={(e) => setToStr(e.target.value)}
                  onBlur={commitTo}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
                  className="h-8 w-20 rounded-md border border-hairline bg-card px-2 text-center text-sm tabular-nums text-ink shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function SessionTileDesignCard() {
  const [open, setOpen] = useState(true);
  const [design, setDesign] = useSessionTileDesign();
  const [combined, setCombined] = useCombinedSessionTileDesign();
  const [simple, setSimple] = useDiarySimpleView();
  return (
    <Card>
      <div className="flex w-full items-center gap-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <h3 className="text-sm font-semibold text-ink">Session tile design Week</h3>
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
          <div className="mt-5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Combined sessions
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              How two or more Strava sessions that <em>happened</em> less than an hour apart (i.e. the time between when the activities actually took place, not when they were synced) render as one tile.
              The tile height is always the sum of the synced activities (unless Simple view is on).
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {COMBINED_SESSION_TILE_DESIGNS.map((d) => {
                const active = d.id === combined;
                return (
                  <button
                    key={d.id}
                    onClick={() => setCombined(d.id)}
                    className={`group relative overflow-hidden rounded-xl border text-left transition ${
                      active
                        ? "border-primary shadow-md ring-2 ring-primary/30"
                        : "border-hairline hover:border-ink/30"
                    }`}
                  >
                    <div className="relative flex h-24 items-center justify-center bg-[#B8B8FF]/25 px-2">
                      <CombinedSessionTilePreview design={d.id} />
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
          </div>
          <div className="mt-4 rounded-lg border border-hairline p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink">Simple view</span>
              <div className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">{simple ? "On" : "Off"}</span>
                <Switch checked={simple} onCheckedChange={setSimple} />
              </div>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Ignore time of day — stack each day's sessions vertically with fixed tile height.
            </p>
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
        <span className="inline-flex items-baseline" style={{ gap: 3 }}>
          <span>8.2</span>
          <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.7 }}>km</span>
        </span>
      </div>
    </div>
  );
}

function CombinedSessionTilePreview({ design }: { design: CombinedSessionTileDesign }) {
  const accent1 = "#5b5bff";
  const accent2 = "#ADADAD"; // strengthCore
  const bg1 = "rgba(184,184,255,0.45)";
  const bg2 = "rgba(173,173,173,0.35)";
  if (design === "icon") {
    return (
      <div className="flex h-14 w-full items-stretch overflow-hidden rounded-[3px] bg-white/70 ring-1 ring-black/5">
        <div className="flex w-1/2 items-center justify-center" style={{ background: bg1 }}>
          <Footprints className="h-6 w-6" strokeWidth={2.25} style={{ color: accent1 }} />
        </div>
        <div className="flex w-1/2 items-center justify-center" style={{ background: bg2 }}>
          <Dumbbell className="h-6 w-6" strokeWidth={2.25} style={{ color: accent2 }} />
        </div>
      </div>
    );
  }
  if (design === "metric") {
    return (
      <div className="flex h-14 w-full items-stretch overflow-hidden rounded-[3px] bg-white/70 ring-1 ring-black/5">
        <div className="flex w-1/2 items-center justify-center px-1.5" style={{ background: bg1 }}>
          <span className="truncate text-[9px] font-semibold text-ink">Morning run</span>
        </div>
        <div className="flex w-1/2 items-center justify-center px-1.5" style={{ background: bg2 }}>
          <span className="truncate text-[9px] font-semibold text-ink">Core</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-14 w-full items-stretch overflow-hidden rounded-[3px] bg-white/70 ring-1 ring-black/5">
      <div className="flex w-1/2 flex-col justify-center px-1.5 leading-tight" style={{ background: bg1 }}>
        <span className="truncate text-[9px] font-semibold text-ink">Morning run</span>
        <span className="text-[8px] tabular-nums text-ink/70">45 min</span>
        <span className="text-[8px] tabular-nums text-ink/70">8.2 km</span>
      </div>
      <div className="flex w-1/2 flex-col justify-center px-1.5 leading-tight" style={{ background: bg2 }}>
        <span className="truncate text-[9px] font-semibold text-ink">Core</span>
        <span className="text-[8px] tabular-nums text-ink/70">20 min</span>
      </div>
    </div>
  );
}

function MonthSessionTileDesignCard() {
  const [open, setOpen] = useState(true);
  const [design, setDesign] = useMonthTileDesign();
  return (
    <Card>
      <div className="flex w-full items-center gap-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <h3 className="text-sm font-semibold text-ink">Session tile design Month</h3>
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
            How logged sessions appear in the Diary month view.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {MONTH_TILE_DESIGNS.map((d) => {
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
                    <MonthTilePreview design={d.id} />
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

function MonthTilePreview({ design }: { design: MonthTileDesign }) {
  const accent = "#5b5bff";
  const tint = "rgba(184,184,255,0.45)";
  if (design === "compact") {
    return (
      <div
        className="flex h-5 w-full items-center gap-1.5 rounded-[3px] px-1.5 text-[11.5px] text-ink"
        style={{ backgroundColor: "rgba(184,184,255,0.18)", boxShadow: `inset 2px 0 0 ${accent}` }}
      >
        <Footprints className="h-3 w-3 shrink-0" strokeWidth={2.25} style={{ color: accent }} />
        <span className="truncate">Morning run</span>
      </div>
    );
  }
  if (design === "stacked") {
    return (
      <div className="flex h-12 w-full items-stretch overflow-hidden rounded-[3px] bg-white/70 ring-1 ring-black/5">
        <div className="flex w-1/2 items-center justify-center" style={{ background: tint }}>
          <Footprints className="h-5 w-5" strokeWidth={2.25} style={{ color: accent }} />
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
    <div className="flex h-12 w-full items-stretch overflow-hidden rounded-[3px] bg-white/70 ring-1 ring-black/5">
      <div className="flex w-1/2 items-center justify-center" style={{ background: tint }}>
        <Footprints className="h-6 w-6" strokeWidth={2.25} style={{ color: accent }} />
      </div>
      <div
        className="flex w-1/2 items-center justify-center text-ink"
        style={{ fontFamily: "Helvetica, Arial, sans-serif", fontWeight: 700, fontSize: 16 }}
      >
        <span className="inline-flex items-baseline" style={{ gap: 3 }}>
          <span>8.2</span>
          <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>km</span>
        </span>
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

/* ───────── Diary chart settings ───────── */

function DiaryChartCard() {
  const [open, setOpen] = useState(false);
  const [priority, setPriority] = usePriorityMetric();
  const [distColor] = useMetricColor("distance");
  const [durColor] = useMetricColor("duration");

  return (
    <Card>
      <div className="flex w-full items-center gap-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <h3 className="text-sm font-semibold text-ink">Chart</h3>
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
        <div className="mt-4 space-y-4">
          {/* Priority dots */}
          <div className="flex items-center gap-6 rounded-xl border border-hairline px-4 py-3">
            {(["distance", "duration"] as const).map((m) => {
              const active = priority === m;
              const color = m === "distance" ? distColor : durColor;
              const label = m === "distance" ? "Distance" : "Duration";
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPriority(m)}
                  className="flex items-center gap-2 text-sm"
                  aria-pressed={active}
                >
                  <span
                    className="inline-block h-3.5 w-3.5 rounded-full border"
                    style={{
                      background: active ? color : "transparent",
                      borderColor: color,
                    }}
                  />
                  <span className={active ? "text-ink font-medium" : "text-muted-foreground"}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
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
  const [detail, setDetail] = useState<null | "strava">(null);

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

  if (detail === "strava") {
    return <StravaConnectorDetail onBack={() => setDetail(null)} />;
  }

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
                Auto-syncs your activities into the Diary. Recent activities cover the <strong>last 90 days</strong>.{" "}
                <button
                  type="button"
                  onClick={() => setDetail("strava")}
                  className="text-ink underline-offset-2 hover:underline"
                >
                  Read more
                </button>
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

const STRAVA_ACTIVITY_CATEGORIES: { title: string; items: string[] }[] = [
  {
    title: "Foot Sports",
    items: ["Run", "Trail Run", "Walk", "Hike", "Wheelchair"],
  },
  {
    title: "Cycle Sports",
    items: [
      "Ride (Standard Cycling)",
      "Mountain Bike Ride",
      "Gravel Ride",
      "E-Bike Ride",
      "E-Mountain Bike Ride",
      "Handcycle",
      "Velomobile",
    ],
  },
  {
    title: "Water Sports",
    items: [
      "Swim",
      "Surfing",
      "Stand Up Paddling (SUP)",
      "Kayak",
      "Canoe",
      "Rowing",
      "Windsurf",
      "Kitesurf",
      "Sailing",
    ],
  },
  {
    title: "Winter Sports",
    items: [
      "Alpine Ski",
      "Backcountry Ski",
      "Nordic Ski",
      "Snowboard",
      "Snowshoe",
      "Ice Skate",
    ],
  },
  {
    title: "Racquet Sports",
    items: ["Tennis", "Pickleball", "Padel", "Badminton", "Squash", "Racquetball", "Table Tennis"],
  },
  {
    title: "Team & Ball Sports",
    items: ["Football (Soccer)", "Basketball", "Volleyball", "Cricket"],
  },
  {
    title: "Gym & Studio Fitness",
    items: [
      "Workout (Catch-all generic category)",
      "Weight Training",
      "Crossfit",
      "HIIT (High-Intensity Interval Training)",
      "Yoga",
      "Pilates",
      "Dance",
      "Physical Therapy",
    ],
  },
  {
    title: "Machines & Other Sports",
    items: [
      "Stair Stepper",
      "Elliptical",
      "Rock Climbing",
      "Skateboarding",
      "Inline Skate",
      "Roller Ski",
      "Golf",
    ],
  },
  {
    title: "Virtual Sports (e.g., Zwift)",
    items: ["Virtual Ride", "Virtual Run"],
  },
];

function displayNameToSportType(name: string): string {
  const map: Record<string, string> = {
    'Run': 'Run',
    'Trail Run': 'TrailRun',
    'Walk': 'Walk',
    'Hike': 'Hike',
    'Wheelchair': 'Wheelchair',
    'Virtual Run': 'VirtualRun',
    'Ride (Standard Cycling)': 'Ride',
    'Mountain Bike Ride': 'MountainBikeRide',
    'Gravel Ride': 'GravelRide',
    'E-Bike Ride': 'EBikeRide',
    'E-Mountain Bike Ride': 'EMountainBikeRide',
    'Handcycle': 'Handcycle',
    'Velomobile': 'Velomobile',
    'Swim': 'Swim',
    'Surfing': 'Surfing',
    'Stand Up Paddling (SUP)': 'StandUpPaddling',
    'Kayak': 'Kayaking',
    'Canoe': 'Canoeing',
    'Rowing': 'Rowing',
    'Windsurf': 'Windsurf',
    'Kitesurf': 'Kitesurf',
    'Sailing': 'Sailing',
    'Alpine Ski': 'AlpineSki',
    'Backcountry Ski': 'BackcountrySki',
    'Nordic Ski': 'NordicSki',
    'Snowboard': 'Snowboard',
    'Snowshoe': 'Snowshoe',
    'Ice Skate': 'IceSkate',
    'Tennis': 'Tennis',
    'Pickleball': 'Pickleball',
    'Padel': 'Padel',
    'Badminton': 'Badminton',
    'Squash': 'Squash',
    'Racquetball': 'Racquetball',
    'Table Tennis': 'TableTennis',
    'Football (Soccer)': 'Soccer',
    'Basketball': 'Basketball',
    'Volleyball': 'Volleyball',
    'Cricket': 'Cricket',
    'Workout (Catch-all generic category)': 'Workout',
    'Weight Training': 'WeightTraining',
    'Crossfit': 'Crossfit',
    'HIIT (High-Intensity Interval Training)': 'HIIT',
    'Yoga': 'Yoga',
    'Pilates': 'Pilates',
    'Dance': 'Dance',
    'Physical Therapy': 'PhysicalTherapy',
    'Stair Stepper': 'StairStepper',
    'Elliptical': 'Elliptical',
    'Rock Climbing': 'RockClimbing',
    'Skateboarding': 'Skateboard',
    'Inline Skate': 'InlineSkate',
    'Roller Ski': 'RollerSki',
    'Golf': 'Golf',
    'Virtual Ride': 'VirtualRide',
  };
  return map[name] ?? name;
}

function StravaConnectorDetail({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-md p-1 text-muted-foreground transition hover:text-ink"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-base font-semibold text-ink">Strava connector</h2>
      </div>

      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Connecting Strava auto-syncs your training activities straight into your Diary,
        so every run, ride, swim or session you record on Strava appears as a tile on
        the matching day without any manual entry. The platform recognises and imports
        every Strava sport type listed below.
      </p>

      <div className="space-y-6">
        {STRAVA_ACTIVITY_CATEGORIES.map((cat) => (
          <div key={cat.title}>
            <h3 className="text-sm font-semibold text-ink">{cat.title}</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              {cat.items.map((it) => {
                const color = colorForStravaSportType(displayNameToSportType(it));
                return (
                  <li key={it} className="flex items-center gap-2.5">
                    <span
                      className="inline-block h-4 w-4 shrink-0 rounded-[3px] border border-black/10"
                      style={{ background: color }}
                      aria-hidden
                    />
                    <span>{it}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
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

