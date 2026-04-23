import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, ArrowLeft, User, Users, Building2, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/discover")({
  component: DiscoverPage,
  head: () => ({ meta: [{ title: "Discover · Raceline" }] }),
});

type Tab = "top" | "users" | "photographers" | "teams" | "companies";

interface ProfileResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  athlete_active: boolean;
  is_photographer: boolean;
  photographer_active: boolean;
}
interface TeamResult {
  id: string;
  name: string;
  description: string | null;
}
interface CompanyResult {
  id: string;
  name: string;
  kind: "timing" | "production";
}

function DiscoverPage() {
  const { user, mode, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("top");
  const [q, setQ] = useState("");
  const [profiles, setProfiles] = useState<ProfileResult[]>([]);
  const [teams, setTeams] = useState<TeamResult[]>([]);
  const [companies, setCompanies] = useState<CompanyResult[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
    if (mode === "team" || mode === "organizer") navigate({ to: "/" });
  }, [loading, user, mode, navigate]);

  useEffect(() => {
    if (!user) return;
    const term = q.trim();
    (async () => {
      // Profiles: only those publicly visible (athlete or photographer active)
      let pq = supabase
        .from("profiles")
        .select("id, first_name, last_name, athlete_active, is_photographer, photographer_active")
        .or("athlete_active.eq.true,photographer_active.eq.true")
        .limit(40);
      if (term) {
        pq = pq.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
      }
      const { data: p } = await pq;
      setProfiles((p as ProfileResult[]) ?? []);

      let tq = supabase.from("teams").select("id, name, description").limit(20);
      if (term) tq = tq.ilike("name", `%${term}%`);
      const { data: t } = await tq;
      setTeams((t as TeamResult[]) ?? []);

      let cq = supabase.from("companies").select("id, name, kind").limit(20);
      if (term) cq = cq.ilike("name", `%${term}%`);
      const { data: c } = await cq;
      setCompanies((c as CompanyResult[]) ?? []);
    })();
  }, [q, user]);

  const athletes = useMemo(() => profiles.filter((p) => p.athlete_active), [profiles]);
  const photographers = useMemo(
    () => profiles.filter((p) => p.is_photographer && p.photographer_active),
    [profiles],
  );

  if (!user) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "top", label: "Top" },
    { key: "users", label: "Users" },
    { key: "photographers", label: "Photographers" },
    { key: "teams", label: "Teams" },
    { key: "companies", label: "Companies" },
  ];

  return (
    <div className="px-4 md:px-6">
      <div className="mx-auto max-w-3xl pt-6 pr-14">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search users, teams, companies"
            className="w-full rounded-full border border-hairline bg-card py-3 pl-11 pr-4 text-sm text-ink outline-none transition focus:border-primary"
            autoFocus
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs transition ${
                tab === t.key
                  ? "bg-primary text-primary-foreground"
                  : "border border-hairline bg-card text-muted-foreground hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-2">
          {tab === "top" && (
            <>
              {athletes.slice(0, 5).map((p) => (
                <UserRow key={`a-${p.id}`} p={p} role="athlete" />
              ))}
              {photographers.slice(0, 5).map((p) => (
                <UserRow key={`ph-${p.id}`} p={p} role="photographer" />
              ))}
              {teams.slice(0, 5).map((t) => (
                <TeamRow key={t.id} t={t} />
              ))}
              {companies.slice(0, 5).map((c) => (
                <CompanyRow key={c.id} c={c} />
              ))}
              {athletes.length + photographers.length + teams.length + companies.length === 0 && (
                <Empty />
              )}
            </>
          )}
          {tab === "users" && (
            <>
              {athletes.map((p) => <UserRow key={p.id} p={p} role="athlete" />)}
              {athletes.length === 0 && <Empty />}
            </>
          )}
          {tab === "photographers" && (
            <>
              {photographers.map((p) => <UserRow key={p.id} p={p} role="photographer" />)}
              {photographers.length === 0 && <Empty />}
            </>
          )}
          {tab === "teams" && (
            <>
              {teams.map((t) => <TeamRow key={t.id} t={t} />)}
              {teams.length === 0 && <Empty />}
            </>
          )}
          {tab === "companies" && (
            <>
              {companies.map((c) => <CompanyRow key={c.id} c={c} />)}
              {companies.length === 0 && <Empty />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function nameOf(p: ProfileResult) {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed";
}

function UserRow({ p, role }: { p: ProfileResult; role: "athlete" | "photographer" }) {
  return (
    <Link
      to="/u/$userId"
      params={{ userId: p.id }}
      search={role === "photographer" ? { as: "photographer" } : undefined}
      className="flex items-center gap-3 rounded-2xl border border-hairline bg-card px-4 py-3 transition hover:bg-secondary"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
        {role === "photographer" ? (
          <Camera className="h-4 w-4 text-ink" />
        ) : (
          <User className="h-4 w-4 text-ink" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{nameOf(p)}</div>
        <div className="text-xs text-muted-foreground">
          {role === "photographer" ? "Photographer" : "Athlete"}
        </div>
      </div>
    </Link>
  );
}

function TeamRow({ t }: { t: TeamResult }) {
  return (
    <Link
      to="/t/$teamId"
      params={{ teamId: t.id }}
      className="flex items-center gap-3 rounded-2xl border border-hairline bg-card px-4 py-3 transition hover:bg-secondary"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
        <Users className="h-4 w-4 text-ink" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{t.name}</div>
        <div className="text-xs text-muted-foreground">Team</div>
      </div>
    </Link>
  );
}

function CompanyRow({ c }: { c: CompanyResult }) {
  return (
    <Link
      to="/c/$companyId"
      params={{ companyId: c.id }}
      className="flex items-center gap-3 rounded-2xl border border-hairline bg-card px-4 py-3 transition hover:bg-secondary"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
        <Building2 className="h-4 w-4 text-ink" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{c.name}</div>
        <div className="text-xs text-muted-foreground capitalize">{c.kind} company</div>
      </div>
    </Link>
  );
}

function Empty() {
  return (
    <div className="rounded-2xl border border-dashed border-hairline bg-card/40 py-14 text-center text-sm text-muted-foreground">
      No results.
    </div>
  );
}

export function BackArrow() {
  return (
    <Link
      to="/discover"
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-card text-ink hover:bg-secondary"
      aria-label="Back"
    >
      <ArrowLeft className="h-4 w-4" />
    </Link>
  );
}
