/**
 * Tiny global signal used to coordinate the sign-in exit choreography
 * between the SignInModal (on the landing home page) and the
 * GlobalTopTabBar. Lives outside React state so the topbar can react
 * to the phase even while the auth context user flips synchronously.
 *
 * Phases:
 *   idle           – default, topbar renders normally
 *   fading-out     – white landing bar fades to 0 (modal also fading/folding)
 *   hidden         – no bar visible (gap between modal gone and dark bar reveal)
 *   reveal-dark    – dark bar fades in, bg interpolates gray → black
 */
import { useEffect, useReducer } from "react";

export type AuthTransitionPhase =
  | "idle"
  | "fading-out"
  | "hidden"
  | "reveal-dark";

let _phase: AuthTransitionPhase = "idle";
const listeners = new Set<() => void>();

export function getAuthTransitionPhase(): AuthTransitionPhase {
  return _phase;
}

export function setAuthTransitionPhase(p: AuthTransitionPhase): void {
  _phase = p;
  listeners.forEach((l) => l());
}

export function useAuthTransition(): AuthTransitionPhase {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
  return _phase;
}
