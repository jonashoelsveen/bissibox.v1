import { useEffect, useRef, useState, useMemo } from "react";
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

// Layout constants
const NODE_W = 220;
const NODE_H = 64;
const EXPANDED_W = 320;
const ROW_H = 28;
const V_GAP = 110; // gap between board row and groups row
const H_GAP = 32;

export function OrgChart({ board, groups, teamName }: OrgChartProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [contactPerson, setContactPerson] = useState<OrgPerson | null>(null);

  // Compute layout
  const layout = useMemo(() => {
    const totalGroupsW = groups.length * NODE_W + Math.max(0, groups.length - 1) * H_GAP;
    const startX = -totalGroupsW / 2;
    const groupNodes = groups.map((g, i) => {
      const expanded = expandedId === g.id;
      const w = expanded ? EXPANDED_W : NODE_W;
      const baseX = startX + i * (NODE_W + H_GAP);
      // center expanded box around its base center
      const x = baseX - (w - NODE_W) / 2;
      const headerH = NODE_H;
      const bodyH = expanded ? 16 + (g.leaders.length + g.members.length) * ROW_H + 16 : 0;
      const h = headerH + bodyH;
      return { group: g, x, y: V_GAP, w, h, expanded };
    });
    const boardX = -NODE_W / 2;
    const boardY = 0;
    return { groupNodes, boardX, boardY };
  }, [groups, expandedId]);

  // Pan handlers
  const onMouseDown = (e: React.MouseEvent) => {
    // Don't pan if clicking on an interactive element inside a node
    const target = e.target as HTMLElement;
    if (target.closest("[data-node-interactive]")) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, tx, ty };
  };
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      if (!dragStart.current) return;
      setTx(dragStart.current.tx + (e.clientX - dragStart.current.x));
      setTy(dragStart.current.ty + (e.clientY - dragStart.current.y));
    };
    const onUp = () => {
      setDragging(false);
      dragStart.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setScale((s) => Math.min(2.5, Math.max(0.4, s + delta)));
  };

  // Auto-zoom and recenter on expansion
  useEffect(() => {
    if (!expandedId) return;
    const node = layout.groupNodes.find((n) => n.group.id === expandedId);
    if (!node || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    // Target scale: fit node height into 70% of viewport
    const targetScale = Math.min(1.4, Math.max(0.8, (rect.height * 0.7) / node.h));
    setScale(targetScale);
    // Center node: viewport center is at (rect.w/2, rect.h/2). Node center in chart coords is (node.x + w/2, node.y + h/2).
    const nodeCx = node.x + node.w / 2;
    const nodeCy = node.y + node.h / 2;
    setTx(rect.width / 2 - nodeCx * targetScale);
    setTy(rect.height / 2 - nodeCy * targetScale);
  }, [expandedId, layout.groupNodes]);

  // Recenter to fit-all when collapsing
  const fitAll = () => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const totalW = Math.max(NODE_W, groups.length * NODE_W + Math.max(0, groups.length - 1) * H_GAP) + 80;
    const totalH = V_GAP + NODE_H + 80;
    const s = Math.min(1, Math.min(rect.width / totalW, rect.height / totalH));
    setScale(s);
    setTx(rect.width / 2);
    setTy(rect.height * 0.18);
  };
  useEffect(() => {
    fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length]);

  const onBackgroundClick = () => {
    if (expandedId) {
      setExpandedId(null);
      // Defer fit to next tick so layout collapses first
      setTimeout(fitAll, 10);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-hairline bg-card">
      {/* Toolbar */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border border-hairline bg-background/90 p-0.5 shadow-sm backdrop-blur" data-node-interactive>
        <button
          onClick={() => setScale((s) => Math.min(2.5, s + 0.15))}
          className="cursor-pointer rounded px-2 py-1 text-sm text-ink hover:bg-secondary"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => setScale((s) => Math.max(0.4, s - 0.15))}
          className="cursor-pointer rounded px-2 py-1 text-sm text-ink hover:bg-secondary"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          onClick={fitAll}
          className="cursor-pointer rounded px-2 py-1 mono text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-secondary"
        >
          Fit
        </button>
      </div>

      <div
        ref={wrapperRef}
        onMouseDown={onMouseDown}
        onWheel={onWheel}
        onClick={onBackgroundClick}
        className={`h-full w-full select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ touchAction: "none" }}
      >
        <div
          className="relative h-full w-full origin-top-left"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: "0 0",
            transition: dragging ? "none" : "transform 320ms cubic-bezier(.2,.8,.2,1)",
          }}
        >
          {/* SVG connectors */}
          <svg
            className="pointer-events-none absolute"
            style={{ overflow: "visible", left: 0, top: 0 }}
            width="1"
            height="1"
          >
            {layout.groupNodes.map((n) => {
              const startX = layout.boardX + NODE_W / 2;
              const startY = layout.boardY + NODE_H;
              const endX = n.x + n.w / 2;
              const endY = n.y;
              const midY = (startY + endY) / 2;
              return (
                <path
                  key={n.group.id}
                  d={`M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`}
                  stroke="hsl(var(--border, 220 13% 80%))"
                  className="stroke-hairline"
                  strokeWidth={1.25}
                  fill="none"
                />
              );
            })}
          </svg>

          {/* Board node */}
          <BoardNode
            x={layout.boardX}
            y={layout.boardY}
            board={board}
            teamName={teamName}
            onPersonClick={(p) => setContactPerson(p)}
          />

          {/* Group nodes */}
          {layout.groupNodes.map((n) => (
            <GroupNode
              key={n.group.id}
              x={n.x}
              y={n.y}
              w={n.w}
              h={n.h}
              group={n.group}
              expanded={n.expanded}
              onToggle={() => setExpandedId(n.expanded ? null : n.group.id)}
              onClose={() => {
                setExpandedId(null);
                setTimeout(fitAll, 10);
              }}
              onPersonClick={(p) => setContactPerson(p)}
            />
          ))}

          {/* Empty state spacing */}
          {groups.length === 0 && (
            <div
              className="absolute text-center text-xs text-muted-foreground"
              style={{ left: -120, top: V_GAP + 8, width: 240 }}
              data-node-interactive
            >
              No groups yet. Create groups in the Groups tab to see them here.
            </div>
          )}
        </div>
      </div>

      {/* Contact dialog */}
      {contactPerson && (
        <ContactDialog person={contactPerson} onClose={() => setContactPerson(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function BoardNode({
  x,
  y,
  board,
  teamName,
  onPersonClick,
}: {
  x: number;
  y: number;
  board: OrgPerson[];
  teamName?: string;
  onPersonClick: (p: OrgPerson) => void;
}) {
  const [open, setOpen] = useState(false);
  const headerH = NODE_H;
  const bodyH = open ? 16 + Math.max(1, board.length) * ROW_H + 16 : 0;
  return (
    <div
      data-node-interactive
      onClick={(e) => e.stopPropagation()}
      className="absolute rounded-lg border border-hairline bg-background shadow-sm"
      style={{
        left: x,
        top: y,
        width: NODE_W,
        height: headerH + bodyH,
        transition: "height 280ms cubic-bezier(.2,.8,.2,1)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left transition hover:bg-secondary/50"
        style={{ height: headerH }}
      >
        <div className="min-w-0">
          <p className="mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">Board</p>
          <p className="mt-0.5 truncate text-sm text-ink">{teamName ?? "Board"}</p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-hairline px-3 py-3">
          {board.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No board members yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {board.map((p) => (
                <PersonRow key={p.id} person={p} onClick={() => onPersonClick(p)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function GroupNode({
  x,
  y,
  w,
  h,
  group,
  expanded,
  onToggle,
  onClose,
  onPersonClick,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  group: OrgGroup;
  expanded: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPersonClick: (p: OrgPerson) => void;
}) {
  return (
    <div
      data-node-interactive
      onClick={(e) => e.stopPropagation()}
      className={`absolute rounded-lg border bg-background shadow-sm ${
        expanded ? "border-primary/40 shadow-lg" : "border-hairline"
      }`}
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        transition: "all 280ms cubic-bezier(.2,.8,.2,1)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left transition hover:bg-secondary/50"
        style={{ height: NODE_H }}
      >
        <div className="min-w-0">
          <p className="mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">Group</p>
          <p className="mt-0.5 truncate text-sm text-ink">{group.name || "Untitled"}</p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <>
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-2 top-2 cursor-pointer rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="border-t border-hairline px-3 py-3">
            {group.leaders.length > 0 && (
              <>
                <p className="mb-1 mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                  Leader{group.leaders.length > 1 ? "s" : ""}
                </p>
                <ul className="mb-2 space-y-0.5">
                  {group.leaders.map((p) => (
                    <PersonRow key={p.id} person={p} onClick={() => onPersonClick(p)} accent />
                  ))}
                </ul>
              </>
            )}
            {group.members.length > 0 ? (
              <>
                <p className="mb-1 mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                  Members ({group.members.length})
                </p>
                <ul className="space-y-0.5">
                  {group.members.map((p) => (
                    <PersonRow key={p.id} person={p} onClick={() => onPersonClick(p)} />
                  ))}
                </ul>
              </>
            ) : group.leaders.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No members yet.</p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

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
        className={`group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12px] transition hover:bg-secondary ${
          accent ? "text-ink" : "text-ink"
        }`}
      >
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
            accent ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
          } group-hover:bg-primary/20 group-hover:text-primary`}
        >
          <User2 className="h-3 w-3" />
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
