/**
 * Shared profile picker used by the left-panel footer and the top-bar
 * initial badge. Account opens first; then the individual profile,
 * entity profiles, a hairline, and Log out. The left panel also inserts
 * Settings between account and Log out.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ExternalLink, Settings, UserRound } from "lucide-react";
import { OrganizationIcon } from "@/components/OrganizationIcon";
import type { UserGroup } from "@/hooks/useUserGroups";
import { getAccountUrl, openAccountSurfaceInNewTab } from "@/lib/app-surface";
import { isEntityFeatureEnabled } from "@/lib/features";
import { ACTIVE_STATUS_COLOR } from "@/lib/cloud-landing-design";
import { setHideMultiDayRow, useHideMultiDayRow } from "@/components/calendar/multiDayRowPref";
import { setHideTimeScale, useHideTimeScale } from "@/components/calendar/timeScalePref";
import { setCalendarTheme, useCalendarTheme } from "@/components/calendar/calendarThemePref";
import {
  SESSION_SIDE_MENU_GAP_PX,
  SESSION_SIDE_MENU_SHELL_CLASS,
  SESSION_SIDE_MENU_SHELL_STYLE,
} from "@/components/calendar/sessionPanelDockUtils";

const LOG_OUT_COLOR = "#FF3B30";

const ROW_BASE =
  "flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm transition-colors hover:bg-white/[0.08]";
const ROW = `${ROW_BASE} text-white/90`;

const HAIRLINE = "my-1 h-px bg-white/[0.08]";

type Pt = { x: number; y: number };

function pointInRect(p: Pt, r: DOMRect, pad = 0): boolean {
  return (
    p.x >= r.left - pad &&
    p.x <= r.right + pad &&
    p.y >= r.top - pad &&
    p.y <= r.bottom + pad
  );
}

function pointInTriangle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  const sign = (p1: Pt, p2: Pt, p3: Pt) =>
    (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** Aim wedge from the cursor to the submenu's left edge. */
