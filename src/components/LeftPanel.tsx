/**
 * Shared full-height left panel + portaled open/close toggle.
 *
 * The panel:
 *   - sits fixed at the left edge, covering the dark top bar
 *   - sets `--topbar-left-offset` so the global top bar + main shift right
 *   - renders arbitrary `children` as the panel body
 *   - always renders the profile footer (initial badge + email) at the
 *     bottom — the one element every left panel shares.
 *
 * The toggle icon is portaled to `document.body` so it stays visible on
 * top of the dark top bar when the panel is closed.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PanelLeft } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useUserGroups, type UserGroup } from "@/hooks/useUserGroups";
import { useProfileDisplayName } from "@/hooks/useProfileDisplayName";
import { ProfileSwitcherMenu } from "@/components/ProfileSwitcherMenu";
import { isEntityFeatureEnabled } from "@/lib/features";

const WIDTH = 256;

export function LeftPanel({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  children?: ReactNode;
}) {
  const { user } = useAuth();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--topbar-left-offset", open ? `${WIDTH}px` : "0px");
    return () => {
      root.style.setProperty("--topbar-left-offset", "0px");
    };
  }, [open]);

  return (
    <>
      <aside
        aria-hidden={!open}
        className="fixed left-0 top-0 bottom-0 z-[80] overflow-hidden"
        style={{
          width: WIDTH,
          display: open ? "block" : "none",
        }}
      >

        <div className="mac-panel relative flex h-full flex-col overflow-hidden border-r border-hairline">
          <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
          {user && (
            <div className="flex-none border-t border-hairline">
              <ProfileFooter user={user} />
            </div>
          )}
        </div>
      </aside>

      {typeof document !== "undefined" &&
        createPortal(
          <button
            type="button"
            onClick={() => onOpenChange(!open)}
            aria-label={open ? "Hide panel" : "Show panel"}
            title={open ? "Hide panel" : "Show panel"}
            className="fixed left-3 top-[6px] z-[200] grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-ink"
          >
            <PanelLeft className="h-4 w-4" />
          </button>,
          document.body,
        )}
    </>
  );
}

/* ---------- Profile footer: initial circle + email ---------- */

function ProfileFooter({
  user,
}: {
  user: { email?: string | null; user_metadata?: Record<string, unknown> };
}) {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const first = typeof meta.first_name === "string" ? meta.first_name : "";
  const last = typeof meta.last_name === "string" ? meta.last_name : "";
  const personalInitial =
    (first.trim()[0] || last.trim()[0] || user.email?.trim()[0] || "?").toUpperCase();
  const { displayName, personalName } = useProfileDisplayName();

  const { signOut, activeEntityId, setActiveEntity } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const { groups, refresh } = useUserGroups();

  const activeGroup: UserGroup | null = activeEntityId
    ? groups.find((g) => g.id === activeEntityId) ?? null
    : null;
  const badgeInitial = activeGroup
    ? (activeGroup.name.trim()[0] || "?").toUpperCase()
    : personalInitial;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    void navigate({ to: "/" });
  };

  const handleSelectPersonal = () => {
    setOpen(false);
    setActiveEntity(null);
  };

  const handleSelectGroup = (id: string) => {
    setOpen(false);
    setActiveEntity(id);
  };

  /** Closed profile footer — Bucket A: email until display_name; entity name only with switcher. */
  const emailLabel =
    isEntityFeatureEnabled("entityProfileSwitcher") && activeGroup
      ? activeGroup.name
      : displayName.trim() || user.email || personalName;

  return (
    <div className="relative px-3 py-2.5" ref={ref}>
      <button
        type="button"
        aria-label="Your profile"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-secondary/60"
      >
        <span className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full bg-ink/10 text-[12px] font-semibold text-ink">
          {badgeInitial}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
          title={emailLabel ?? undefined}
        >
          {emailLabel}
        </span>
      </button>
      {open && (
        <ProfileSwitcherMenu
          personalName={personalName}
          personalInitial={personalInitial}
          groups={groups}
          activeEntityId={activeEntityId}
          onSelectPersonal={handleSelectPersonal}
          onSelectEntity={handleSelectGroup}
          onClose={() => setOpen(false)}
          onSignOut={() => void handleSignOut()}
          isLoggedIn={!!user}
          className="absolute bottom-full left-2 right-2 z-50 mb-1.5 origin-bottom-left"
        />
      )}
    </div>
  );
}
