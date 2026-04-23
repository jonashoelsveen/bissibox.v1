import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";
import raceResultLogo from "@/assets/race-result-logo.png";
import eqTimingLogo from "@/assets/eq-timing-logo.png";

type Role = "organizer" | "photographer" | "timekeeper";
type CompanyKind = "timing" | "production";

interface UserRole {
  id: string;
  role: Role;
  company_id: string | null;
}
interface Company {
  id: string;
  kind: CompanyKind;
  name: string;
}
interface Team {
  id: string;
  name: string;
  owner_id: string;
}

const COMPANY_LOGOS: Record<string, string> = {
  "race result": raceResultLogo,
  "raceresult": raceResultLogo,
  "eq timing": eqTimingLogo,
  "eqtiming": eqTimingLogo,
};

function getCompanyLogo(name: string): string | null {
  return COMPANY_LOGOS[name.toLowerCase().trim()] ?? null;
}

export function RolesPanel({
  userId,
  viewMode = "individual",
}: {
  userId: string;
  viewMode?: "individual" | "team";
}) {
  const [accountType, setAccountType] = useState<"individual" | "team">("individual");
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [open, setOpen] = useState<null | "team" | "photographer" | "timekeeper">(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (key: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const load = async () => {
    const [{ data: prof }, { data: r }, { data: c }, { data: t }] = await Promise.all([
      supabase.from("profiles").select("account_type").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("id, role, company_id").eq("user_id", userId),
      supabase.from("companies").select("id, kind, name").order("name"),
      supabase.from("teams").select("id, name, owner_id").eq("owner_id", userId),
    ]);
    if (prof) setAccountType((prof.account_type as "individual" | "team") ?? "individual");
    setRoles((r ?? []) as UserRole[]);
    setCompanies((c ?? []) as Company[]);
    setTeams((t ?? []) as Team[]);
  };

  useEffect(() => {
    load();
  }, [userId]);

  const hasRole = (r: Role) => roles.some((x) => x.role === r);
  const roleCompany = (r: Role): Company | null => {
    const ur = roles.find((x) => x.role === r);
    if (!ur?.company_id) return null;
    return companies.find((c) => c.id === ur.company_id) ?? null;
  };

  return (
    <section className="mt-6 space-y-4">
      <Box
        title="Account type"
        body={
          <p className="text-sm text-muted-foreground">
            You are viewing roles as a <span className="text-ink">{viewMode}</span>.
            {viewMode === "team" && " Teams can become organizers and create events."}
            {viewMode === "individual" &&
              " Individuals can create a team, become a photographer, or become a timekeeper."}
          </p>
        }
      />

      {viewMode === "individual" && accountType === "individual" && (
        <Box
          title="Create a team"
          body={
            <p className="text-sm text-muted-foreground">
              Turn your account into a team. You'll be able to add members and become an organizer.
            </p>
          }
          action={
            teams.length > 0 ? (
              <span className="mono text-[10px] uppercase tracking-widest text-ink">
                {teams[0].name}
              </span>
            ) : (
              <BecomeBtn onClick={() => setOpen("team")}>Create team</BecomeBtn>
            )
          }
        />
      )}

      {viewMode === "individual" && (
        <>
          <RoleCard
            title="Photographer"
            tagline="Join a production company to upload media to the platform."
            expanded={expanded.has("photographer")}
            onToggle={() => toggleExpanded("photographer")}
            details={
              <>
                <p>
                  As a photographer on the platform, you'll be able to upload event media,
                  tag athletes as subjects, and have your work discovered by participants
                  and organizers.
                </p>
                <ul className="ml-4 list-disc space-y-1">
                  <li>Upload high-resolution images and video to events you cover.</li>
                  <li>Get credited on every media item — your name appears with the production company in parentheses.</li>
                  <li>Build a portfolio that organizers can browse when hiring.</li>
                  <li>Participants can purchase or download photos where they are the subject.</li>
                </ul>
                <p className="mt-2">
                  <strong>Guidelines:</strong> Only professional photographers affiliated with a
                  registered production company are accepted. The company will verify your
                  affiliation. Respect athlete privacy — do not publish media flagged as private.
                </p>
              </>
            }
            active={hasRole("photographer")}
            activeCompany={roleCompany("photographer")}
            onBecome={() => setOpen("photographer")}
            becomeLabel="Become photographer"
          />

          <RoleCard
            title="Timekeeper"
            tagline="Join a registered timing company to time events on the platform."
            expanded={expanded.has("timekeeper")}
            onToggle={() => toggleExpanded("timekeeper")}
            details={
              <>
                <p>
                  As a timekeeper, you operate the official timing for races on behalf of a
                  registered timing company such as EQ Timing or Race Result.
                </p>
                <ul className="ml-4 list-disc space-y-1">
                  <li>Push live results and split times directly to event pages.</li>
                  <li>Manage bib assignments and class brackets together with organizers.</li>
                  <li>Get credited on every result with your timing company logo and name.</li>
                  <li>Access timing dashboards across every event your company services.</li>
                </ul>
                <p className="mt-2">
                  <strong>Guidelines:</strong> Only operators affiliated with a registered timing
                  company can become timekeepers. Your company must accept your request before
                  you can publish results.
                </p>
              </>
            }
            active={hasRole("timekeeper")}
            activeCompany={roleCompany("timekeeper")}
            onBecome={() => setOpen("timekeeper")}
            becomeLabel="Become timekeeper"
          />
        </>
      )}

      {viewMode === "team" && (
        <RoleCard
          title="Organizer"
          tagline="Unlock event creation and full participant management for your team."
          expanded={expanded.has("organizer")}
          onToggle={() => toggleExpanded("organizer")}
          details={
            <>
              <p>
                Becoming an organizer unlocks the full event toolkit for your team. Run anything
                from a casual training session to a certified competition.
              </p>
                <ul className="ml-4 list-disc space-y-1">
                  <li><strong>Create events</strong> — trainings, competitions, multi-stage races.</li>
                  <li><strong>Draw course maps</strong> with our editor, complete with elevation profiles and split points.</li>
                  <li><strong>Manage participants</strong> — accept signups, assign bibs, set classes and start times.</li>
                  <li><strong>Add co-organizers</strong> to share the workload across your team members.</li>
                  <li><strong>Hire photographers and timekeepers</strong> directly from registered companies.</li>
                  <li><strong>Publish</strong> when ready — your event appears in the public feed and on athlete dashboards.</li>
                </ul>
              <p className="mt-2">
                <strong>Note:</strong> Until payments are integrated, organizer access is granted
                automatically to every team.
              </p>
            </>
          }
          active={hasRole("organizer")}
          activeCompany={null}
          onBecome={async () => {
            const { error } = await supabase
              .from("user_roles")
              .insert({ user_id: userId, role: "organizer" });
            if (error) return toast.error(error.message);
            toast.success("You can now create events.");
            load();
          }}
          becomeLabel="Become organizer"
        />
      )}

      {open === "team" && (
        <TeamModal
          userId={userId}
          onClose={() => setOpen(null)}
          onCreated={async () => {
            await supabase.from("profiles").update({ account_type: "team" }).eq("id", userId);
            setOpen(null);
            load();
          }}
        />
      )}

      {open === "photographer" && (
        <CompanyModal
          title="Choose a production company"
          companies={companies.filter((c) => c.kind === "production")}
          emptyHint="No production companies are registered yet. Coming soon."
          note="The company will be notified, and you'll be notified when they accept."
          onClose={() => setOpen(null)}
          onSelect={async (companyId) => {
            const { error } = await supabase
              .from("user_roles")
              .insert({ user_id: userId, role: "photographer", company_id: companyId });
            if (error) return toast.error(error.message);
            toast.success("You're now a photographer (auto-approved for now).");
            setOpen(null);
            load();
          }}
        />
      )}

      {open === "timekeeper" && (
        <CompanyModal
          title="Choose a timing company"
          companies={companies.filter((c) => c.kind === "timing")}
          emptyHint="No timing companies registered."
          note="The company will be notified, and you'll be notified when they accept."
          onClose={() => setOpen(null)}
          onSelect={async (companyId) => {
            const { error } = await supabase
              .from("user_roles")
              .insert({ user_id: userId, role: "timekeeper", company_id: companyId });
            if (error) return toast.error(error.message);
            toast.success("You're now a timekeeper (auto-approved for now).");
            setOpen(null);
            load();
          }}
        />
      )}
    </section>
  );
}

function RoleCard({
  title,
  tagline,
  expanded,
  onToggle,
  details,
  active,
  activeCompany,
  onBecome,
  becomeLabel,
}: {
  title: string;
  tagline: string;
  expanded: boolean;
  onToggle: () => void;
  details: React.ReactNode;
  active: boolean;
  activeCompany: Company | null;
  onBecome: () => void;
  becomeLabel: string;
}) {
  const logo = activeCompany ? getCompanyLogo(activeCompany.name) : null;

  return (
    <div className="rounded-2xl border border-hairline bg-card p-5 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-ink">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{tagline}</p>
          <button
            onClick={onToggle}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-ink hover:opacity-80"
          >
            {expanded ? "Hide details" : "Read more"}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
        <div className="shrink-0">
          {active ? (
            <div className="flex flex-col items-end gap-2">
              <span className="mono rounded-full border border-hairline px-3 py-1 text-[10px] uppercase tracking-widest text-ink">
                Active
              </span>
              {activeCompany && (
                <div className="flex items-center gap-2">
                  {logo ? (
                    <img
                      src={logo}
                      alt={activeCompany.name}
                      className="h-8 w-auto max-w-[120px] object-contain"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">{activeCompany.name}</span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <BecomeBtn onClick={onBecome}>{becomeLabel}</BecomeBtn>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-2 rounded-xl border border-hairline bg-background p-4 text-sm text-muted-foreground">
          {details}
        </div>
      )}
    </div>
  );
}

function Box({
  title,
  body,
  action,
}: {
  title: string;
  body: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-card p-5 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{title}</h3>
          <div className="mt-2">{body}</div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

function BecomeBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border border-hairline bg-white px-4 py-2 text-xs font-medium text-black hover:bg-neutral-100"
    >
      {children}
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-hairline bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-ink">{title}</h2>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-ink">
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function TeamModal({
  userId,
  onClose,
  onCreated,
}: {
  userId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [nif, setNif] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <Modal title="Create a team" onClose={onClose}>
      <div className="space-y-3">
        <Input label="Team name" value={name} onChange={setName} />
        <Input label="NIF ID (optional)" value={nif} onChange={setNif} placeholder="Upload coming later" />
        <button
          disabled={saving || !name.trim()}
          onClick={async () => {
            setSaving(true);
            const { error } = await supabase
              .from("teams")
              .insert({ name: name.trim(), nif_id: nif || null, owner_id: userId });
            setSaving(false);
            if (error) return toast.error(error.message);
            toast.success("Team created.");
            onCreated();
          }}
          className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create team"}
        </button>
      </div>
    </Modal>
  );
}

function CompanyModal({
  title,
  companies,
  emptyHint,
  note,
  onClose,
  onSelect,
}: {
  title: string;
  companies: Company[];
  emptyHint: string;
  note: string;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string>("");
  const filtered = companies.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search companies…"
          className="w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
        />
        <div className="max-h-56 overflow-y-auto rounded-xl border border-hairline">
          {filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{emptyHint}</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => setPicked(c.id)}
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition ${
                  picked === c.id ? "bg-secondary text-ink" : "text-muted-foreground hover:text-ink"
                }`}
              >
                <span>{c.name}</span>
                {picked === c.id && <span className="mono text-[10px] uppercase">Selected</span>}
              </button>
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground">{note}</p>
        <button
          disabled={!picked}
          onClick={() => onSelect(picked)}
          className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Confirm
        </button>
      </div>
    </Modal>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
      />
    </label>
  );
}
