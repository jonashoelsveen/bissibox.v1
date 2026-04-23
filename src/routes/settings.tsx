import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Settings · Raceline" }] }),
});

function SettingsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  return (
    <div className="px-4 md:px-6">
      <div className="mx-auto max-w-3xl pt-10">
        <p className="mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Settings</p>
        <h1 className="mt-2 text-3xl text-ink md:text-4xl">Preferences</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Settings will be expanded soon. For now, manage your profile from{" "}
          <Link to="/profile" className="text-ink underline">
            Profile
          </Link>
          .
        </p>

        <section className="mt-8 rounded-2xl border border-hairline bg-card p-8 text-sm text-muted-foreground">
          Coming soon: notifications, privacy, connected accounts, language.
        </section>
      </div>
    </div>
  );
}
