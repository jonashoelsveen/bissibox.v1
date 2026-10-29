import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
export const CALENDAR_INVITE_STORAGE_KEY = "calendar_invite_token";

/** Accepts a stored calendar invite once a cookie session exists. */
export function CalendarInviteGate() {
  const { user, authReady } = useAuth();
  const navigate = useNavigate();
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!authReady || !user) return;
    const token = sessionStorage.getItem(CALENDAR_INVITE_STORAGE_KEY);
    if (!token || started.current === token) return;
    started.current = token;
    void (async () => {
      const { data } = await supabase.rpc("accept_user_calendar_invite", { p_token: token });
      const payload = data as { ok?: boolean } | null;
      if (payload?.ok) {
        sessionStorage.removeItem(CALENDAR_INVITE_STORAGE_KEY);
        window.dispatchEvent(new Event("bissibox-calendars-changed"));
        void navigate({ to: "/calendar" });
      }
    })();
  }, [authReady, user, navigate]);

  return null;
}
