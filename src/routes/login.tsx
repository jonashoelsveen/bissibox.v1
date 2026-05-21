import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";

type SearchParams = { redirect?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: LoginPage,
  head: () => ({ meta: [{ title: "Sign in · aponnacloud" }] }),
});

const SYSTEM_FONT =
  '-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function LoginPage() {
  const { user, authReady, signIn } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authReady && user) {
      navigate({ to: search.redirect ?? "/calendar", replace: true });
    }
  }, [authReady, user, navigate, search.redirect]);

  const onContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setStep(2);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    navigate({ to: search.redirect ?? "/calendar", replace: true });
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ fontFamily: SYSTEM_FONT, background: "var(--background, #f5f5f7)" }}
    >
      <div
        className="relative w-full overflow-hidden"
        style={{
          maxWidth: 380,
          borderRadius: 14,
          background: "var(--card, #ffffff)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.08)",
          padding: 32,
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {step === 1 ? (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.3, marginBottom: 24, color: "var(--foreground)" }}>
                Sign in to aponnacloud
              </h1>
              <form onSubmit={onContinue} className="space-y-3">
                <input
                  type="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                  required
                  style={{ fontFamily: SYSTEM_FONT }}
                  className="w-full rounded-xl border border-hairline bg-transparent px-4 py-3 text-[15px] text-foreground outline-none transition focus:border-foreground/40"
                />
                <button
                  type="submit"
                  className="w-full rounded-full bg-foreground py-3 text-[15px] font-medium text-background transition hover:opacity-90"
                  style={{ fontFamily: SYSTEM_FONT }}
                >
                  Continue
                </button>
              </form>
              <div className="mt-6 text-center">
                <Link
                  to="/auth"
                  className="text-[13px] text-muted-foreground transition hover:text-foreground"
                >
                  Create account
                </Link>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <div className="mb-5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setStep(1); setError(null); setPassword(""); }}
                  className="-ml-1.5 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="text-[13px] text-muted-foreground" style={{ fontFamily: SYSTEM_FONT }}>
                  {email}
                </div>
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.3, marginBottom: 24, color: "var(--foreground)" }}>
                Enter password
              </h1>
              <form onSubmit={onSubmit} className="space-y-3">
                <input
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                  style={{ fontFamily: SYSTEM_FONT }}
                  className="w-full rounded-xl border border-hairline bg-transparent px-4 py-3 text-[15px] text-foreground outline-none transition focus:border-foreground/40"
                />
                {error && (
                  <div className="text-[12.5px] text-red-500" style={{ fontFamily: SYSTEM_FONT }}>
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center rounded-full bg-foreground py-3 text-[15px] font-medium text-background transition hover:opacity-90 disabled:opacity-90"
                  style={{ fontFamily: SYSTEM_FONT, minHeight: 46 }}
                >
                  {submitting ? (
                    <svg className="h-[14px] w-[14px] animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  ) : (
                    "Sign in"
                  )}
                </button>
              </form>
              <div className="mt-6 text-center">
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="text-[13px] text-muted-foreground transition hover:text-foreground"
                >
                  Forgot password?
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
