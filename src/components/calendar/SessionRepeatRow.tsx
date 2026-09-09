import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import {
  repeatLabel,
  repeatOptionsForSessionDate,
  SESSION_REPEAT_LABELS,
  SESSION_REPEAT_OFF_LABEL,
  type SessionRepeatRule,
} from "@/lib/sessionRepeat";
import {
  estimateSessionSideMenuHeight,
  SESSION_SIDE_MENU_ITEM_CLASS,
  SessionSideListbox,
} from "./SessionSideListbox";
import { sessionPopoverFieldClass } from "./sessionPopoverField";

const POPOVER_ACTIVITY_TEXT = "text-[12px] text-ink";

export function SessionRepeatRow({
  sessionDate,
  enabled,
  rule,
  readOnly = false,
  onToggle,
  onRuleChange,
  sessionCardRef,
  clusterRef,
  rightOccupied = false,
}: {
  sessionDate: Date;
  enabled: boolean;
  rule: SessionRepeatRule;
  readOnly?: boolean;
  onToggle: (next: boolean) => void;
  onRuleChange: (rule: SessionRepeatRule) => void;
  sessionCardRef: RefObject<HTMLDivElement | null>;
  clusterRef: RefObject<HTMLDivElement | null>;
  rightOccupied?: boolean;
}) {
  const options = useMemo(() => repeatOptionsForSessionDate(sessionDate), [sessionDate]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSide, setMenuSide] = useState<"left" | "right" | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const Chevron = menuOpen && menuSide === "left" ? ChevronLeft : ChevronRight;
  const tabLabel = enabled ? repeatLabel(rule) : SESSION_REPEAT_OFF_LABEL;

  const repeatFieldShell = (content: ReactNode) => (
    <div ref={fieldRef} className="relative">
      <div
        className={[
          "relative flex min-h-[40px] items-center",
          sessionPopoverFieldClass(menuOpen && !readOnly),
        ].join(" ")}
      >
        {content}
        {!readOnly ? (
          <Chevron
            className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={2}
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );

  if (readOnly) {
    return repeatFieldShell(
      <div
        className={[
          "flex min-h-[40px] w-full items-center py-0 pl-3 pr-3",
          POPOVER_ACTIVITY_TEXT,
        ].join(" ")}
      >
        <span
          className={[
            "min-w-0 flex-1 truncate leading-none",
            enabled ? "" : "text-muted-foreground/60",
          ].join(" ")}
        >
          {tabLabel}
        </span>
      </div>,
    );
  }

  return (
    <>
      {repeatFieldShell(
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          aria-label="Repeat"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className={[
            "flex min-h-[40px] w-full cursor-default items-center bg-transparent py-0 pl-3 pr-8 text-left outline-none",
            POPOVER_ACTIVITY_TEXT,
          ].join(" ")}
        >
          <span
            className={[
              "min-w-0 flex-1 truncate leading-none",
              enabled ? "" : "text-muted-foreground/60",
            ].join(" ")}
          >
            {tabLabel}
          </span>
        </button>,
      )}
      <SessionSideListbox
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        fieldRef={fieldRef}
        sessionCardRef={sessionCardRef}
        clusterRef={clusterRef}
        rightOccupied={rightOccupied}
        estimatedHeight={estimateSessionSideMenuHeight(options.length + 1)}
        onSideChange={setMenuSide}
      >
        <button
          type="button"
          role="option"
          aria-selected={!enabled}
          onClick={(e) => {
            e.stopPropagation();
            if (enabled) onToggle(false);
            setMenuOpen(false);
          }}
          className={SESSION_SIDE_MENU_ITEM_CLASS}
        >
          <span className="min-w-0 flex-1 truncate">{SESSION_REPEAT_OFF_LABEL}</span>
          {!enabled ? <Check className="h-3.5 w-3.5 shrink-0 text-white" /> : null}
        </button>
        {options.map((option) => {
          const active = enabled && option === rule;
          return (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={active}
              onClick={(e) => {
                e.stopPropagation();
                onRuleChange(option);
                setMenuOpen(false);
              }}
              className={SESSION_SIDE_MENU_ITEM_CLASS}
            >
              <span className="min-w-0 flex-1 truncate">{SESSION_REPEAT_LABELS[option]}</span>
              {active ? <Check className="h-3.5 w-3.5 shrink-0 text-white" /> : null}
            </button>
          );
        })}
      </SessionSideListbox>
    </>
  );
}
