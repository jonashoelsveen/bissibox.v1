import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CreditCard, Users as UsersIcon, Image as ImageIcon, Calendar, X, Layers, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { ProfileShell, MediaGrid } from "@/components/ProfileShell";
import { VerificationDialog } from "@/components/VerificationDialog";
import { formatMoney } from "@/lib/format";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/t/$teamId")({
  component: TeamPage,
  head: () => ({ meta: [{ title: "Team · Raceline" }] }),
});

interface PublicTeam {
  id: string;
  name: string;
  description: string | null;
  description_long: string | null;
  country: string | null;
  cover_media_id: string | null;
  website: string | null;
  owner_id: string;
  active: boolean;
  entity_type: string;
}

interface Tier {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  group_assignment_mode: "volunteer" | "criteria";
  criteria_label: string;
  is_active: boolean;
  is_public: boolean;
}

interface GroupOpt {
  id: string;
  name: string;
}

interface PublicGroup {
  id: string;
  name: string;
  age_from: number | null;
  age_to: number | null;
  description: string | null;
  color: string | null;
}

interface ConfirmInfo {
  team_name: string;
  tier_name: string | null;
  mode: "volunteer" | "criteria";
  criteria_label: string;
  group_name: string | null;
  group_age_from: number | null;
  group_age_to: number | null;
  group_is_default: boolean;
  leader_name: string | null;
  leader_email: string | null;
  leader_phone: string | null;
  fallback_email: string | null;
  fallback_phone: string | null;
  birth_year: number | null;
  auto_created_default: boolean;
}

interface Member {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
}

interface EventRow {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
}

