import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type SearchParams = { redirect?: string };

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: AuthPage,
  head: () => ({
    meta: [{ title: "Sign in · Raceline" }],
  }),
});

function AuthPage() {
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: search.redirect ?? "/profile" });
  }, [user, navigate, search.redirect]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (mode === "signup") {
      const { error, needsEmailConfirmation } = await signUp({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
      });
      setLoading(false);
      if (error) return toast.error(error);
      if (needsEmailConfirmation) {
        toast.success("Check your email to confirm your account.");
        setPassword("");
        setMode("signin");
        return;
      }
      toast.success("Account created. You're signed in.");
    } else {
      const { error } = await signIn(email, password);
      setLoading(false);
      if (error) return toast.error(error);
    }
  };

  return (
    <div className="mx-auto max-w-md px-6">
      <div className="pt-6">
        <p className="mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Raceline</p>
        <h1 className="mt-3 text-3xl text-ink">
          {mode === "signin" ? "Welcome back." : "Create your profile."}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Sign in to your race profile."
            : "All you need to sign up for any race."}
        </p>
      </div>

      <form onSubmit={submit} className="mt-8 space-y-3">
        {mode === "signup" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" value={firstName} onChange={setFirstName} required />
            <Field label="Last name" value={lastName} onChange={setLastName} required />
          </div>
        )}
        <Field label="Email" type="email" value={email} onChange={setEmail} required />
        <Field label="Password" type="password" value={password} onChange={setPassword} required />
        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        className="mt-6 w-full text-center text-sm text-muted-foreground hover:text-ink"
      >
        {mode === "signin" ? "No account yet? Create one." : "Already have an account? Sign in."}
      </button>

      <Link
        to="/"
        className="mt-10 block text-center mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-ink"
      >
        ← back to home
      </Link>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1 w-full rounded-xl border border-hairline bg-card px-4 py-3 text-base text-ink outline-none transition focus:border-primary"
      />
    </label>
  );
}
