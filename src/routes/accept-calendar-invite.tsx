import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { CLOUD_PAGE_BG } from "@/lib/cloud-landing-design";
import { CALENDAR_INVITE_STORAGE_KEY } from "@/components/calendar/CalendarInviteGate";

type SearchParams = { token?: string };

export const Route = createFileRoute("/accept-calendar-invite")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: AcceptCalendarInvitePage,
  head: () => ({ meta: [{ title: "Accept calendar invite · Bissibox" }] }),
});

function AcceptCalendarInvitePage() {
  const { user, authReady } = useAuth();
  const navigate = useNavigate();
  const { token } = Route.useSearch();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      void navigate({ to: "/", replace: true });
      return;
    }
    sessionStorage.setItem(CALENDAR_INVITE_STORAGE_KEY, token);
    if (!authReady) return;
    if (!user) {
      void navigate({ to: "/", search: { signin: "calendar" }, replace: true });
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc("accept_user_calendar_invite", {
        p_token: token,
      });
      if (cancelled) return;
      const payload = data as { ok?: boolean; error?: string } | null;
      if (rpcError || !payload?.ok) {
        setError(payload?.error || rpcError?.message || "Could not accept the invite");
        return;
      }
      sessionStorage.removeItem(CALENDAR_INVITE_STORAGE_KEY);
      window.dispatchEvent(new Event("bissibox-calendars-changed"));
      void navigate({ to: "/calendar", replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user, authReady, navigate]);

  return (
    <div className="grid min-h-full w-full place-items-center" style={{ backgroundColor: CLOUD_PAGE_BG }}>
      {error ? <p className="max-w-sm px-6 text-center text-sm text-[#1d1d1f]">{error}</p> : null}
    </div>
  );
}
