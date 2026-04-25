import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CreditCard, Users as UsersIcon, Image as ImageIcon, Calendar } from "lucide-react";
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
}

interface Tier {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
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
  const [tab, setTab] = useState<"memberships" | "members" | "media" | "events">("memberships");
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [media, setMedia] = useState<{ id: string; storage_path: string; media_type: string }[]>([]);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [followers, setFollowers] = useState(0);
  const [myMemberships, setMyMemberships] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name, description, description_long, country, cover_media_id, website, owner_id")
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
        .select("*")
        .eq("team_id", teamId)
        .order("sort_order");
      setTiers((tierData ?? []) as Tier[]);

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
      setMyMemberships(new Set((data ?? []).map((r) => r.tier_id).filter(Boolean) as string[]));
    })();
  }, [user, teamId]);

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [pendingTierId, setPendingTierId] = useState<string | null>(null);
  const nav = useNavigate();

  const startJoin = (tierId: string) => {
    if (!user) {
      nav({ to: "/auth", search: { redirect: window.location.pathname } as never });
      return;
    }
    setPendingTierId(tierId);
    setVerifyOpen(true);
  };

  const onVerified = () => {
    if (pendingTierId) setMyMemberships((s) => new Set([...s, pendingTierId]));
    setVerifyOpen(false);
    setPendingTierId(null);
    toast.success("Membership requested");
  };

  if (notFound) {
    return (
      <div className="px-6 pt-20 text-center text-sm text-muted-foreground">Team not found.</div>
    );
  }
  if (!team) return null;

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
        <button
          onClick={() => setTab("memberships")}
          className="rounded-full bg-ink px-5 py-1.5 text-xs font-medium text-background hover:opacity-90"
        >
          Become a member
        </button>
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
        <div className="space-y-2">
          {tiers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-hairline bg-card/40 px-6 py-12 text-center">
              <div className="text-sm text-muted-foreground">
                This team hasn't set up membership tiers yet.
              </div>
              <button
                onClick={() => startJoin("__default__")}
                disabled={myMemberships.has("__default__")}
                className="mt-4 rounded-full bg-ink px-5 py-1.5 text-xs text-background hover:opacity-90 disabled:opacity-50"
              >
                {myMemberships.has("__default__") ? "Joined" : "Join as member"}
              </button>
            </div>
          ) : (
            tiers.map((tier) => {
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
                      onClick={() => startJoin(tier.id)}
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
    <VerificationDialog
      open={verifyOpen}
      onClose={() => setVerifyOpen(false)}
      onVerified={onVerified}
      title={`Join ${team.name}`}
      subtitle={pendingTier ? `${pendingTier.name} · ${formatMoney(pendingTier.price, pendingTier.currency)}` : undefined}
      targetKind="team_membership"
      targetId={teamId}
      targetMeta={{ tier_id: pendingTierId }}
    />
    </>
  );
}
