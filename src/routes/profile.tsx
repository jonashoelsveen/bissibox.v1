import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/profile")({
  component: ProfileRedirect,
  head: () => ({ meta: [{ title: "Profile · Raceline" }] }),
});

function ProfileRedirect() {
  const { user, activeEntityId, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    try {
      if (activeEntityId) {
        void navigate({ to: "/t/$teamId", params: { teamId: activeEntityId }, replace: true });
      } else {
        void navigate({ to: "/u/$userId", params: { userId: user.id }, replace: true });
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }, [user, activeEntityId, loading, navigate]);

  return (
    <div className="px-6 pt-20 text-center text-sm text-muted-foreground">
      {error ?? "Opening your profile…"}
    </div>
  );
}
