import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/t/$teamId")({
  component: TeamPage,
  head: () => ({ meta: [{ title: "Team · Raceline" }] }),
});

interface PublicTeam {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  country: string | null;
  contact_email: string | null;
}

function TeamPage() {
  const { teamId } = Route.useParams();
  const router = useRouter();
  const [team, setTeam] = useState<PublicTeam | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name, description, website, country, contact_email")
        .eq("id", teamId)
        .maybeSingle();
      if (!data) setNotFound(true);
      else setTeam(data as PublicTeam);
    })();
  }, [teamId]);

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
            Team not found.
          </div>
        )}

        {team && (
          <div className="mt-6 rounded-2xl border border-hairline bg-card p-6 md:p-8">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                <Users className="h-6 w-6 text-ink" />
              </span>
              <div>
                <h1 className="text-2xl font-bold text-ink">{team.name}</h1>
                <div className="text-xs text-muted-foreground">Team</div>
              </div>
            </div>
            {team.description && (
              <p className="mt-6 whitespace-pre-wrap text-sm text-ink">{team.description}</p>
            )}
            <div className="mt-6 grid gap-3 text-sm">
              {team.country && <Row label="Country" value={team.country} />}
              {team.website && <Row label="Website" value={team.website} />}
              {team.contact_email && <Row label="Contact" value={team.contact_email} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-hairline pb-2">
      <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}