function TeamPage() {
  const { teamId } = Route.useParams();
  const { user } = useAuth();
  const [team, setTeam] = useState<PublicTeam | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<"memberships" | "groups" | "members" | "media" | "events">("memberships");
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [tiersLoaded, setTiersLoaded] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [media, setMedia] = useState<{ id: string; storage_path: string; media_type: string }[]>([]);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [followers, setFollowers] = useState(0);
  const [myMemberships, setMyMemberships] = useState<Set<string>>(new Set());
  const [groupOptions, setGroupOptions] = useState<GroupOpt[]>([]);
  const [pickerGroupId, setPickerGroupId] = useState<string>("");
  const [confirmInfo, setConfirmInfo] = useState<ConfirmInfo | null>(null);
  const [leaderInfoOpen, setLeaderInfoOpen] = useState(false);
  const [publicGroups, setPublicGroups] = useState<PublicGroup[]>([]);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name, description, description_long, country, cover_media_id, website, owner_id, active, entity_type")
        .eq("id", teamId)
        .maybeSingle();
      if (!data) {
        setNotFound(true);
        return;
      }
      const t = data as PublicTeam;
      setTeam(t);

      if (t.cover_media_id) {
        const { data: m } = await supabase
          .from("media_items")
          .select("storage_path")
          .eq("id", t.cover_media_id)
          .maybeSingle();
        if (m) setCoverPath(m.storage_path);
      }

      const { data: tierData } = await supabase
        .from("team_membership_tiers")
        .select("id, name, description, price, currency, group_assignment_mode, criteria_label, is_active, is_public")
        .eq("team_id", teamId)
        .order("sort_order");
      setTiers(((tierData ?? []) as unknown as Tier[]).map((t) => ({
        ...t,
        group_assignment_mode: (t.group_assignment_mode === "criteria" ? "criteria" : "volunteer"),
        criteria_label: t.criteria_label ?? "age",
        is_active: t.is_active ?? true,
        is_public: t.is_public ?? true,
      })));
      setTiersLoaded(true);

      const { data: groupData } = await supabase
        .from("team_groups")
        .select("id, name, age_from, age_to, description, color")
        .eq("team_id", teamId)
        .order("sort_order");
      const groups = (groupData ?? []) as PublicGroup[];
      setGroupOptions(groups.map((g) => ({ id: g.id, name: g.name || "Untitled group" })));
      setPublicGroups(groups);

      // Members joined with profiles (only active athletes show publicly)
      const { data: memberRows } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId)
        .eq("accepted", true);
      const ids = (memberRows ?? []).map((r) => r.user_id);
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", ids);
        setMembers(
          (profs ?? []).map((p) => ({
            user_id: p.id,
            first_name: p.first_name,
            last_name: p.last_name,
          })),
        );
      }

      // Events organized by team owner — fetch by owner_id from teams
      const { data: teamRow } = await supabase
        .from("teams")
        .select("owner_id")
        .eq("id", teamId)
        .maybeSingle();
      if (teamRow?.owner_id) {
        const { data: ev } = await supabase
          .from("events")
          .select("id, title, starts_at, location")
          .eq("owner_id", teamRow.owner_id)
          .eq("published", true)
          .order("starts_at", { ascending: true });
        setEvents((ev ?? []) as EventRow[]);
      }

      const { count } = await supabase
        .from("team_follows")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamId);
      setFollowers(count ?? 0);
    })();
  }, [teamId]);

  useEffect(() => {
    (async () => {
      // Team profile media = items belonging to THIS team, linked to the
      // team's "Profile" album. Fully isolated from any individual content.
      const { data: profileAlbum } = await supabase
        .from("media_albums")
        .select("id")
        .eq("team_id", teamId)
        .eq("name", "Profile")
        .maybeSingle();
      if (!profileAlbum) {
        setMedia([]);
        return;
      }
      const { data: links } = await supabase
        .from("media_item_albums")
        .select("media_item_id")
        .eq("album_id", profileAlbum.id);
      const ids = ((links as { media_item_id: string }[] | null) ?? []).map(
        (l) => l.media_item_id,
      );
      if (ids.length === 0) {
        setMedia([]);
        return;
      }
      const { data: m } = await supabase
        .from("media_items")
        .select("id, storage_path, media_type")
        .in("id", ids)
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(120);
      setMedia((m ?? []) as { id: string; storage_path: string; media_type: string }[]);
    })();
  }, [teamId]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("team_memberships")
        .select("tier_id")
        .eq("user_id", user.id)
        .eq("team_id", teamId);
      const set = new Set<string>();
      (data ?? []).forEach((r) => {
        if (r.tier_id) set.add(r.tier_id as string);
        else set.add("__default__");
      });
      setMyMemberships(set);
    })();
  }, [user, teamId]);

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [pendingTierId, setPendingTierId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTierId, setPickerTierId] = useState<string>("__default__");
  const nav = useNavigate();
  const visibleTiers = tiers.filter((tier) => tier.is_active && tier.is_public);
  const displayTiers = tiers.filter((tier) => visibleTiers.some((visibleTier) => visibleTier.id === tier.id) || myMemberships.has(tier.id));
  const canShowMembershipActions = tiersLoaded && visibleTiers.length > 0 && (!user || user.id !== team?.owner_id);
  const entityLabel = team?.entity_type === "company" ? "Company" : team?.entity_type === "cooperation" ? "Corporate" : "Team";

  const openPicker = () => {
    if (!canShowMembershipActions) return;
    if (!user) {
      nav({ to: "/auth", search: { redirect: window.location.pathname } as never });
      return;
    }
    setPickerTierId(visibleTiers[0]?.id ?? "__default__");
    setPickerGroupId(groupOptions[0]?.id ?? "");
    setPickerOpen(true);
  };

  const pickedTier = visibleTiers.find((t) => t.id === pickerTierId) ?? null;
  const pickerNeedsGroup = !!pickedTier && pickedTier.group_assignment_mode === "volunteer" && groupOptions.length > 0;

  const startJoin = (tierId: string, groupId?: string | null) => {
    if (!visibleTiers.some((tier) => tier.id === tierId)) return;
    if (!user) {
      nav({ to: "/auth", search: { redirect: window.location.pathname } as never });
      return;
    }
    setPendingTierId(tierId);
    (window as unknown as { __pendingGroupId?: string | null }).__pendingGroupId = groupId ?? null;
    setVerifyOpen(true);
  };

  const confirmPicker = () => {
    setPickerOpen(false);
    startJoin(pickerTierId, pickerNeedsGroup ? pickerGroupId : null);
  };

  const onVerified = (result?: Record<string, unknown>) => {
    if (pendingTierId) setMyMemberships((s) => new Set([...s, pendingTierId]));
    setVerifyOpen(false);
    setPendingTierId(null);
    // Build confirmation info from edge response
    const r = (result ?? {}) as {
      team?: { name: string; contact_email: string | null; contact_phone: string | null } | null;
      tier?: { name: string; mode: "volunteer" | "criteria"; criteria_label: string } | null;
      group?: {
        id: string; name: string; age_from: number | null; age_to: number | null;
        is_default: boolean; leader_name: string | null;
        leader_email: string | null; leader_phone: string | null;
      } | null;
      birth_year?: number | null;
      auto_created_default?: boolean;
      assignment_mode?: "volunteer" | "criteria";
      criteria_label?: string;
    };
    setConfirmInfo({
      team_name: r.team?.name ?? team?.name ?? "this team",
      tier_name: r.tier?.name ?? null,
      mode: r.assignment_mode ?? r.tier?.mode ?? "volunteer",
      criteria_label: r.criteria_label ?? r.tier?.criteria_label ?? "age",
      group_name: r.group?.name ?? null,
      group_age_from: r.group?.age_from ?? null,
      group_age_to: r.group?.age_to ?? null,
      group_is_default: !!r.group?.is_default,
      leader_name: r.group?.leader_name ?? null,
      leader_email: r.group?.leader_email ?? null,
      leader_phone: r.group?.leader_phone ?? null,
      fallback_email: r.team?.contact_email ?? null,
      fallback_phone: r.team?.contact_phone ?? null,
      birth_year: r.birth_year ?? null,
      auto_created_default: !!r.auto_created_default,
    });
  };

  if (notFound) {
    return (
      <div className="px-6 pt-20 text-center text-sm text-muted-foreground">Team not found.</div>
    );
  }
  if (!team) return null;

  if (team.active === false) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="mono mb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          {team.name}
        </div>
        <h1 className="text-xl text-ink">This profile is not active</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The owner has set this profile to inactive.
        </p>
      </div>
    );
  }

  const pendingTier = tiers.find((t) => t.id === pendingTierId);
  return (
    <>
    <ProfileShell
      coverPath={coverPath}
      fallbackInitial={team.name[0]?.toUpperCase() ?? "T"}
      eyebrow="Team"
      title={team.name}
      subtitle={
        <span>
          {followers.toLocaleString()} followers
          {team.country && <> · {team.country}</>}
        </span>
      }
      actions={
        canShowMembershipActions ? (
          <button
            onClick={openPicker}
            className="rounded-full bg-ink px-5 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            Become a member
          </button>
        ) : null
      }
      tabs={[
        { key: "memberships", label: "Memberships", icon: <CreditCard className="h-3.5 w-3.5" /> },
        { key: "members", label: "Members", icon: <UsersIcon className="h-3.5 w-3.5" /> },
        { key: "events", label: "Events", icon: <Calendar className="h-3.5 w-3.5" /> },
        { key: "media", label: "Media", icon: <ImageIcon className="h-3.5 w-3.5" /> },
      ]}
      activeTab={tab}
      onTabChange={(k) => setTab(k as typeof tab)}
      website={{
        url: team.website,
        canEdit: !!user && user.id === team.owner_id,
        onSave: async (url) => {
          const { error } = await supabase
            .from("teams")
            .update({ website: url })
            .eq("id", teamId);
          if (error) {
            toast.error(error.message);
          } else {
            setTeam({ ...team, website: url });
          }
        },
      }}
    >
      {tab === "memberships" && (
        <div id="team-membership-picker" className="space-y-2 scroll-mt-24">
          {displayTiers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline bg-card/40 px-6 py-12 text-center">
              <div className="text-sm text-muted-foreground">
                This {entityLabel} has no active memberships.
              </div>
            </div>
          ) : (
            displayTiers.map((tier) => {
              const joined = myMemberships.has(tier.id);
              return (
                <div
                  key={tier.id}
                  className="flex items-center justify-between rounded-xl border border-hairline bg-card px-5 py-4"
                >
                  <div>
                    <div className="text-sm font-medium text-ink">{tier.name}</div>
                    {tier.description && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{tier.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="num text-sm text-ink">
                      {formatMoney(tier.price, tier.currency)}
                    </span>
                    <button
                      onClick={() => {
                        if (!user) {
                          nav({ to: "/auth", search: { redirect: window.location.pathname } as never });
                          return;
                        }
                        // If this tier is volunteer mode and team has groups, force the picker so the user can choose a group.
                        if (tier.group_assignment_mode === "volunteer" && groupOptions.length > 0) {
                          setPickerTierId(tier.id);
                          setPickerGroupId(groupOptions[0]?.id ?? "");
                          setPickerOpen(true);
                          return;
                        }
                        startJoin(tier.id);
                      }}
                      disabled={joined}
                      className="rounded-full bg-ink px-4 py-1.5 text-xs text-background hover:opacity-90 disabled:opacity-50"
                    >
                      {joined ? "Joined" : "Join"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "members" && (
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {members.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-hairline bg-card/40 py-16 text-center text-sm text-muted-foreground">
              No public members.
            </div>
          ) : (
            members.map((m) => (
              <Link
                key={m.user_id}
                to="/u/$userId"
                params={{ userId: m.user_id }}
                search={{ as: "athlete" }}
                className="flex items-center gap-3 rounded-xl border border-hairline bg-card px-4 py-3 hover:bg-secondary"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs text-ink">
                  {(m.first_name?.[0] ?? "?").toUpperCase()}
                </span>
                <span className="text-sm text-ink">
                  {[m.first_name, m.last_name].filter(Boolean).join(" ") || "Unnamed"}
                </span>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === "events" && (
        <div className="space-y-2">
          {events.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline bg-card/40 py-16 text-center text-sm text-muted-foreground">
              No events.
            </div>
          ) : (
            events.map((e) => (
              <Link
                key={e.id}
                to="/events/$eventId"
                params={{ eventId: e.id }}
                className="flex items-center justify-between rounded-xl border border-hairline bg-card px-5 py-4 hover:bg-secondary"
              >
                <div>
                  <div className="text-sm font-medium text-ink">{e.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(e.starts_at).toLocaleDateString()}
                    {e.location && ` · ${e.location}`}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === "media" && <MediaGrid items={media} />}
    </ProfileShell>
    {pickerOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setPickerOpen(false)} />
        <div className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-hairline bg-card shadow-2xl">
          <header className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
            <div>
              <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Become a member</p>
              <h2 className="mt-0.5 text-lg text-ink">{team.name}</h2>
            </div>
            <button
              onClick={() => setPickerOpen(false)}
              aria-label="Close"
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="space-y-5 px-5 py-5">
            <div>
              <label className="mono mb-1.5 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Membership
              </label>
              <select
                value={pickerTierId}
                onChange={(e) => setPickerTierId(e.target.value)}
                className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              >
                {visibleTiers.length === 0 ? (
                  <option value="__default__">Member</option>
                ) : (
                  visibleTiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {formatMoney(t.price, t.currency)}
                    </option>
                  ))
                )}
              </select>
            </div>
            {pickerNeedsGroup && (
              <div>
                <label className="mono mb-1.5 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Group
                </label>
                <select
                  value={pickerGroupId}
                  onChange={(e) => setPickerGroupId(e.target.value)}
                  className="w-full rounded-md border border-hairline bg-background px-3 py-2 text-sm text-ink outline-none focus:border-primary"
                >
                  {groupOptions.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] text-muted-foreground">Choose the group you'd like to join.</p>
              </div>
            )}
            {pickedTier && pickedTier.group_assignment_mode === "criteria" && groupOptions.length > 0 && (
              <p className="text-[12px] text-muted-foreground">
                You'll be placed automatically based on <span className="text-ink">{pickedTier.criteria_label || "age"}</span>.
              </p>
            )}
          </div>
          <footer className="flex items-center justify-end gap-2 border-t border-hairline bg-background/60 px-5 py-3">
            <button
              onClick={() => setPickerOpen(false)}
              className="rounded-md border border-hairline bg-card px-4 py-1.5 text-sm text-ink transition hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              onClick={confirmPicker}
              disabled={myMemberships.has(pickerTierId) || (pickerNeedsGroup && !pickerGroupId)}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {myMemberships.has(pickerTierId) ? "Already joined" : "Continue"}
            </button>
          </footer>
        </div>
      </div>
    )}
    <VerificationDialog
      open={verifyOpen}
      onClose={() => setVerifyOpen(false)}
      onVerified={onVerified}
      title={`Join ${team.name}`}
      subtitle={pendingTier ? `${pendingTier.name} · ${formatMoney(pendingTier.price, pendingTier.currency)}` : undefined}
      targetKind="team_membership"
      targetId={teamId}
      targetMeta={{
        tier_id: pendingTierId && pendingTierId !== "__default__" ? pendingTierId : null,
        group_id: (typeof window !== "undefined" ? (window as unknown as { __pendingGroupId?: string | null }).__pendingGroupId ?? null : null),
      }}
    />
    {confirmInfo && (
      <ConfirmJoinedDialog
        info={confirmInfo}
        onClose={() => { setConfirmInfo(null); setLeaderInfoOpen(false); }}
        leaderInfoOpen={leaderInfoOpen}
        onToggleLeader={() => setLeaderInfoOpen((v) => !v)}
      />
    )}
    </>
  );
}

function ConfirmJoinedDialog({
  info,
  onClose,
  leaderInfoOpen,
  onToggleLeader,
}: {
  info: ConfirmInfo;
  onClose: () => void;
  leaderInfoOpen: boolean;
  onToggleLeader: () => void;
}) {
  const leaderName = info.leader_name?.trim() || info.team_name;
  const leaderEmail = info.leader_email?.trim() || info.fallback_email || null;
  const leaderPhone = info.leader_phone?.trim() || info.fallback_phone || null;

  const groupLabel = info.group_name ?? "your group";
  const criteriaWord = info.criteria_label || "age";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-hairline bg-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">You're in</p>
            <h2 className="mt-0.5 text-lg text-ink">{info.team_name}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="space-y-3 px-5 py-5 text-sm text-ink">
          {info.group_name ? (
            info.mode === "criteria" ? (
              <p>
                You successfully signed up and in group <span className="font-medium">"{groupLabel}"</span>.{" "}
                "{info.team_name}" has groups based on <span className="font-medium">{criteriaWord}</span>.{" "}
                {info.birth_year != null && (
                  <>Since you are born in <span className="num">{info.birth_year}</span>, you are in <span className="font-medium">"{groupLabel}"</span>. </>
                )}
                For more info, contact group administrator{" "}
                <button
                  onClick={onToggleLeader}
                  className="inline-flex items-center gap-1 rounded-md border border-hairline bg-background px-2 py-0.5 text-xs text-ink hover:bg-secondary"
                >
                  <UsersIcon className="h-3 w-3" />
                  <span className="font-medium">"{leaderName}"</span>
                </button>
                .
              </p>
            ) : (
              <p>
                You successfully signed up and in group <span className="font-medium">"{groupLabel}"</span>.{" "}
                For more info, contact group administrator{" "}
                <button
                  onClick={onToggleLeader}
                  className="inline-flex items-center gap-1 rounded-md border border-hairline bg-background px-2 py-0.5 text-xs text-ink hover:bg-secondary"
                >
                  <UsersIcon className="h-3 w-3" />
                  <span className="font-medium">"{leaderName}"</span>
                </button>
                .
              </p>
            )
          ) : (
            <p>You successfully signed up to "{info.team_name}".</p>
          )}
          {info.auto_created_default && info.group_is_default && (
            <p className="text-xs text-muted-foreground">
              Your age didn't fit any defined group, so you were placed in the auto-created Default Group.
            </p>
          )}
          {leaderInfoOpen && info.group_name && (
            <div className="rounded-lg border border-hairline bg-background/60 px-4 py-3 text-xs text-muted-foreground">
              <div className="text-ink font-medium">{leaderName}</div>
              {leaderEmail && <div className="mt-1">Email: <a className="text-primary hover:underline" href={`mailto:${leaderEmail}`}>{leaderEmail}</a></div>}
              {leaderPhone && <div>Phone: <a className="text-primary hover:underline" href={`tel:${leaderPhone}`}>{leaderPhone}</a></div>}
              {!leaderEmail && !leaderPhone && <div className="mt-1">No contact details on file.</div>}
            </div>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-hairline bg-background/60 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md bg-primary px-5 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            OK
          </button>
        </footer>
      </div>
    </div>
  );
}
