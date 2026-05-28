import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  setAuthTransitionPhase,
  setSignInModalOpen,
} from "@/lib/auth-transition";
import { COUNTRIES, COUNTRY_CALLING_CODES } from "@/lib/countries";

const HELVETICA =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

export type SignInContext = "cloud" | "calendar" | "diary" | "photos" | "entity" | "role";

type Mode = "signin" | "signup" | "otp";

function headerFor(ctx: SignInContext) {
  switch (ctx) {
    case "calendar":
      return "Welcome to Aponna Cloud Calendar";
    case "diary":
      return "Welcome to Aponna Cloud Diary";
    case "photos":
      return "Welcome to Aponna Cloud Photos";
    case "entity":
      return "Sign in before creating Aponna-entity";
    case "role":
      return "Sign in before getting a role";
    default:
      return "Welcome to Aponna Cloud";
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
  const [callingCode, setCallingCode] = useState("+1");
  const [phone, setPhone] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verifyVia, setVerifyVia] = useState<"email" | "sms">("email");
  const [marketing, setMarketing] = useState(true);

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
  const otpInputsRef = useRef<Array<HTMLInputElement | null>>([]);
  // Pending session tokens — held in memory between signup response and
  // successful OTP verification. The Supabase client session is NOT set
  // until verifySignupOtp() succeeds, so the user cannot reach
  // authenticated UI by refreshing or navigating away.
  const [pendingAccessToken, setPendingAccessToken] = useState<string | null>(null);
  const [pendingRefreshToken, setPendingRefreshToken] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

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
      setTimeout(() => otpInputsRef.current[0]?.focus(), 50);
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
      const payload = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
      if (payload?.error) throw new Error(payload.error);
      // OTP verified — NOW activate the Supabase client session so the
      // user becomes "logged in" in the UI and lands on home.
      if (pendingRefreshToken) {
        await activateSession(pendingAccessToken, pendingRefreshToken);
      }
      choreographExit();
    } catch (e) {
      setOtpError((e as Error).message || "Verification failed");
      setOtpDigits(["", "", "", "", "", ""]);
      otpInputsRef.current[0]?.focus();
      setOtpVerifying(false);
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
    const result = await signUp({
      email: trimmedEmail,
      password,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
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

  return (
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
              if (!submitting && !exiting) onClose();
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
                  <ModalHeader title={title} subtitle="Sign in with your Aponna-account" subtitleSize={14} />
                  <SignInForm
                    onSubmit={onSubmit}
                    email={email}
                    setEmail={setEmail}
                    password={password}
                    setPassword={setPassword}
                    error={error}
                    submitting={submitting}
                    onCreate={() => switchMode("signup")}
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
                  callingCode={callingCode}
                  setCallingCode={setCallingCode}
                  phone={phone}
                  setPhone={setPhone}
                  password={password}
                  setPassword={setPassword}
                  confirmPassword={confirmPassword}
                  setConfirmPassword={setConfirmPassword}
                  verifyVia={verifyVia}
                  setVerifyVia={setVerifyVia}
                  marketing={marketing}
                  setMarketing={setMarketing}
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
                    // userId not directly known here; use current authenticated session user id.
                    void (async () => {
                      const { data } = await supabase.auth.getUser();
                      const uid = data.user?.id;
                      if (uid) await sendSignupOtp(otpEmail, uid);
                    })();
                  }}
                  resendIn={otpResendIn}
                  sending={otpSending}
                  verifying={otpVerifying}
                  error={otpError}
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
}) {
  const { onSubmit, email, setEmail, password, setPassword, error, submitting, onCreate } = props;
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <LabeledField
        label="E-mail adress"
        value={email}
        onChange={setEmail}
        type="email"
        autoComplete="email"
        autoFocus
        required
      />
      <LabeledField
        label="Password"
        value={password}
        onChange={setPassword}
        type="password"
        autoComplete="current-password"
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
          Create Aponna-account
        </button>
      </div>

      <PrimaryButton submitting={submitting} label="Sign in" />
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
  callingCode: string; setCallingCode: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  confirmPassword: string; setConfirmPassword: (v: string) => void;
  verifyVia: "email" | "sms"; setVerifyVia: (v: "email" | "sms") => void;
  marketing: boolean; setMarketing: (v: boolean) => void;
  error: string | null;
  submitting: boolean;
  onCancel: () => void;
}) {
  const {
    onSubmit, firstName, setFirstName, lastName, setLastName,
    country, setCountry, bDay, setBDay, bMonth, setBMonth, bYear, setBYear,
    email, setEmail, callingCode, setCallingCode, phone, setPhone,
    password, setPassword, confirmPassword, setConfirmPassword,
    verifyVia, setVerifyVia, marketing, setMarketing,
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
          title="Create Aponna-account"
          subtitle="Your key to the Aponna ecosystem"
          subtitleSize={13}
        />
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

        <LabeledField label="E-mail adress" value={email} onChange={setEmail} type="email" autoComplete="email" required />

        <div>
          <FieldLabel>Phone number</FieldLabel>
          <div className="grid gap-3" style={{ gridTemplateColumns: "110px 1fr" }}>
            <RawSelect value={callingCode} onChange={setCallingCode} required>
              {COUNTRY_CALLING_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
            </RawSelect>
            <RawInput type="tel" value={phone} onChange={setPhone} autoComplete="tel-national" required />
          </div>
        </div>

        <LabeledField label="Password" value={password} onChange={setPassword} type="password" autoComplete="new-password" required />
        <LabeledField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} type="password" autoComplete="new-password" required />

        <div>
          <FieldLabel>Verification</FieldLabel>
          <div className="space-y-2">
            <RadioRow
              label="Verify with code via e-mail"
              checked={verifyVia === "email"}
              onChange={() => setVerifyVia("email")}
            />
            <RadioRow
              label="Verify with code via text message"
              checked={verifyVia === "sms"}
              onChange={() => setVerifyVia("sms")}
            />
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <div
            style={{
              fontFamily: HELVETICA, fontSize: 12, fontWeight: 700,
              color: "#1d1d1f", marginBottom: 6, letterSpacing: "-0.005em",
            }}
          >
            Announcements
          </div>
          <label className="flex items-start gap-2" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
              style={{ marginTop: 3, accentColor: "#1d1d1f" }}
            />
            <span style={{ fontFamily: HELVETICA, fontSize: 12, color: "#86868b", lineHeight: 1.4 }}>
              Receive email-communication from Aponna about marketing, recomendations and updates about Aponna software and services.
            </span>
          </label>
        </div>

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
          className="transition active:scale-[0.99]"
          style={{
            background: "#ffffff", color: "#1d1d1f",
            borderRadius: 12, padding: "11px 22px",
            fontFamily: HELVETICA, fontSize: 14, fontWeight: 500,
            letterSpacing: "-0.005em",
            border: "1px solid #1d1d1f",
            cursor: submitting ? "default" : "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="transition active:scale-[0.99]"
          style={{
            background: "#1d1d1f", color: "#ffffff",
            borderRadius: 12, padding: "11px 22px",
            fontFamily: HELVETICA, fontSize: 14, fontWeight: 500,
            letterSpacing: "-0.005em", border: "none",
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
        borderRadius: 12,
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
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

const inputStyle: React.CSSProperties = {
  fontFamily: HELVETICA,
  width: "100%",
  background: "#ffffff",
  color: "#1d1d1f",
  border: "1px solid #1d1d1f",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  outline: "none",
  transition: "border-color 120ms ease-out, box-shadow 120ms ease-out",
};

function RawInput({
  type = "text", value, onChange, required, autoComplete, autoFocus,
}: {
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      style={inputStyle}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(29,29,31,0.08)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = "none";
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
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      style={{ ...inputStyle, appearance: "auto" }}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(29,29,31,0.08)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {children}
    </select>
  );
}

function RadioRow({
  label, checked, onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2" style={{ cursor: "pointer" }}>
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        style={{ accentColor: "#1d1d1f" }}
      />
      <span style={{ fontFamily: HELVETICA, fontSize: 13, color: "#1d1d1f" }}>
        {label}
      </span>
    </label>
  );
}

function OtpStep({
  email,
  digits,
  setDigits,
  inputsRef,
  onVerify,
  onResend,
  resendIn,
  sending,
  verifying,
  error,
}: {
  email: string;
  digits: string[];
  setDigits: (d: string[]) => void;
  inputsRef: React.MutableRefObject<Array<HTMLInputElement | null>>;
  onVerify: (code?: string) => void;
  onResend: () => void;
  resendIn: number;
  sending: boolean;
  verifying: boolean;
  error: string | null;
}) {
  const handleDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "");
    if (!clean) {
      const next = [...digits];
      next[i] = "";
      setDigits(next);
      return;
    }
    if (clean.length > 1) {
      const chars = clean.slice(0, 6).split("");
      const next = ["", "", "", "", "", ""];
      chars.forEach((c, idx) => (next[idx] = c));
      setDigits(next);
      const lastIdx = Math.min(chars.length, 6) - 1;
      inputsRef.current[lastIdx]?.focus();
      if (chars.length === 6) onVerify(next.join(""));
      return;
    }
    const next = [...digits];
    next[i] = clean[0];
    setDigits(next);
    if (i < 5) inputsRef.current[i + 1]?.focus();
    if (i === 5 && next.every((d) => d)) onVerify(next.join(""));
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
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(29,29,31,0.08)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = "none";
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
        <span>Check your spam folder if you don't see the email.</span>
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

