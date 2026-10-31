import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Calendar,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { ColorsPanel, ColorSwatch } from "@/components/library/CategoryActionsMenu";
import { getSessionDefaultColor } from "@/lib/sessionDefaultColor";
import { isPlaceholderGroupName, useEntityRoster } from "@/hooks/useEntityRoster";
import { useAuth } from "@/lib/auth";
import { authHeaders } from "@/lib/calendarSessionPersist";
import { useProfileDisplayName } from "@/hooks/useProfileDisplayName";
import { useCalendarTheme } from "./calendarThemePref";
import { sessionDeleteActionClass } from "./CalendarSessionContextMenu";
import { sessionPopoverFieldClass } from "./sessionPopoverField";
import { CalendarInfoToast } from "./CalendarInfoToast";
import { DeleteCalendarModal } from "./DeleteCalendarModal";
import {
  SESSION_CARD_WIDTH_PX,
  SESSION_SIDE_MENU_BG,
  SESSION_SIDE_MENU_ITEM_CLASS,
  SESSION_SIDE_MENU_SHELL_CLASS,
  SESSION_SIDE_MENU_SHELL_STYLE,
} from "./sessionPanelDockUtils";
import {
  useUserCalendars,
  type CalendarAccessRole,
  type UserCalendar,
  type UserCalendarMember,
} from "./UserCalendarsContext";

const MENU_W = 176;
const SUB_W = 168;
const PEOPLE_MENU_W = SESSION_CARD_WIDTH_PX;
const SUB_GAP = 4;
/** Same scroll height as the session card's time listbox (8 rows + inset). */
const PEOPLE_LIST_MAX_H = 252;
const AIM_GRACE_MS = 280;

type Pt = { x: number; y: number };
type SubPanel = "color" | "people" | null;

function pointInRect(p: Pt, r: DOMRect, pad = 0): boolean {
  return p.x >= r.left - pad && p.x <= r.right + pad && p.y >= r.top - pad && p.y <= r.bottom + pad;
}

