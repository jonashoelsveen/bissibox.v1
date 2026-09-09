import { useEffect, useRef } from "react";
import {
  isEditableTarget,
  matchesShortcut,
  shortcutSpec,
  type ShortcutName,
} from "@/lib/shortcuts";

/**
 * Runs `handler` when a named shortcut is pressed, unless focus is in a
 * text field. `preventDefault` is called so the browser does not also act.
 */
export function useShortcut(
  name: ShortcutName,
  handler: (event: KeyboardEvent) => void,
  options?: { enabled?: boolean; capture?: boolean },
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const enabled = options?.enabled ?? true;
  const capture = options?.capture ?? false;
  const spec = shortcutSpec(name);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (!matchesShortcut(event, spec)) return;
      event.preventDefault();
      handlerRef.current(event);
    };
    window.addEventListener("keydown", onKey, capture);
    return () => window.removeEventListener("keydown", onKey, capture);
  }, [spec, enabled, capture]);
}
