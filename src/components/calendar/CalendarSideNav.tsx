/**
 * CalendarSideNav — left rail for the Calendar page.
 *
 * Replaces the old folders / Previous list. Now contains:
 *   1. A persistent MiniCalendar at the top (drives `currentDate`).
 *   2. Below it, category filter rows (Notion-style) the user toggles to
 *      show/hide events of that category.
 *      - Individual seat: the 4 individual session categories.
 *      - When the user is also a member of one or more entities, each
 *        entity is rendered as a collapsible group with the admin
 *        (entity) category sub-tabs.
 *      - Team / organizer seat: the entity's admin category list.
 */

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Eye, EyeOff } from "lucide-react";
import { MiniCalendar, type DateRange } from "./MiniCalendar";
import {
  INDIVIDUAL_CATEGORIES,
  CAT_TRAINING_COLOR,
  CAT_SCHOOL_COLOR,
  CAT_WORK_COLOR,
} from "./MonthGridType1";

/* ---------- Category keys & colors ---------- */

const CAT_MEETING = "#E63337";
const CAT_EVENT = "#F09B0A";
const CAT_RACE = "#26B270";

export const ADMIN_SIDENAV_CATEGORIES: { key: AdminCatKey; label: string; color: string }[] = [
  { key: "admin:meeting", label: "Møte", color: CAT_MEETING },
  { key: "admin:event", label: "Event", color: CAT_EVENT },
  { key: "admin:race", label: "Løp", color: CAT_RACE },
];

export const INDIVIDUAL_SIDENAV_CATEGORIES = INDIVIDUAL_CATEGORIES.map((c) => ({
  key: `ind:${c.value}` as IndCatKey,
  label: c.label,
  color: c.color,
  Icon: c.Icon,
}));

type IndCatKey = `ind:${"training" | "school" | "work" | "else"}`;
type AdminCatKey = `admin:${"meeting" | "event" | "race"}`;
export type CategoryKey = IndCatKey | AdminCatKey;

/** Map an event color to a stable category key (used for filtering). */
export function categoryKeyFromColor(color: string | null | undefined): CategoryKey {
  const c = (color ?? "").toLowerCase();
  if (c === CAT_MEETING.toLowerCase()) return "admin:meeting";
  if (c === CAT_EVENT.toLowerCase()) return "admin:event";
  if (c === CAT_RACE.toLowerCase()) return "admin:race";
  if (c === CAT_TRAINING_COLOR.toLowerCase()) return "ind:training";
  if (c === CAT_SCHOOL_COLOR.toLowerCase()) return "ind:school";
  if (c === CAT_WORK_COLOR.toLowerCase()) return "ind:work";
  return "ind:else";
}

export interface SideNavEntity {
  id: string;
  name: string;
}

export interface CalendarSideNavProps {
  /** Mini-calendar selection */
  currentDate: Date;
  currentRange: DateRange;
  onCurrentDateChange: (date: Date, range: DateRange) => void;
  /** Visible category keys (toggle set) */
  visibleCategories: Set<CategoryKey>;
  onToggleCategory: (key: CategoryKey) => void;
  /** Profile context */
  seat: "individual" | "admin";
  /** Optional entity list shown as collapsible groups (individual seat). */
  entities?: SideNavEntity[];
}

