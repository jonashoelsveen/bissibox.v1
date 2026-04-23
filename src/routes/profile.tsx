import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Profile · Raceline" }] }),
});

interface Profile {
  first_name: string | null;
  last_name: string | null;
  gender: string | null;
  birth_date: string | null;
  anonymous: boolean;
  club: string | null;
  company_club: string | null;
  team: string | null;
  team_group: string | null;
  default_class: string | null;
  license: string | null;
  address: string | null;
  postal_code: string | null;
  postal_place: string | null;
  country: string | null;
  nationality: string | null;
  mobile: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
}

interface RegistrationRow {
  id: string;
  race_type: string;
  status: string;
  events: { id: string; title: string; starts_at: string; location: string } | null;
}

interface LikedRow {
  id: string;
  events: { id: string; title: string; starts_at: string; location: string } | null;
}

function ProfilePage() {
  const { user, loading: authLoading, mode, setMode, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [regs, setRegs] = useState<RegistrationRow[]>([]);
  const [liked, setLiked] = useState<LikedRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"general" | "address" | "races" | "liked" | "roles">("general");

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (data) setProfile(data as Profile);
      const { data: r } = await supabase
        .from("registrations")
        .select("id, race_type, status, events(id, title, starts_at, location)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setRegs((r as unknown as RegistrationRow[]) ?? []);
      const { data: l } = await supabase
        .from("event_likes")
        .select("id, events(id, title, starts_at, location)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setLiked((l as unknown as LikedRow[]) ?? []);
    })();
  }, [user]);

  const unlike = async (likeId: string) => {
    const { error } = await supabase.from("event_likes").delete().eq("id", likeId);
    if (error) return toast.error(error.message);
    setLiked((prev) => prev.filter((x) => x.id !== likeId));
  };

  const update = (k: keyof Profile, v: string | boolean | null) =>
    setProfile((p) => (p ? { ...p, [k]: v } : p));

  const save = async () => {
    if (!user || !profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update(profile).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved.");
  };

  if (!user || !profile) {
    return <div className="mx-auto max-w-3xl px-6 py-20 text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex justify-end gap-2 pt-4 pr-14">
        <ModeToggle mode={mode} setMode={setMode} />
        <button
          onClick={async () => {
            await signOut();
            navigate({ to: "/" });
          }}
          className="rounded-full border border-hairline bg-card px-4 py-2 text-xs text-muted-foreground hover:text-ink"
        >
          Sign out
        </button>
      </div>

      <div className="mt-8 grid gap-10 md:grid-cols-[180px_1fr]">
        <nav className="-ml-2 flex flex-row gap-1 md:flex-col md:gap-0.5">
          {(["general", "address", "races", "liked"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-2 text-left text-sm transition ${
                tab === t
                  ? "bg-secondary font-medium text-ink"
                  : "text-muted-foreground hover:text-ink"
              }`}
            >
              {t === "general"
                ? "General"
                : t === "address"
                  ? "Contact & address"
                  : t === "races"
                    ? "My races"
                    : "Liked races"}
            </button>
          ))}
        </nav>

        <div>
          {tab === "general" && (
            <Card>
              <Grid>
                <Field label="First name" value={profile.first_name ?? ""} onChange={(v) => update("first_name", v)} />
                <Field label="Last name" value={profile.last_name ?? ""} onChange={(v) => update("last_name", v)} />
                <Select
                  label="Gender"
                  value={profile.gender ?? ""}
                  onChange={(v) => update("gender", v || null)}
                  options={[
                    { value: "", label: "—" },
                    { value: "male", label: "Male" },
                    { value: "female", label: "Female" },
                    { value: "other", label: "Other" },
                  ]}
                />
                <Field
                  label="Birth date"
                  type="date"
                  value={profile.birth_date ?? ""}
                  onChange={(v) => update("birth_date", v || null)}
                />
                <Field label="Team" value={profile.team ?? ""} onChange={(v) => update("team", v)} />
                <Field label="License" value={profile.license ?? ""} onChange={(v) => update("license", v)} />
              </Grid>
              <Anonymous value={profile.anonymous} onChange={(v) => update("anonymous", v)} />
              <SaveBar saving={saving} onSave={save} />
            </Card>
          )}

          {tab === "address" && (
            <Card>
              <Grid>
                <Field label="Address" value={profile.address ?? ""} onChange={(v) => update("address", v)} />
                <Field label="Postal code" value={profile.postal_code ?? ""} onChange={(v) => update("postal_code", v)} />
                <Field label="Postal place" value={profile.postal_place ?? ""} onChange={(v) => update("postal_place", v)} />
                <Field label="Country" value={profile.country ?? ""} onChange={(v) => update("country", v)} />
                <Field label="Nationality" value={profile.nationality ?? ""} onChange={(v) => update("nationality", v)} />
                <Field label="Mobile" value={profile.mobile ?? ""} onChange={(v) => update("mobile", v)} />
                <Field
                  label="Emergency contact"
                  value={profile.emergency_contact ?? ""}
                  onChange={(v) => update("emergency_contact", v)}
                />
                <Field
                  label="Emergency phone"
                  value={profile.emergency_phone ?? ""}
                  onChange={(v) => update("emergency_phone", v)}
                />
              </Grid>
              <SaveBar saving={saving} onSave={save} />
            </Card>
          )}

          {tab === "races" && (
            <Card>
              {regs.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-muted-foreground">No races yet.</p>
                  <Link
                    to="/"
                    className="mt-4 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground"
                  >
                    Find a race
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-hairline">
                  {regs.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-4">
                      <div className="min-w-0">
                        <Link
                          to="/events/$eventId"
                          params={{ eventId: r.events?.id ?? "" }}
                          className="block truncate text-ink hover:underline"
                        >
                          {r.events?.title ?? "Race"}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {r.race_type} · {r.events?.location}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="num text-sm text-ink">
                          {r.events ? formatDate(r.events.starts_at) : ""}
                        </span>
                        <span
                          className={`mono text-[10px] uppercase tracking-widest ${
                            r.status === "confirmed"
                              ? "text-ink"
                              : r.status === "cancelled"
                                ? "text-destructive"
                                : "text-accent"
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {tab === "liked" && (
            <Card>
              {liked.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-muted-foreground">No liked races yet.</p>
                  <Link
                    to="/"
                    className="mt-4 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm text-primary-foreground"
                  >
                    Discover races
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-hairline">
                  {liked.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 py-4">
                      <div className="min-w-0">
                        <Link
                          to="/events/$eventId"
                          params={{ eventId: l.events?.id ?? "" }}
                          className="block truncate text-ink hover:underline"
                        >
                          {l.events?.title ?? "Race"}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {l.events?.location}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="num text-sm text-ink">
                          {l.events ? formatDate(l.events.starts_at) : ""}
                        </span>
                        <button
                          onClick={() => unlike(l.id)}
                          className="mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-destructive"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ModeToggle({
  mode,
  setMode,
}: {
  mode: "participant" | "organizer";
  setMode: (m: "participant" | "organizer") => void;
}) {
  return (
    <div className="flex rounded-full border border-hairline bg-card p-1">
      {(["participant", "organizer"] as const).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className={`rounded-full px-3 py-1.5 text-[10px] uppercase tracking-widest transition ${
            mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-ink"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-2xl border border-hairline bg-card p-6 md:p-8">{children}</section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none transition focus:border-primary"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none transition focus:border-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Anonymous({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mt-4 flex items-center gap-3">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-primary"
      />
      <span className="text-sm text-ink">Show as Anonymous in start lists</span>
    </label>
  );
}

function SaveBar({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  return (
    <div className="mt-6 flex justify-end">
      <button
        onClick={onSave}
        disabled={saving}
        className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
