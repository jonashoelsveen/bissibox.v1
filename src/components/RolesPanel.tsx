import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
              <Btn onClick={() => setOpen("team")}>Create team</Btn>
            )
          }
        />
      )}

      {viewMode === "individual" && (
        <>
          <Box
            title="Become a photographer"
            body={
              <p className="text-sm text-muted-foreground">
                Join a production company to upload media to the platform.
              </p>
            }
            action={
              hasRole("photographer") ? (
                <ActiveBadge />
              ) : (
                <Btn onClick={() => setOpen("photographer")}>Become photographer</Btn>
              )
            }
          />

          <Box
            title="Become a timekeeper"
            body={
              <p className="text-sm text-muted-foreground">
                Join a registered timing company (e.g. EQ Timing, Race Result) to time events.
              </p>
            }
            action={
              hasRole("timekeeper") ? (
                <ActiveBadge />
              ) : (
                <Btn onClick={() => setOpen("timekeeper")}>Become timekeeper</Btn>
              )
            }
          />
        </>
      )}

      {viewMode === "team" && (
        <Box
          title="Become an organizer"
          body={
            <p className="text-sm text-muted-foreground">
              Unlock event creation for your team.
            </p>
          }
          action={
            hasRole("organizer") ? (
              <ActiveBadge />
            ) : (
              <Btn
                onClick={async () => {
                  const { error } = await supabase
                    .from("user_roles")
                    .insert({ user_id: userId, role: "organizer" });
                  if (error) return toast.error(error.message);
                  toast.success("You can now create events.");
                  load();
                }}
              >
                Unlock organizer
              </Btn>
            )
          }
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

function Btn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
    >
      {children}
    </button>
  );
}

function ActiveBadge() {
  return (
    <span className="mono rounded-full border border-hairline px-3 py-1 text-[10px] uppercase tracking-widest text-ink">
      Active
    </span>
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
