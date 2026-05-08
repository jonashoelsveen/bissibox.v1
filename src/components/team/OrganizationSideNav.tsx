import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronRight,
  Building2,
  Briefcase,
  UserCog,
  Layers,
  Wallet,
  Users as UsersIcon,
  Network,
  MoreHorizontal,
  Pin,
  PinOff,
} from "lucide-react";

export type OrgTabId = "board" | "coaches" | "groups" | "memberships" | "members" | "chart";

export interface OrgTabDef {
  id: OrgTabId;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

export const ORG_TABS: OrgTabDef[] = [
  { id: "board", label: "Board", icon: Briefcase },
  { id: "coaches", label: "Group leaders", icon: UserCog },
  { id: "groups", label: "Groups", icon: Layers },
  { id: "memberships", label: "Memberships", icon: Wallet },
  { id: "members", label: "Members", icon: UsersIcon },
  { id: "chart", label: "Chart", icon: Network },
];

const PIN_KEY = "raceline:org-pinned-tabs";

function loadPinned(): Record<OrgTabId, boolean> {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (!raw) return {} as Record<OrgTabId, boolean>;
    return JSON.parse(raw) as Record<OrgTabId, boolean>;
  } catch {
    return {} as Record<OrgTabId, boolean>;
  }
}

export function OrganizationSideNav({
  active,
  onSelect,
  rootActive,
  onRootClick,
}: {
  /** currently active sub-tab, or null if the root "Organization" view */
  active: OrgTabId | null;
  onSelect: (id: OrgTabId) => void;
  rootActive: boolean;
  onRootClick: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [menuFor, setMenuFor] = useState<OrgTabId | null>(null);
  const [pinned, setPinned] = useState<Record<OrgTabId, boolean>>(() => loadPinned());

  useEffect(() => {
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify(pinned));
    } catch {
      // noop
    }
  }, [pinned]);

  const togglePin = (id: OrgTabId) => {
    setMenuFor(null);
    setPinned((p) => ({ ...p, [id]: !p[id] }));
  };

  const ordered = [...ORG_TABS].sort((a, b) => {
    const ap = pinned[a.id] ? 1 : 0;
    const bp = pinned[b.id] ? 1 : 0;
    return bp - ap;
  });

  return (
    <nav className="flex flex-col gap-1">
      <button
        onClick={() => (rootActive ? setOpen((o) => !o) : onRootClick())}
        className={`group flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition ${
          rootActive ? "bg-secondary font-medium text-ink" : "text-ink hover:bg-secondary/60"
        }`}
      >
        <span className="grid h-5 w-5 shrink-0 place-items-center text-muted-foreground">
          <Building2 className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
        <span className="ml-2 min-w-0 flex-1 truncate">Organization</span>
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-90" : "rotate-0"
          }`}
        />
      </button>

      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ height: { duration: 0.24, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.18 } }}
        style={{ overflow: open ? "visible" : "hidden", pointerEvents: open ? "auto" : "none" }}
      >
        <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-hairline pl-2">
          {ordered.map((t) => {
            const isActive = active === t.id;
            const Icon = t.icon;
            return (
              <div key={t.id} className="group relative flex items-center">
                <button
                  onClick={() => onSelect(t.id)}
                  className={`flex flex-1 items-center gap-1.5 rounded-md px-3 py-1 text-left text-xs transition ${
                    isActive ? "bg-secondary font-medium text-ink" : "text-muted-foreground hover:text-ink"
                  }`}
                >
                  {pinned[t.id] && <Pin className="h-3 w-3 text-muted-foreground/70" />}
                  <Icon className="h-3 w-3 opacity-70" />
                  <span className="truncate">{t.label}</span>
                </button>
                <div className="relative">
                  <button
                    onClick={() => setMenuFor(menuFor === t.id ? null : t.id)}
                    className="rounded p-1 text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 hover:text-ink"
                    aria-label="Tab actions"
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </button>
                  {menuFor === t.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                      <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-md border border-hairline bg-popover shadow-lg">
                        <button
                          onClick={() => togglePin(t.id)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink hover:bg-secondary"
                        >
                          {pinned[t.id] ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                          {pinned[t.id] ? "Unpin" : "Pin"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </nav>
  );
}
