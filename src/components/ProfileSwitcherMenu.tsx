/**
 * Shared profile picker used by the left-panel footer and the top-bar
 * initial badge. Account opens first; then the individual profile,
 * entity profiles, a hairline, and Log out.
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, UserRound } from "lucide-react";
import { OrganizationIcon } from "@/components/OrganizationIcon";
import type { UserGroup } from "@/hooks/useUserGroups";
import { getAccountUrl, openAccountSurfaceInNewTab } from "@/lib/app-surface";
import { isEntityFeatureEnabled } from "@/lib/features";
import { ACTIVE_STATUS_COLOR } from "@/lib/cloud-landing-design";
import {
  SESSION_SIDE_MENU_SHELL_CLASS,
  SESSION_SIDE_MENU_SHELL_STYLE,
} from "@/components/calendar/sessionPanelDockUtils";

const LOG_OUT_COLOR = "#FF3B30";

const ROW =
  "flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-white/90 transition-colors hover:bg-white/[0.08]";

const FADE_MASK =
  "[mask-image:linear-gradient(to_right,#000_calc(100%-1.25rem),transparent)] [-webkit-mask-image:linear-gradient(to_right,#000_calc(100%-1.25rem),transparent)]";

export function FadeName({ children, className }: { children: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  return (
    <span
      ref={ref}
      className={[
        "min-w-0 flex-1 overflow-hidden whitespace-nowrap",
        overflows ? FADE_MASK : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

export function ProfileSwitcherMenu({
  personalName,
  personalInitial,
  groups,
  activeEntityId,
  onSelectPersonal,
  onSelectEntity,
  onClose,
  onSignOut,
  isLoggedIn,
  className,
}: {
  personalName: string;
  personalInitial: string;
  groups: UserGroup[];
  activeEntityId: string | null;
  onSelectPersonal: () => void;
  onSelectEntity: (id: string) => void;
  onClose: () => void;
  onSignOut: () => void;
  isLoggedIn: boolean;
  className?: string;
}) {
  /** Individual + entity profile rows — Bucket A: currently live, hidden this round. */
  const showSwitcher = isEntityFeatureEnabled("entityProfileSwitcher");
  const accountUrl = getAccountUrl();

  return (
    <div
      role="menu"
      className={["overflow-hidden p-1", SESSION_SIDE_MENU_SHELL_CLASS, className]
        .filter(Boolean)
        .join(" ")}
      style={SESSION_SIDE_MENU_SHELL_STYLE}
    >
      <a
        href={accountUrl}
        target="_blank"
        rel="noopener noreferrer"
        role="menuitem"
        aria-label="account.aponna.com"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
          openAccountSurfaceInNewTab(isLoggedIn);
        }}
        className={`${ROW} no-underline`}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-white/50">
          <UserRound className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">account.aponna.com</span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-white/50" strokeWidth={1.75} aria-hidden />
      </a>

      {/** Individual + entity profile rows — Bucket A: currently live, hidden this round. */}
      {showSwitcher ? (
      <>
      <div className="my-1 h-px bg-white/[0.08]" />

      <div className="max-h-64 overflow-y-auto">
        <ProfileRow
          label={personalName}
          active={activeEntityId == null}
          onClick={onSelectPersonal}
          icon={<span className="text-[11px] font-semibold">{personalInitial}</span>}
        />
        {groups.map((g) => (
          <ProfileRow
            key={g.id}
            label={g.name}
            active={activeEntityId === g.id}
            onClick={() => onSelectEntity(g.id)}
            icon={<OrganizationIcon className="h-3.5 w-3.5" strokeWidth={1.75} />}
          />
        ))}
      </div>
      </>
      ) : null}

      <div className="my-1 h-px bg-white/[0.08]" />

      <button
        type="button"
        role="menuitem"
        onClick={onSignOut}
        className={ROW}
        style={{ color: LOG_OUT_COLOR }}
      >
        <span>Log out</span>
      </button>
    </div>
  );
}

function ProfileRow({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={ROW}>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-white/50">
        {icon}
      </span>
      <FadeName>{label}</FadeName>
      {active ? (
        <span
          data-active-label
          className="shrink-0 text-[11px] font-medium"
          style={{ color: ACTIVE_STATUS_COLOR }}
        >
          Active
        </span>
      ) : null}
    </button>
  );
}
