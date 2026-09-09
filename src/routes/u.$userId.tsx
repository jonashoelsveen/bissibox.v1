import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trophy, Image as ImageIcon, Camera, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileShell, MediaGrid } from "@/components/ProfileShell";
import { FollowButton } from "@/components/FollowButton";
import { useAuth } from "@/lib/auth";
import { z } from "zod";
import { useProfileVisibility } from "@/lib/library-settings";

const search = z.object({
  as: z.enum(["athlete", "photographer"]).default("athlete").catch("athlete"),
});

export const Route = createFileRoute("/u/$userId")({
  validateSearch: search,
  component: UserProfilePage,
  head: () => ({ meta: [{ title: "Profile · Raceline" }] }),
});

interface PublicProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  club: string | null;
  team: string | null;
  country: string | null;
  athlete_active: boolean;
  is_photographer: boolean;
  photographer_active: boolean;
  photographer_bio: string | null;
  athlete_cover_media_id: string | null;
  photographer_cover_media_id: string | null;
  website: string | null;
}

interface PB {
  id: string;
  discipline: string;
  performance: string;
  achieved_on: string | null;
  venue: string | null;
  competition: string | null;
  team: string | null;
}

interface MediaItem {
  id: string;
  storage_path: string;
  media_type: string;
}

function UserProfilePage() {
  const { userId } = Route.useParams();
  const { as } = Route.useSearch();
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<"bests" | "media">(as === "photographer" ? "media" : "bests");
  const [pbs, setPbs] = useState<PB[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [followers, setFollowers] = useState(0);

  const showPhotographer = as === "photographer";

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select(
          "id, first_name, last_name, club, team, country, athlete_active, is_photographer, photographer_active, photographer_bio, athlete_cover_media_id, photographer_cover_media_id, website",
        )
        .eq("id", userId)
        .maybeSingle();
      if (!data) {
        setNotFound(true);
        return;
      }
      const p = data as PublicProfile;
      setProfile(p);

      const coverId = showPhotographer ? p.photographer_cover_media_id : p.athlete_cover_media_id;
      if (coverId) {
        const { data: m } = await supabase
          .from("media_items")
          .select("storage_path")
          .eq("id", coverId)
          .maybeSingle();
        if (m) setCoverPath(m.storage_path);
      }

      const { data: pbData } = await supabase
        .from("personal_bests")
        .select("id, discipline, performance, achieved_on, venue, competition, team")
        .eq("user_id", userId)
        .order("achieved_on", { ascending: false });
      setPbs((pbData ?? []) as PB[]);

      // Public profile mirrors the individual "Profile" album exactly —
      // same single source of truth as teams. Scope to the individual
      // workspace (team_id IS NULL) so team content never leaks here.
      const { data: profileAlbum } = await supabase
        .from("media_albums")
        .select("id")
        .eq("user_id", userId)
        .is("team_id", null)
        .eq("name", "Profile")
        .maybeSingle();
      if (profileAlbum) {
        const { data: links } = await supabase
          .from("media_item_albums")
          .select("media_item_id")
          .eq("album_id", profileAlbum.id);
        const ids = ((links as { media_item_id: string }[] | null) ?? []).map(
          (l) => l.media_item_id,
        );
        if (ids.length > 0) {
          const { data: mediaData } = await supabase
            .from("media_items")
            .select("id, storage_path, media_type")
            .in("id", ids)
            .is("team_id", null)
            .order("created_at", { ascending: false })
            .limit(120);
          setMedia((mediaData ?? []) as MediaItem[]);
        } else {
          setMedia([]);
        }
      } else {
        setMedia([]);
      }

      const { count } = await supabase
        .from("user_follows")
        .select("id", { count: "exact", head: true })
        .eq("target_user_id", userId)
        .eq("target_role", showPhotographer ? "photographer" : "athlete");
      setFollowers(count ?? 0);
    })();
  }, [userId, showPhotographer]);

  if (notFound) {
    return (
      <div className="px-6 pt-20 text-center text-sm text-muted-foreground">
        Profile not found or not public.
      </div>
    );
  }
  if (!profile) return null;

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Unnamed";

  const [visibility] = useProfileVisibility(`user:${userId}`);
  const baseTabs = showPhotographer
    ? [{ key: "media", label: "Media", icon: <ImageIcon className="h-3.5 w-3.5" /> }]
    : [
        { key: "bests", label: "Personal bests", icon: <Trophy className="h-3.5 w-3.5" /> },
        { key: "media", label: "Media", icon: <ImageIcon className="h-3.5 w-3.5" /> },
      ];
  const tabs = baseTabs.filter((t) => (t.key === "media" ? visibility.Media !== false : true));

  return (
    <ProfileShell
      coverPath={coverPath}
      fallbackInitial={(profile.first_name?.[0] ?? "U").toUpperCase()}
      eyebrow={showPhotographer ? "Photographer" : "Athlete"}
      title={name}
      subtitle={
        <span>
          {followers.toLocaleString()} followers
          {!showPhotographer && profile.team && <> · {profile.team}</>}
          {!showPhotographer && profile.country && <> · {profile.country}</>}
        </span>
      }
      actions={
        <>
          <FollowButton
            target={{ kind: "user", userId, role: showPhotographer ? "photographer" : "athlete" }}
          />
          {profile.is_photographer && profile.photographer_active && (
            <div className="flex gap-2">
              <Link
                to="/u/$userId"
                params={{ userId }}
                search={{ as: "athlete" }}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs ${
                  !showPhotographer
                    ? "bg-secondary text-ink"
                    : "border border-hairline text-muted-foreground hover:text-ink"
                }`}
              >
                <UserIcon className="h-3 w-3" />
                Athlete
              </Link>
              <Link
                to="/u/$userId"
                params={{ userId }}
                search={{ as: "photographer" }}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs ${
                  showPhotographer
                    ? "bg-secondary text-ink"
                    : "border border-hairline text-muted-foreground hover:text-ink"
                }`}
              >
                <Camera className="h-3 w-3" />
                Photographer
              </Link>
            </div>
          )}
        </>
      }
      tabs={tabs}
      activeTab={tab}
      onTabChange={(k) => setTab(k as "bests" | "media")}
      website={{
        url: profile.website,
        canEdit: !!user && user.id === userId,
        onSave: async (url) => {
          const { error } = await supabase
            .from("profiles")
            .update({ website: url })
            .eq("id", userId);
          if (!error) setProfile({ ...profile, website: url });
        },
      }}
    >
      {tab === "bests" && !showPhotographer && (
        <div className="rounded-2xl border border-hairline bg-card overflow-hidden">
          {pbs.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No personal bests yet. Results will appear here as they are imported from timing partners.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-normal">Discipline</th>
                  <th className="px-4 py-3 font-normal">Performance</th>
                  <th className="px-4 py-3 font-normal">Date</th>
                  <th className="px-4 py-3 font-normal">Competition & Venue</th>
                  <th className="px-4 py-3 font-normal">Team</th>
                </tr>
              </thead>
              <tbody>
                {pbs.map((pb) => (
                  <tr key={pb.id} className="border-t border-hairline">
                    <td className="px-4 py-3 text-ink">{pb.discipline}</td>
                    <td className="px-4 py-3 num text-ink">{pb.performance}</td>
                    <td className="px-4 py-3 num text-muted-foreground">
                      {pb.achieved_on ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {[pb.competition, pb.venue].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{pb.team ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "media" && <MediaGrid items={media} />}
    </ProfileShell>
  );
}
