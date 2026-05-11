/**
 * DiarySideNav — left rail for the Diary page.
 *
 * Mirrors CalendarSideNav (mini calendar + categories) but with a Diary-specific
 * category tree:
 *   Training (parent, like an entity tab)
 *     Endurance
 *       Running
 *       Cycling
 *       Other
 *     Strength
 *       Core
 *       Max
 *     Stretch
 *
 * Fold state and per-row visibility are persisted in localStorage.
 *
 * NOTE: only the top-level "Training" toggle currently filters underlying
 * events (via the shared `ind:training` category key). Sub-tab toggles are
 * tracked locally for UI/state continuity until events carry sub-category data.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Eye, EyeOff } from "lucide-react";
import { MiniCalendar, type DateRange } from "./MiniCalendar";
import { CAT_TRAINING_COLOR } from "./MonthGridType1";
import type { CategoryKey } from "./CalendarSideNav";

type Node = {
  id: string;
  label: string;
  color?: string;
  children?: Node[];
};

const TREE: Node = {
  id: "training",
  label: "Training",
  color: CAT_TRAINING_COLOR,
  children: [
    {
      id: "endurance",
      label: "Endurance",
      children: [
        { id: "running", label: "Running" },
        { id: "cycling", label: "Cycling" },
        { id: "other", label: "Other" },
      ],
    },
    {
      id: "strength",
      label: "Strength",
      children: [
        { id: "core", label: "Core" },
        { id: "max", label: "Max" },
      ],
    },
    { id: "stretch", label: "Stretch" },
  ],
};

const OPEN_KEY = "diary:sidenav:open";
const HIDDEN_KEY = "diary:sidenav:hidden";

function loadSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}
function saveSet(key: string, s: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(s)));
  } catch {
    /* ignore */
  }
}

export interface DiarySideNavProps {
  currentDate: Date;
  currentRange: DateRange;
  onCurrentDateChange: (date: Date, range: DateRange) => void;
  viewMode?: "day" | "week" | "month";
  visibleCategories: Set<CategoryKey>;
  onToggleCategory: (key: CategoryKey) => void;
}

export function DiarySideNav({
  currentDate,
  currentRange,
  onCurrentDateChange,
  viewMode,
  visibleCategories,
  onToggleCategory,
}: DiarySideNavProps) {
  const [open, setOpen] = useState<Set<string>>(() => {
    const s = loadSet(OPEN_KEY);
    if (s.size === 0) {
      // Default: top-level Training open on first visit.
      s.add("training");
    }
    return s;
  });
  const [hidden, setHidden] = useState<Set<string>>(() => loadSet(HIDDEN_KEY));

  useEffect(() => saveSet(OPEN_KEY, open), [open]);
  useEffect(() => saveSet(HIDDEN_KEY, hidden), [hidden]);

  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const toggleHidden = (id: string) => {
    setHidden((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    if (id === "training") onToggleCategory("ind:training");
  };

  // Keep "training" hidden state in sync with shared filter on first mount.
  useEffect(() => {
    const trainingOn = visibleCategories.has("ind:training");
    setHidden((prev) => {
      const has = prev.has("training");
      if (trainingOn && has) {
        const n = new Set(prev);
        n.delete("training");
        return n;
      }
      if (!trainingOn && !has) {
        const n = new Set(prev);
        n.add("training");
        return n;
      }
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <nav className="flex max-h-[calc(100vh-8rem)] flex-col gap-3 overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ink/15 hover:[&::-webkit-scrollbar-thumb]:bg-ink/30">
      <div>
        <MiniCalendar
          selectedRange={currentRange ?? { start: currentDate, end: currentDate }}
          onSelectRange={(r) => onCurrentDateChange(r.start, r)}
          viewMode={viewMode}
        />
      </div>

      <div className="flex flex-col gap-0.5 pb-4">
        <div className="px-3 pb-1 pt-1 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
          Categories
        </div>

        <TreeNode
          node={TREE}
          depth={0}
          open={open}
          hidden={hidden}
          onToggleOpen={toggleOpen}
          onToggleHidden={toggleHidden}
        />
      </div>
    </nav>
  );
}

function TreeNode({
  node,
  depth,
  open,
  hidden,
  onToggleOpen,
  onToggleHidden,
}: {
  node: Node;
  depth: number;
  open: Set<string>;
  hidden: Set<string>;
  onToggleOpen: (id: string) => void;
  onToggleHidden: (id: string) => void;
}) {
  const hasChildren = !!node.children?.length;
  const isOpen = open.has(node.id);
  const on = !hidden.has(node.id);

  // Top-level "training" styled like an entity header (uppercase). Deeper rows
  // styled like CategoryRow.
  const isHeader = depth === 0;

  return (
    <div className="flex flex-col">
      <div
        className={`group flex w-full items-center gap-1.5 rounded-md pr-2 ${
          isHeader
            ? "px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80 hover:bg-secondary/60"
            : "py-1 pl-2 text-xs hover:bg-secondary/60"
        } ${on ? "text-ink" : "text-muted-foreground"}`}
        style={{ marginLeft: depth > 0 ? depth * 10 : 0 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggleOpen(node.id)}
            className="grid h-4 w-4 shrink-0 place-items-center rounded hover:bg-secondary"
            aria-expanded={isOpen}
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <span className="inline-block h-4 w-4 shrink-0" />
        )}

        {!isHeader && (
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px] border border-hairline"
            style={{ background: node.color ?? "transparent", opacity: on ? 1 : 0.35 }}
          />
        )}

        <button
          type="button"
          onClick={() => onToggleHidden(node.id)}
          className="min-w-0 flex-1 truncate text-left"
        >
          {node.label}
        </button>

        <button
          type="button"
          onClick={() => onToggleHidden(node.id)}
          aria-label={on ? "Hide" : "Show"}
          className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-secondary"
        >
          {on ? (
            <Eye className="h-3 w-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100" />
          ) : (
            <EyeOff className="h-3 w-3 text-muted-foreground/70" />
          )}
        </button>
      </div>

      {hasChildren && (
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              style={{ overflow: "hidden" }}
            >
              <div className={depth === 0 ? "ml-3 border-l border-hairline pl-1" : ""}>
                {node.children!.map((child) => (
                  <TreeNode
                    key={child.id}
                    node={child}
                    depth={depth + 1}
                    open={open}
                    hidden={hidden}
                    onToggleOpen={onToggleOpen}
                    onToggleHidden={onToggleHidden}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
