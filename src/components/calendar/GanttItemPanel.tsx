/**
 * Dockable edit panel for Macro Gantt project/phase blocks.
 * Subset of the entity session panel: dock + close, title, start/end dates, group.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import type { UserCategory } from "@/hooks/useUserCategories";
import { useEntityRoster, isPlaceholderGroupName } from "@/hooks/useEntityRoster";
import { useUserGroups } from "@/hooks/useUserGroups";
import { computePopoverPosition } from "./popoverPosition";
import { SessionPopoverHeader } from "./SessionPopoverHeader";
import { SessionPanelDockGuides, SessionPanelHeaderRow } from "./SessionPanelDock";
import {
  computeDockedPanelLeft,
  getSessionPanelDocked,
  SESSION_PANEL_DOCK_TRANSITION,
  SESSION_PANEL_SHELL_CLASS,
  SESSION_PANEL_SHELL_STYLE,
  setSessionPanelDocked,
  subscribeSessionPanelDocked,
  type SessionPanelFloatPosition,
} from "./sessionPanelDockUtils";
import { weeksForCalendarYear, resolveGanttDaySpan, dateFromDayOffset, formatDateISO, parseDateISO, spanFromDayOffsets, dayOffsetInYearGrid, clampDayOffset } from "./ganttWeeks";
import { SessionDeleteButton } from "./SessionDeleteButton";
import { STANDARD_COLORS_NAMED } from "@/components/library/CategoryActionsMenu";

const PANEL_W = 280;
const VIEWPORT_MARGIN = 8;
const BASE_PANEL_H = 260;
const PANEL_FIELD = "rounded-[10px] bg-muted/70";
const FIELD_TEXT = "text-[12px] text-ink";
const CONTENT_GAP = "gap-4";

export type GanttItemPanelChange = {
  name: string;
  color: string;
  gantt_start_week: number;
  gantt_end_week: number;
  gantt_start_date: string;
  gantt_end_date: string;
  app_group_id?: string | null;
};

export function GanttItemPanel({
  item,
  year,
  anchor,
  teamId,
  liveSpan = null,
  onChange,
  onClose,
  onDelete,
}: {
  item: UserCategory;
  year: number;
  anchor: DOMRect;
  teamId?: string | null;
  /** In-progress edge-resize dates from the grid (keeps fields in sync). */
  liveSpan?: {
    gantt_start_date: string;
    gantt_end_date: string;
  } | null;
  onChange: (patch: GanttItemPanelChange) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const weeks = useMemo(() => weeksForCalendarYear(year), [year]);
  const weekCount = weeks.length;

  const resolved = useMemo(() => {
    const span = resolveGanttDaySpan(weeks, item);
    if (!span) {
      const d = formatDateISO(new Date(year, 0, 1));
      return { startDate: d, endDate: d };
    }
    return {
      startDate: formatDateISO(dateFromDayOffset(weeks, span.startDay)),
      endDate: formatDateISO(dateFromDayOffset(weeks, span.endDay)),
    };
  }, [weeks, item, year]);

  const [name, setName] = useState(item.name);
  const [startDate, setStartDate] = useState(resolved.startDate);
  const [endDate, setEndDate] = useState(resolved.endDate);
  const [appGroupId, setAppGroupId] = useState<string | null>(item.app_group_id ?? null);
  const [color, setColor] = useState(item.color);

  // Sync from item when not live-resizing.
  useEffect(() => {
    if (liveSpan) return;
    setStartDate(resolved.startDate);
    setEndDate(resolved.endDate);
  }, [resolved.startDate, resolved.endDate, liveSpan]);

  useEffect(() => {
    if (!liveSpan) return;
    setStartDate(liveSpan.gantt_start_date);
    setEndDate(liveSpan.gantt_end_date);
  }, [liveSpan]);

  useEffect(() => {
    setName(item.name);
    setAppGroupId(item.app_group_id ?? null);
    setColor(item.color);
  }, [item.id, item.name, item.app_group_id, item.color]);

  const ref = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const settledRef = useRef(false);

  const panelDocked = useSyncExternalStore(
    subscribeSessionPanelDocked,
    getSessionPanelDocked,
    () => false,
  );
  const [dockIconHover, setDockIconHover] = useState(false);
  const [dockLeft, setDockLeft] = useState(() => computeDockedPanelLeft(PANEL_W));
  const [panelHeight, setPanelHeight] = useState(BASE_PANEL_H);
  const [panelTop, setPanelTop] = useState(0);
  const [panelLeft, setPanelLeft] = useState(0);
  const [panelReady, setPanelReady] = useState(false);
  const [allowPosTransition, setAllowPosTransition] = useState(false);
  const [floatPos, setFloatPos] = useState<SessionPanelFloatPosition>({ left: 0, top: 0 });
  const floatingPosRef = useRef<SessionPanelFloatPosition>(floatPos);
  const anchorKey = `${anchor.top}|${anchor.bottom}|${anchor.left}|${anchor.right}`;

  const clampPanelTop = useCallback((top: number, height: number) => {
    const vh = window.innerHeight;
    let next = top;
    if (next + height > vh - VIEWPORT_MARGIN) {
      next = Math.max(VIEWPORT_MARGIN, vh - VIEWPORT_MARGIN - height);
    }
    if (next < VIEWPORT_MARGIN) next = VIEWPORT_MARGIN;
    return next;
  }, []);

  const initialPos = useMemo(
    () => computePopoverPosition(anchor, PANEL_W, BASE_PANEL_H),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- freeze to open-time anchor
    [anchor.top, anchor.bottom, anchor.left, anchor.right, anchor.width, anchor.height],
  );

  const placePanel = useCallback(
    (el: HTMLDivElement, opts?: { reveal?: boolean; enableTransitionAfter?: boolean }) => {
      const height = Math.max(el.offsetHeight, 1);
      setPanelHeight((prev) => (prev === height ? prev : height));

      if (panelDocked) {
        const top = clampPanelTop(anchor.top, height);
        const left = computeDockedPanelLeft(PANEL_W);
        setPanelTop((prev) => (prev === top ? prev : top));
        setDockLeft((prev) => (prev === left ? prev : left));
        setPanelLeft((prev) => (prev === left ? prev : left));
      } else {
        const pos = computePopoverPosition(anchor, PANEL_W, height);
        setPanelTop((prev) => (prev === pos.top ? prev : pos.top));
        setPanelLeft((prev) => (prev === pos.left ? prev : pos.left));
      }

      if (opts?.reveal) setPanelReady(true);
      if (opts?.enableTransitionAfter) {
        requestAnimationFrame(() => setAllowPosTransition(true));
      }
    },
    [anchor, clampPanelTop, panelDocked],
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setAllowPosTransition(false);
    placePanel(el, { reveal: true, enableTransitionAfter: true });
  }, [anchorKey, panelDocked, placePanel]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setAllowPosTransition(false);
      placePanel(el, { enableTransitionAfter: true });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [placePanel]);

  useLayoutEffect(() => {
    if (!panelReady) return;
    titleInputRef.current?.focus({ preventScroll: true });
  }, [panelReady]);

  useEffect(() => {
    const next = {
      left: panelDocked ? dockLeft : panelLeft,
      top: panelTop,
    };
    floatingPosRef.current = next;
    setFloatPos(next);
  }, [panelDocked, panelLeft, panelTop, dockLeft]);

  useEffect(() => {
    if (!panelDocked) return;
    const updateDockLeft = () => setDockLeft(computeDockedPanelLeft(PANEL_W));
    updateDockLeft();
    window.addEventListener("resize", updateDockLeft);
    return () => window.removeEventListener("resize", updateDockLeft);
  }, [panelDocked]);

  // Seed float position from initial placement once.
  useEffect(() => {
    setPanelTop(initialPos.top);
    setPanelLeft(initialPos.left);
    setFloatPos({ left: initialPos.left, top: initialPos.top });
  }, [initialPos.left, initialPos.top]);

  const effectiveLeft = panelDocked ? dockLeft : panelLeft;

  const togglePanelDock = useCallback(() => {
    if (panelDocked) {
      setSessionPanelDocked(false);
      setAllowPosTransition(true);
      setPanelTop(floatPos.top);
      setPanelLeft(floatPos.left);
      return;
    }
    const next = { left: panelLeft, top: panelTop };
    floatingPosRef.current = next;
    setFloatPos(next);
    const left = computeDockedPanelLeft(PANEL_W);
    setDockLeft(left);
    setAllowPosTransition(true);
    setSessionPanelDocked(true);
  }, [panelDocked, panelLeft, panelTop, floatPos.top, floatPos.left]);

  const buildPatch = useCallback((): GanttItemPanelChange | null => {
    if (weekCount === 0) return null;
    const startParsed = parseDateISO(startDate);
    const endParsed = parseDateISO(endDate);
    if (!startParsed || !endParsed) return null;

    let startDay = clampDayOffset(weeks, dayOffsetInYearGrid(weeks, startParsed));
    let endDay = clampDayOffset(weeks, dayOffsetInYearGrid(weeks, endParsed));
    if (endDay < startDay) {
      const t = startDay;
      startDay = endDay;
      endDay = t;
    }

    const span = spanFromDayOffsets(weeks, startDay, endDay);
    const patch: GanttItemPanelChange = {
      name: name.trim() || item.name,
      color,
      ...span,
    };
    if (teamId) patch.app_group_id = appGroupId;
    return patch;
  }, [weekCount, weeks, startDate, endDate, name, item.name, color, teamId, appGroupId]);

  const commitAndClose = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    const patch = buildPatch();
    if (patch) onChange(patch);
    onClose();
  }, [buildPatch, onChange, onClose]);

  const deleteAndClose = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    onDelete?.();
    onClose();
  }, [onDelete, onClose]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      // Ignore clicks on gantt blocks (re-open / re-anchor handled by parent).
      if ((t as HTMLElement)?.closest?.("[data-gantt-block]")) return;
      if ((t as HTMLElement)?.closest?.("[data-role='popover']")) return;
      commitAndClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        commitAndClose();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === "textarea" || tag === "select" || tag === "button") return;
        e.preventDefault();
        commitAndClose();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [commitAndClose]);

  const dockGuideRect = {
    left: dockLeft,
    top: panelTop,
    width: PANEL_W,
    height: panelHeight,
  };
  const placeholderGuideRect = {
    left: floatPos.left,
    top: floatPos.top,
    width: PANEL_W,
    height: panelHeight,
  };

  return createPortal(
    <>
      <SessionPanelDockGuides
        showDockSlot={dockIconHover && !panelDocked}
        showPlaceholder={dockIconHover && panelDocked}
        dockSlot={dockGuideRect}
        placeholder={placeholderGuideRect}
      />
      <div
        ref={ref}
        data-role="popover"
        data-gantt-item-panel=""
        className="fixed z-50"
        style={{
          top: panelTop,
          left: effectiveLeft,
          width: PANEL_W,
          visibility: panelReady ? "visible" : "hidden",
          pointerEvents: panelReady ? "auto" : "none",
          transition: allowPosTransition ? SESSION_PANEL_DOCK_TRANSITION : undefined,
        }}
      >
        <div
          className={["flex min-h-0 flex-col", SESSION_PANEL_SHELL_CLASS].join(" ")}
          style={{ ...SESSION_PANEL_SHELL_STYLE, width: PANEL_W }}
        >
          <div className="px-3 pt-2">
            <SessionPanelHeaderRow
              docked={panelDocked}
              onDockHoverChange={setDockIconHover}
              onDockToggle={togglePanelDock}
              actions={
                <SessionPopoverHeader isEdit onClose={commitAndClose} />
              }
            />
          </div>

          <div className={`flex flex-col ${CONTENT_GAP} px-3 pb-3 pt-2`}>
            <input
              ref={titleInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Title"
              className={[
                "block w-full px-3 py-3 text-[13px] text-ink outline-none placeholder:text-muted-foreground/60",
                PANEL_FIELD,
              ].join(" ")}
            />

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={[
                  "min-w-0 flex-1 px-2.5 py-2.5 outline-none",
                  PANEL_FIELD,
                  FIELD_TEXT,
                ].join(" ")}
                aria-label="Start date"
              />
              <span className="shrink-0 text-[11px] text-muted-foreground">–</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={[
                  "min-w-0 flex-1 px-2.5 py-2.5 outline-none",
                  PANEL_FIELD,
                  FIELD_TEXT,
                ].join(" ")}
                aria-label="End date"
              />
            </div>

            <GanttColorDropdownRow
              value={color}
              onChange={(hex) => {
                setColor(hex);
                const patch = buildPatch();
                if (patch) onChange({ ...patch, color: hex });
              }}
            />

            {teamId ? (
              <GanttGroupDropdownRow
                teamId={teamId}
                initialAppGroupId={item.app_group_id ?? null}
                selectedAppGroupId={appGroupId}
                onSelectionChange={setAppGroupId}
              />
            ) : null}
          </div>

          <div className="flex items-center justify-between px-3 pb-3 pt-1 text-[11px] text-muted-foreground">
            {onDelete ? (
              <SessionDeleteButton
                repeatSession={false}
                onDelete={deleteAndClose}
                onDeleteScope={() => deleteAndClose()}
              />
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <span className="mono tabular-nums">⏎ for å lagre</span>
              <button
                type="button"
                onClick={commitAndClose}
                className="rounded-[10px] bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

function GanttColorDropdownRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const normalized = value.trim().toLowerCase();
  const options = useMemo(() => {
    const rows = STANDARD_COLORS_NAMED.map((c) => ({ hex: c.hex, name: c.name }));
    if (normalized && !rows.some((row) => row.hex.toLowerCase() === normalized)) {
      rows.unshift({ hex: value, name: "Custom" });
    }
    return rows;
  }, [normalized, value]);
  const selected =
    options.find((row) => row.hex.toLowerCase() === normalized) ?? options[0] ?? null;
  const selectedHex = selected?.hex ?? value;
  const selectedName = selected?.name ?? "Colour";

  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 z-[1] h-2 w-2 -translate-y-1/2 rounded-full"
        style={{ background: selectedHex }}
      />
      <div className={["relative min-h-[40px]", PANEL_FIELD].join(" ")}>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          aria-label="Colour"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((open) => !open);
          }}
          className={[
            "flex w-full cursor-pointer items-center bg-transparent py-2.5 pl-7 pr-8 text-left outline-none",
            FIELD_TEXT,
          ].join(" ")}
        >
          <span className="min-w-0 flex-1 truncate">{selectedName}</span>
        </button>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={2}
          aria-hidden
        />
        {menuOpen ? (
          <>
            <div
              className="fixed inset-0 z-40"
              aria-hidden
              onClick={() => setMenuOpen(false)}
            />
            <div
              role="listbox"
              aria-label="Colour"
              className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-md border border-ink/15 bg-card py-1 shadow-lg"
            >
              {options.map((row) => {
                const active = row.hex.toLowerCase() === selectedHex.toLowerCase();
                return (
                  <button
                    key={row.hex}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onChange(row.hex);
                    }}
                    className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-ink transition-colors ${
                      active ? "bg-secondary/60" : "hover:bg-secondary"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] border border-black/15"
                      style={{ background: row.hex }}
                    />
                    <span className="min-w-0 flex-1 truncate">{row.name}</span>
                    {active ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-ink" aria-hidden />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function GanttGroupDropdownRow({
  teamId,
  selectedAppGroupId = null,
  onSelectionChange,
}: {
  teamId: string;
  initialAppGroupId?: string | null;
  selectedAppGroupId?: string | null;
  onSelectionChange?: (appGroupId: string | null) => void;
}) {
  const { groups, loading } = useEntityRoster(teamId);
  const { groups: userTeams } = useUserGroups();
  const entityName = userTeams.find((t) => t.id === teamId)?.name ?? "Team";

  const options = useMemo(() => {
    const rosterGroups = groups.filter(
      (g) => g.name.trim().length > 0 && !isPlaceholderGroupName(g.name),
    );
    return [
      { id: null as string | null, label: entityName },
      ...rosterGroups.map((g) => ({ id: g.id as string | null, label: g.name })),
    ];
  }, [entityName, groups]);

  const resolvedValue = selectedAppGroupId ?? "";
  const selectedLabel = options.find((o) => (o.id ?? "") === resolvedValue)?.label ?? entityName;

  const shell = (content: ReactNode) => (
    <div className="relative">
      <div className={["relative", PANEL_FIELD].join(" ")}>
        {content}
        {options.length > 0 ? (
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={2}
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );

  if (loading) {
    return shell(
      <div className={["block w-full py-2.5 px-3 pr-8", FIELD_TEXT, "text-muted-foreground"].join(" ")}>
        …
      </div>,
    );
  }

  return shell(
    <select
      value={resolvedValue}
      onChange={(e) => {
        const next = e.target.value || null;
        onSelectionChange?.(next);
      }}
      aria-label={selectedLabel}
      className={[
        "block w-full cursor-pointer appearance-none bg-transparent px-3 py-2.5 pr-8 outline-none",
        FIELD_TEXT,
      ].join(" ")}
    >
      {options.map((option) => (
        <option key={option.id ?? "__entity__"} value={option.id ?? ""}>
          {option.label}
        </option>
      ))}
    </select>,
  );
}
