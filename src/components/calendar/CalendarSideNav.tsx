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

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Eye, EyeOff } from "lucide-react";
import { MiniCalendar, type DateRange } from "./MiniCalendar";
import {
  INDIVIDUAL_CATEGORIES,
  CAT_TRAINING_COLOR,
  CAT_SCHOOL_COLOR,
  CAT_WORK_COLOR,
} from "./MonthGridType1";
import { MeCategorySection } from "./MeCategorySection";
import { SideNavNameHeader } from "./SideNavNameHeader";
import { useUserCategories } from "@/hooks/useUserCategories";

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
type MeCatKey = `me:${string}`;
export type CategoryKey = IndCatKey | AdminCatKey | MeCatKey;

/** Map an event color to a stable category key (used for filtering). */
export function categoryKeyFromColor(color: string | null | undefined): CategoryKey {
  const c = (color ?? "").toLowerCase();
  if (c === CAT_MEETING.toLowerCase()) return "admin:meeting";
  if (c === CAT_EVENT.toLowerCase()) return "admin:event";
  if (c === CAT_RACE.toLowerCase()) return "admin:race";
  return `me:${c}` as MeCatKey;
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
  /** Active view mode — drives whole-week highlighting in mini calendar. */
  viewMode?: "day" | "week" | "month";
  /** Visible category keys (toggle set) */
  visibleCategories: Set<CategoryKey>;
  onToggleCategory: (key: CategoryKey) => void;
  /** Profile context */
  seat: "individual" | "admin";
  /** Optional entity list shown as collapsible groups (individual seat). */
  entities?: SideNavEntity[];
  /** Active team id (admin seat only). Scopes the team's categories. */
  teamId?: string | null;
  /** Active team name (admin seat only). Used as the section header. */
  teamName?: string;
  /** Display name shown above the mini-calendar. "Me" for individual, entity name for admin. */
  displayName?: string;
}

export function CalendarSideNav({
  currentDate,
  currentRange,
  onCurrentDateChange,
  viewMode,
  visibleCategories,
  onToggleCategory,
  seat,
  entities = [],
  teamId = null,
  teamName,
  displayName,
}: CalendarSideNavProps) {
  const name = displayName ?? (seat === "admin" ? teamName ?? "Team" : "Me");

  return (
    <nav className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="shrink-0 pr-1.5">
        <MiniCalendar
          selectedRange={currentRange ?? { start: currentDate, end: currentDate }}
          onSelectRange={(r) => onCurrentDateChange(r.start, r)}
          viewMode={viewMode}
        />
      </div>


      {/* Category filters — scrollable */}
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-6 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ink/15 hover:[&::-webkit-scrollbar-thumb]:bg-ink/30">
        {seat === "admin" ? (
          <TeamCategorySectionAdapter
            teamId={teamId}
            title={teamName ?? "Categories"}
            onToggleCategory={onToggleCategory}
          />
        ) : (
          <>
            <MeCategorySectionAdapter onToggleCategory={onToggleCategory} />

            {entities.map((e) => (
              <EntityGroup
                key={e.id}
                entity={e}
                visibleCategories={visibleCategories}
                onToggleCategory={onToggleCategory}
              />
            ))}
          </>
        )}
      </div>
    </nav>
  );
}

/** Same as MeCategorySectionAdapter but scoped to a team. */
function TeamCategorySectionAdapter({
  teamId,
  title,
  onToggleCategory,
}: {
  teamId: string | null;
  title: string;
  onToggleCategory: (k: CategoryKey) => void;
}) {
  const { categories, update } = useUserCategories({ teamId });
  const hidden = new Set<string>();
  for (const c of categories) if (c.hidden) hidden.add(c.id);
  const handleToggleHidden = (id: string) => {
    const c = categories.find((x) => x.id === id);
    if (!c) return;
    onToggleCategory(`me:${c.color.toLowerCase()}` as CategoryKey);
    void update(c.id, { hidden: !c.hidden });
  };
  return (
    <MeCategorySection
      hidden={hidden}
      onToggleHidden={handleToggleHidden}
      teamId={teamId}
      title={title}
    />
  );
}

/** Reads category visibility from DB and writes the `hidden` flag back so the
 * grid filter (driven by visibleCategories in CalendarPage's effect) updates
 * via realtime. */
function MeCategorySectionAdapter({
  onToggleCategory,
}: {
  onToggleCategory: (k: CategoryKey) => void;
}) {
  const { categories, update } = useUserCategories();
  const hidden = new Set<string>();
  for (const c of categories) if (c.hidden) hidden.add(c.id);
  const handleToggleHidden = (id: string) => {
    const c = categories.find((x) => x.id === id);
    if (!c) return;
    onToggleCategory(`me:${c.color.toLowerCase()}` as CategoryKey);
    void update(c.id, { hidden: !c.hidden });
  };
  return <MeCategorySection hidden={hidden} onToggleHidden={handleToggleHidden} showCoachAccess />;
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
        className="inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] border border-hairline"
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
  visibleCategories,
  onToggleCategory,
}: {
  entity: SideNavEntity;
  visibleCategories: Set<CategoryKey>;
  onToggleCategory: (k: CategoryKey) => void;
}) {
  const storageKey = `calendar:sidenav:entityOpen:${entity.id}`;
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open, storageKey]);
  const items = useMemo(() => ADMIN_SIDENAV_CATEGORIES, []);
  return (
    <div className="flex flex-col">
      <div className="group flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-sm transition hover:bg-secondary/60">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Collapse" : "Expand"}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-ink"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          />
          <span className="min-w-0 flex-1 truncate font-medium">{entity.name}</span>
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
            <div className="mt-0.5 flex flex-col gap-0.5">
              {items.map((c) => {
                const on = visibleCategories.has(c.key);
                return (
                  <CategoryRow
                    key={`${entity.id}:${c.key}`}
                    label={c.label}
                    color={c.color}
                    on={on}
                    onClick={() => onToggleCategory(c.key)}
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
