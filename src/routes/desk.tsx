import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  MoreVertical,
  Pin,
  PinOff,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";

export const Route = createFileRoute("/desk")({
  component: DeskPage,
  head: () => ({ meta: [{ title: "Desk · Raceline" }] }),
});

type DeskKind = "all" | "personal" | "team";

interface DeskRow {
  id: string;
  name: string;
  kind: DeskKind;
  pinned: boolean;
  // For team-derived rows we keep the originating team id
  teamId?: string;
}

const MATERIALS: Record<string, { label: string; bg: string; surface: string }> = {
  oak: {
    label: "Oak",
    bg: "linear-gradient(135deg, #c9a26b 0%, #a87c46 50%, #8b5e2f 100%)",
    surface:
      "repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0 2px, transparent 2px 6px), linear-gradient(135deg, #d6b07a 0%, #b88753 60%, #8d6033 100%)",
  },
  steel: {
    label: "Stainless steel",
    bg: "linear-gradient(135deg, #d8dde3 0%, #aab1bb 50%, #6e747d 100%)",
    surface:
      "repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 4px), linear-gradient(135deg, #e3e7ec 0%, #b3bac4 55%, #777e88 100%)",
  },
};

function DeskPage() {
  const { user, mode, activeEntityId, loading } = useAuth();
  const navigate = useNavigate();

  const isIndividual = mode !== "team" && mode !== "organizer" && !activeEntityId;

  // Material preference (local-only for Phase 1)
  const [material, setMaterial] = useState<string>(() => {
    if (typeof window === "undefined") return "oak";
    return localStorage.getItem("desk:material") || "oak";
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("desk:material", material);
  }, [material]);

  // Memberships → one team-row per membership
  const [teamRows, setTeamRows] = useState<DeskRow[]>([]);
  // Personal desks (Phase 1: in-memory only)
  const [personalDesks, setPersonalDesks] = useState<DeskRow[]>([]);
  const [activeDeskId, setActiveDeskId] = useState<string>("all");

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragHandle, setDragHandle] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("team_memberships")
        .select("team_id, status, teams:team_id(id,name)")
        .eq("user_id", user.id)
        .eq("status", "active");
      const rows: DeskRow[] = ((data ?? []) as Array<{ team_id: string; teams: { id: string; name: string } | null }>)
        .filter((r) => r.teams)
        .map((r) => ({
          id: `team:${r.team_id}`,
          teamId: r.team_id,
          name: r.teams!.name,
          kind: "team" as DeskKind,
          pinned: false,
        }));
      setTeamRows(rows);
    })();
  }, [user]);

  const allRows = useMemo<DeskRow[]>(() => {
    const all: DeskRow = { id: "all", name: "All", kind: "all", pinned: true };
    return [all, ...personalDesks, ...teamRows].sort((a, b) => {
      if (a.kind === "all") return -1;
      if (b.kind === "all") return 1;
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return 0;
    });
  }, [personalDesks, teamRows]);

  const activeDesk = allRows.find((r) => r.id === activeDeskId) ?? allRows[0];

  const togglePin = (id: string) => {
    setMenuFor(null);
    setPersonalDesks((arr) =>
      arr.map((r) => (r.id === id ? { ...r, pinned: !r.pinned } : r)),
    );
    setTeamRows((arr) =>
      arr.map((r) => (r.id === id ? { ...r, pinned: !r.pinned } : r)),
    );
  };

  const beginRename = (row: DeskRow) => {
    setMenuFor(null);
    setEditingId(row.id);
    setEditingValue(row.name);
  };

  const commitRename = () => {
    if (!editingId) return;
    const name = editingValue.trim();
    if (!name) {
      setEditingId(null);
      return;
    }
    setPersonalDesks((arr) => arr.map((r) => (r.id === editingId ? { ...r, name } : r)));
    setTeamRows((arr) => arr.map((r) => (r.id === editingId ? { ...r, name } : r)));
    setEditingId(null);
  };

  const deleteRow = (id: string) => {
    setMenuFor(null);
    setPersonalDesks((arr) => arr.filter((r) => r.id !== id));
    if (activeDeskId === id) setActiveDeskId("all");
  };

  const createDesk = () => {
    const id = `personal:${Date.now()}`;
    const next: DeskRow = { id, name: "New desk", kind: "personal", pinned: false };
    setPersonalDesks((arr) => [...arr, next]);
    setActiveDeskId(id);
    setEditingId(id);
    setEditingValue("New desk");
  };

  if (loading || !user) {
    return <div className="px-6 pt-20 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (!isIndividual) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center text-sm text-muted-foreground">
        The Desk is available in individual mode. Switch to your personal profile to use it.
      </div>
    );
  }

  const mat = MATERIALS[material] ?? MATERIALS.oak;

  return (
    <div className="px-4 md:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-2 pt-4">
          <div className="flex items-baseline gap-2">
            <span className="mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              Desk
            </span>
            <h1 className="text-2xl font-semibold text-ink">{activeDesk?.name ?? "All"}</h1>
          </div>
          <button
            onClick={createDesk}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-card px-4 py-2 text-xs text-ink hover:bg-secondary"
          >
            <Plus className="h-3.5 w-3.5" /> New desk
          </button>
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-[220px_1fr]">
          <nav className="-ml-2 flex flex-col gap-0.5">
            <button
              className="flex items-center justify-between rounded-md px-3 py-2 text-left text-sm text-muted-foreground"
              type="button"
            >
              <span>Desks</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <div className="ml-3 flex flex-col gap-0.5 border-l border-hairline pl-2">
              {allRows.map((row) => {
                const active = activeDeskId === row.id;
                const isDragging = dragId === row.id;
                const draggable = row.kind !== "all";
                return (
                  <div
                    key={row.id}
                    draggable={draggable && dragHandle === row.id}
                    onDragStart={(e) => {
                      if (dragHandle !== row.id) {
                        e.preventDefault();
                        return;
                      }
                      setDragId(row.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDragHandle(null);
                    }}
                    className={`group relative flex items-center gap-1 rounded-md transition ${
                      active ? "bg-secondary" : "hover:bg-secondary/60"
                    } ${isDragging ? "opacity-40" : ""}`}
                  >
                    {draggable ? (
                      <span
                        className="grid h-7 w-4 shrink-0 cursor-grab place-items-center text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 hover:text-ink active:cursor-grabbing"
                        onMouseDown={() => setDragHandle(row.id)}
                        onMouseUp={() => setDragHandle(null)}
                        onMouseLeave={() => {
                          if (!dragId) setDragHandle(null);
                        }}
                        aria-label="Drag to reorder"
                      >
                        <GripVertical className="h-3 w-3" />
                      </span>
                    ) : (
                      <span className="h-7 w-4 shrink-0" />
                    )}

                    {editingId === row.id ? (
                      <input
                        autoFocus
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="min-w-0 flex-1 rounded-md border border-hairline bg-background px-2 py-1 text-xs text-ink outline-none"
                      />
                    ) : (
                      <button
                        onClick={() => setActiveDeskId(row.id)}
                        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1.5 pr-1 text-left text-xs transition ${
                          active ? "font-medium text-ink" : "text-muted-foreground hover:text-ink"
                        }`}
                      >
                        {row.pinned && row.kind !== "all" && (
                          <Pin className="h-2.5 w-2.5 shrink-0 fill-current text-ink/70" />
                        )}
                        <span className="truncate">{row.name}</span>
                        {row.kind === "team" && (
                          <span className="ml-auto shrink-0 text-[9px] uppercase tracking-wider text-muted-foreground/70">
                            team
                          </span>
                        )}
                      </button>
                    )}

                    {row.kind !== "all" && (
                      <div className="relative shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuFor(menuFor === row.id ? null : row.id);
                          }}
                          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground/60 opacity-0 transition hover:bg-card hover:text-ink group-hover:opacity-100 data-[open=true]:opacity-100"
                          data-open={menuFor === row.id}
                          aria-label="Desk actions"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                        {menuFor === row.id && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setMenuFor(null)}
                            />
                            <div className="absolute right-0 top-8 z-50 w-40 overflow-hidden rounded-md border border-hairline bg-card shadow-lg">
                              <button
                                onClick={() => togglePin(row.id)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink hover:bg-secondary"
                              >
                                {row.pinned ? (
                                  <>
                                    <PinOff className="h-3.5 w-3.5" /> Unpin
                                  </>
                                ) : (
                                  <>
                                    <Pin className="h-3.5 w-3.5" /> Pin to top
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => beginRename(row)}
                                className="flex w-full items-center gap-2 border-t border-hairline px-3 py-2 text-left text-xs text-ink hover:bg-secondary"
                              >
                                <Pencil className="h-3.5 w-3.5" /> Edit name
                              </button>
                              {row.kind === "personal" && (
                                <button
                                  onClick={() => deleteRow(row.id)}
                                  className="flex w-full items-center gap-2 border-t border-hairline px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> Delete
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </nav>

          <section>
            <div
              className="relative aspect-[16/9] w-full overflow-hidden rounded-3xl border border-hairline shadow-inner"
              style={{ background: mat.surface }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.18),transparent_60%)]" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="mono text-[10px] uppercase tracking-[0.3em] text-white/70">
                  {mat.label} desk
                </span>
                <p className="mt-2 max-w-md text-sm text-white/80">
                  This is your {activeDesk?.name ?? "desk"}. Files placed here will appear on the surface.
                </p>
                <p className="mt-4 text-xs text-white/60">
                  No files yet — pick files in Settings → Desk to give this desk access.
                </p>
              </div>
            </div>

            <div className="mt-4 text-xs text-muted-foreground">
              Material:&nbsp;
              {Object.entries(MATERIALS).map(([key, m]) => (
                <button
                  key={key}
                  onClick={() => setMaterial(key)}
                  className={`mr-2 rounded-full border px-3 py-1 text-[11px] transition ${
                    material === key
                      ? "border-ink bg-ink text-background"
                      : "border-hairline text-muted-foreground hover:text-ink"
                  }`}
                >
                  {m.label}
                </button>
              ))}
              <button
                onClick={() => toast("More materials coming later.")}
                className="rounded-full border border-dashed border-hairline px-3 py-1 text-[11px] text-muted-foreground hover:text-ink"
              >
                More coming…
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
