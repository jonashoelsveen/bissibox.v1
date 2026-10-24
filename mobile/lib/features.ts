/**
 * Feature gating for paid plans.
 *
 * Today: all users can access Team features (grandfathered).
 * Later: flip GRANDFATHER_ALL_USERS or query user_plans + Stripe.
 */

export type PlanTier = "free" | "team";

/** Temporary — set false when Stripe is live */
const GRANDFATHER_ALL_USERS = true;

export function canAccessTeamPlan(_plan: PlanTier | null | undefined): boolean {
  if (GRANDFATHER_ALL_USERS) return true;
  return _plan === "team";
}

/** Placeholder URL for Stripe checkout — replace when billing is wired */
export const TEAM_CHECKOUT_URL = "https://bissibox.com/upgrade/team";

/** Placeholder URL for plan management — replace when billing is wired */
export const CHANGE_PLAN_URL = "https://bissibox.com/upgrade/team";