function pointInTriangle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  const sign = (p1: Pt, p2: Pt, p3: Pt) =>
    (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** `side` is where the submenu sits. The triangle covers that panel's facing edge. */
function isInAimTriangle(apex: Pt, p: Pt, target: DOMRect, side: "left" | "right"): boolean {
  if (side === "left") {
    return pointInTriangle(p, apex, { x: target.right, y: target.top }, { x: target.right, y: target.bottom });
  }
  return pointInTriangle(p, apex, { x: target.left, y: target.top }, { x: target.left, y: target.bottom });
}

function oppositeSide(side: "left" | "right"): "left" | "right" {
  return side === "right" ? "left" : "right";
}

function RoleIsland({
  value,
  onChange,
}: {
  value: "member" | "admin";
  onChange: (next: "member" | "admin") => void;
}) {
  const dark = useCalendarTheme() === "dark";
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState({ left: 2, width: 0 });
  const activeIndex = value === "admin" ? 1 : 0;

  const measureIndicator = () => {
    const track = trackRef.current;
    if (!track) return;
    const inner = track.clientWidth - 4;
    const width = inner / 2;
    const left = 2 + activeIndex * width;
    setIndicator((prev) => (prev.left === left && prev.width === width ? prev : { left, width }));
  };

  useLayoutEffect(() => {
    measureIndicator();
    const track = trackRef.current;
    if (!track) return;
    const ro = new ResizeObserver(() => measureIndicator());
    ro.observe(track);
    return () => ro.disconnect();
  }, [activeIndex]);

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label="Access"
      className="relative box-border w-full shrink-0 overflow-hidden bg-muted/70"
      style={{
        height: 28,
        borderRadius: 10,
        ...(dark
          ? ({
              "--muted": "#2a2a2c",
              "--muted-foreground": "#aeaeb2",
            } as CSSProperties)
          : {}),
      }}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute transition-[left,width] duration-150 ease-out ${dark ? "" : "bg-white"}`}
        style={{
          left: indicator.width > 0 ? indicator.left : 2,
          width: indicator.width > 0 ? indicator.width : 0,
          height: 24,
          top: 2,
          borderRadius: 8,
          backgroundColor: dark ? "#1c1c1e" : undefined,
        }}
      />
      <div
        className="relative grid h-full items-center"
        style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", padding: 2 }}
      >
        {(["member", "admin"] as const).map((key) => {
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(key)}
              className={[
                "relative z-[1] flex h-full items-center justify-center truncate text-[12px] leading-none transition-colors",
                selected
                  ? dark
                    ? "font-medium text-[#f2f2f2]"
                    : "font-medium text-muted-foreground"
                  : "font-normal text-muted-foreground/80 hover:text-muted-foreground",
              ].join(" ")}
            >
              {key === "member" ? "Members" : "Admins"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AccessTicks({
  role,
  onChange,
}: {
  role: CalendarAccessRole;
  onChange: (role: CalendarAccessRole) => void;
}) {
  const tick = (key: CalendarAccessRole, label: string) => {
    const on = role === key;
    return (
      <button
        type="button"
        onClick={() => onChange(key)}
        className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] text-white/90 hover:bg-white/[0.08]"
      >
        <span
          className={`grid h-3.5 w-3.5 place-items-center rounded-[3px] border ${on ? "border-white bg-white text-black" : "border-white/40"}`}
        >
          {on ? <Check className="h-3 w-3" /> : null}
        </span>
        {label}
      </button>
    );
  };
  return (
    <div className="flex flex-col">
      {tick("member", "Member")}
      {tick("admin", "Admin")}
    </div>
  );
}

const EMAIL_FIELD_CLASS =
  "calendar-people-email w-full rounded-md bg-[#333335] px-2 py-1.5 text-[12px] text-white caret-white outline-none placeholder:text-white/40 focus:bg-[#333335]";

function isCurrentUser(
  member: UserCalendarMember,
  user: { id: string; email?: string | null } | null,
) {
  if (!user) return false;
  if (member.userId === user.id) return true;
  const email = user.email?.trim().toLowerCase();
  return !!email && member.email.toLowerCase() === email;
}

/** Pending first. While searching: admins, then members, with you first among accepted admins. */
function peopleListRank(member: UserCalendarMember, self: boolean, searching: boolean) {
  const pending = member.status === "pending";
  if (!searching) return pending ? 0 : 1;
  if (member.role === "admin") {
    if (pending) return 0;
    if (self) return 1;
    return 2;
  }
  return pending ? 3 : 4;
}

function PeoplePanel({
  calendar,
  canManage,
  onInviteSent,
  onEditingChange,
  onEditorDismissed,
}: {
  calendar: UserCalendar;
  canManage: boolean;
  onInviteSent: (email: string) => void;
  onEditingChange?: (editing: boolean) => void;
  onEditorDismissed?: () => void;
}) {
  const { user } = useAuth();
  const { displayName: myProfileName } = useProfileDisplayName();
  const { inviteMember, updateMemberRole, removeMember } = useUserCalendars();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"member" | "admin">("member");
  const searching = searchFocused || query.trim().length > 0;
  const personLabel = (member: UserCalendarMember) => {
    if (isCurrentUser(member, user) && myProfileName.trim()) return myProfileName.trim();
    return member.displayName?.trim() || member.email;
  };
  const resetSearch = () => {
    setQuery("");
    setSearchFocused(false);
    searchRef.current?.blur();
  };
  const [editor, setEditor] = useState<
    null | { mode: "invite"; originY: number } | { mode: "edit"; member: UserCalendarMember; originY: number }
  >(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CalendarAccessRole>("member");
  const [memberMenu, setMemberMenu] = useState<{ member: UserCalendarMember; top: number; left: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onEditingChange?.(editor != null);
    return () => onEditingChange?.(false);
  }, [editor, onEditingChange]);

  const people = calendar.members
    .filter((member) => {
      if (!searching && member.role !== tab) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        member.email.toLowerCase().includes(q) ||
        personLabel(member).toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const rank =
        peopleListRank(a, isCurrentUser(a, user), searching) -
        peopleListRank(b, isCurrentUser(b, user), searching);
      if (rank !== 0) return rank;
      return a.email.localeCompare(b.email);
    });

  const openInvite = (originY: number) => {
    setMemberMenu(null);
    setEmail("");
    setRole("member");
    setError(null);
    setEditor({ mode: "invite", originY });
  };

  const openEdit = (member: UserCalendarMember, originY: number) => {
    setMemberMenu(null);
    setEmail(member.email);
    setRole(member.role);
    setError(null);
    setEditor({ mode: "edit", member, originY });
  };

  const closeEditor = () => {
    onEditorDismissed?.();
    setEditor(null);
    setError(null);
  };

  const submit = async () => {
    if (editor?.mode === "edit") {
      setBusy(true);
      await updateMemberRole(editor.member.id, role);
      setBusy(false);
      closeEditor();
      return;
    }
    const nextEmail = email.trim();
    if (!nextEmail.includes("@")) {
      setError("Enter a valid email");
      return;
    }
    setBusy(true);
    const result = await inviteMember({ calendarId: calendar.id, email: nextEmail, role });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onInviteSent(nextEmail);
    closeEditor();
  };

  if (editor) {
    return (
      <div className="flex w-full flex-col">
        {editor.mode === "invite" || editor.member.displayName ? (
        <motion.div
          initial={{ y: editor.originY, opacity: 1 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-[12px] text-white"
        >
          {editor.mode === "invite" ? (
            <>
              <Plus className="h-3.5 w-3.5" />
              <span>Add user</span>
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate font-medium">{editor.member.displayName}</span>
          )}
        </motion.div>
        ) : null}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.22, delay: 0.08 }}
          className="flex flex-col gap-1 px-1 pb-1"
        >
          <style>{`
            .calendar-people-email:-webkit-autofill,
            .calendar-people-email:-webkit-autofill:hover,
            .calendar-people-email:-webkit-autofill:focus {
              -webkit-text-fill-color: #fff;
              caret-color: #fff;
              box-shadow: inset 0 0 0 1000px #333335;
              transition: background-color 99999s ease-out 0s;
            }
          `}</style>
          <input
            value={email}
            readOnly={editor.mode === "edit"}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="off"
            className={EMAIL_FIELD_CLASS}
          />
          <AccessTicks role={role} onChange={setRole} />
          {error ? <p className="px-2 text-[11px] text-[#FF8A84]">{error}</p> : null}
          <div className="mt-1 flex items-center justify-between gap-2 px-1">
            <button
              type="button"
              onClick={closeEditor}
              className="rounded-md bg-white/15 px-2.5 py-1 text-[11px] text-white/80"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-black disabled:opacity-50"
            >
              {editor.mode === "edit" ? "Save" : "Invite"}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex h-7 items-center rounded-md bg-white/10 pr-1 text-white">
        <span className="grid h-7 w-7 shrink-0 place-items-center text-white/70" aria-hidden>
          <Search className="h-3.5 w-3.5" />
        </span>
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => {
            if (!query.trim()) setSearchFocused(false);
          }}
          placeholder="Search"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/45"
        />
        {searching ? (
          <button
            type="button"
            aria-label="Close search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={resetSearch}
            className="ml-1 grid h-5 w-5 shrink-0 place-items-center rounded text-white/60 hover:bg-white/[0.14] hover:text-white"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      {searching ? null : (
        <>
          {canManage ? (
            <button
              type="button"
              onClick={(e) => {
                const row = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const parent = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                openInvite(row.top - parent.top);
              }}
              className={SESSION_SIDE_MENU_ITEM_CLASS}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add user</span>
            </button>
          ) : null}
          <RoleIsland value={tab} onChange={setTab} />
        </>
      )}
      <div
        className="session-side-menu-scroll flex flex-col overflow-y-auto"
        style={{ maxHeight: PEOPLE_LIST_MAX_H }}
        onMouseDown={(e) => {
          if (searching) e.preventDefault();
        }}
      >
        {people.map((member) => {
          const self = isCurrentUser(member, user);
          const manageable = canManage && !self;
          return (
            <div key={member.id} className="group/person flex shrink-0 items-center gap-1 rounded-sm px-2 py-1.5 text-[12px] text-white/90 hover:bg-white/[0.08]">
              <span className="min-w-0 flex-1 truncate">
                {personLabel(member)}
                {member.status === "pending" ? <span className="text-white/40"> Pending</span> : null}
                {self && member.status !== "pending" ? <span className="text-white/40"> Me</span> : null}
              </span>
              {!manageable ? (
                canManage ? <span aria-hidden className="h-5 w-5 shrink-0" /> : null
              ) : (
                <button
                  type="button"
                  aria-label="Access"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMemberMenu({ member, top: rect.top, left: rect.right + 4 });
                  }}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded text-white/55 hover:bg-white/10 hover:text-white"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {memberMenu
        ? createPortal(
            <div
              data-calendar-member-menu=""
              className={`fixed z-[10001] p-1 ${SESSION_SIDE_MENU_SHELL_CLASS}`}
              style={{
                ...SESSION_SIDE_MENU_SHELL_STYLE,
                top: memberMenu.top,
                left: Math.min(memberMenu.left, window.innerWidth - MENU_W - 8),
                width: MENU_W,
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={SESSION_SIDE_MENU_ITEM_CLASS}
                onClick={(e) => {
                  const row = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  openEdit(memberMenu.member, 0);
                  void row;
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>Edit</span>
              </button>
              <button
                type="button"
                className={sessionDeleteActionClass(true)}
                onClick={() => {
                  onEditorDismissed?.();
                  void removeMember(memberMenu.member.id);
                  setMemberMenu(null);
                }}
              >
                <span className="flex items-center gap-2">
                  <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                  <span>Delete</span>
                </span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function CalendarActionsMenu({
  calendar,
  limited = false,
  onRename,
  onDeleted,
  onInviteSent,
}: {
  calendar: UserCalendar;
  limited?: boolean;
  onRename: () => void;
  onDeleted: () => void;
  onInviteSent: (email: string) => void;
}) {
  const menuId = useId();
  const { setCalendarColor, deleteCalendar } = useUserCalendars();
  const [open, setOpen] = useState(false);
  const [subPanel, setSubPanel] = useState<SubPanel>(null);
  const [mainPos, setMainPos] = useState<{ top: number; left: number } | null>(null);
  const [subPos, setSubPos] = useState<{ top: number; left: number; side: "left" | "right" } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const colorRowRef = useRef<HTMLDivElement>(null);
  const peopleRowRef = useRef<HTMLDivElement>(null);
  const subState = useRef<SubPanel>(null);
  const peopleEditingRef = useRef(false);
  const peopleHoldRef = useRef(false);
  const pointerRef = useRef<Pt>({ x: 0, y: 0 });
  const prevPointerRef = useRef<Pt>({ x: 0, y: 0 });
  const aimApexRef = useRef<Pt | null>(null);
  const intentFreezeRef = useRef(false);
  const closeTimer = useRef<number | null>(null);
  subState.current = subPanel;

  const placeMain = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuHeight = mainRef.current?.offsetHeight || 148;
    const margin = 8;
    const left =
      rect.right + 4 + MENU_W > window.innerWidth - margin
        ? Math.max(margin, rect.left - 4 - MENU_W)
        : rect.right + 4;
    const maxTop = window.innerHeight - menuHeight - margin;
    let top = rect.top;
    if (top > maxTop) top = Math.max(margin, maxTop);
    if (top < margin) top = margin;
    setMainPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
  }, []);

  const placeSub = useCallback((panel: Exclude<SubPanel, null>) => {
    const row = (panel === "color" ? colorRowRef : peopleRowRef).current;
    const main = mainRef.current;
    if (!row || !main) return null;
    const rowRect = row.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    const width = panel === "people" ? PEOPLE_MENU_W : subRef.current?.offsetWidth || SUB_W;
    const menuHeight = subRef.current?.offsetHeight || (panel === "people" ? 320 : 220);
    const openLeft = mainRect.right + SUB_GAP + width > window.innerWidth - 8;
    const left = Math.max(8, openLeft ? mainRect.left - SUB_GAP - width : mainRect.right + SUB_GAP);
    const maxTop = window.innerHeight - menuHeight - 8;
    let top = rowRect.top;
    if (top > maxTop) top = Math.max(8, maxTop);
    if (top < 8) top = 8;
    return { top, left, side: openLeft ? "left" as const : "right" as const };
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const onPeopleEditing = useCallback((editing: boolean) => {
    peopleEditingRef.current = editing;
    if (editing) {
      peopleHoldRef.current = false;
      cancelClose();
    }
  }, [cancelClose]);

  const onEditorDismissed = useCallback(() => {
    peopleEditingRef.current = false;
    peopleHoldRef.current = true;
    cancelClose();
  }, [cancelClose]);

  const closeSub = useCallback(() => {
    cancelClose();
    aimApexRef.current = null;
    intentFreezeRef.current = false;
    subState.current = null;
    setSubPanel(null);
    setSubPos(null);
  }, [cancelClose]);

  const close = useCallback(() => {
    peopleEditingRef.current = false;
    peopleHoldRef.current = false;
    closeSub();
    setOpen(false);
  }, [closeSub]);

  const openSub = useCallback(
    (panel: Exclude<SubPanel, null>) => {
      cancelClose();
      aimApexRef.current = null;
      intentFreezeRef.current = false;
      subState.current = panel;
      setSubPos(placeSub(panel));
      setSubPanel(panel);
    },
    [cancelClose, placeSub],
  );

  const aiming = useCallback(() => {
    const subEl = subRef.current;
    if (!subEl || !subPos) return false;
    const sub = subEl.getBoundingClientRect();
    const p = pointerRef.current;
    if (pointInRect(p, sub, 2)) return true;
    const apex = aimApexRef.current ?? prevPointerRef.current;
    return isInAimTriangle(apex, p, sub, subPos.side) || isInAimTriangle(prevPointerRef.current, p, sub, subPos.side);
  }, [subPos]);

  const requestOpen = useCallback(
    (panel: Exclude<SubPanel, null>) => {
      if (peopleEditingRef.current || peopleHoldRef.current) return;
      const current = subState.current;
      if (current && current !== panel && intentFreezeRef.current && aiming()) return;
      openSub(panel);
    },
    [aiming, openSub],
  );

  const beginAim = (e: ReactPointerEvent<HTMLDivElement>, panel: Exclude<SubPanel, null>) => {
    if (peopleEditingRef.current || peopleHoldRef.current) return;
    if (subState.current !== panel) return;
    const leave = { x: e.clientX, y: e.clientY };
    const prev = pointerRef.current;
    pointerRef.current = leave;
    prevPointerRef.current = prev;
    const subEl = subRef.current;
    const sub = subEl?.getBoundingClientRect();
    const side = subPos?.side ?? "right";
    if (!sub) {
      closeSub();
      return;
    }
    const toward =
      (side === "right" && leave.x >= e.currentTarget.getBoundingClientRect().right - 8) ||
      (side === "left" && leave.x <= e.currentTarget.getBoundingClientRect().left + 8) ||
      isInAimTriangle(prev, leave, sub, side);
    if (!toward) {
      closeSub();
      return;
    }
    aimApexRef.current = leave;
    intentFreezeRef.current = true;
    cancelClose();
    closeTimer.current = window.setTimeout(() => closeSub(), AIM_GRACE_MS);
  };

  const beginAimBack = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (peopleEditingRef.current || peopleHoldRef.current) return;
    if (!subState.current || !subPos) return;
    const next = e.relatedTarget;
    if (next instanceof Node && mainRef.current?.contains(next)) {
      cancelClose();
      aimApexRef.current = null;
      intentFreezeRef.current = false;
      return;
    }
    if (next instanceof Element && next.closest("[data-calendar-member-menu]")) {
      cancelClose();
      return;
    }
    const leave = { x: e.clientX, y: e.clientY };
    const prev = pointerRef.current;
    pointerRef.current = leave;
    prevPointerRef.current = prev;
    const menu = mainRef.current?.getBoundingClientRect();
    const side = subPos.side;
    if (!menu) {
      closeSub();
      return;
    }
    const toward =
      (side === "right" && leave.x <= e.currentTarget.getBoundingClientRect().left + 8) ||
      (side === "left" && leave.x >= e.currentTarget.getBoundingClientRect().right - 8) ||
      isInAimTriangle(prev, leave, menu, oppositeSide(side));
    if (!toward) {
      closeSub();
      return;
    }
    aimApexRef.current = leave;
    intentFreezeRef.current = true;
    cancelClose();
    closeTimer.current = window.setTimeout(() => closeSub(), AIM_GRACE_MS);
  };

  useLayoutEffect(() => {
    if (!open) {
      setMainPos(null);
      return;
    }
    placeMain();
    const observer = new ResizeObserver(() => placeMain());
    if (mainRef.current) observer.observe(mainRef.current);
    window.addEventListener("resize", placeMain);
    window.addEventListener("scroll", placeMain, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", placeMain);
      window.removeEventListener("scroll", placeMain, true);
    };
  }, [open, placeMain]);

  useLayoutEffect(() => {
    if (!open || !subPanel) return;
    const next = placeSub(subPanel);
    if (!next) return;
    setSubPos((prev) =>
      prev && prev.top === next.top && prev.left === next.left && prev.side === next.side ? prev : next,
    );
    const observer = new ResizeObserver(() => {
      const placed = placeSub(subPanel);
      if (!placed) return;
      setSubPos((prev) =>
        prev && prev.top === placed.top && prev.left === placed.left && prev.side === placed.side ? prev : placed,
      );
    });
    if (subRef.current) observer.observe(subRef.current);
    return () => observer.disconnect();
  }, [open, subPanel, placeSub]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      const el = t instanceof Element ? t : t.parentElement;
      if (triggerRef.current?.contains(t) || mainRef.current?.contains(t) || subRef.current?.contains(t)) return;
      if (el?.closest("[data-calendar-member-menu]")) return;
      close();
    };
    const onMove = (e: PointerEvent) => {
      prevPointerRef.current = pointerRef.current;
      pointerRef.current = { x: e.clientX, y: e.clientY };
      const active = subState.current;
      if (!active || !subRef.current) return;
      if (active === "people" && (peopleEditingRef.current || peopleHoldRef.current)) {
        const subBox = subRef.current.getBoundingClientRect();
        const rowBox = peopleRowRef.current?.getBoundingClientRect();
        const inside =
          pointInRect(pointerRef.current, subBox, 1) ||
          (rowBox ? pointInRect(pointerRef.current, rowBox, 1) : false);
        if (peopleHoldRef.current && inside && !peopleEditingRef.current) {
          peopleHoldRef.current = false;
        }
        if (peopleEditingRef.current || peopleHoldRef.current) {
          cancelClose();
          return;
        }
      }
      const sub = subRef.current.getBoundingClientRect();
      const row = (active === "color" ? colorRowRef : peopleRowRef).current?.getBoundingClientRect();
      const p = pointerRef.current;
      const prev = prevPointerRef.current;
      const hovered = document.elementFromPoint(p.x, p.y);
      if (hovered instanceof Element && hovered.closest("[data-calendar-member-menu]")) {
        cancelClose();
        return;
      }
      const side = subPos?.side ?? "right";
      const menu = mainRef.current?.getBoundingClientRect();
      if (pointInRect(p, sub, 1) || (row && pointInRect(p, row, 1)) || (menu && pointInRect(p, menu, 1))) {
        cancelClose();
        intentFreezeRef.current = false;
        aimApexRef.current = null;
        return;
      }
      const apex = aimApexRef.current ?? prev;
      const towardSub = isInAimTriangle(apex, p, sub, side) || isInAimTriangle(prev, p, sub, side);
      const exitedTowardMenu =
        pointInRect(prev, sub, 1) &&
        ((side === "right" && p.x <= sub.left + 8) || (side === "left" && p.x >= sub.right - 8));
      const towardMenu =
        exitedTowardMenu ||
        (!!menu &&
          (isInAimTriangle(apex, p, menu, oppositeSide(side)) ||
            isInAimTriangle(prev, p, menu, oppositeSide(side))));
      if (towardSub || towardMenu) {
        intentFreezeRef.current = true;
        if (!aimApexRef.current) aimApexRef.current = prev;
        cancelClose();
        closeTimer.current = window.setTimeout(() => closeSub(), AIM_GRACE_MS);
        return;
      }
      if (subState.current) closeSub();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointermove", onMove);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointermove", onMove);
    };
  }, [open, close, closeSub, cancelClose, subPos]);

  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  return (
    <>
      <span ref={triggerRef} className="inline-flex" data-calendar-menu={menuId}>
        <button
          type="button"
          aria-label="Calendar actions"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground/60 opacity-0 hover:bg-secondary hover:text-ink group-hover:opacity-100 data-[open=true]:opacity-100"
          data-open={open ? "true" : "false"}
        >
          <MoreHorizontal className="h-3 w-3" />
        </button>
      </span>
      {open
        ? createPortal(
            <div
              ref={mainRef}
              className={`fixed z-[9999] p-1 ${SESSION_SIDE_MENU_SHELL_CLASS}`}
              style={{
                ...SESSION_SIDE_MENU_SHELL_STYLE,
                top: mainPos?.top ?? 0,
                left: mainPos?.left ?? 0,
                width: MENU_W,
                visibility: mainPos ? "visible" : "hidden",
                backgroundColor: SESSION_SIDE_MENU_BG,
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {limited ? null : (
                <button type="button" className={SESSION_SIDE_MENU_ITEM_CLASS} onClick={() => { close(); onRename(); }}>
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="flex-1">Edit title</span>
                </button>
              )}
              {limited ? null : (
              <div
                ref={colorRowRef}
                onPointerEnter={(e) => {
                  pointerRef.current = { x: e.clientX, y: e.clientY };
                  requestOpen("color");
                }}
                onPointerLeave={(e) => beginAim(e, "color")}
                className={`${SESSION_SIDE_MENU_ITEM_CLASS} ${subPanel === "color" ? "bg-white/[0.08]" : ""}`}
              >
                <ColorSwatch fill={calendar.color} dark />
                <span className="flex-1">Colour</span>
                {subPanel === "color" && subPos?.side === "left" ? (
                  <ChevronLeft className="h-3 w-3 text-white/50" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-white/50" />
                )}
              </div>
              )}
              <div
                ref={peopleRowRef}
                onPointerEnter={(e) => {
                  pointerRef.current = { x: e.clientX, y: e.clientY };
                  requestOpen("people");
                }}
                onPointerLeave={(e) => beginAim(e, "people")}
                className={`${SESSION_SIDE_MENU_ITEM_CLASS} ${subPanel === "people" ? "bg-white/[0.08]" : ""}`}
              >
                <Users className="h-3.5 w-3.5" />
                <span className="flex-1">People</span>
                {subPanel === "people" && subPos?.side === "left" ? (
                  <ChevronLeft className="h-3 w-3 text-white/50" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-white/50" />
                )}
              </div>
              <div className="my-1 h-px bg-white/10" />
              <button
                type="button"
                className={sessionDeleteActionClass(true)}
                onClick={() => {
                  close();
                  setConfirmDelete(true);
                }}
              >
                <span className="flex items-center gap-2">
                  <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                  <span>Delete</span>
                </span>
              </button>
            </div>,
            document.body,
          )
        : null}
      {open && subPanel && subPos
        ? createPortal(
            <div
              ref={subRef}
              className={`fixed z-[10000] p-1 ${SESSION_SIDE_MENU_SHELL_CLASS}`}
              style={{
                ...SESSION_SIDE_MENU_SHELL_STYLE,
                top: subPos.top,
                left: subPos.left,
                width: subPanel === "people" ? PEOPLE_MENU_W : undefined,
                backgroundColor: SESSION_SIDE_MENU_BG,
              }}
              onPointerEnter={cancelClose}
              onPointerLeave={beginAimBack}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {subPanel === "color" ? (
                <ColorsPanel
                  currentColor={calendar.color}
                  tone="dark"
                  onPick={(hex) => {
                    void setCalendarColor(calendar.id, hex);
                    close();
                  }}
                />
              ) : (
                <PeoplePanel
                  calendar={calendar}
                  canManage={!limited}
                  onInviteSent={onInviteSent}
                  onEditingChange={onPeopleEditing}
                  onEditorDismissed={onEditorDismissed}
                />
              )}
            </div>,
            document.body,
          )
        : null}
      <DeleteCalendarModal
        open={confirmDelete}
        name={calendar.name}
        leaving={limited}
        onOpenChange={setConfirmDelete}
        onConfirm={() => {
          setConfirmDelete(false);
          void deleteCalendar(calendar.id);
          onDeleted();
        }}
      />
    </>
  );
}

function CalendarRow({
  calendar,
  leading = false,
  sortable,
  renaming,
  renameValue,
  setRenameValue,
  onCommitRename,
  onCancelRename,
  onStartRename,
  onInviteSent,
}: {
  calendar: UserCalendar;
  leading?: boolean;
  sortable: boolean;
  renaming: boolean;
  renameValue: string;
  setRenameValue: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onStartRename: () => void;
  onInviteSent: (email: string) => void;
}) {
  const { setCalendarHidden } = useUserCalendars();
  const dark = useCalendarTheme() === "dark";
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: calendar.id,
    disabled: !sortable || renaming,
    animateLayoutChanges: () => false,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? "none" : transition,
    zIndex: isDragging ? 50 : undefined,
    cursor: "default",
    background: isDragging ? (dark ? "#1c1c1e" : "#ffffff") : undefined,
    boxShadow: isDragging
      ? "0 1px 0 rgba(0,0,0,0.04), 0 10px 24px -10px rgba(0,0,0,0.25)"
      : undefined,
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const started = useRef(0);
  useEffect(() => {
    if (!renaming) return;
    started.current = Date.now();
    const mark = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    mark();
    const frame = requestAnimationFrame(mark);
    return () => cancelAnimationFrame(frame);
  }, [renaming]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(renaming ? {} : listeners)}
      data-calendar-tab=""
      data-calendar-id={calendar.id}
      className={`group flex cursor-default items-center gap-2 rounded-sm px-2 py-1 text-xs text-ink hover:bg-secondary/60 [&_button]:cursor-default ${leading ? "is-first" : ""} ${calendar.hidden ? "text-muted-foreground" : ""} ${renaming ? "ring-1 ring-inset ring-hairline" : ""}`}
    >
      <span aria-hidden className="inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] border border-hairline" style={{ background: calendar.color }} />
      {renaming ? (
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={() => {
            if (Date.now() - started.current < 250) {
              requestAnimationFrame(() => inputRef.current?.focus());
              return;
            }
            onCommitRename();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename();
            else if (e.key === "Escape") onCancelRename();
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 bg-transparent outline-none"
          aria-label="Calendar name"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{calendar.name}</span>
      )}
      <button
        type="button"
        aria-label={calendar.hidden ? `Show ${calendar.name}` : `Hide ${calendar.name}`}
        onClick={(e) => {
          e.stopPropagation();
          void setCalendarHidden(calendar.id, !calendar.hidden);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-secondary"
      >
        {calendar.hidden ? (
          <EyeOff className="h-3 w-3 text-muted-foreground/70" />
        ) : (
          <Eye className="h-3 w-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100" />
        )}
      </button>
      <CalendarActionsMenu
        calendar={calendar}
        limited={calendar.myRole !== "admin"}
        onRename={onStartRename}
        onDeleted={() => {}}
        onInviteSent={onInviteSent}
      />
    </div>
  );
}

/** Title, URL, and the action buttons share this size. */
const WEB_ADDRESS_FONT_PX = 13;
const WEB_ADDRESS_URL_LINE_PX = 18;
const WEB_ADDRESS_URL_VISIBLE_LINES = 4;
/** Scrollport only. Vertical inset sits outside it, matching the description placeholder (top-2). */
const WEB_ADDRESS_URL_FIELD_H = WEB_ADDRESS_URL_LINE_PX * WEB_ADDRESS_URL_VISIBLE_LINES;
const WEB_ADDRESS_URL_INSET_Y = 8;

/** A pasted subscription link: http(s) or webcal, with a host. */
function isWebAddress(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed.replace(/^webcal:/i, "https:"));
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return parsed.hostname.length > 0;
}

function AddCalendarMenu({
  onNormal,
  onInvalidUrl,
  onSubmitUrl,
}: {
  onNormal: () => void;
  onInvalidUrl: (message?: string) => void;
  onSubmitUrl: (url: string, name: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [titleFocused, setTitleFocused] = useState(false);
  const [urlFocused, setUrlFocused] = useState(false);
  const [mainPos, setMainPos] = useState<{ top: number; left: number } | null>(null);
  const [subPos, setSubPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const urlRowRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const urlThumbRef = useRef<HTMLDivElement>(null);
  const urlThumbTimer = useRef<number | null>(null);

  const closeUrl = useCallback(() => {
    setUrlOpen(false);
    setTitle("");
    setUrl("");
    setTitleFocused(false);
    setUrlFocused(false);
  }, []);

  const close = useCallback(() => {
    closeUrl();
    setOpen(false);
  }, [closeUrl]);

  const placeMain = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuHeight = mainRef.current?.offsetHeight || 76;
    const margin = 8;
    const left =
      rect.right + 4 + MENU_W > window.innerWidth - margin
        ? Math.max(margin, rect.left - 4 - MENU_W)
        : rect.right + 4;
    const maxTop = window.innerHeight - menuHeight - margin;
    let top = rect.top;
    if (top > maxTop) top = Math.max(margin, maxTop);
    if (top < margin) top = margin;
    setMainPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
  }, []);

  const placeSub = useCallback(() => {
    const row = urlRowRef.current;
    const main = mainRef.current;
    if (!row || !main) return null;
    const rowRect = row.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    const width = SESSION_CARD_WIDTH_PX;
    const menuHeight = subRef.current?.offsetHeight || 200;
    const margin = 8;
    const leftOfMenu = mainRect.left - SUB_GAP - width;
    const rightOfMenu = mainRect.right + SUB_GAP;
    const preferLeft = leftOfMenu >= margin || rightOfMenu + width > window.innerWidth - margin;
    const left = Math.max(
      margin,
      Math.min(preferLeft ? leftOfMenu : rightOfMenu, window.innerWidth - margin - width),
    );
    const maxTop = window.innerHeight - menuHeight - margin;
    let top = rowRect.top;
    if (top > maxTop) top = Math.max(margin, maxTop);
    if (top < margin) top = margin;
    return { top, left };
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMainPos(null);
      return;
    }
    placeMain();
    const observer = new ResizeObserver(() => placeMain());
    if (mainRef.current) observer.observe(mainRef.current);
    window.addEventListener("resize", placeMain);
    window.addEventListener("scroll", placeMain, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", placeMain);
      window.removeEventListener("scroll", placeMain, true);
    };
  }, [open, placeMain]);

  useLayoutEffect(() => {
    if (!open || !urlOpen) return;
    const next = placeSub();
    if (next) setSubPos(next);
    const observer = new ResizeObserver(() => {
      const placed = placeSub();
      if (!placed) return;
      setSubPos((prev) => (prev && prev.top === placed.top && prev.left === placed.left ? prev : placed));
    });
    if (subRef.current) observer.observe(subRef.current);
    return () => observer.disconnect();
  }, [open, urlOpen, placeSub]);

  useEffect(() => {
    if (!urlOpen) return;
    titleRef.current?.focus();
  }, [urlOpen]);

  const syncUrlThumb = useCallback(() => {
    const el = inputRef.current;
    const thumb = urlThumbRef.current;
    if (!el || !thumb) return;
    const canScroll = el.scrollHeight > el.clientHeight + 1;
    if (!canScroll) {
      thumb.dataset.on = "0";
      thumb.style.height = "0px";
      return;
    }
    const ratio = el.clientHeight / el.scrollHeight;
    const height = Math.max(18, Math.round(el.clientHeight * ratio));
    const travel = Math.max(0, el.clientHeight - height - 4);
    const maxScroll = el.scrollHeight - el.clientHeight;
    const top = 2 + (maxScroll > 0 ? (el.scrollTop / maxScroll) * travel : 0);
    thumb.style.height = `${height}px`;
    thumb.style.transform = `translateY(${top}px)`;
  }, []);

  const onUrlScroll = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    const snapped = Math.min(
      max,
      Math.round(el.scrollTop / WEB_ADDRESS_URL_LINE_PX) * WEB_ADDRESS_URL_LINE_PX,
    );
    if (Math.abs(el.scrollTop - snapped) >= 1) {
      el.scrollTop = snapped;
      return;
    }
    syncUrlThumb();
    const thumb = urlThumbRef.current;
    if (!thumb || el.scrollHeight <= el.clientHeight + 1) return;
    thumb.dataset.on = "1";
    if (urlThumbTimer.current) window.clearTimeout(urlThumbTimer.current);
    urlThumbTimer.current = window.setTimeout(() => {
      if (urlThumbRef.current) urlThumbRef.current.dataset.on = "0";
    }, 700);
  }, [syncUrlThumb]);

  useLayoutEffect(() => {
    if (!urlOpen) return;
    syncUrlThumb();
  }, [url, urlOpen, syncUrlThumb]);

  useEffect(() => () => {
    if (urlThumbTimer.current) window.clearTimeout(urlThumbTimer.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || mainRef.current?.contains(t) || subRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, close]);

  const hasUrlText = url.trim().length > 0;
  const hasCalendarTitle = /[\p{L}\p{N}]/u.test(title);
  const canAdd = hasUrlText && hasCalendarTitle;
  const submittingRef = useRef(false);

  const submitUrl = () => {
    if (!canAdd || submittingRef.current) return;
    if (!isWebAddress(url)) {
      onInvalidUrl();
      inputRef.current?.focus();
      return;
    }
    submittingRef.current = true;
    void onSubmitUrl(url.trim(), title.trim()).then((ok) => {
      submittingRef.current = false;
      if (!ok) {
        inputRef.current?.focus();
        return;
      }
      close();
    });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Add calendar"
        aria-expanded={open}
        aria-haspopup="menu"
        data-open={open ? "true" : "false"}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((current) => !current);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="relative z-[1] grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-ink data-[open=true]:bg-secondary data-[open=true]:text-ink"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      {open
        ? createPortal(
            <div
              ref={mainRef}
              role="menu"
              className={`fixed z-[9999] p-1 ${SESSION_SIDE_MENU_SHELL_CLASS}`}
              style={{
                ...SESSION_SIDE_MENU_SHELL_STYLE,
                top: mainPos?.top ?? 0,
                left: mainPos?.left ?? 0,
                width: MENU_W,
                visibility: mainPos ? "visible" : "hidden",
                backgroundColor: SESSION_SIDE_MENU_BG,
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                className={SESSION_SIDE_MENU_ITEM_CLASS}
                onClick={() => {
                  close();
                  onNormal();
                }}
              >
                <Calendar className="h-3.5 w-3.5" />
                <span className="flex-1">Normal</span>
              </button>
              <button
                ref={urlRowRef}
                type="button"
                role="menuitem"
                aria-expanded={urlOpen}
                className={`${SESSION_SIDE_MENU_ITEM_CLASS} ${urlOpen ? "bg-white/[0.08]" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (urlOpen) closeUrl();
                  else setUrlOpen(true);
                }}
              >
                <Link2 className="h-3.5 w-3.5" />
                <span className="flex-1">Web address</span>
                <ChevronRight className="h-3 w-3 text-white/50" />
              </button>
            </div>,
            document.body,
          )
        : null}
      {open && urlOpen
        ? createPortal(
            <div
              ref={subRef}
              role="dialog"
              aria-label="Add calendar from web address"
              className={`fixed z-[10000] flex flex-col gap-1 p-1 ${SESSION_SIDE_MENU_SHELL_CLASS}`}
              style={{
                ...SESSION_SIDE_MENU_SHELL_STYLE,
                top: subPos?.top ?? 0,
                left: subPos?.left ?? 0,
                width: SESSION_CARD_WIDTH_PX,
                visibility: subPos ? "visible" : "hidden",
                backgroundColor: SESSION_SIDE_MENU_BG,
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (canAdd) submitUrl();
                  else inputRef.current?.focus();
                }}
                placeholder="Calendar title"
                aria-label="Calendar title"
                maxLength={120}
                onFocus={() => setTitleFocused(true)}
                onBlur={() => setTitleFocused(false)}
                className={[
                  "block w-full cursor-text px-3 text-white outline-none placeholder:text-white/40",
                  sessionPopoverFieldClass(titleFocused, "dark"),
                ].join(" ")}
                style={{
                  height: urlRowRef.current?.offsetHeight || undefined,
                  fontSize: WEB_ADDRESS_FONT_PX,
                  lineHeight: `${urlRowRef.current?.offsetHeight || WEB_ADDRESS_FONT_PX}px`,
                }}
              />
              <div
                className={["relative", sessionPopoverFieldClass(urlFocused, "dark")].join(" ")}
                style={{ paddingTop: WEB_ADDRESS_URL_INSET_Y, paddingBottom: WEB_ADDRESS_URL_INSET_Y }}
              >
                <div className="relative">
                  <textarea
                    ref={inputRef}
                    value={url}
                    onChange={(e) => setUrl(e.target.value.replace(/[\r\n]+/g, ""))}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      submitUrl();
                    }}
                    placeholder="https://.."
                    aria-label="Subscription link"
                    onFocus={() => setUrlFocused(true)}
                    onBlur={() => setUrlFocused(false)}
                    onScroll={onUrlScroll}
                    className="session-description-scroll block w-full cursor-text resize-none bg-transparent px-3 text-white outline-none placeholder:text-white/40"
                    style={{
                      height: WEB_ADDRESS_URL_FIELD_H,
                      maxHeight: WEB_ADDRESS_URL_FIELD_H,
                      fontSize: WEB_ADDRESS_FONT_PX,
                      lineHeight: `${WEB_ADDRESS_URL_LINE_PX}px`,
                      paddingTop: 0,
                      paddingBottom: 0,
                    }}
                  />
                  <div ref={urlThumbRef} data-on="0" aria-hidden className="session-description-thumb web-address-url-thumb" />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={closeUrl}
                  className="inline-flex items-center rounded-[10px] bg-white/15 px-3 text-white/80"
                  style={{
                    height: urlRowRef.current?.offsetHeight || undefined,
                    fontSize: WEB_ADDRESS_FONT_PX,
                    lineHeight: `${urlRowRef.current?.offsetHeight || WEB_ADDRESS_FONT_PX}px`,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canAdd}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={submitUrl}
                  className="inline-flex items-center rounded-[10px] bg-white px-3 font-medium text-black disabled:opacity-50"
                  style={{
                    height: urlRowRef.current?.offsetHeight || undefined,
                    fontSize: WEB_ADDRESS_FONT_PX,
                    lineHeight: `${urlRowRef.current?.offsetHeight || WEB_ADDRESS_FONT_PX}px`,
                  }}
                >
                  Add
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function SectionHeader({
  title,
  open,
  onToggle,
  onAdd,
  onInvalidUrl,
  onSubmitUrl,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onInvalidUrl: (message?: string) => void;
  onSubmitUrl: (url: string, name: string) => Promise<boolean>;
}) {
  const dark = useCalendarTheme() === "dark";
  return (
    <div
      className={`group sticky top-0 z-[2] flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-sm ${
        dark ? "bg-[#1c1c1e] hover:bg-[#2c2c2e]" : "bg-[rgba(245,245,247,0.92)] hover:bg-[#EAEAEC]"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
        className="absolute inset-0 rounded-md"
      />
      <span className="pointer-events-none relative z-[1] flex min-w-0 flex-1 items-center gap-1.5 text-left text-ink">
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
      </span>
      <AddCalendarMenu onNormal={onAdd} onInvalidUrl={onInvalidUrl} onSubmitUrl={onSubmitUrl} />
    </div>
  );
}

/** Autoscroll only once the pointer is in this strip at the list's top or bottom edge. */
const CALENDAR_DRAG_SCROLL_EDGE_PX = 8;
const CALENDAR_DRAG_SCROLL_STEP_PX = 4;
/** Release snap: same glide into the row, shorter, and it starts moving immediately. */
const CALENDAR_SNAP_MS = 150;
const CALENDAR_SNAP_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function easeOutSnap(t: number): number {
  return 1 - (1 - t) ** 3;
}

function calendarTabsScroller(): HTMLElement | null {
  return document.querySelector(".calendar-tabs-scroll");
}

function orderCalendars(calendars: UserCalendar[], orderIds: string[] | null): UserCalendar[] {
  if (!orderIds) return calendars;
  const byId = new Map(calendars.map((calendar) => [calendar.id, calendar]));
  const next: UserCalendar[] = [];
  for (const id of orderIds) {
    const calendar = byId.get(id);
    if (calendar) next.push(calendar);
  }
  for (const calendar of calendars) {
    if (!orderIds.includes(calendar.id)) next.push(calendar);
  }
  return next;
}

function CalendarList({
  calendars,
  renamingId,
  renameValue,
  setRenameValue,
  onCommitRename,
  onCancelRename,
  onStartRename,
  onInviteSent,
  onReorder,
}: {
  calendars: UserCalendar[];
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (value: string) => void;
  onCommitRename: (calendar: UserCalendar) => void;
  onCancelRename: () => void;
  onStartRename: (calendar: UserCalendar) => void;
  onInviteSent: (email: string) => void;
  onReorder: (ordered: UserCalendar[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [orderIds, setOrderIds] = useState<string[] | null>(null);
  const shown = orderCalendars(calendars, orderIds);
  const dragEnabled = shown.length > 1;
  const dragScroll = useRef<{ frame: number | null; step: number }>({ frame: null, step: 0 });
  const releaseFrame = useRef<number | null>(null);
  const lastOverId = useRef<string | null>(null);

  const stopAutoscroll = useCallback(() => {
    const state = dragScroll.current;
    if (state.frame != null) cancelAnimationFrame(state.frame);
    state.frame = null;
    state.step = 0;
  }, []);

  const cancelReleaseSnap = useCallback(() => {
    if (releaseFrame.current != null) cancelAnimationFrame(releaseFrame.current);
    releaseFrame.current = null;
  }, []);

  const releaseScrollSnap = useCallback(() => {
    cancelReleaseSnap();
    const el = calendarTabsScroller();
    if (!el) return;
    // Keep the browser's mandatory snap off until our shorter glide finishes.
    el.setAttribute("data-calendar-dragging", "1");
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    const current = el.scrollTop;
    const hostTop = el.getBoundingClientRect().top;
    let target = current;
    let best = Infinity;
    el.querySelectorAll<HTMLElement>("[data-calendar-tab]").forEach((tab) => {
      const raw = getComputedStyle(tab).transform;
      const transformY = !raw || raw === "none" ? 0 : new DOMMatrix(raw).m42 || 0;
      const snap = Math.min(max, Math.max(0, current + tab.getBoundingClientRect().top - hostTop - transformY));
      const dist = Math.abs(snap - current);
      if (dist < best) {
        best = dist;
        target = snap;
      }
    });
    if (Math.abs(target - current) < 0.5) {
      el.removeAttribute("data-calendar-dragging");
      return;
    }
    const start = current;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / CALENDAR_SNAP_MS);
      el.scrollTop = start + (target - start) * easeOutSnap(p);
      if (p < 1) {
        releaseFrame.current = requestAnimationFrame(step);
        return;
      }
      releaseFrame.current = null;
      el.scrollTop = target;
      el.removeAttribute("data-calendar-dragging");
    };
    releaseFrame.current = requestAnimationFrame(step);
  }, [cancelReleaseSnap]);

  useEffect(() => {
    return () => {
      stopAutoscroll();
      cancelReleaseSnap();
      calendarTabsScroller()?.removeAttribute("data-calendar-dragging");
    };
  }, [cancelReleaseSnap, stopAutoscroll]);

  const tickDragScroll = useCallback(() => {
    const state = dragScroll.current;
    const scroller = calendarTabsScroller();
    if (!scroller || state.step === 0) {
      state.frame = null;
      return;
    }
    scroller.scrollTop += state.step;
    state.frame = requestAnimationFrame(tickDragScroll);
  }, []);

  const updateDragScroll = useCallback((clientY: number) => {
    const scroller = calendarTabsScroller();
    const state = dragScroll.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const edge = CALENDAR_DRAG_SCROLL_EDGE_PX;
    const step =
      clientY <= rect.top + edge
        ? -CALENDAR_DRAG_SCROLL_STEP_PX
        : clientY >= rect.bottom - edge
          ? CALENDAR_DRAG_SCROLL_STEP_PX
          : 0;
    state.step = step;
    if (step !== 0 && state.frame == null) state.frame = requestAnimationFrame(tickDragScroll);
  }, [tickDragScroll]);

  const handleDragStart = () => {
    cancelReleaseSnap();
    lastOverId.current = null;
    calendarTabsScroller()?.setAttribute("data-calendar-dragging", "1");
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const origin = event.activatorEvent;
    if (!(origin instanceof MouseEvent)) return;
    updateDragScroll(origin.clientY + event.delta.y);
  };

  const handleDragOver = (event: DragOverEvent) => {
    if (!event.over || event.over.id === event.active.id) return;
    lastOverId.current = String(event.over.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    stopAutoscroll();
    const { active, over } = event;
    const overId =
      over && over.id !== active.id ? String(over.id) : lastOverId.current;
    lastOverId.current = null;
    if (!overId || overId === String(active.id)) {
      releaseScrollSnap();
      return;
    }
    const from = shown.findIndex((calendar) => calendar.id === active.id);
    const to = shown.findIndex((calendar) => calendar.id === overId);
    if (from < 0 || to < 0 || from === to) {
      releaseScrollSnap();
      return;
    }
    const next = arrayMove(shown, from, to);
    setOrderIds(next.map((calendar) => calendar.id));
    onReorder(next);
    releaseScrollSnap();
  };

  return (
    <div data-calendar-list="" className="flex flex-col gap-0.5" style={{ overflow: "visible" }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        autoScroll={false}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragCancel={() => {
          stopAutoscroll();
          lastOverId.current = null;
          releaseScrollSnap();
        }}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={shown.map((calendar) => calendar.id)} strategy={verticalListSortingStrategy}>
          {shown.map((calendar, index) => (
            <CalendarRow
              key={calendar.id}
              calendar={calendar}
              leading={index === 0}
              sortable={dragEnabled && renamingId !== calendar.id}
              renaming={renamingId === calendar.id}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              onCommitRename={() => onCommitRename(calendar)}
              onCancelRename={onCancelRename}
              onStartRename={() => onStartRename(calendar)}
              onInviteSent={onInviteSent}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function CalendarTabsScroller({
  header,
  count,
  children,
}: {
  header?: ReactNode;
  count: number;
  children: ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const [shift, setShift] = useState(0);
  const [viewport, setViewport] = useState<number | null>(null);

  const syncThumb = useCallback(() => {
    const el = scrollRef.current;
    const thumb = thumbRef.current;
    if (!el || !thumb) return;
    const canScroll = el.scrollHeight > el.clientHeight + 1;
    if (!canScroll) {
      thumb.dataset.on = "0";
      return;
    }
    const ratio = el.clientHeight / el.scrollHeight;
    const height = Math.max(18, Math.round(el.clientHeight * ratio));
    const travel = Math.max(0, el.clientHeight - height - 4);
    const maxScroll = el.scrollHeight - el.clientHeight;
    const top = 2 + (maxScroll > 0 ? (el.scrollTop / maxScroll) * travel : 0);
    thumb.style.height = `${height}px`;
    thumb.style.transform = `translateY(${top}px)`;
  }, []);

  const measure = useCallback(() => {
    const frame = frameRef.current;
    const scroll = scrollRef.current;
    if (!frame || !scroll) return;
    const row = scroll.querySelector<HTMLElement>("[data-calendar-tab]");
    const renaming = !!scroll.querySelector("[data-calendar-tab] input");
    const frameH = frame.clientHeight;
    const headerH = headerRef.current?.offsetHeight ?? 0;
    const rowH = row?.offsetHeight ?? 0;
    if (renaming || rowH <= 0 || frameH <= headerH || scroll.scrollHeight < rowH) {
      setShift((prev) => (prev === 0 ? prev : 0));
      setViewport((prev) => (prev == null ? prev : null));
      syncThumb();
      return;
    }
    const available = frameH - headerH;
    const list = scroll.querySelector<HTMLElement>("[data-calendar-list]");
    const gap = list ? Number.parseFloat(getComputedStyle(list).rowGap) || 0 : 0;
    const stride = rowH + gap;
    const rows = Math.floor((available + gap) / stride);
    if (rows < 1) {
      setShift((prev) => (prev === 0 ? prev : 0));
      setViewport((prev) => (prev == null ? prev : null));
      syncThumb();
      return;
    }
    const tabCount = scroll.querySelectorAll("[data-calendar-tab]").length;
    const nextViewport = rows * rowH + (rows - 1) * gap;
    const nextShift = tabCount > rows ? Math.max(0, available - nextViewport) : 0;
    setShift((prev) => (prev === nextShift ? prev : nextShift));
    setViewport((prev) => (tabCount > rows ? (prev === nextViewport ? prev : nextViewport) : prev == null ? prev : null));
    syncThumb();
  }, [syncThumb]);

  useLayoutEffect(() => {
    measure();
    const frame = frameRef.current;
    const scroll = scrollRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(frame);
    const inner = scroll?.firstElementChild;
    if (inner) observer.observe(inner);
    return () => observer.disconnect();
  }, [measure, count, viewport, shift]);

  useEffect(() => {
    const panel = frameRef.current?.closest("[data-left-panel]");
    if (!panel) return;
    const onLeave = () => {
      if (thumbRef.current) thumbRef.current.dataset.on = "0";
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
    panel.addEventListener("pointerleave", onLeave);
    return () => panel.removeEventListener("pointerleave", onLeave);
  }, []);

  useEffect(() => () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
  }, []);

  const onScroll = () => {
    syncThumb();
    const el = scrollRef.current;
    const thumb = thumbRef.current;
    if (!el || !thumb || el.scrollHeight <= el.clientHeight + 1) return;
    thumb.dataset.on = "1";
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (thumbRef.current) thumbRef.current.dataset.on = "0";
    }, 700);
  };

  return (
    <div ref={frameRef} className="calendar-group flex min-h-0 flex-1 flex-col">
      <div style={{ height: shift }} className="shrink-0" />
      {header ? (
        <div ref={headerRef} className="shrink-0 pb-0.5">
          {header}
        </div>
      ) : null}
      <div
        className={`relative min-h-0 ${viewport == null ? "flex-1" : "shrink-0"}`}
        style={viewport == null ? undefined : { height: viewport }}
      >
        <div ref={scrollRef} className="calendar-tabs-scroll h-full overflow-y-auto" onScroll={onScroll}>
          {children}
        </div>
        <div ref={thumbRef} data-on="0" aria-hidden className="calendar-tabs-thumb" />
      </div>
    </div>
  );
}

export function CalendarsSection({
  seat,
  teamId = null,
}: {
  seat: "individual" | "admin";
  teamId?: string | null;
}) {
  const { calendars, createCalendar, renameCalendar, reorderCalendars, refresh } = useUserCalendars();
  const roster = useEntityRoster(seat === "admin" ? teamId : null);
  const [openPersonal, setOpenPersonal] = useState(true);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const groups = roster.groups.filter((group) => group.name.trim() && !isPlaceholderGroupName(group.name));

  const startRename = (calendar: UserCalendar) => {
    window.setTimeout(() => {
      setRenamingId(calendar.id);
      setRenameValue(calendar.name);
    }, 0);
  };

  const commitRename = (calendar: UserCalendar) => {
    const next = renameValue.trim();
    setRenamingId(null);
    if (!next || next === calendar.name) return;
    void renameCalendar(calendar.id, next);
  };

  const subscribeFromUrl = async (
    url: string,
    name: string,
    entityId: string | null,
    appGroupId: string | null,
  ): Promise<boolean> => {
    const label = name.trim();
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/calendar/subscriptions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          url,
          label: label || undefined,
          entityId: entityId ?? undefined,
          appGroupId: appGroupId ?? undefined,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setToast(body.error || "The URL address is not valid.");
        return false;
      }
      await refresh();
      return true;
    } catch {
      setToast("The URL address is not valid.");
      return false;
    }
  };

  const add = async (entityId: string | null, appGroupId: string | null) => {
    const created = await createCalendar({
      name: "New calendar",
      color: getSessionDefaultColor(),
      entityId,
      appGroupId,
    });
    if (!created) return;
    if (appGroupId) setOpenGroupId(appGroupId);
    else setOpenPersonal(true);
    setRenamingId(created.id);
    setRenameValue(created.name);
  };

  const listProps = {
    renamingId,
    renameValue,
    setRenameValue,
    onCommitRename: commitRename,
    onCancelRename: () => setRenamingId(null),
    onStartRename: startRename,
    onInviteSent: (email: string) => setToast(`Calendar invite sent to ${email}`),
    onReorder: (ordered: UserCalendar[]) => {
      void reorderCalendars(ordered);
    },
  };

  useLayoutEffect(() => {
    if (!renamingId) return;
    const mark = () => {
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Calendar name"]');
      input?.focus();
      input?.select();
    };
    mark();
    const frame = requestAnimationFrame(mark);
    return () => cancelAnimationFrame(frame);
  }, [renamingId]);

  let body: ReactNode;
  if (seat === "admin" && teamId) {
    const rows = calendars.filter((calendar) => calendar.entityId === teamId);
    body = (
      <CalendarTabsScroller count={rows.length}>
        {groups.map((group) => {
          const open = openGroupId === group.id;
          const groupRows = rows.filter((calendar) => calendar.appGroupId === group.id);
          return (
            <div key={group.id} className="calendar-group">
              <SectionHeader
                title={group.name}
                open={open}
                onToggle={() => setOpenGroupId((current) => (current === group.id ? null : group.id))}
                onAdd={() => void add(teamId, group.id)}
                onInvalidUrl={(message) => setToast(message || "The URL address is not valid.")}
                onSubmitUrl={(url, name) => subscribeFromUrl(url, name, teamId, group.id)}
              />
              <motion.div
                initial={false}
                animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
                transition={{ height: { duration: 0.24, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.16 } }}
                className={open ? "mt-0.5" : ""}
                style={{ overflow: open ? "visible" : "hidden" }}
              >
                <CalendarList calendars={groupRows} {...listProps} />
              </motion.div>
            </div>
          );
        })}
      </CalendarTabsScroller>
    );
  } else {
    const rows = calendars.filter((calendar) => !calendar.entityId);
    body = (
      <CalendarTabsScroller
        count={rows.length}
        header={
          <SectionHeader
            title="Calendars"
            open={openPersonal}
            onToggle={() => setOpenPersonal((v) => !v)}
            onAdd={() => void add(null, null)}
            onInvalidUrl={(message) => setToast(message || "The URL address is not valid.")}
            onSubmitUrl={(url, name) => subscribeFromUrl(url, name, null, null)}
          />
        }
      >
        <motion.div
          initial={false}
          animate={{ height: openPersonal ? "auto" : 0, opacity: openPersonal ? 1 : 0 }}
          transition={{ height: { duration: 0.24, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.16 } }}
          style={{ overflow: openPersonal ? "visible" : "hidden" }}
        >
          <CalendarList calendars={rows} {...listProps} />
        </motion.div>
      </CalendarTabsScroller>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-1.5">
      {body}
      {toast ? <CalendarInfoToast message={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
