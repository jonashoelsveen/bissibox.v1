import { useEffect, useState } from "react";
import { ChevronDown, X, User2, Mail, Phone, Briefcase } from "lucide-react";

export interface OrgPerson {
  id: string;
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface OrgGroup {
  id: string;
  name: string;
  description?: string | null;
  leaders: OrgPerson[];
  members: OrgPerson[];
}

export interface OrgChartProps {
  board: OrgPerson[];
  groups: OrgGroup[];
  teamName?: string;
}

type FocusTarget =
  | { kind: "group"; id: string }
  | { kind: "board" }
  | null;

export function OrgChart({ board, groups, teamName }: OrgChartProps) {
  const [focus, setFocus] = useState<FocusTarget>(null);
  const [contactPerson, setContactPerson] = useState<OrgPerson | null>(null);

  const focusedGroup =
    focus?.kind === "group" ? groups.find((g) => g.id === focus.id) ?? null : null;
  const isBoardFocused = focus?.kind === "board";

  const close = () => setFocus(null);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-hairline bg-card">
      <div className="relative flex-1 overflow-y-auto">
        {/* Full chart fades/zooms out when focused */}
        <div
          className={`transition-all duration-300 ease-out ${
            focus
              ? "pointer-events-none scale-[0.96] opacity-0"
              : "scale-100 opacity-100"
          }`}
        >
          <FullChart
            board={board}
            groups={groups}
            teamName={teamName}
            onExpandGroup={(id) => setFocus({ kind: "group", id })}
            onExpandBoard={() => setFocus({ kind: "board" })}
            onPersonClick={(p) => setContactPerson(p)}
          />
        </div>

        {focusedGroup && (
          <FocusedOverlay onClose={close}>
            <FocusedGroupCard
              group={focusedGroup}
              onClose={close}
              onPersonClick={(p) => setContactPerson(p)}
            />
          </FocusedOverlay>
        )}

        {isBoardFocused && (
          <FocusedOverlay onClose={close}>
            <FocusedBoardCard
              board={board}
              teamName={teamName}
              onClose={close}
              onPersonClick={(p) => setContactPerson(p)}
            />
          </FocusedOverlay>
        )}
      </div>

      {contactPerson && (
        <ContactDialog person={contactPerson} onClose={() => setContactPerson(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Full chart: Board on top, group boxes below

function FullChart({
  board,
  groups,
  teamName,
  onExpandGroup,
  onExpandBoard,
  onPersonClick,
}: {
  board: OrgPerson[];
  groups: OrgGroup[];
  teamName?: string;
  onExpandGroup: (id: string) => void;
  onExpandBoard: () => void;
  onPersonClick: (p: OrgPerson) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-10 px-6 py-10 animate-in fade-in duration-300">
      {/* Board */}
      <div className="w-full max-w-[260px]">
        <BoardBox board={board} teamName={teamName} onExpand={onExpandBoard} />
      </div>

      {/* Connector */}
      {groups.length > 0 && (
        <div className="-my-6 h-10 w-px bg-hairline" aria-hidden="true" />
      )}

      {/* Groups grid */}
      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No groups yet. Create groups in the Groups tab to see them here.
        </p>
      ) : (
        <div className="relative w-full">
          {/* Horizontal connector line above groups */}
          {groups.length > 1 && (
            <div
              className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-6 bg-hairline"
              style={{
                height: 1,
                width: `min(100%, ${groups.length * 240}px)`,
              }}
              aria-hidden="true"
            />
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {groups.map((g) => (
              <div key={g.id} className="relative">
                {/* Vertical drop to box */}
                <div
                  className="pointer-events-none absolute left-1/2 -top-6 h-6 w-px -translate-x-1/2 bg-hairline"
                  aria-hidden="true"
                />
                <GroupBox group={g} onExpand={() => onExpandGroup(g.id)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BoardBox({
  board,
  teamName,
  onExpand,
}: {
  board: OrgPerson[];
  teamName?: string;
  onExpand: () => void;
}) {
  return (
    <button
      onClick={onExpand}
      className="group flex w-full items-center justify-between gap-2 rounded-lg border border-hairline bg-background px-4 py-3 text-left shadow-sm transition hover:border-primary/40 hover:bg-secondary/40"
    >
      <div className="min-w-0">
        <p className="mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">Board</p>
        <p className="mt-0.5 truncate text-sm text-ink">{teamName || "Board"}</p>
        <p className="mt-0.5 mono text-[10px] text-muted-foreground">
          {board.length} {board.length === 1 ? "member" : "members"}
        </p>
      </div>
      <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-muted-foreground transition group-hover:text-primary" />
    </button>
  );
}

function GroupBox({ group, onExpand }: { group: OrgGroup; onExpand: () => void }) {
  const total = group.leaders.length + group.members.length;
  return (
    <button
      onClick={onExpand}
      className="group flex w-full items-center justify-between gap-2 rounded-lg border border-hairline bg-background px-4 py-3 text-left shadow-sm transition hover:border-primary/40 hover:bg-secondary/40"
    >
      <div className="min-w-0">
        <p className="mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">Group</p>
        <p className="mt-0.5 truncate text-sm text-ink">{group.name || "Untitled"}</p>
        <p className="mt-0.5 mono text-[10px] text-muted-foreground">
          {total} {total === 1 ? "person" : "people"}
        </p>
      </div>
      <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-muted-foreground transition group-hover:text-primary" />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Focus overlay + focused cards (group / board)

function FocusedOverlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 flex items-start justify-center overflow-y-auto px-6 py-10 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl animate-in fade-in zoom-in-95 duration-300 ease-out"
      >
        {children}
      </div>
    </div>
  );
}

function FocusedGroupCard({
  group,
  onClose,
  onPersonClick,
}: {
  group: OrgGroup;
  onClose: () => void;
  onPersonClick: (p: OrgPerson) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-primary/40 bg-background shadow-xl">
      <header className="flex items-center justify-between gap-3 border-b border-hairline bg-background/60 px-5 py-3.5">
        <div className="min-w-0">
          <p className="mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Group
          </p>
          <h3 className="mt-0.5 truncate text-base text-ink">{group.name || "Untitled"}</h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="space-y-5 px-5 py-5">
        {group.description && (
          <p className="text-[12px] leading-relaxed text-muted-foreground">{group.description}</p>
        )}

        <section>
          <p className="mb-2 mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {group.leaders.length > 1 ? "Leaders" : "Leader"}
          </p>
          {group.leaders.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">No leader assigned.</p>
          ) : (
            <ul className="space-y-0.5">
              {group.leaders.map((p) => (
                <PersonRow key={p.id} person={p} onClick={() => onPersonClick(p)} accent />
              ))}
            </ul>
          )}
        </section>

        <section>
          <p className="mb-2 mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Members ({group.members.length})
          </p>
          {group.members.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">No members yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {group.members.map((p) => (
                <PersonRow key={p.id} person={p} onClick={() => onPersonClick(p)} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function FocusedBoardCard({
  board,
  teamName,
  onClose,
  onPersonClick,
}: {
  board: OrgPerson[];
  teamName?: string;
  onClose: () => void;
  onPersonClick: (p: OrgPerson) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-primary/40 bg-background shadow-xl">
      <header className="flex items-center justify-between gap-3 border-b border-hairline bg-background/60 px-5 py-3.5">
        <div className="min-w-0">
          <p className="mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Board
          </p>
          <h3 className="mt-0.5 truncate text-base text-ink">{teamName || "Board"}</h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="space-y-5 px-5 py-5">
        <section>
          <p className="mb-2 mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Members ({board.length})
          </p>
          {board.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">No board members yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {board.map((p) => (
                <PersonRow key={p.id} person={p} onClick={() => onPersonClick(p)} accent />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function PersonRow({
  person,
  onClick,
  accent,
}: {
  person: OrgPerson;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[13px] text-ink transition hover:bg-secondary"
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition ${
            accent ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
          } group-hover:bg-primary/20 group-hover:text-primary`}
        >
          <User2 className="h-3.5 w-3.5" />
        </span>
        <span className="truncate">{person.name || "Unnamed"}</span>
        {person.role && (
          <span className="ml-auto truncate mono text-[9px] uppercase tracking-wider text-muted-foreground">
            {person.role}
          </span>
        )}
      </button>
    </li>
  );
}

function ContactDialog({ person, onClose }: { person: OrgPerson; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-hairline bg-card shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-hairline bg-background/60 px-5 py-3.5">
          <div className="min-w-0">
            <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Contact
            </p>
            <h2 className="mt-0.5 truncate text-lg text-ink">{person.name || "Unnamed"}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="space-y-3 px-6 py-5 text-sm">
          {person.role && (
            <Row icon={<Briefcase className="h-3.5 w-3.5" />} label="Role" value={person.role} />
          )}
          <Row
            icon={<Mail className="h-3.5 w-3.5" />}
            label="Email"
            value={person.email || "—"}
            href={person.email ? `mailto:${person.email}` : undefined}
          />
          <Row
            icon={<Phone className="h-3.5 w-3.5" />}
            label="Phone"
            value={person.phone || "—"}
            href={person.phone ? `tel:${person.phone}` : undefined}
          />
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
        {href && value !== "—" ? (
          <a href={href} className="block truncate text-ink hover:text-primary">
            {value}
          </a>
        ) : (
          <p className="truncate text-ink">{value}</p>
        )}
      </div>
    </div>
  );
}
