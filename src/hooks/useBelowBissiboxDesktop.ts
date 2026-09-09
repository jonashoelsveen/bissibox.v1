import { useEffect, useState } from "react";
import { BISSIBOX_DESKTOP_MIN_PX } from "@/lib/cloud-landing-design";

/** True when the viewport is below the Bissibox desktop minimum (640px). */
export function useBelowBissiboxDesktop() {
  const [below, setBelow] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < BISSIBOX_DESKTOP_MIN_PX,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${BISSIBOX_DESKTOP_MIN_PX - 1}px)`);
    const onChange = () => setBelow(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return below;
}
