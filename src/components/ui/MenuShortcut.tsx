import type { ReactNode } from "react";
import { Command } from "lucide-react";
import {
  displayShortcutKey,
  isApplePlatform,
  type ShortcutSpec,
} from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/**
 * Trailing shortcut glyphs for menus (Notion / Apple style): ⌘ then the key.
 * Bind the same spec with `useShortcut` so the hint always matches behavior.
 */
export function MenuShortcut({
  shortcut,
  className,
}: {
  shortcut: ShortcutSpec;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "ml-auto inline-flex items-center gap-0.5 text-muted-foreground",
        className,
      )}
      aria-hidden
    >
      {shortcutGlyphs(shortcut)}
    </span>
  );
}

function shortcutGlyphs(spec: ShortcutSpec): ReactNode {
  const apple = isApplePlatform();
  const nodes: ReactNode[] = [];
  if (spec.mod) {
    nodes.push(
      apple ? (
        <Command key="mod" className="h-3 w-3" strokeWidth={2} aria-hidden />
      ) : (
        <span key="mod" className="text-[11px] font-medium leading-none">
          Ctrl
        </span>
      ),
    );
  }
  if (spec.alt) {
    nodes.push(
      <span key="alt" className="text-[11px] font-medium leading-none">
        {apple ? "⌥" : "Alt"}
      </span>,
    );
  }
  if (spec.shift) {
    nodes.push(
      <span key="shift" className="text-[11px] font-medium leading-none">
        {apple ? "⇧" : "Shift"}
      </span>,
    );
  }
  nodes.push(
    <span key="key" className="text-[11px] font-medium leading-none">
      {displayShortcutKey(spec.key)}
    </span>,
  );
  return nodes;
}
