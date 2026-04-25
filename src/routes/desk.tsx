import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ChevronDown,
  GripVertical,
  Move,
  MoreVertical,
  Pin,
  PinOff,
  Plus,
  Trash2,
  Pencil,
  X,
  Check,
  FileText,
  Mail,
  StickyNote,
  Upload,
} from "lucide-react";

export const Route = createFileRoute("/desk")({
  component: DeskPage,
  head: () => ({ meta: [{ title: "Desk · Raceline" }] }),
});

type DeskKind = "all" | "personal" | "team";
type ToolId = "files" | "email" | "postit";

interface DeskRow {
  id: string;
  name: string;
  kind: DeskKind;
  pinned: boolean;
  teamId?: string;
}

interface ToolObject {
  id: string;
  tool: ToolId;
  x: number; // percent (0-100)
  y: number; // percent
  rot: number;
}

interface Patch {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
  rot: number;
  bornAt: number; // ms timestamp for slap animation
}

interface DeskTools {
  selected: ToolId[];
  postitColor: string;
  extraEmails: string[];
  objects: ToolObject[];
  patches: Patch[];
}

const TOOL_DEFS: { id: ToolId; label: string; icon: React.ComponentType<{ className?: string }>; desc: string }[] = [
  { id: "files", label: "Files", icon: FileText, desc: "Add files from your computer." },
  { id: "email", label: "Email", icon: Mail, desc: "Read emails from members of this entity." },
  { id: "postit", label: "Post-it patches", icon: StickyNote, desc: "Stick notes anywhere on the desk." },
];

const POSTIT_COLORS = ["#fde68a", "#fca5a5", "#a7f3d0", "#bfdbfe", "#ddd6fe", "#fbcfe8"];

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

function emptyTools(): DeskTools {
  return { selected: [], postitColor: POSTIT_COLORS[0], extraEmails: [], objects: [], patches: [] };
}

const initialPos = (i: number): { x: number; y: number; rot: number } => {
  const cols = [22, 50, 78];
  return { x: cols[i % 3], y: 35 + Math.floor(i / 3) * 30, rot: (i % 2 === 0 ? -2 : 3) };
};

