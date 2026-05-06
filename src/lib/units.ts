/**
 * User preference for distance units.
 * Stored in localStorage, app-wide. Internal data stays in km.
 */
import { useEffect, useState, useCallback } from "react";

export type DistanceUnit = "km" | "mi";

const KEY = "user:distance-unit";
const EVENT = "user-units:change";

export function readUnit(): DistanceUnit {
  if (typeof window === "undefined") return "km";
  try {
    const raw = localStorage.getItem(KEY);
    return raw === "mi" ? "mi" : "km";
  } catch {
    return "km";
  }
}

export function writeUnit(u: DistanceUnit): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, u);
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore */
  }
}

export function useDistanceUnit(): [DistanceUnit, (u: DistanceUnit) => void] {
  const [unit, setUnit] = useState<DistanceUnit>(() => readUnit());
  useEffect(() => {
    const onChange = () => setUnit(readUnit());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setUnit(readUnit());
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const set = useCallback((u: DistanceUnit) => {
    writeUnit(u);
    setUnit(u);
  }, []);
  return [unit, set];
}

const KM_PER_MI = 1.609344;

export function kmToUnit(km: number, unit: DistanceUnit): number {
  return unit === "mi" ? km / KM_PER_MI : km;
}

export function unitLabel(unit: DistanceUnit): string {
  return unit === "mi" ? "mi" : "km";
}

/** Format a km value into the user's preferred unit, e.g. "8.9 km" or "5.5 mi". */
export function formatDistance(km: number | null | undefined, unit: DistanceUnit, digits = 1): string {
  if (km == null || Number.isNaN(km)) return "—";
  return `${kmToUnit(km, unit).toFixed(digits)} ${unitLabel(unit)}`;
}
