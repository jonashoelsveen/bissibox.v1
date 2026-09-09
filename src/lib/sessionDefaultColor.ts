import {
  DEFAULT_SESSION_COLOR,
  STANDARD_COLORS_NAMED,
  type ColorValue,
} from "@/components/library/sessionColors";

const STORAGE_KEY = "calendar.sessionDefaultColor";

const listeners = new Set<() => void>();

function normalizeSessionColor(hex: string | null | undefined): ColorValue {
  if (!hex) return DEFAULT_SESSION_COLOR;
  const found = STANDARD_COLORS_NAMED.find(
    (c) => c.hex.toLowerCase() === hex.trim().toLowerCase(),
  );
  return found?.hex ?? DEFAULT_SESSION_COLOR;
}

function readStoredDefault(): ColorValue {
  if (typeof window === "undefined") return DEFAULT_SESSION_COLOR;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const next = normalizeSessionColor(raw);
    if (raw && next.toLowerCase() !== raw.trim().toLowerCase()) {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    return next;
  } catch {
    return DEFAULT_SESSION_COLOR;
  }
}

let currentDefault = readStoredDefault();

function emit(): void {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    currentDefault = normalizeSessionColor(event.newValue);
    emit();
  });
}

export function getSessionDefaultColor(): ColorValue {
  return currentDefault;
}

export function isSessionDefaultColor(hex: string | null | undefined): boolean {
  if (!hex) return false;
  return hex.trim().toLowerCase() === currentDefault.toLowerCase();
}

export function setSessionDefaultColor(hex: ColorValue): void {
  const next = normalizeSessionColor(hex);
  if (next.toLowerCase() === currentDefault.toLowerCase()) return;
  currentDefault = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore quota / privacy mode
  }
  emit();
}

export function subscribeSessionDefaultColor(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}
