import { redirect } from "@tanstack/react-router";
import type { FeatureFlag } from "@/lib/features";
import { isEntityFeatureEnabled, isFeatureEnabled } from "@/lib/features";

/** Redirect when an entity sub-flag is off for this client (beta snapshot included). */
export function entityFeatureRouteGuard(flag: FeatureFlag, to: "/calendar" | "/me" | "/") {
  if (isFeatureEnabled(flag)) return;
  if (typeof window === "undefined") return;
  /** Entity route — Bucket A/B: client redirect when the matching sub-flag is off. */
  if (isEntityFeatureEnabled(flag)) return;
  throw redirect({ to });
}
