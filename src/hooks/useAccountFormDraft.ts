import { useCallback, useEffect, useMemo, useState } from "react";

function isDraftDirty<T extends Record<string, unknown>>(saved: T, draft: T) {
  return (Object.keys(saved) as Array<keyof T>).some((key) => saved[key] !== draft[key]);
}

/**
 * Local draft for account tab forms.
 * `values` is available synchronously from `saved` — no extra render cycle.
 */
export function useAccountFormDraft<T extends Record<string, unknown>>(saved: T | null) {
  const [draft, setDraft] = useState<T | null>(null);
  const savedKey = useMemo(
    () => (saved ? JSON.stringify(saved) : null),
    [saved],
  );

  useEffect(() => {
    setDraft(null);
  }, [savedKey]);

  const values = (draft ?? saved) as T | null;

  const isDirty =
    saved != null && values != null && isDraftDirty(saved, values);

  const cancel = useCallback(() => {
    setDraft(null);
  }, []);

  const patch = useCallback(
    (partial: Partial<T>) => {
      setDraft((prev) => {
        const base = prev ?? saved;
        if (!base) return prev;
        return { ...base, ...partial };
      });
    },
    [saved],
  );

  return { values, isDirty, cancel, patch };
}
