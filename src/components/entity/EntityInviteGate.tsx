import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useAuth } from "@/lib/auth";
import { isEntityFeatureEnabled } from "@/lib/features";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const ENTITY_INVITE_STORAGE_KEY = "entity_invite_token";

type EntityInvitePeek = {
  ok?: boolean;
  team_name?: string;
  role?: "admin" | "member";
  group_names?: string[];
  invite_email?: string;
  status?: string;
  already_active?: boolean;
  error?: string;
};

/**
 * After sign-in, shows an Apple-style modal when a pending entity invite token
 * is present in the URL (?invite=) or session storage (from /accept-entity-invite).
 */
export function EntityInviteGate() {
  const { user, authReady } = useAuth();
  const search = useSearch({ strict: false }) as { invite?: string };
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [peek, setPeek] = useState<EntityInvitePeek | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const peekedRef = useRef<string | null>(null);

  useEffect(() => {
    /** Invite token persist — Bucket A: currently live, hidden this round. */
    if (!isEntityFeatureEnabled("entityInviteFlow")) return;
    if (search.invite) {
      sessionStorage.setItem(ENTITY_INVITE_STORAGE_KEY, search.invite);
    }
  }, [search.invite]);

  useEffect(() => {
    if (!authReady || !user) return;
    /** Entity invite modal — Bucket A: currently live, hidden this round. */
    if (!isEntityFeatureEnabled("entityInviteFlow")) return;

    const resolved = search.invite || sessionStorage.getItem(ENTITY_INVITE_STORAGE_KEY);
    if (!resolved || peekedRef.current === resolved) return;

    let cancelled = false;
    void (async () => {
      const { data, error: fnError } = await supabase.functions.invoke("peek-entity-invite", {
        body: { token: resolved },
      });
      if (cancelled) return;

      const payload = data as EntityInvitePeek | null;
      if (fnError || !payload?.ok) {
        sessionStorage.removeItem(ENTITY_INVITE_STORAGE_KEY);
        clearInviteFromUrl(navigate, search.invite);
        return;
      }

      peekedRef.current = resolved;
      setToken(resolved);
      setPeek(payload);
      setOpen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, user, search.invite, navigate]);

  const dismiss = () => {
    setOpen(false);
    setError(null);
    sessionStorage.removeItem(ENTITY_INVITE_STORAGE_KEY);
    clearInviteFromUrl(navigate, search.invite);
  };

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setError(null);

    const { data, error: fnError } = await supabase.functions.invoke("accept-entity-invite", {
      body: { token },
    });

    setAccepting(false);
    const payload = data as { ok?: boolean; error?: string; team_name?: string } | null;

    if (fnError || !payload?.ok) {
      setError(payload?.error ?? fnError?.message ?? "Could not accept invitation.");
      return;
    }

    sessionStorage.removeItem(ENTITY_INVITE_STORAGE_KEY);
    clearInviteFromUrl(navigate, search.invite);
    setOpen(false);
  };

  if (!peek) return null;

  const roleLabel = peek.role === "admin" ? "administrator" : "member";
  const groups = peek.group_names ?? [];
  const groupLine =
    groups.length > 0
      ? `You will be added to ${groups.join(", ")}.`
      : "You will be added to the entity without a group assignment.";

  const title = peek.already_active
    ? "Already joined"
    : "Accept invitation?";

  const message = peek.already_active
    ? `You are already an active ${roleLabel} of ${peek.team_name ?? "this entity"}.`
    : `${peek.team_name ?? "A team"} invited you as ${roleLabel === "administrator" ? "an" : "a"} ${roleLabel}. ${groupLine}`;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && dismiss()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/25 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[100] w-[320px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[10px] bg-[#ECECEC] shadow-[0_12px_40px_rgba(0,0,0,0.28)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <div className="px-5 pb-4 pt-5 text-center">
            <DialogPrimitive.Title className="font-sans text-sm font-medium leading-snug text-ink">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-[11px] leading-relaxed text-[#3C3C43]/80">
              {message}
            </DialogPrimitive.Description>
            {error && (
              <p className="mt-2 text-[11px] leading-relaxed text-[#FF3B30]">{error}</p>
            )}
          </div>
          <div
            className={cn(
              "grid border-t border-black/10 bg-[#F5F5F7]/90",
              peek.already_active ? "grid-cols-1" : "grid-cols-2",
            )}
          >
            {!peek.already_active && (
              <button
                type="button"
                onClick={dismiss}
                disabled={accepting}
                className="h-10 border-r border-black/10 text-[13px] font-normal text-ink transition-colors hover:bg-black/[0.04] disabled:opacity-50"
              >
                Not now
              </button>
            )}
            <button
              type="button"
              onClick={peek.already_active ? dismiss : handleAccept}
              disabled={accepting}
              className={cn(
                "h-10 text-[13px] font-semibold text-[#007AFF] transition-colors hover:bg-black/[0.04] disabled:opacity-50",
                peek.already_active && "border-t border-black/10",
              )}
            >
              {accepting ? "Accepting…" : peek.already_active ? "OK" : "Accept"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function clearInviteFromUrl(
  navigate: ReturnType<typeof useNavigate>,
  invite?: string,
) {
  if (!invite) return;
  void navigate({ to: "/", search: {}, replace: true });
}