function isInAimTriangle(apex: Pt, p: Pt, sub: DOMRect): boolean {
  return pointInTriangle(
    p,
    apex,
    { x: sub.left, y: sub.top },
    { x: sub.left, y: sub.bottom },
  );
}

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
  showSettings = false,
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
  /** Left-panel footer only. The top-bar menu does not open calendar settings. */
  showSettings?: boolean;
  className?: string;
}) {
  /** Individual + entity profile rows — Bucket A: currently live, hidden this round. */
  const showSwitcher = isEntityFeatureEnabled("entityProfileSwitcher");
  const accountUrl = getAccountUrl();
  const menuRef = useRef<HTMLDivElement>(null);
  const settingsRowRef = useRef<HTMLDivElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const appearanceRowRef = useRef<HTMLDivElement>(null);
  const appearanceMenuRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<Pt>({ x: 0, y: 0 });
  const aimApexRef = useRef<Pt | null>(null);
  const appearanceApexRef = useRef<Pt | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsBox, setSettingsBox] = useState<{ left: number; bottom: number } | null>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [appearanceBox, setAppearanceBox] = useState<{ left: number; bottom: number } | null>(null);
  const hideTimeScale = useHideTimeScale();
  const hideMultiDayRow = useHideMultiDayRow();
  const theme = useCalendarTheme();

  useLayoutEffect(() => {
    if (!settingsOpen) {
      setSettingsBox(null);
      return;
    }
    const place = () => {
      const row = settingsRowRef.current?.getBoundingClientRect();
      const menu = menuRef.current?.getBoundingClientRect();
      if (!row || !menu) return;
      setSettingsBox({
        left: menu.right + SESSION_SIDE_MENU_GAP_PX,
        bottom: window.innerHeight - row.bottom,
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [settingsOpen]);

  useLayoutEffect(() => {
    if (!appearanceOpen) {
      setAppearanceBox(null);
      return;
    }
    const place = () => {
      const row = appearanceRowRef.current?.getBoundingClientRect();
      const menu = settingsMenuRef.current?.getBoundingClientRect();
      if (!row || !menu) return;
      setAppearanceBox({
        left: menu.right + SESSION_SIDE_MENU_GAP_PX,
        bottom: window.innerHeight - row.bottom,
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [appearanceOpen]);

  useEffect(() => {
    if (!settingsOpen) setAppearanceOpen(false);
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onMove = (e: PointerEvent) => {
      const prev = pointerRef.current;
      const p = { x: e.clientX, y: e.clientY };
      pointerRef.current = p;

      const appearanceEl = appearanceMenuRef.current;
      const appearanceRow = appearanceRowRef.current;
      if (appearanceOpen && (!appearanceEl || !appearanceRow)) {
        const row = appearanceRowRef.current?.getBoundingClientRect();
        if (
          row &&
          p.x >= row.right - 12 &&
          p.y >= row.top - 12 &&
          p.y <= row.bottom + 12
        ) {
          return;
        }
      }
      if (appearanceEl && appearanceRow) {
        const sub = appearanceEl.getBoundingClientRect();
        const row = appearanceRow.getBoundingClientRect();
        const host = settingsMenuRef.current?.getBoundingClientRect();
        const inAppearance = pointInRect(p, sub, 2) || pointInRect(p, row, 2);
        const inGap =
          !!host &&
          p.x >= Math.min(row.right, host.right) - 1 &&
          p.x <= sub.left + 2 &&
          p.y >= row.top - 1 &&
          p.y <= row.bottom + 1;
        const apex = appearanceApexRef.current ?? prev;
        const aiming =
          inGap || isInAimTriangle(apex, p, sub) || isInAimTriangle(prev, p, sub);
        if (inAppearance || aiming) {
          if (inAppearance) appearanceApexRef.current = null;
          else if (!appearanceApexRef.current) appearanceApexRef.current = prev;
          return;
        }
        appearanceApexRef.current = null;
        setAppearanceOpen(false);
      }

      const subEl = settingsMenuRef.current;
      const rowEl = settingsRowRef.current;
      if (!subEl || !rowEl) return;
      const sub = subEl.getBoundingClientRect();
      const row = rowEl.getBoundingClientRect();
      if (pointInRect(p, sub, 2) || pointInRect(p, row, 2)) {
        aimApexRef.current = null;
        return;
      }
      const menu = menuRef.current?.getBoundingClientRect();
      const inGap =
        !!menu &&
        p.x >= Math.min(row.right, menu.right) - 1 &&
        p.x <= sub.left + 2 &&
        p.y >= row.top - 1 &&
        p.y <= row.bottom + 1;
      const apex = aimApexRef.current ?? prev;
      if (inGap || isInAimTriangle(apex, p, sub) || isInAimTriangle(prev, p, sub)) {
        if (!aimApexRef.current) aimApexRef.current = prev;
        return;
      }
      aimApexRef.current = null;
      setSettingsOpen(false);
    };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  }, [settingsOpen, appearanceOpen]);

  return (
    <div
      ref={menuRef}
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
        aria-label="account.bissibox.com"
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
        <span className="min-w-0 flex-1">account.bissibox.com</span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-white/50" strokeWidth={1.75} aria-hidden />
      </a>

      {/** Individual + entity profile rows — Bucket A: currently live, hidden this round. */}
      {showSwitcher ? (
      <>
      <div className={HAIRLINE} />

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

      {showSettings ? (
        <>
          <div className={HAIRLINE} />
          <div
            ref={settingsRowRef}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={settingsOpen}
            className={`${ROW} cursor-default`}
            onPointerEnter={(e) => {
              pointerRef.current = { x: e.clientX, y: e.clientY };
              aimApexRef.current = null;
              setSettingsOpen(true);
            }}
            onPointerMove={(e) => {
              pointerRef.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerLeave={(e) => {
              const leave = { x: e.clientX, y: e.clientY };
              const row = settingsRowRef.current?.getBoundingClientRect();
              const sub = settingsMenuRef.current?.getBoundingClientRect();
              const towardRight = !!row && leave.x >= row.right - 8;
              const towardMenu = !!sub && isInAimTriangle(pointerRef.current, leave, sub);
              if (towardRight || towardMenu) {
                aimApexRef.current = leave;
                pointerRef.current = leave;
                return;
              }
              aimApexRef.current = null;
              setSettingsOpen(false);
            }}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center text-white/50">
              <Settings className="h-3.5 w-3.5" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">Settings</span>
          </div>
          {settingsOpen && settingsBox && typeof document !== "undefined"
            ? createPortal(
                <div
                  ref={settingsMenuRef}
                  data-profile-settings-menu=""
                  role="menu"
                  className={`fixed z-[220] min-w-[220px] overflow-hidden p-1 ${SESSION_SIDE_MENU_SHELL_CLASS}`}
                  style={{
                    ...SESSION_SIDE_MENU_SHELL_STYLE,
                    left: settingsBox.left,
                    bottom: settingsBox.bottom,
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={!hideTimeScale}
                    onClick={() => setHideTimeScale(!hideTimeScale)}
                    className={`${ROW_BASE} whitespace-nowrap ${hideTimeScale ? "text-white/40" : "text-white/90"}`}
                  >
                    Show time in week-view
                  </button>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={!hideMultiDayRow}
                    onClick={() => setHideMultiDayRow(!hideMultiDayRow)}
                    className={`${ROW_BASE} whitespace-nowrap ${hideMultiDayRow ? "text-white/40" : "text-white/90"}`}
                  >
                    Show events
                  </button>
                  <div
                    ref={appearanceRowRef}
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={appearanceOpen}
                    className={`${ROW} cursor-default`}
                    onPointerEnter={(e) => {
                      pointerRef.current = { x: e.clientX, y: e.clientY };
                      appearanceApexRef.current = null;
                      setAppearanceOpen(true);
                    }}
                    onPointerMove={(e) => {
                      pointerRef.current = { x: e.clientX, y: e.clientY };
                    }}
                    onPointerLeave={(e) => {
                      const leave = { x: e.clientX, y: e.clientY };
                      const row = appearanceRowRef.current?.getBoundingClientRect();
                      const sub = appearanceMenuRef.current?.getBoundingClientRect();
                      const towardRight = !!row && leave.x >= row.right - 8;
                      const towardMenu = !!sub && isInAimTriangle(pointerRef.current, leave, sub);
                      if (towardRight || towardMenu) {
                        appearanceApexRef.current = leave;
                        pointerRef.current = leave;
                        return;
                      }
                      appearanceApexRef.current = null;
                      setAppearanceOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1">Appearance</span>
                  </div>
                </div>,
                document.body,
              )
            : null}
          {appearanceOpen && appearanceBox && typeof document !== "undefined"
            ? createPortal(
                <div
                  ref={appearanceMenuRef}
                  data-profile-settings-menu=""
                  role="menu"
                  className={`fixed z-[230] min-w-[160px] overflow-hidden p-1 ${SESSION_SIDE_MENU_SHELL_CLASS}`}
                  style={{
                    ...SESSION_SIDE_MENU_SHELL_STYLE,
                    left: appearanceBox.left,
                    bottom: appearanceBox.bottom,
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <ThemeChoice
                    label="Light"
                    selected={theme === "light"}
                    onClick={() => setCalendarTheme("light")}
                  />
                  <ThemeChoice
                    label="Dark"
                    selected={theme === "dark"}
                    onClick={() => setCalendarTheme("dark")}
                  />
                </div>,
                document.body,
              )
            : null}
        </>
      ) : null}

      <div className={HAIRLINE} />

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

function ThemeChoice({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      className={`${ROW} whitespace-nowrap`}
    >
      <span className="min-w-0 flex-1">{label}</span>
      {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-white/80" strokeWidth={2} /> : null}
    </button>
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
