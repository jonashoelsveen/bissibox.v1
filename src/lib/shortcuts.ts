/**
 * App-wide keyboard shortcuts.
 *
 * Add a named spec here, render it with `MenuShortcut`, and bind it with
 * `useShortcut`. Mac shows ⌘; other platforms show Ctrl.
 */

export type ShortcutSpec = {
  /** Letter, digit, or named key (`"v"`, `"Enter"`). */
  key: string;
  /** Extra keys that trigger the same action (e.g. Backspace for Delete). */
  aliases?: readonly string[];
  /** ⌘ on Apple, Ctrl elsewhere. */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
};

export const SHORTCUTS = {
  pasteSession: { key: "v", mod: true },
  copySession: { key: "c", mod: true },
  duplicateSession: { key: "d", mod: true },
  deleteSession: { key: "Delete", aliases: ["Backspace"] },
} as const satisfies Record<string, ShortcutSpec>;

export type ShortcutName = keyof typeof SHORTCUTS;

export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return true;
  const platform = navigator.platform ?? "";
  const ua = navigator.userAgent ?? "";
  return /Mac|iPhone|iPod|iPad/.test(platform) || /Mac OS X/.test(ua);
}

export function shortcutSpec(name: ShortcutName): ShortcutSpec {
  return SHORTCUTS[name];
}

export function matchesShortcut(event: KeyboardEvent, spec: ShortcutSpec): boolean {
  if (event.repeat) return false;
  const pressed = event.key.toLowerCase();
  const keys = [spec.key, ...(spec.aliases ?? [])].map((k) => k.toLowerCase());
  if (!keys.includes(pressed)) return false;

  const apple = isApplePlatform();
  const modPressed = apple ? event.metaKey : event.ctrlKey;
  if (!!spec.mod !== modPressed) return false;
  if (apple && spec.mod && event.ctrlKey) return false;
  if (!apple && spec.mod && event.metaKey) return false;
  if (!!spec.shift !== event.shiftKey) return false;
  if (!!spec.alt !== event.altKey) return false;
  return true;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"),
  );
}

export function shortcutAriaLabel(spec: ShortcutSpec): string {
  const apple = isApplePlatform();
  const parts: string[] = [];
  if (spec.mod) parts.push(apple ? "Command" : "Control");
  if (spec.alt) parts.push(apple ? "Option" : "Alt");
  if (spec.shift) parts.push("Shift");
  parts.push(displayShortcutKey(spec.key));
  return parts.join(" ");
}

export function shortcutAriaKeyshortcuts(spec: ShortcutSpec): string {
  const parts: string[] = [];
  if (spec.mod) parts.push(isApplePlatform() ? "Meta" : "Control");
  if (spec.alt) parts.push("Alt");
  if (spec.shift) parts.push("Shift");
  parts.push(displayShortcutKey(spec.key));
  return parts.join("+");
}

export function displayShortcutKey(key: string): string {
  if (key.length === 1) return key.toUpperCase();
  return key;
}
