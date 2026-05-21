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
const phaseListeners = new Set<() => void>();

export function getAuthTransitionPhase(): AuthTransitionPhase {
  return _phase;
}

export function setAuthTransitionPhase(p: AuthTransitionPhase): void {
  _phase = p;
  phaseListeners.forEach((l) => l());
}

export function useAuthTransition(): AuthTransitionPhase {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    phaseListeners.add(force);
    return () => {
      phaseListeners.delete(force);
    };
  }, []);
  return _phase;
}

// Separate signal for whether the sign-in modal is currently open.
// The top tab-bar uses this to recede behind the modal backdrop.
let _modalOpen = false;
const modalListeners = new Set<() => void>();

export function setSignInModalOpen(v: boolean): void {
  _modalOpen = v;
  modalListeners.forEach((l) => l());
}

export function useSignInModalOpen(): boolean {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    modalListeners.add(force);
    return () => {
      modalListeners.delete(force);
    };
  }, []);
  return _modalOpen;
}
