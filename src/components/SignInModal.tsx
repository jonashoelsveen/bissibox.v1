import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";

import {
  setAuthTransitionPhase,
  setSignInModalOpen,
} from "@/lib/auth-transition";
import { formatBirthIso } from "@/lib/birth-date";
import { COUNTRIES } from "@/lib/countries";
import { SIGN_IN_BUTTON_BORDER_RADIUS } from "@/lib/cloud-landing-design";
import { isEntityFeatureEnabled } from "@/lib/features";
import { otpVerifyFailureFromPayload, focusOtpFirstBox, applyOtpBoxInput, focusOtpBox } from "@/lib/otpAttempts";
import { VerificationCodeExpiredPanel } from "@/components/account/VerificationCodeExpiredPanel";

const HELVETICA =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

export type SignInContext = "cloud" | "calendar" | "entity" | "account";

type Mode = "signin" | "signup" | "otp";

function headerFor(ctx: SignInContext) {
  switch (ctx) {
    case "calendar":
      return "Welcome to Aponna Cloud Calendar";
    case "entity":
      return "Sign in before creating Aponna-entity";
    case "account":
      return "Welcome to your Bissibox-account";
    default:
      return "Welcome to Bissibox";
  }
}

export function SignInModal({
  open,
  onClose,
  context = "cloud",
}: {
  open: boolean;
  onClose: () => void;
  context?: SignInContext;
}) {
  const { signIn, signUp, activateSession } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [fieldsReady, setFieldsReady] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);

  // shared
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // signup-only
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [country, setCountry] = useState("");
  const [bDay, setBDay] = useState("");
  const [bMonth, setBMonth] = useState("");
  const [bYear, setBYear] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // OTP signup step
  const [otpEmail, setOtpEmail] = useState("");
  const [otpAttemptId, setOtpAttemptId] = useState<string | null>(null);
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [otpResendIn, setOtpResendIn] = useState(0);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpExpired, setOtpExpired] = useState(false);
  const otpInputsRef = useRef<Array<HTMLInputElement | null>>([]);
  // Pending session tokens — held in memory between signup response and
  // successful OTP verification. The Supabase client session is NOT set
  // until verifySignupOtp() succeeds, so the user cannot reach
  // authenticated UI by refreshing or navigating away.
  const [pendingAccessToken, setPendingAccessToken] = useState<string | null>(null);
  const [pendingRefreshToken, setPendingRefreshToken] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    setSignInModalOpen(open);
    if (!open) {
      // Modal was closed (either by the user, or by the parent once auth
      // succeeded). Always snap the auth-transition phase back to "idle"
      // so the global top tab-bar is guaranteed to render at full opacity
      // on the destination route. Without this, the choreography can get
      // stuck at "reveal-dark" / "hidden" (because t4 was cleared by the
      // cleanup below) and the top bar disappears after navigating into
      // an app from the Apps menu.
      setAuthTransitionPhase("idle");
      setEmail("");
      setPassword("");
      setFirstName("");
      setLastName("");
      setCountry("");
      setBDay("");
      setBMonth("");
      setBYear("");
      setConfirmPassword("");
      setError(null);
      setSubmitting(false);
      setSwitchingMode(false);
      setMode("signin");
      setOtpEmail("");
      setOtpAttemptId(null);
      setOtpDigits(["", "", "", "", "", ""]);
      setOtpResendIn(0);
      setOtpSending(false);
      setOtpVerifying(false);
      setOtpError(null);
      setPendingAccessToken(null);
      setPendingRefreshToken(null);
      setPendingUserId(null);
      return;
    }
    setFieldsReady(false);
    setExiting(false);
    setError(null);
    setMode("signin");
    const t = setTimeout(() => setFieldsReady(true), 1500);
    timers.current.push(t);
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      setSignInModalOpen(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      setSignInModalOpen(false);
      setAuthTransitionPhase("idle");
    },
    [],
  );

  const switchMode = (next: Mode) => {
    if (switchingMode || mode === next) return;
    setError(null);
    setSwitchingMode(true);
    const t = setTimeout(() => {
      setMode(next);
      setSwitchingMode(false);
    }, 650);
    timers.current.push(t);
  };

  const choreographExit = () => {
    const t1 = setTimeout(() => {
      setExiting(true);
      setAuthTransitionPhase("fading-out");
    }, 200);
    const t2 = setTimeout(() => {
      setAuthTransitionPhase("hidden");
    }, 1200);
    const t3 = setTimeout(() => {
      setAuthTransitionPhase("reveal-dark");
      onClose();
    }, 2100);
    const t4 = setTimeout(() => {
      setAuthTransitionPhase("idle");
    }, 2600);
    timers.current.push(t1, t2, t3, t4);
  };

  const sendSignupOtp = async (destEmail: string, userId: string, accessToken: string) => {
    setOtpSending(true);
    setOtpError(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/send-verification-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "apikey": supabaseAnonKey,
        },
        body: JSON.stringify({
          channel: "email",
          destination: destEmail,
          target_kind: "account_signup",
          target_id: userId,
          target_meta: {},
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; attempt_id?: string };
      if (payload?.error) throw new Error(payload.error);
      if (!payload?.attempt_id) throw new Error("Failed to send code");
      setOtpAttemptId(payload.attempt_id);
      setOtpResendIn(60);
      setOtpDigits(["", "", "", "", "", ""]);
      setOtpExpired(false);
      setOtpError(null);
      setTimeout(() => focusOtpFirstBox(otpInputsRef.current), 50);
    } catch (e) {
      setOtpError((e as Error).message || "Failed to send code");
    } finally {
      setOtpSending(false);
    }
  };

  const verifySignupOtp = async (codeStr?: string) => {
    const code = codeStr ?? otpDigits.join("");
    if (code.length !== 6 || !otpAttemptId || !pendingAccessToken) return;
    setOtpVerifying(true);
    setOtpError(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/verify-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${pendingAccessToken}`,
          "apikey": supabaseAnonKey,
        },
        body: JSON.stringify({ attempt_id: otpAttemptId, code }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
        remaining?: number;
        code?: string;
      };
      if (!res.ok || payload?.error) {
        const failure = otpVerifyFailureFromPayload(payload);
        setOtpExpired(failure.expired);
        setOtpError(failure.expired ? null : failure.message);
        setOtpDigits(["", "", "", "", "", ""]);
        setOtpVerifying(false);
        setTimeout(() => focusOtpFirstBox(otpInputsRef.current), 50);
        return;
      }
      // OTP verified — NOW activate the Supabase client session so the
      // user becomes "logged in" in the UI and lands on calendar.
      if (pendingRefreshToken) {
        await activateSession(pendingAccessToken, pendingRefreshToken);
      }
      choreographExit();
    } catch (e) {
      const failure = otpVerifyFailureFromPayload({
        error: e instanceof Error ? e.message : "Verification failed",
      });
      setOtpExpired(failure.expired);
      setOtpError(failure.expired ? null : failure.message);
      setOtpDigits(["", "", "", "", "", ""]);
      setOtpVerifying(false);
      setTimeout(() => focusOtpFirstBox(otpInputsRef.current), 50);
      return;
    }
    setOtpVerifying(false);
  };

  // Resend cooldown countdown
  useEffect(() => {
    if (otpResendIn <= 0) return;
    const t = setTimeout(() => setOtpResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [otpResendIn]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (mode === "signup") {
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
      /** Signup birth date — Bucket A: required only when extended fields are shown. */
      if (isEntityFeatureEnabled("entityExtendedProfileFields")) {
        const birthDate = formatBirthIso(bYear, bMonth, bDay);
        if (!birthDate) {
          setError("Please enter a valid birth date.");
          return;
        }
      }
    }

    setSubmitting(true);

    if (mode === "signin") {
      const { error: err } = await signIn(email.trim(), password);
      if (err) {
        setError(err);
        setSubmitting(false);
        return;
      }
      choreographExit();
      return;
    }

    // signup
    const trimmedEmail = email.trim();
    const extended = isEntityFeatureEnabled("entityExtendedProfileFields");
    const birthDate = extended ? formatBirthIso(bYear, bMonth, bDay) : null;
    const result = await signUp({
      email: trimmedEmail,
      password,
      ...(extended
        ? {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            birth_date: birthDate ?? undefined,
          }
        : {}),
    });
    const { error: err, needsEmailConfirmation, needsOtpVerification, userId } = result;
    if (err) {
      setError(err);
      setSubmitting(false);
      return;
    }
    if (needsEmailConfirmation) {
      setError("Check your email to confirm your account.");
      setSubmitting(false);
      return;
    }
    if (needsOtpVerification && userId) {
      const accessToken = result._pendingAccessToken ?? "";
      const refreshToken = result._pendingRefreshToken ?? "";
      setPendingAccessToken(accessToken || null);
      setPendingRefreshToken(refreshToken || null);
      setPendingUserId(userId);
      setOtpEmail(trimmedEmail);
      setOtpAttemptId(null);
      setOtpDigits(["", "", "", "", "", ""]);
      setOtpError(null);
      setMode("otp");
      setSubmitting(false);
      void sendSignupOtp(trimmedEmail, userId, accessToken);
      return;
    }
    // Fallback: no OTP requested (shouldn't happen with new register flow).
    choreographExit();
  };


  const title = headerFor(context);
  const overlay = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="signin-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto"
          style={{
            paddingTop: "min(10vh, 110px)",
            paddingBottom: "min(10vh, 110px)",
            fontFamily: HELVETICA,
          }}
        >
          {/* dim backdrop */}
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: exiting ? 0 : 1 }}
            transition={{ duration: exiting ? 0.6 : 0.3, ease: "easeOut" }}
            style={{ background: "rgba(0,0,0,0.28)" }}
            onClick={() => {
              if (!submitting && !exiting && !otpVerifying && !otpSending) onClose();
            }}
          />

          {/* the modal — animates size between signin/signup */}
          <motion.div
            key="signin-card"
            layout
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={
              exiting
                ? {
                    opacity: 0,
                    scaleY: 0,
                    transformOrigin: "top center",
                    transition: { duration: 0.7, ease: [0.4, 0, 0.2, 1] },
                  }
                : { opacity: 1, scale: 1, y: 0 }
            }
            transition={{
              layout: { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] },
              duration: 0.35,
              ease: [0.2, 0.8, 0.2, 1],
            }}
            className="relative flex flex-col"
            style={{
              width: "min(480px, 94vw)",
              maxHeight: "88vh",
              background: "#ffffff",
              borderRadius: 18,
              boxShadow:
                "0 30px 60px -20px rgba(0,0,0,0.25), 0 12px 24px -12px rgba(0,0,0,0.18)",
              overflow: "hidden",
              transformOrigin: "top center",
            }}
          >
            <motion.div
              layout
              initial={{ opacity: 0 }}
              animate={{
                opacity:
                  exiting || switchingMode ? 0 : fieldsReady ? 1 : 0,
              }}
              transition={{
                duration: exiting ? 0.5 : switchingMode ? 0.25 : 0.45,
                ease: "easeOut",
              }}
              className="flex min-h-0 flex-1 flex-col"
            >
              {mode === "signin" ? (
                <div style={{ padding: "44px 40px 32px" }}>
                  <ModalHeader title={title} subtitle="Sign in with your Bissibox-account" subtitleSize={14} />
                  <SignInForm
                    onSubmit={onSubmit}
                    email={email}
                    setEmail={setEmail}
                    password={password}
                    setPassword={setPassword}
                    error={error}
                    submitting={submitting}
                    onCreate={() => switchMode("signup")}
                    ready={fieldsReady}
                  />
                </div>
              ) : mode === "signup" ? (
                <SignUpForm
                  onSubmit={onSubmit}
                  firstName={firstName}
                  setFirstName={setFirstName}
                  lastName={lastName}
                  setLastName={setLastName}
                  country={country}
                  setCountry={setCountry}
                  bDay={bDay}
                  setBDay={setBDay}
                  bMonth={bMonth}
                  setBMonth={setBMonth}
                  bYear={bYear}
                  setBYear={setBYear}
                  email={email}
                  setEmail={setEmail}
                  password={password}
                  setPassword={setPassword}
                  confirmPassword={confirmPassword}
                  setConfirmPassword={setConfirmPassword}
                  error={error}
                  submitting={submitting}
                  onCancel={() => switchMode("signin")}
                />
              ) : (
                <OtpStep
                  email={otpEmail}
                  digits={otpDigits}
                  setDigits={setOtpDigits}
                  inputsRef={otpInputsRef}
                  onVerify={verifySignupOtp}
                  onResend={() => {
                    if (pendingAccessToken && pendingUserId) {
                      void sendSignupOtp(otpEmail, pendingUserId, pendingAccessToken);
                    }
                  }}
                  onCancel={onClose}
                  resendIn={otpResendIn}
                  sending={otpSending}
                  verifying={otpVerifying}
                  error={otpError}
                  expired={otpExpired}
                />
              )}
            </motion.div>

            {/* loading spinner while mode-transitioning */}
            <AnimatePresence>
              {switchingMode && (
                <motion.div
                  key="loader"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                >
                  <Spinner />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Render on document.body so the dim covers the top tab bar too. Inside
  // `<main>` the overlay is clipped below the 48px bar and that bar then
  // fades on its own — you see its edges.
  if (!portalReady) return null;
  return createPortal(overlay, document.body);
}

function Spinner() {
  return (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: "50%",
        border: "2px solid rgba(29,29,31,0.15)",
        borderTopColor: "#1d1d1f",
        animation: "aponna-spin 0.8s linear infinite",
      }}
    >
      <style>{`@keyframes aponna-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function SignInForm(props: {
  onSubmit: (e: React.FormEvent) => void;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  error: string | null;
  submitting: boolean;
  onCreate: () => void;
  ready: boolean;
}) {
  const { onSubmit, email, setEmail, password, setPassword, error, submitting, onCreate, ready } = props;
  const [allowCredentialAutofill, setAllowCredentialAutofill] = useState(false);
  const unlockCredentialAutofill = () => setAllowCredentialAutofill(true);
  return (
    <form onSubmit={onSubmit} className="space-y-4" autoComplete="off">
      <LabeledField
        label="E-mail adress"
        value={email}
        onChange={setEmail}
        type="email"
        autoComplete="email"
        autoFocus={ready}
        lockAutofillUntilPointer
        autofillAllowed={allowCredentialAutofill}
        onAutofillUnlock={unlockCredentialAutofill}
        required
      />
      <LabeledField
        label="Password"
        value={password}
        onChange={setPassword}
        type="password"
        autoComplete="current-password"
        lockAutofillUntilPointer
        autofillAllowed={allowCredentialAutofill}
        onAutofillUnlock={unlockCredentialAutofill}
        required
      />
      {error && <ErrorLine error={error} />}

      <div className="flex w-full justify-center" style={{ padding: "6px 0 2px" }}>
        <button
          type="button"
          onClick={onCreate}
          className="hover:underline"
          style={{
            fontFamily: HELVETICA,
            fontSize: 13,
            color: "#1d1d1f",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          Create Bissibox-account
        </button>
      </div>

      <PrimaryButton submitting={submitting} label="Log in" />
    </form>
  );
}

function SignUpForm(props: {
  onSubmit: (e: React.FormEvent) => void;
  firstName: string; setFirstName: (v: string) => void;
  lastName: string; setLastName: (v: string) => void;
  country: string; setCountry: (v: string) => void;
  bDay: string; setBDay: (v: string) => void;
  bMonth: string; setBMonth: (v: string) => void;
  bYear: string; setBYear: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  confirmPassword: string; setConfirmPassword: (v: string) => void;
  error: string | null;
  submitting: boolean;
  onCancel: () => void;
}) {
  const {
    onSubmit, firstName, setFirstName, lastName, setLastName,
    country, setCountry, bDay, setBDay, bMonth, setBMonth, bYear, setBYear,
    email, setEmail,
    password, setPassword, confirmPassword, setConfirmPassword,
    error, submitting, onCancel,
  } = props;

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const arr: number[] = [];
    for (let y = now; y >= now - 110; y--) arr.push(y);
    return arr;
  }, []);
  const days = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);
  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];

  return (
    <form
      onSubmit={onSubmit}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        className="space-y-4 overflow-y-auto"
        style={{ padding: "44px 40px 20px" }}
      >
        <ModalHeader
          title="Create Bissibox-account"
          subtitle="Your key to the Bissibox ecosystem"
          subtitleSize={13}
        />
        {/** Signup name, country, birth date — Bucket A: currently live, hidden this round. */}
        {isEntityFeatureEnabled("entityExtendedProfileFields") ? (
        <>
        <div className="grid grid-cols-2 gap-3">
          <LabeledField label="First name" value={firstName} onChange={setFirstName} autoComplete="given-name" autoFocus required />
          <LabeledField label="Last name" value={lastName} onChange={setLastName} autoComplete="family-name" required />
        </div>

        <LabeledSelect label="Country" value={country} onChange={setCountry} required>
          <option value="" disabled>Select country</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </LabeledSelect>

        <div>
          <FieldLabel>Birth date</FieldLabel>
          <div className="grid grid-cols-3 gap-3">
            <RawSelect value={bDay} onChange={setBDay} required>
              <option value="" disabled>Day</option>
              {days.map((d) => <option key={d} value={d}>{d}</option>)}
            </RawSelect>
            <RawSelect value={bMonth} onChange={setBMonth} required>
              <option value="" disabled>Month</option>
              {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </RawSelect>
            <RawSelect value={bYear} onChange={setBYear} required>
              <option value="" disabled>Year</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </RawSelect>
          </div>
        </div>
        </>
        ) : null}

        <LabeledField label="E-mail adress" value={email} onChange={setEmail} type="email" autoComplete="email" required autoFocus={!isEntityFeatureEnabled("entityExtendedProfileFields")} />

        <LabeledField label="Password" value={password} onChange={setPassword} type="password" autoComplete="new-password" required />
        <LabeledField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} type="password" autoComplete="new-password" required />

        {error && <ErrorLine error={error} />}
      </div>

      <div
        className="flex items-center justify-between"
        style={{
          padding: "14px 40px 20px",
          borderTop: "1px solid rgba(0,0,0,0.08)",
          background: "#ffffff",
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="border border-[#1d1d1f] bg-white text-[#1d1d1f] transition-colors hover:bg-[#f0f0f0] active:scale-[0.99] disabled:cursor-default"
          style={{
            borderRadius: 12, padding: "11px 22px",
            fontFamily: HELVETICA, fontSize: 14, fontWeight: 500,
            letterSpacing: "-0.005em",
            cursor: submitting ? "default" : "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="border-0 bg-[#1d1d1f] text-white transition-colors hover:bg-black active:scale-[0.99] disabled:cursor-default"
          style={{
            borderRadius: 12, padding: "11px 22px",
            fontFamily: HELVETICA, fontSize: 14, fontWeight: 500,
            letterSpacing: "-0.005em",
            cursor: submitting ? "default" : "pointer",
            opacity: submitting ? 0.85 : 1,
          }}
        >
          Continue
        </button>
      </div>
    </form>
  );
}

function ModalHeader({
  title, subtitle, subtitleSize,
}: { title: string; subtitle: string; subtitleSize: number }) {
  return (
    <div className="mb-6 text-center">
      <h2
        style={{
          fontFamily: HELVETICA, fontSize: 22, fontWeight: 400,
          color: "#1d1d1f", letterSpacing: "-0.01em", lineHeight: 1.2,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          marginTop: 6, fontFamily: HELVETICA, fontSize: subtitleSize,
          fontWeight: 400, color: "#86868b", letterSpacing: "-0.005em",
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}

function PrimaryButton({ submitting, label }: { submitting: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={submitting}
      className="w-full transition active:scale-[0.99]"
      style={{
        marginTop: 4,
        background: "#1d1d1f",
        color: "#ffffff",
        borderRadius: SIGN_IN_BUTTON_BORDER_RADIUS,
        padding: "12px 18px",
        fontFamily: HELVETICA,
        fontSize: 15,
        fontWeight: 500,
        letterSpacing: "-0.005em",
        border: "none",
        cursor: submitting ? "default" : "pointer",
        opacity: submitting ? 0.85 : 1,
      }}
    >
      {label}
    </button>
  );
}

function ErrorLine({ error }: { error: string }) {
  return (
    <div className="text-[12.5px]" style={{ color: "#c0392b", fontFamily: HELVETICA }}>
      {error}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: HELVETICA, display: "block", fontSize: 12,
        fontWeight: 700, color: "#1d1d1f", marginBottom: 6,
        letterSpacing: "-0.005em",
      }}
    >
      {children}
    </span>
  );
}

function LabeledField({
  label, value, onChange, type = "text", required, autoComplete, autoFocus,
  lockAutofillUntilPointer, autofillAllowed, onAutofillUnlock,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  lockAutofillUntilPointer?: boolean;
  autofillAllowed?: boolean;
  onAutofillUnlock?: () => void;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <RawInput
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        lockAutofillUntilPointer={lockAutofillUntilPointer}
        autofillAllowed={autofillAllowed}
        onAutofillUnlock={onAutofillUnlock}
      />
    </label>
  );
}

function LabeledSelect({
  label, value, onChange, required, children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <RawSelect value={value} onChange={onChange} required={required}>
        {children}
      </RawSelect>
    </label>
  );
}

function bindFocusedField(el: HTMLElement | null) {
  if (!el) return () => {};
  const sync = () => {
    el.classList.toggle("is-focused", document.activeElement === el);
  };
  const activate = () => {
    document.querySelectorAll(".account-field.is-focused").forEach((node) => {
      if (node !== el) node.classList.remove("is-focused");
    });
    el.classList.add("is-focused");
  };
  sync();
  document.addEventListener("focusin", sync);
  document.addEventListener("focusout", sync);
  el.addEventListener("pointerdown", activate);
  return () => {
    document.removeEventListener("focusin", sync);
    document.removeEventListener("focusout", sync);
    el.removeEventListener("pointerdown", activate);
    el.classList.remove("is-focused");
  };
}

const inputStyle: React.CSSProperties = {
  fontFamily: HELVETICA,
  width: "100%",
  background: "#ffffff",
  color: "#1d1d1f",
  caretColor: "#1d1d1f",
  cursor: "text",
  border: "1px solid #1d1d1f",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  outline: "none",
  transition: "border-color 120ms ease-out, box-shadow 120ms ease-out",
};

function RawInput({
  type = "text", value, onChange, required, autoComplete, autoFocus,
  lockAutofillUntilPointer = false, autofillAllowed = false, onAutofillUnlock,
}: {
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  lockAutofillUntilPointer?: boolean;
  autofillAllowed?: boolean;
  onAutofillUnlock?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const unbindRef = useRef<(() => void) | null>(null);
  const [allowAutofill, setAllowAutofill] = useState(!lockAutofillUntilPointer);
  const autofillLocked = lockAutofillUntilPointer && !allowAutofill;

  const unlockAutofill = (target?: HTMLInputElement) => {
    if (!autofillLocked) return;
    if (target) {
      if (type) target.type = type;
      if (autoComplete) target.autoComplete = autoComplete;
      target.removeAttribute("name");
    }
    setAllowAutofill(true);
    onAutofillUnlock?.();
  };

  const setInputRef = (el: HTMLInputElement | null) => {
    inputRef.current = el;
    unbindRef.current?.();
    unbindRef.current = bindFocusedField(el);
  };

  useEffect(() => () => {
    unbindRef.current?.();
    unbindRef.current = null;
  }, []);

  useEffect(() => {
    if (autofillAllowed) unlockAutofill(inputRef.current ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autofillAllowed]);

  useEffect(() => {
    if (!autoFocus) return;
    const el = inputRef.current;
    if (!el) return;
    // Same caret placement as Create account. Credential autofill stays locked
    // until pointerdown so Google's suggestion does not open on its own.
    const placeCaret = () => {
      el.focus({ preventScroll: true });
      document.querySelectorAll(".account-field.is-focused").forEach((node) => {
        if (node !== el) node.classList.remove("is-focused");
      });
      el.classList.add("is-focused");
      try {
        const pos = el.value.length;
        el.setSelectionRange(pos, pos);
      } catch {
        /* type=email does not always expose a selection range */
      }
    };
    const t = window.setTimeout(placeCaret, 0);
    return () => window.clearTimeout(t);
  }, [autoFocus]);

  return (
    <input
      ref={setInputRef}
      type={autofillLocked ? "text" : type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      name={allowAutofill ? undefined : `deferred-${type}`}
      autoComplete={allowAutofill ? autoComplete : "off"}
      inputMode={autofillLocked || type !== "email" ? undefined : "email"}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      style={inputStyle}
      className="account-field signin-field"
      onPointerDown={(e) => {
        const target = e.currentTarget;
        document.querySelectorAll(".account-field.is-focused").forEach((node) => {
          if (node !== target) node.classList.remove("is-focused");
        });
        target.classList.add("is-focused");
        unlockAutofill(target);
      }}
    />
  );
}

function RawSelect({
  value, onChange, required, children,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  children: React.ReactNode;
}) {
  const unbindRef = useRef<(() => void) | null>(null);
  const setSelectRef = (el: HTMLSelectElement | null) => {
    unbindRef.current?.();
    unbindRef.current = bindFocusedField(el);
  };
  useEffect(() => () => {
    unbindRef.current?.();
    unbindRef.current = null;
  }, []);
  return (
    <select
      ref={setSelectRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      style={{ ...inputStyle, appearance: "auto" }}
      className="account-field signin-field"
      onPointerDown={(e) => {
        const target = e.currentTarget;
        document.querySelectorAll(".account-field.is-focused").forEach((node) => {
          if (node !== target) node.classList.remove("is-focused");
        });
        target.classList.add("is-focused");
      }}
    >
      {children}
    </select>
  );
}

function OtpStep({
  email,
  digits,
  setDigits,
  inputsRef,
  onVerify,
  onResend,
  onCancel,
  resendIn,
  sending,
  verifying,
  error,
  expired = false,
}: {
  email: string;
  digits: string[];
  setDigits: (d: string[]) => void;
  inputsRef: React.MutableRefObject<Array<HTMLInputElement | null>>;
  onVerify: (code?: string) => void;
  onResend: () => void;
  onCancel: () => void;
  resendIn: number;
  sending: boolean;
  verifying: boolean;
  error: string | null;
  expired?: boolean;
}) {
  useEffect(() => {
    if (expired) return;
    const cleanups = inputsRef.current.map((el) => bindFocusedField(el));
    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [inputsRef, expired, verifying]);

  useEffect(() => {
    if (expired || verifying) return;
    if (digits.some((d) => d)) return;
    const t = window.setTimeout(() => focusOtpFirstBox(inputsRef.current), 50);
    return () => window.clearTimeout(t);
  }, [expired, verifying, digits, inputsRef]);

  if (expired) {
    return (
      <div style={{ padding: "44px 40px 32px" }}>
        <VerificationCodeExpiredPanel
          compactTitle
          error={error}
          footer={
            <div
              className="flex items-center justify-between"
              style={{ marginTop: 28 }}
            >
              <button
                type="button"
                onClick={onCancel}
                disabled={sending}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  color: "#ff3b30",
                  fontFamily: HELVETICA,
                  fontSize: 15,
                  fontWeight: 400,
                  letterSpacing: "-0.01em",
                  opacity: sending ? 0.45 : 1,
                  cursor: sending ? "default" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onResend}
                disabled={sending}
                className="transition active:scale-[0.99]"
                style={{
                  background: "#1d1d1f",
                  color: "#ffffff",
                  borderRadius: 12,
                  padding: "12px 18px",
                  fontFamily: HELVETICA,
                  fontSize: 15,
                  fontWeight: 500,
                  letterSpacing: "-0.005em",
                  border: "none",
                  cursor: sending ? "default" : "pointer",
                  opacity: sending ? 0.7 : 1,
                }}
              >
                {sending ? "Sending…" : "Resend"}
              </button>
            </div>
          }
        />
      </div>
    );
  }

  const handleDigit = (i: number, v: string) => {
    const result = applyOtpBoxInput({ index: i, value: v, digits });
    setDigits(result.digits);
    focusOtpBox(inputsRef.current, result.focusIndex);
    if (result.complete) onVerify(result.digits.join(""));
  };

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
    }
  };

  const complete = digits.every((d) => d);

  return (
    <div style={{ padding: "44px 40px 32px" }}>
      <ModalHeader
        title="Verify your email"
        subtitle={`We've sent a 6-digit code to ${email}. Enter it below.`}
        subtitleSize={13}
      />

      <div className="flex justify-between gap-2" style={{ marginTop: 8 }}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={d}
            onChange={(e) => handleDigit(i, e.target.value)}
            onKeyDown={(e) => handleKey(i, e)}
            disabled={verifying}
            className="account-field signin-field"
            onPointerDown={(e) => {
              const target = e.currentTarget;
              document.querySelectorAll(".account-field.is-focused").forEach((node) => {
                if (node !== target) node.classList.remove("is-focused");
              });
              target.classList.add("is-focused");
            }}
            style={{
              fontFamily: HELVETICA,
              width: 48,
              height: 56,
              borderRadius: 10,
              border: "1px solid #1d1d1f",
              background: "#ffffff",
              color: "#1d1d1f",
              fontSize: 22,
              textAlign: "center",
              outline: "none",
              transition: "box-shadow 120ms ease-out",
            }}
          />
        ))}
      </div>

      {error && (
        <div style={{ marginTop: 14 }}>
          <ErrorLine error={error} />
        </div>
      )}

      <div
        className="flex items-center justify-between"
        style={{
          marginTop: 18,
          fontFamily: HELVETICA,
          fontSize: 12,
          color: "#86868b",
        }}
      >
        <button
          type="button"
          disabled={resendIn > 0 || sending}
          onClick={onResend}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: resendIn > 0 || sending ? "default" : "pointer",
            color: resendIn > 0 || sending ? "#86868b" : "#1d1d1f",
            fontFamily: HELVETICA,
            fontSize: 12,
            textDecoration: resendIn > 0 || sending ? "none" : "underline",
          }}
        >
          {sending
            ? "Sending…"
            : resendIn > 0
              ? `Resend in ${resendIn}s`
              : "Resend code"}
        </button>
        <span>Check your spam folder if you can't find the email.</span>
      </div>

      <button
        type="button"
        onClick={() => onVerify()}
        disabled={verifying || !complete}
        className="w-full transition active:scale-[0.99]"
        style={{
          marginTop: 18,
          background: "#1d1d1f",
          color: "#ffffff",
          borderRadius: 12,
          padding: "12px 18px",
          fontFamily: HELVETICA,
          fontSize: 15,
          fontWeight: 500,
          letterSpacing: "-0.005em",
          border: "none",
          cursor: verifying || !complete ? "default" : "pointer",
          opacity: verifying || !complete ? 0.7 : 1,
        }}
      >
        {verifying ? "Verifying…" : "Verify"}
      </button>
    </div>
  );
}