function DeskPage() {
  const { user, mode, activeEntityId, loading } = useAuth();
  const navigate = useNavigate();

  const isIndividual = mode !== "team" && mode !== "organizer" && !activeEntityId;

  const [material, setMaterial] = useState<string>(() => {
    if (typeof window === "undefined") return "oak";
    return localStorage.getItem("desk:material") || "oak";
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("desk:material", material);
  }, [material]);

  const [teamRows, setTeamRows] = useState<DeskRow[]>([]);
  const [personalDesks, setPersonalDesks] = useState<DeskRow[]>([]);
  const [activeDeskId, setActiveDeskId] = useState<string>("all");

  const [toolsByDesk, setToolsByDesk] = useState<Record<string, DeskTools>>({});

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragHandle, setDragHandle] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  // Tool dialogs
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<ToolId[]>([]);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupDraft, setSetupDraft] = useState<DeskTools>(emptyTools());
  const [emailInput, setEmailInput] = useState("");

  // Post-it composer
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [composerStage, setComposerStage] = useState<"peel" | "write" | "slap">("peel");
  const [pendingSlap, setPendingSlap] = useState<Patch | null>(null);

  // Object drag (on the desk surface)
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [draggingObj, setDraggingObj] = useState<{ kind: "obj" | "patch"; id: string; offX: number; offY: number } | null>(null);

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
  const activeTools = toolsByDesk[activeDeskId] ?? emptyTools();
  const hasTools = activeTools.selected.length > 0;

  const updateActiveTools = (fn: (t: DeskTools) => DeskTools) => {
    setToolsByDesk((m) => {
      const cur = m[activeDeskId] ?? emptyTools();
      return { ...m, [activeDeskId]: fn(cur) };
    });
  };

  const togglePin = (id: string) => {
    setMenuFor(null);
    setPersonalDesks((arr) => arr.map((r) => (r.id === id ? { ...r, pinned: !r.pinned } : r)));
    setTeamRows((arr) => arr.map((r) => (r.id === id ? { ...r, pinned: !r.pinned } : r)));
  };
  const beginRename = (row: DeskRow) => {
    setMenuFor(null);
    setEditingId(row.id);
    setEditingValue(row.name);
  };
  const commitRename = () => {
    if (!editingId) return;
    const name = editingValue.trim();
    if (!name) { setEditingId(null); return; }
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

  // ── Tool picker / setup ──
  const openPicker = () => {
    setPicked(activeTools.selected);
    setPickerOpen(true);
  };

  const savePicker = () => {
    if (picked.length === 0) {
      setPickerOpen(false);
      return;
    }
    setSetupDraft({
      ...activeTools,
      selected: picked,
      postitColor: activeTools.postitColor || POSTIT_COLORS[0],
      extraEmails: activeTools.extraEmails || [],
      objects: activeTools.objects ?? [],
      patches: activeTools.patches ?? [],
    });
    setPickerOpen(false);
    setSetupOpen(true);
  };

  const finishSetup = () => {
    // Create tool objects on desk for newly added tools
    const existing = activeTools.objects ?? [];
    const existingTools = new Set(existing.map((o) => o.tool));
    const newObjs: ToolObject[] = [];
    setupDraft.selected.forEach((t, i) => {
      if (!existingTools.has(t)) {
        const p = initialPos(existing.length + newObjs.length);
        newObjs.push({ id: `${t}-${Date.now()}-${i}`, tool: t, ...p });
      }
    });
    // Drop objects whose tool was unchecked
    const keptObjs = existing.filter((o) => setupDraft.selected.includes(o.tool));
    const finalObjs = [...keptObjs, ...newObjs];

    setToolsByDesk((m) => ({
      ...m,
      [activeDeskId]: {
        ...setupDraft,
        objects: finalObjs,
        patches: setupDraft.patches ?? activeTools.patches ?? [],
      },
    }));
    setSetupOpen(false);
    toast.success("Tools added to desk");
  };

  const removeTool = (tool: ToolId) => {
    updateActiveTools((cur) => ({
      ...cur,
      selected: cur.selected.filter((t) => t !== tool),
      objects: (cur.objects ?? []).filter((o) => o.tool !== tool),
      patches: tool === "postit" ? [] : cur.patches,
    }));
  };

  const addEmail = () => {
    const v = emailInput.trim();
    if (!v) return;
    setSetupDraft((d) => ({ ...d, extraEmails: [...d.extraEmails, v] }));
    setEmailInput("");
  };

  // ── Post-it composer ──
  const openComposer = () => {
    setComposerText("");
    setComposerStage("peel");
    setComposerOpen(true);
    // After peel anim, switch to write
    setTimeout(() => setComposerStage("write"), 650);
  };
  const slapPatch = () => {
    if (!composerText.trim()) {
      toast("Write something first.");
      return;
    }
    const patch: Patch = {
      id: `p-${Date.now()}`,
      text: composerText.trim(),
      color: activeTools.postitColor || POSTIT_COLORS[0],
      x: 30 + Math.random() * 40,
      y: 35 + Math.random() * 30,
      rot: -6 + Math.random() * 12,
      bornAt: Date.now(),
    };
    setComposerStage("slap");
    setPendingSlap(patch);
    // Close composer after slap finishes
    setTimeout(() => {
      updateActiveTools((cur) => ({ ...cur, patches: [...(cur.patches ?? []), patch] }));
      setComposerOpen(false);
      setPendingSlap(null);
    }, 500);
  };

  // ── Object dragging on desk surface ──
  const onObjMouseDown = (e: React.MouseEvent, kind: "obj" | "patch", id: string) => {
    if (!surfaceRef.current) return;
    const rect = surfaceRef.current.getBoundingClientRect();
    setDraggingObj({
      kind,
      id,
      offX: ((e.clientX - rect.left) / rect.width) * 100,
      offY: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };
  useEffect(() => {
    if (!draggingObj) return;
    const onMove = (e: MouseEvent) => {
      if (!surfaceRef.current) return;
      const rect = surfaceRef.current.getBoundingClientRect();
      const x = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));
      updateActiveTools((cur) => {
        if (draggingObj.kind === "obj") {
          return { ...cur, objects: cur.objects.map((o) => (o.id === draggingObj.id ? { ...o, x, y } : o)) };
        }
        return { ...cur, patches: cur.patches.map((p) => (p.id === draggingObj.id ? { ...p, x, y } : p)) };
      });
    };
    const onUp = () => setDraggingObj(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingObj]);

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
            <span className="mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Desk</span>
            <h1 className="text-2xl font-semibold text-ink">{activeDesk?.name ?? "All"}</h1>
          </div>
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-[220px_1fr]">
          <nav className="-ml-2 flex flex-col gap-0.5">
            <div className="flex items-center justify-between px-3 py-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">Desks <ChevronDown className="h-3.5 w-3.5" /></span>
              <button
                onClick={createDesk}
                aria-label="New desk"
                className="grid h-5 w-5 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-ink"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
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
                      if (dragHandle !== row.id) { e.preventDefault(); return; }
                      setDragId(row.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                    onDragEnd={() => { setDragId(null); setDragHandle(null); }}
                    className={`group relative flex items-center gap-1 rounded-md transition ${
                      active ? "bg-secondary" : "hover:bg-secondary/60"
                    } ${isDragging ? "opacity-40" : ""}`}
                  >
                    {draggable ? (
                      <span
                        className="grid h-7 w-4 shrink-0 cursor-grab place-items-center text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 hover:text-ink active:cursor-grabbing"
                        onMouseDown={() => setDragHandle(row.id)}
                        onMouseUp={() => setDragHandle(null)}
                        onMouseLeave={() => { if (!dragId) setDragHandle(null); }}
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
                          <span className="ml-auto shrink-0 text-[9px] uppercase tracking-wider text-muted-foreground/70">team</span>
                        )}
                      </button>
                    )}

                    {row.kind !== "all" && (
                      <div className="relative shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === row.id ? null : row.id); }}
                          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground/60 opacity-0 transition hover:bg-card hover:text-ink group-hover:opacity-100 data-[open=true]:opacity-100"
                          data-open={menuFor === row.id}
                          aria-label="Desk actions"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                        {menuFor === row.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setMenuFor(null)} />
                            <div className="absolute right-0 top-8 z-50 w-40 overflow-hidden rounded-md border border-hairline bg-card shadow-lg">
                              <button onClick={() => togglePin(row.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink hover:bg-secondary">
                                {row.pinned ? <><PinOff className="h-3.5 w-3.5" /> Unpin</> : <><Pin className="h-3.5 w-3.5" /> Pin to top</>}
                              </button>
                              <button onClick={() => beginRename(row)} className="flex w-full items-center gap-2 border-t border-hairline px-3 py-2 text-left text-xs text-ink hover:bg-secondary">
                                <Pencil className="h-3.5 w-3.5" /> Edit name
                              </button>
                              {row.kind === "personal" && (
                                <button onClick={() => deleteRow(row.id)} className="flex w-full items-center gap-2 border-t border-hairline px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/10">
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
              ref={surfaceRef}
              className="relative aspect-[16/9] w-full overflow-hidden rounded-3xl border border-hairline shadow-inner select-none"
              style={{ background: mat.surface }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.18),transparent_60%)]" />

              {/* Plus + Edit buttons (top right) */}
              <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
                {hasTools && (
                  <button
                    onClick={openPicker}
                    aria-label="Edit desk tools"
                    title="Edit tools"
                    className="grid h-9 w-9 place-items-center rounded-sm border border-ink/20 bg-white/95 text-ink shadow-md transition hover:bg-white"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={openPicker}
                  aria-label="Add tools to desk"
                  title="Add tools"
                  className="grid h-9 w-9 place-items-center rounded-sm border border-ink/20 bg-white/95 text-ink shadow-md transition hover:bg-white"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {!hasTools && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="mono text-[10px] uppercase tracking-[0.3em] text-white/70">{mat.label} desk</span>
                  <p className="mt-2 max-w-md text-sm text-white/80">This is your {activeDesk?.name ?? "desk"}.</p>
                  <p className="mt-4 text-xs text-white/60">Tap + to add tools to this desk.</p>
                </div>
              )}

              {/* Realistic objects on the desk */}
              {hasTools && activeTools.objects.map((obj) => (
                <DeskObject
                  key={obj.id}
                  obj={obj}
                  color={activeTools.postitColor}
                  isDragging={draggingObj?.kind === "obj" && draggingObj.id === obj.id}
                  onMouseDown={(e) => onObjMouseDown(e, "obj", obj.id)}
                  onAddPatch={openComposer}
                />
              ))}

              {/* Slapped patches */}
              {activeTools.patches.map((p) => (
                <PatchOnDesk
                  key={p.id}
                  patch={p}
                  isDragging={draggingObj?.kind === "patch" && draggingObj.id === p.id}
                  onMouseDown={(e) => onObjMouseDown(e, "patch", p.id)}
                />
              ))}
            </div>

            <div className="mt-4 text-xs text-muted-foreground">
              Material:&nbsp;
              {Object.entries(MATERIALS).map(([key, m]) => (
                <button
                  key={key}
                  onClick={() => setMaterial(key)}
                  className={`mr-2 rounded-full border px-3 py-1 text-[11px] transition ${
                    material === key ? "border-ink bg-ink text-background" : "border-hairline text-muted-foreground hover:text-ink"
                  }`}
                >
                  {m.label}
                </button>
              ))}
              <button onClick={() => toast("More materials coming later.")} className="rounded-full border border-dashed border-hairline px-3 py-1 text-[11px] text-muted-foreground hover:text-ink">
                More coming…
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* ── Tool picker (Excel-style) ── */}
      {pickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setPickerOpen(false)}>
          <div
            className="w-full max-w-sm border border-ink/30 bg-white shadow-2xl"
            style={{ borderRadius: 2 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Title bar */}
            <div className="flex items-center justify-between border-b border-ink/20 bg-[linear-gradient(180deg,#f3f4f6,#e5e7eb)] px-3 py-1.5">
              <div className="flex items-center gap-2">
                <span className="grid h-3.5 w-3.5 place-items-center bg-[#107C41] text-[8px] font-bold text-white" style={{ borderRadius: 1 }}>X</span>
                <h2 className="text-xs font-semibold text-ink">Add tools — {activeDesk?.name}</h2>
              </div>
              <button onClick={() => setPickerOpen(false)} className="grid h-5 w-5 place-items-center text-muted-foreground hover:bg-destructive hover:text-white" aria-label="Close">
                <X className="h-3 w-3" />
              </button>
            </div>
            {/* Sheet area */}
            <div className="p-0">
              <div className="grid grid-cols-[28px_28px_1fr] border-b border-ink/15 bg-[#f9fafb] text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <div className="border-r border-ink/15 px-2 py-1.5">#</div>
                <div className="border-r border-ink/15 px-1 py-1.5 text-center">✓</div>
                <div className="px-2 py-1.5">Tool</div>
              </div>
              {TOOL_DEFS.map((t, i) => {
                const checked = picked.includes(t.id);
                return (
                  <label key={t.id} className="grid cursor-pointer grid-cols-[28px_28px_1fr] border-b border-ink/10 text-xs hover:bg-[#f3f6fb]">
                    <div className="border-r border-ink/10 bg-[#f9fafb] px-2 py-1.5 text-[10px] text-muted-foreground">{i + 1}</div>
                    <div className="grid place-items-center border-r border-ink/10">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setPicked((p) => (e.target.checked ? [...p, t.id] : p.filter((x) => x !== t.id)))}
                        className="h-3.5 w-3.5 accent-[#107C41]"
                        style={{ borderRadius: 0 }}
                      />
                    </div>
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <t.icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-ink">{t.label}</span>
                    </div>
                  </label>
                );
              })}
            </div>
            {/* Footer */}
            <div className="flex justify-end gap-2 border-t border-ink/20 bg-[#f9fafb] px-3 py-2">
              <button onClick={() => setPickerOpen(false)} className="border border-ink/30 bg-white px-3 py-1 text-xs text-ink hover:bg-secondary" style={{ borderRadius: 2 }}>Cancel</button>
              <button onClick={savePicker} className="border border-[#0b5e31] bg-[#107C41] px-3 py-1 text-xs font-medium text-white hover:bg-[#0e6c39]" style={{ borderRadius: 2 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Setup dialog (Excel-style) ── */}
      {setupOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl border border-ink/30 bg-white shadow-2xl" style={{ borderRadius: 2 }}>
            <div className="flex items-center justify-between border-b border-ink/20 bg-[linear-gradient(180deg,#f3f4f6,#e5e7eb)] px-3 py-1.5">
              <div className="flex items-center gap-2">
                <span className="grid h-3.5 w-3.5 place-items-center bg-[#107C41] text-[8px] font-bold text-white" style={{ borderRadius: 1 }}>X</span>
                <h2 className="text-xs font-semibold text-ink">Set up tools — {activeDesk?.name}'s desk</h2>
              </div>
              <button onClick={() => setSetupOpen(false)} className="grid h-5 w-5 place-items-center text-muted-foreground hover:bg-destructive hover:text-white"><X className="h-3 w-3" /></button>
            </div>

            <div className="grid divide-x divide-ink/10" style={{ gridTemplateColumns: `repeat(${setupDraft.selected.length}, minmax(0,1fr))` }}>
              {setupDraft.selected.map((tool) => (
                <div key={tool} className="bg-white">
                  <div className="border-b border-ink/15 bg-[#f9fafb] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink">
                    {TOOL_DEFS.find((t) => t.id === tool)!.label}
                  </div>
                  <div className="p-3">
                    <SetupColumn
                      tool={tool}
                      deskName={activeDesk?.name ?? "desk"}
                      draft={setupDraft}
                      onDraftChange={setSetupDraft}
                      emailInput={emailInput}
                      setEmailInput={setEmailInput}
                      addEmail={addEmail}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-ink/20 bg-[#f9fafb] px-3 py-2">
              <button onClick={() => setSetupOpen(false)} className="border border-ink/30 bg-white px-3 py-1 text-xs text-ink hover:bg-secondary" style={{ borderRadius: 2 }}>Cancel</button>
              <button onClick={finishSetup} className="border border-[#0b5e31] bg-[#107C41] px-4 py-1 text-xs font-medium text-white hover:bg-[#0e6c39]" style={{ borderRadius: 2 }}>Add tools</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Post-it composer overlay ── */}
      {composerOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          {/* The Patch */}
          <div className="relative" style={{ perspective: 1200 }}>
            <div
              className="relative shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
              style={{
                width: composerStage === "peel" ? 140 : 320,
                height: composerStage === "peel" ? 140 : 320,
                background: activeTools.postitColor || POSTIT_COLORS[0],
                transformOrigin: "top right",
                transform:
                  composerStage === "peel"
                    ? "rotateX(45deg) rotateZ(-12deg) translateY(-30px)"
                    : composerStage === "slap"
                      ? "scale(0.6) rotate(8deg) translateY(80px)"
                      : "rotateX(0deg) rotateZ(-2deg)",
                transition: "transform 600ms cubic-bezier(.2,.9,.3,1.2), width 400ms ease, height 400ms ease, opacity 400ms",
                opacity: composerStage === "slap" ? 0 : 1,
                boxShadow: "0 1px 0 rgba(0,0,0,0.05) inset, 0 24px 60px rgba(0,0,0,0.45)",
              }}
            >
              {/* Adhesive strip top */}
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-3"
                style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.06), transparent)" }}
              />
              {/* Curl shadow */}
              {composerStage === "peel" && (
                <div
                  className="pointer-events-none absolute right-0 top-0 h-10 w-10"
                  style={{
                    background: "linear-gradient(225deg, rgba(0,0,0,0.25), transparent 60%)",
                  }}
                />
              )}

              {composerStage === "write" && (
                <div className="flex h-full flex-col p-4">
                  <textarea
                    autoFocus
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    placeholder="Write a note…"
                    className="flex-1 resize-none bg-transparent text-base leading-snug text-ink outline-none placeholder:text-ink/40"
                    style={{ fontFamily: "'Caveat', 'Bradley Hand', cursive" }}
                  />
                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={() => setComposerOpen(false)}
                      className="text-[11px] text-ink/60 hover:text-ink"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={slapPatch}
                      className="border border-ink/40 bg-white/70 px-3 py-1 text-[11px] font-medium text-ink hover:bg-white"
                      style={{ borderRadius: 2 }}
                    >
                      Add patch
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Slap landing preview (the patch flying down) */}
          {composerStage === "slap" && pendingSlap && (
            <div
              className="pointer-events-none absolute"
              style={{
                left: `calc(50% - 60px)`,
                top: `calc(50% - 60px)`,
                width: 120,
                height: 120,
                background: pendingSlap.color,
                transform: "scale(1.4) rotate(0deg)",
                animation: "deskSlap 450ms cubic-bezier(.2,.7,.2,1.4) forwards",
                boxShadow: "0 30px 60px rgba(0,0,0,0.5)",
              }}
            />
          )}
        </div>
      )}

      <style>{`
        @keyframes deskSlap {
          0% { transform: scale(1.6) rotate(-4deg); opacity: 1; }
          70% { transform: scale(0.95) rotate(2deg); opacity: 1; }
          100% { transform: scale(0.7) rotate(4deg); opacity: 0; }
        }
        @keyframes patchLand {
          0% { transform: translate(-50%,-50%) scale(1.6) rotate(var(--rot,0deg)); opacity: 0; }
          60% { transform: translate(-50%,-50%) scale(0.94) rotate(var(--rot,0deg)); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(1) rotate(var(--rot,0deg)); opacity: 1; }
        }
        @keyframes objIn {
          0% { transform: translate(-50%,-50%) scale(0.6) rotate(0deg); opacity: 0; }
          100% { transform: translate(-50%,-50%) scale(1) rotate(var(--rot,0deg)); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Subcomponents ──

function DeskObject({
  obj,
  color,
  isDragging,
  onMouseDown,
  onAddPatch,
}: {
  obj: ToolObject;
  color: string;
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onAddPatch: () => void;
}) {
  return (
    <div
      className="group absolute"
      style={{
        left: `${obj.x}%`,
        top: `${obj.y}%`,
        transform: `translate(-50%,-50%) rotate(${obj.rot}deg)`,
        animation: "objIn 360ms cubic-bezier(.2,.7,.2,1.2)",
        ["--rot" as never]: `${obj.rot}deg`,
        zIndex: isDragging ? 50 : 10,
        cursor: isDragging ? "grabbing" : "default",
        filter: isDragging ? "drop-shadow(0 20px 30px rgba(0,0,0,0.4))" : "drop-shadow(0 8px 14px rgba(0,0,0,0.25))",
      }}
    >
      {/* Move handle */}
      <button
        onMouseDown={onMouseDown}
        aria-label="Move"
        className="absolute -left-2 -top-2 z-10 grid h-6 w-6 place-items-center rounded-full border border-ink/20 bg-white/95 text-ink opacity-0 shadow transition group-hover:opacity-100 active:cursor-grabbing"
      >
        <Move className="h-3 w-3" />
      </button>

      {obj.tool === "files" && <PaperFolder />}
      {obj.tool === "email" && <Envelope />}
      {obj.tool === "postit" && <PostItPad color={color} onAdd={onAddPatch} />}
    </div>
  );
}

function PaperFolder() {
  return (
    <div className="relative" style={{ width: 180, height: 130 }}>
      {/* Files peeking */}
      <div className="absolute left-3 top-1 h-[110px] w-[160px] -rotate-1 bg-white" style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.1)" }}>
        <div className="m-3 h-1.5 w-20 bg-ink/15" />
        <div className="mx-3 mt-1 h-1 w-28 bg-ink/10" />
        <div className="mx-3 mt-1 h-1 w-24 bg-ink/10" />
      </div>
      <div className="absolute left-1 top-3 h-[112px] w-[164px] rotate-1 bg-[#fafaf7]" />
      {/* Folder body */}
      <div
        className="absolute bottom-0 left-0 h-[100px] w-[180px]"
        style={{
          background: "linear-gradient(180deg,#e7c66a 0%, #c79b3a 100%)",
          clipPath: "polygon(0 18px, 70px 18px, 86px 0, 180px 0, 180px 100px, 0 100px)",
          boxShadow: "inset 0 -10px 18px rgba(0,0,0,0.18)",
        }}
      />
      <div className="absolute bottom-1 left-2 text-[9px] font-semibold uppercase tracking-widest text-[#5a3f0d]">Files</div>
    </div>
  );
}

function Envelope() {
  return (
    <div className="relative" style={{ width: 180, height: 120 }}>
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(180deg,#fdfbf6 0%,#f1ead7 100%)",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12), 0 1px 0 rgba(0,0,0,0.08)",
        }}
      />
      {/* Flap */}
      <div
        className="absolute inset-x-0 top-0"
        style={{
          height: 70,
          background: "linear-gradient(180deg,#f6efdb 0%,#e7dcb9 100%)",
          clipPath: "polygon(0 0, 100% 0, 50% 100%)",
          boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.1)",
        }}
      />
      <div className="absolute right-2 top-2 h-7 w-7 border border-ink/25 bg-white">
        <div className="m-0.5 h-2 bg-ink/10" />
        <div className="mx-0.5 mt-0.5 h-1 bg-ink/10" />
      </div>
      <div className="absolute bottom-2 left-2 text-[9px] font-semibold uppercase tracking-widest text-ink/70">Email</div>
    </div>
  );
}

function PostItPad({ color, onAdd }: { color: string; onAdd: () => void }) {
  return (
    <div className="relative" style={{ width: 140, height: 140 }}>
      {/* Stack of patches */}
      <div className="absolute inset-x-2 bottom-1 h-[6px] bg-black/10" />
      <div className="absolute -bottom-0 left-1 right-1 top-2 bg-white/40" />
      <div
        className="absolute inset-0"
        style={{
          background: color,
          boxShadow:
            "0 1px 0 rgba(0,0,0,0.12) inset, 0 -2px 0 rgba(0,0,0,0.06) inset, 0 8px 14px rgba(0,0,0,0.18)",
        }}
      >
        {/* Top adhesive */}
        <div className="absolute inset-x-0 top-0 h-3" style={{ background: "linear-gradient(180deg,rgba(0,0,0,0.07),transparent)" }} />
        <div className="absolute bottom-2 left-2 text-[9px] font-semibold uppercase tracking-widest text-ink/70">Post-it</div>

        <button
          onClick={onAdd}
          aria-label="Add patch"
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center border border-ink/30 bg-white/90 text-ink shadow-sm hover:bg-white"
          style={{ borderRadius: 2 }}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function PatchOnDesk({
  patch,
  isDragging,
  onMouseDown,
}: {
  patch: Patch;
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const recent = Date.now() - patch.bornAt < 800;
  return (
    <div
      className="group absolute"
      style={{
        left: `${patch.x}%`,
        top: `${patch.y}%`,
        width: 130,
        height: 130,
        transform: `translate(-50%,-50%) rotate(${patch.rot}deg)`,
        ["--rot" as never]: `${patch.rot}deg`,
        animation: recent ? "patchLand 380ms cubic-bezier(.2,.7,.2,1.4)" : undefined,
        background: patch.color,
        zIndex: isDragging ? 50 : 20,
        boxShadow: "0 1px 0 rgba(0,0,0,0.07) inset, 0 12px 22px rgba(0,0,0,0.28)",
        filter: isDragging ? "drop-shadow(0 16px 24px rgba(0,0,0,0.35))" : undefined,
      }}
    >
      {/* Adhesive */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-3" style={{ background: "linear-gradient(180deg,rgba(0,0,0,0.07),transparent)" }} />
      <button
        onMouseDown={onMouseDown}
        aria-label="Move patch"
        className="absolute -left-2 -top-2 grid h-6 w-6 place-items-center rounded-full border border-ink/20 bg-white/95 text-ink opacity-0 shadow transition group-hover:opacity-100 active:cursor-grabbing"
      >
        <Move className="h-3 w-3" />
      </button>
      <div
        className="h-full w-full overflow-hidden p-3 text-[14px] leading-snug text-ink"
        style={{ fontFamily: "'Caveat', 'Bradley Hand', cursive" }}
      >
        {patch.text}
      </div>
    </div>
  );
}

function SetupColumn({
  tool,
  deskName,
  draft,
  onDraftChange,
  emailInput,
  setEmailInput,
  addEmail,
}: {
  tool: ToolId;
  deskName: string;
  draft: DeskTools;
  onDraftChange: (d: DeskTools) => void;
  emailInput: string;
  setEmailInput: (v: string) => void;
  addEmail: () => void;
}) {
  if (tool === "files") {
    return (
      <div className="space-y-2 text-xs text-muted-foreground">
        <button className="inline-flex items-center gap-1.5 border border-ink/30 bg-white px-2.5 py-1 text-ink hover:bg-secondary" style={{ borderRadius: 2 }}>
          <Upload className="h-3 w-3" /> Add files
        </button>
        <p>All files added will be accessed through "{deskName}"'s desk.</p>
      </div>
    );
  }
  if (tool === "email") {
    return (
      <div className="space-y-2 text-xs text-muted-foreground">
        <p>Reads emails from members of {deskName}.</p>
        <p>Add extra email addresses?</p>
        <div className="flex gap-1.5">
          <input
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
            placeholder="name@example.com"
            className="min-w-0 flex-1 border border-ink/30 bg-white px-2 py-1 text-xs text-ink outline-none"
            style={{ borderRadius: 2 }}
          />
          <button onClick={addEmail} className="border border-[#0b5e31] bg-[#107C41] px-2 py-1 text-[11px] text-white" style={{ borderRadius: 2 }}>Add</button>
        </div>
        {draft.extraEmails.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {draft.extraEmails.map((e, i) => (
              <span key={i} className="inline-flex items-center gap-1 border border-ink/20 bg-white px-2 py-0.5 text-[10px] text-ink" style={{ borderRadius: 2 }}>
                {e}
                <button onClick={() => onDraftChange({ ...draft, extraEmails: draft.extraEmails.filter((_, j) => j !== i) })}>
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2 text-xs text-muted-foreground">
      <p>Patches let you write anything and place them anywhere on the desk.</p>
      <p>Pick a color for this desk:</p>
      <div className="flex flex-wrap gap-1.5">
        {POSTIT_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onDraftChange({ ...draft, postitColor: c })}
            aria-label={`Color ${c}`}
            className={`grid h-6 w-6 place-items-center border transition ${
              draft.postitColor === c ? "border-ink ring-2 ring-ink/20" : "border-ink/20"
            }`}
            style={{ background: c, borderRadius: 2 }}
          >
            {draft.postitColor === c && <Check className="h-3 w-3 text-ink" />}
          </button>
        ))}
      </div>
    </div>
  );
}