export function CalendarSideNav({
  currentDate,
  currentRange,
  onCurrentDateChange,
  visibleCategories,
  onToggleCategory,
  seat,
  entities = [],
}: CalendarSideNavProps) {
  // Per-entity visibility state (independent across entities).
  const [entityHidden, setEntityHidden] = useState<Record<string, Set<AdminCatKey>>>({});
  const [entityAllHidden, setEntityAllHidden] = useState<Set<string>>(new Set());

  const toggleEntityCat = (eid: string, k: AdminCatKey) => {
    setEntityHidden((prev) => {
      const cur = new Set(prev[eid] ?? []);
      if (cur.has(k)) cur.delete(k);
      else cur.add(k);
      return { ...prev, [eid]: cur };
    });
    setEntityAllHidden((prev) => {
      if (!prev.has(eid)) return prev;
      const next = new Set(prev);
      next.delete(eid);
      return next;
    });
  };
  const toggleEntityAll = (eid: string) =>
    setEntityAllHidden((prev) => {
      const next = new Set(prev);
      if (next.has(eid)) next.delete(eid);
      else next.add(eid);
      return next;
    });

  return (
    <nav className="flex max-h-[calc(100vh-8rem)] flex-col gap-3 overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ink/15 hover:[&::-webkit-scrollbar-thumb]:bg-ink/30">
      {/* Mini-calendar pinned to the top of the rail */}
      <div className="rounded-lg border border-hairline bg-card">
        <MiniCalendar
          selectedRange={currentRange ?? { start: currentDate, end: currentDate }}
          onSelectRange={(r) => onCurrentDateChange(r.start, r)}
        />
      </div>

      {/* Category filters */}
      <div className="flex flex-col gap-0.5 pb-4">
        <div className="px-3 pb-1 pt-1 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
          Kategorier
        </div>

        {seat === "admin" ? (
          <CategoryList
            items={ADMIN_SIDENAV_CATEGORIES.map((c) => ({
              key: c.key,
              label: c.label,
              color: c.color,
            }))}
            visible={visibleCategories}
            onToggle={onToggleCategory}
          />
        ) : (
          <>
            <CategoryList
              items={INDIVIDUAL_SIDENAV_CATEGORIES.map((c) => ({
                key: c.key,
                label: c.label,
                color: c.color,
              }))}
              visible={visibleCategories}
              onToggle={onToggleCategory}
            />

            {entities.map((e) => (
              <EntityGroup
                key={e.id}
                entity={e}
                allHidden={entityAllHidden.has(e.id)}
                hiddenCats={entityHidden[e.id] ?? new Set()}
                onToggleAll={() => toggleEntityAll(e.id)}
                onToggleCat={(k) => toggleEntityCat(e.id, k)}
              />
            ))}
          </>
        )}
      </div>
    </nav>
  );
}

/* ---------- Pieces ---------- */

function CategoryList({
  items,
  visible,
  onToggle,
}: {
  items: { key: CategoryKey; label: string; color: string | null }[];
  visible: Set<CategoryKey>;
  onToggle: (k: CategoryKey) => void;
}) {
  return (
    <div className="flex flex-col">
      {items.map((c) => (
        <CategoryRow
          key={c.key}
          label={c.label}
          color={c.color}
          on={visible.has(c.key)}
          onClick={() => onToggle(c.key)}
        />
      ))}
    </div>
  );
}

function CategoryRow({
  label,
  color,
  on,
  onClick,
  indent,
}: {
  label: string;
  color: string | null;
  on: boolean;
  onClick: () => void;
  indent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs transition hover:bg-secondary/60 ${
        indent ? "ml-3" : ""
      } ${on ? "text-ink" : "text-muted-foreground"}`}
    >
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px] border border-hairline"
        style={{ background: color ?? "transparent", opacity: on ? 1 : 0.35 }}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {on ? (
        <Eye className="h-3 w-3 shrink-0 text-muted-foreground/50 opacity-0 group-hover:opacity-100" />
      ) : (
        <EyeOff className="h-3 w-3 shrink-0 text-muted-foreground/70" />
      )}
    </button>
  );
}

function EntityGroup({
  entity,
  allHidden,
  hiddenCats,
  onToggleAll,
  onToggleCat,
}: {
  entity: SideNavEntity;
  allHidden: boolean;
  hiddenCats: Set<AdminCatKey>;
  onToggleAll: () => void;
  onToggleCat: (k: AdminCatKey) => void;
}) {
  const [open, setOpen] = useState(true);
  const items = useMemo(() => ADMIN_SIDENAV_CATEGORIES, []);
  return (
    <div className="mt-1 flex flex-col">
      <div className="group flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80 hover:bg-secondary/60">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-1.5"
          aria-expanded={open}
        >
          <ChevronRight
            className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          />
          <span className="min-w-0 flex-1 truncate text-left">{entity.name}</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleAll();
          }}
          aria-label={allHidden ? "Vis alle" : "Skjul alle"}
          className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-secondary"
        >
          {allHidden ? (
            <EyeOff className="h-3 w-3 text-muted-foreground/70" />
          ) : (
            <Eye className="h-3 w-3 text-muted-foreground/60" />
          )}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="ml-3 border-l border-hairline pl-1">
              {items.map((c) => {
                const on = !allHidden && !hiddenCats.has(c.key);
                return (
                  <CategoryRow
                    key={`${entity.id}:${c.key}`}
                    label={c.label}
                    color={c.color}
                    on={on}
                    onClick={() => onToggleCat(c.key)}
                  />
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
    </div>
  );
}
