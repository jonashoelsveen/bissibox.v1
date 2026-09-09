export const OTP_EXHAUSTED_CODE = "otp_exhausted";

export type OtpVerifyFailurePayload = {
  error?: string;
  code?: string;
  remaining?: number;
};

export type OtpVerifyFailure = {
  expired: boolean;
  remaining: number | null;
  message: string;
};

function parseRemainingFromMessage(error: string | undefined): number | null {
  if (!error) return null;
  const m = error.match(/(\d+)\s+attempts?\s+left/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function formatOtpAttemptsLeft(remaining: number): string {
  return `Wrong code. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`;
}

export function otpVerifyFailureFromPayload(
  data: OtpVerifyFailurePayload,
): OtpVerifyFailure {
  const remaining =
    typeof data.remaining === "number" && Number.isFinite(data.remaining)
      ? Math.max(0, data.remaining)
      : parseRemainingFromMessage(data.error);
  const expired =
    data.code === OTP_EXHAUSTED_CODE ||
    remaining === 0 ||
    /too many attempts/i.test(data.error ?? "") ||
    /verification code expired/i.test(data.error ?? "");
  if (expired) {
    return { expired: true, remaining: 0, message: "" };
  }
  const message =
    remaining != null
      ? formatOtpAttemptsLeft(remaining)
      : (data.error ?? "Verification failed");
  return { expired: false, remaining, message };
}

export function focusOtpBox(
  inputs: Array<HTMLInputElement | null | undefined>,
  index: number,
) {
  const el = inputs[index];
  if (!el || el.disabled) return;
  el.focus({ preventScroll: true });
  if (typeof document === "undefined") return;
  document.querySelectorAll(".account-field.is-focused").forEach((node) => {
    if (node !== el) node.classList.remove("is-focused");
  });
  el.classList.add("is-focused");
}

export function focusOtpFirstBox(
  inputs: Array<HTMLInputElement | null | undefined>,
) {
  focusOtpBox(inputs, 0);
}

function emptyOtpDigits(): string[] {
  return ["", "", "", "", "", ""];
}

/**
 * Shared 6-box OTP typing. Signup, email, password, and delete account all
 * use this so a new try always starts at box 1 — including when focus is
 * still on the last box after a filled (or just-cleared) code.
 */
export function applyOtpBoxInput({
  index,
  value,
  digits,
}: {
  index: number;
  value: string;
  digits: readonly string[];
}): { digits: string[]; focusIndex: number; complete: boolean } {
  const clean = value.replace(/\D/g, "");
  const finish = (next: string[], focusIndex: number) => ({
    digits: next,
    focusIndex,
    complete: next.every((d) => d),
  });

  if (!clean) {
    const next = [...digits];
    next[index] = "";
    return finish(next, index);
  }

  const prev = digits[index] ?? "";
  const leadingEmpty = index > 0 && digits.slice(0, index).every((d) => !d);
  const allFilled = digits.every((d) => d);
  const appended =
    prev.length === 1 && clean.startsWith(prev) && clean.length > prev.length;

  // Extra keystrokes after the last box is filled start a new try.
  if (appended && (allFilled || index === 5)) {
    const extra = clean.slice(prev.length).slice(0, 6);
    const next = emptyOtpDigits();
    extra.split("").forEach((c, idx) => {
      next[idx] = c;
    });
    return finish(next, Math.min(extra.length, 5));
  }

  // Focus was left on a later empty box (typical after a failed try). Treat
  // incoming digits as starting at box 1, same as signup.
  if (leadingEmpty) {
    const chars = clean.slice(0, 6).split("");
    const next = emptyOtpDigits();
    chars.forEach((c, idx) => {
      next[idx] = c;
    });
    return finish(next, Math.min(chars.length, 5));
  }

  if (clean.length > 1) {
    const chars = clean.slice(0, 6).split("");
    const next = emptyOtpDigits();
    chars.forEach((c, idx) => {
      next[idx] = c;
    });
    return finish(next, Math.min(Math.max(chars.length - 1, 0), 5));
  }

  const next = [...digits];
  next[index] = clean[0];
  return finish(next, index < 5 ? index + 1 : index);
}
