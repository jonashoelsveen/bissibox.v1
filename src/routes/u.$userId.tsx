import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, User, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";

const search = z.object({
  as: fallback(z.enum(["athlete", "photographer"]), "athlete").default("athlete"),
});

export const Route = createFileRoute("/u/$userId")({
  validateSearch: zodValidator(search),
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
}

function UserProfilePage() {
  const { userId } = Route.useParams();
  const { as } = Route.useSearch();
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select(
          "id, first_name, last_name, club, team, country, athlete_active, is_photographer, photographer_active, photographer_bio",
        )
        .eq("id", userId)
        .maybeSingle();
      if (!data) setNotFound(true);
      else setProfile(data as PublicProfile);
    })();
  }, [userId]);

  const name =
    profile && ([profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Unnamed");
  const showPhotographer =
    as === "photographer" && profile?.is_photographer && profile?.photographer_active;
  const showAthlete = !showPhotographer && profile?.athlete_active;

  return (
    <div className="px-4 md:px-6">
      <div className="mx-auto max-w-2xl pt-6 pr-14">
        <button
          onClick={() => router.history.back()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-card text-ink hover:bg-secondary"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        {notFound && (
          <div className="mt-10 rounded-2xl border border-dashed border-hairline bg-card/40 py-14 text-center text-sm text-muted-foreground">
            Profile not found or not public.
          </div>
        )}

        {profile && (
          <div className="mt-6 rounded-2xl border border-hairline bg-card p-6 md:p-8">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                {showPhotographer ? (
                  <Camera className="h-6 w-6 text-ink" />
                ) : (
                  <User className="h-6 w-6 text-ink" />
                )}
              </span>
              <div>
                <h1 className="text-2xl font-bold text-ink">{name}</h1>
                <div className="text-xs text-muted-foreground">
                  {showPhotographer ? "Photographer" : "Athlete"}
                </div>
              </div>
            </div>

            {profile.is_photographer && profile.photographer_active && (
              <div className="mt-4 flex gap-2">
                <Link
                  to="/u/$userId"
                  params={{ userId }}
                  search={{ as: "athlete" }}
                  className={`rounded-full px-3 py-1.5 text-xs ${
                    !showPhotographer
                      ? "bg-primary text-primary-foreground"
                      : "border border-hairline bg-card text-muted-foreground hover:text-ink"
                  }`}
                >
                  Athlete
                </Link>
                <Link
                  to="/u/$userId"
                  params={{ userId }}
                  search={{ as: "photographer" }}
                  className={`rounded-full px-3 py-1.5 text-xs ${
                    showPhotographer
                      ? "bg-primary text-primary-foreground"
                      : "border border-hairline bg-card text-muted-foreground hover:text-ink"
                  }`}
                >
                  Photographer
                </Link>
              </div>
            )}

            <div className="mt-6 grid gap-3 text-sm">
              {showAthlete && (
                <>
                  <Row label="Club" value={profile.club} />
                  <Row label="Team" value={profile.team} />
                  <Row label="Country" value={profile.country} />
                </>
              )}
              {showPhotographer && (
                <>
                  <Row label="Country" value={profile.country} />
                  {profile.photographer_bio && (
                    <div>
                      <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        Bio
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-ink">{profile.photographer_bio}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between border-b border-hairline pb-2">
      <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}
