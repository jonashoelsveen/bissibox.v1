import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type SearchParams = { token?: string };

export const Route = createFileRoute("/accept-coach-invite")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: AcceptCoachInvitePage,
  head: () => ({ meta: [{ title: "Accept coach invitation · Bissibox" }] }),
});

function AcceptCoachInvitePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { token } = Route.useSearch();
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState<string>("");
  const [ownerName, setOwnerName] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Missing invitation token.");
      return;
    }
    if (loading) return;
    if (!user) {
      const redirect = `/accept-coach-invite?token=${encodeURIComponent(token)}`;
      navigate({ to: "/auth", search: { redirect } });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("accept-coach-invite", {
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
        setOwnerName(data.owner_name ?? "");
        setState("success");
        setTimeout(() => {
          navigate({ to: "/clients" });
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
  }, [token, user, loading, navigate]);

  return (
    <div className="mx-auto max-w-md px-6">
      <div className="pt-6">
        <p className="mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Bissibox</p>
        <h1 className="mt-3 text-3xl text-ink">
          {state === "loading" && "Accepting invitation…"}
          {state === "success" && "You're connected."}
          {state === "error" && "Invitation problem"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {state === "loading" && "One moment while we connect you with your new client."}
          {state === "success" &&
            `${ownerName} is now in your Clients list. Taking you there…`}
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
