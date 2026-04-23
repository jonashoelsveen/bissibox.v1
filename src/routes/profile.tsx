import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/profile")({
  component: ProfileRedirect,
  head: () => ({ meta: [{ title: "Profile · Raceline" }] }),
});

function ProfileRedirect() {
  const { user, mode, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }

    const isTeam = mode === "team" || mode === "organizer";
    (async () => {
      if (isTeam) {
        const { data: team } = await supabase
          .from("teams")
          .select("id")
          .eq("owner_id", user.id)
          .maybeSingle();
        if (team) {
          void navigate({ to: "/t/$teamId", params: { teamId: team.id }, replace: true });
        } else {
          // No team yet — fall back to personal profile
          void navigate({ to: "/u/$userId", params: { userId: user.id }, replace: true });
        }
      } else {
        void navigate({ to: "/u/$userId", params: { userId: user.id }, replace: true });
      }
    })().catch((e: unknown) => setError((e as Error).message));
  }, [user, mode, loading, navigate]);

  return (
    <div className="px-6 pt-20 text-center text-sm text-muted-foreground">
      {error ?? "Opening your profile…"}
    </div>
  );
}
