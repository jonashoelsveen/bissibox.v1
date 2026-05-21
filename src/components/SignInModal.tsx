import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { setAuthTransitionPhase } from "@/lib/auth-transition";

const HELVETICA =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

type Mode = "signin" | "signup";

export function SignInModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  // Reveal fields/buttons 1.7s after the modal first appears.
  const [fieldsReady, setFieldsReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!open) return;
    setFieldsReady(false);
    setExiting(false);
    setError(null);
    const t = setTimeout(() => setFieldsReady(true), 1700);
    timers.current.push(t);
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [open]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    if (mode === "signin") {
      const { error: err } = await signIn(email.trim(), password);
      if (err) {
        setError(err);
        setSubmitting(false);
        return;
      }
    } else {
      const { error: err, needsEmailConfirmation } = await signUp({
        email: email.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
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
    }

    // Success — choreograph exit.
    // 0.2s delay → modal content fades + modal folds from top.
    // Simultaneously, the white top bar fades to 0.
    // At 2.1s total, the dark top bar starts to reveal (gray → black).
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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="signin-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[120] flex items-start justify-center"
          style={{
            paddingTop: "min(18vh, 180px)",
            fontFamily: HELVETICA,
          }}
        >
          {/* dim backdrop */}
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: exiting ? 0 : 1 }}
            transition={{ duration: exiting ? 0.6 : 0.3, ease: "easeOut" }}
            style={{ background: "rgba(0,0,0,0.18)" }}
            onClick={() => {
              if (!submitting && !exiting) onClose();
            }}
          />

          {/* the modal */}
          <motion.div
            key="signin-card"
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
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
            className="relative"
            style={{
              width: "min(420px, 92vw)",
              background: "#ffffff",
              borderRadius: 18,
              boxShadow:
                "0 30px 60px -20px rgba(0,0,0,0.25), 0 12px 24px -12px rgba(0,0,0,0.18)",
              padding: "38px 36px 30px",
              transformOrigin: "top center",
            }}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: exiting ? 0 : fieldsReady ? 1 : 0 }}
              transition={{
                duration: exiting ? 0.5 : 0.45,
                ease: "easeOut",
              }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.form
                  key={mode}
                  onSubmit={onSubmit}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className="space-y-4"
                >
                  {mode === "signup" && (
                    <div className="grid grid-cols-2 gap-3">
                      <LabeledField
                        label="First name"
                        value={firstName}
                        onChange={setFirstName}
                        autoComplete="given-name"
                        required
                      />
                      <LabeledField
                        label="Last name"
                        value={lastName}
                        onChange={setLastName}
                        autoComplete="family-name"
                        required
                      />
                    </div>
                  )}
                  <LabeledField
                    label="E-mail adress"
                    value={email}
                    onChange={setEmail}
                    type="email"
                    autoComplete="email"
                    required
                  />
                  <LabeledField
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    type="password"
                    autoComplete={
                      mode === "signin" ? "current-password" : "new-password"
                    }
                    required
                  />

                  {error && (
                    <div
                      className="text-[12.5px]"
                      style={{ color: "#c0392b", fontFamily: HELVETICA }}
                    >
                      {error}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setMode(mode === "signin" ? "signup" : "signin");
                    }}
                    className="block w-full text-center"
                    style={{
                      fontFamily: HELVETICA,
                      fontSize: 13,
                      color: "#1d1d1f",
                      padding: "6px 0 2px",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {mode === "signin"
                      ? "Create Aponna Account"
                      : "Sign in to existing account"}
                  </button>

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
                    {mode === "signin" ? "Sign in" : "Create account"}
                  </button>
                </motion.form>
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LabeledField({
  label,
  value,
  onChange,
  type = "text",
  required,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span
        style={{
          fontFamily: HELVETICA,
          display: "block",
          fontSize: 12,
          fontWeight: 700,
          color: "#1d1d1f",
          marginBottom: 6,
          letterSpacing: "-0.005em",
        }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoComplete={autoComplete}
        style={{
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
        }}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(29,29,31,0.08)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = "none";
        }}
      />
    </label>
  );
}
