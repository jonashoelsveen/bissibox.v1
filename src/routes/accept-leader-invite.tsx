import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type SearchParams = { token?: string };

export const Route = createFileRoute("/accept-leader-invite")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: AcceptLeaderInvitePage,
  head: () => ({ meta: [{ title: "Accept invitation · Raceline" }] }),
});

function AcceptLeaderInvitePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { token } = Route.useSearch();
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState<string>("");
  const [teamName, setTeamName] = useState<string>("");
  const [groupName, setGroupName] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Missing invitation token.");
      return;
    }
    if (user === undefined) return; // auth still loading
    if (!user) {
      const redirect = `/accept-leader-invite?token=${encodeURIComponent(token)}`;
      navigate({ to: "/auth", search: { redirect } });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("accept-leader-invite", {
          body: { token },
        });
        if (cancelled) return;
        if (error) {
          setState("error");
          setMessage(error.message ?? "Could not accept invitation.");
          return;
        }
        if (!data?.ok) {
          setState("error");
          setMessage(data?.error ?? "Could not accept invitation.");
          return;
        }
        setTeamName(data.team_name ?? "");
        setGroupName(data.group_name ?? "");
        setState("success");
        const teamId = data.team_id as string;
        setTimeout(() => {
          navigate({ to: "/t/$teamId", params: { teamId } });
        }, 2000);
      } catch (e) {
        if (cancelled) return;
        setState("error");
        setMessage((e as Error).message ?? "Unexpected error.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user, navigate]);

  return (
    <div className="mx-auto max-w-md px-6">
      <div className="pt-6">
        <p className="mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Raceline</p>
        <h1 className="mt-3 text-3xl text-ink">
          {state === "loading" && "Accepting invitation…"}
          {state === "success" && "You're in."}
          {state === "error" && "Invitation problem"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {state === "loading" && "One moment while we set things up."}
          {state === "success" &&
            `You're now a group leader for ${teamName}${groupName ? ` · ${groupName}` : ""}.`}
          {state === "error" && message}
        </p>
      </div>

      <Link
        to="/"
        className="mt-10 block text-center mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-ink"
      >
        ← back to home
      </Link>
    </div>
  );
}
