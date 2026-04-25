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

interface DeskTools {
  selected: ToolId[];
  postitColor: string;
  extraEmails: string[];
}

const TOOL_DEFS: { id: ToolId; label: string; icon: React.ComponentType<{ className?: string }>; desc: string }[] = [
  { id: "files", label: "Files", icon: FileText, desc: "Add files from your computer to this desk." },
  { id: "email", label: "Email", icon: Mail, desc: "Read emails from members of this entity (Gmail / Outlook)." },
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
  return { selected: [], postitColor: POSTIT_COLORS[0], extraEmails: [] };
}

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

  // Per-desk tools (in-memory only for Phase 1)
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
  const [setupStep, setSetupStep] = useState(0);
  const [setupTools, setSetupTools] = useState<ToolId[]>([]);
  const [setupDraft, setSetupDraft] = useState<DeskTools>(emptyTools());
  const [emailInput, setEmailInput] = useState("");

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
    setSetupTools(picked);
    setSetupDraft({
      selected: picked,
      postitColor: activeTools.postitColor || POSTIT_COLORS[0],
      extraEmails: activeTools.extraEmails || [],
    });
    setSetupStep(0);
    setPickerOpen(false);
    setSetupOpen(true);
  };

  const finishSetup = () => {
    setToolsByDesk((m) => ({ ...m, [activeDeskId]: setupDraft }));
    setSetupOpen(false);
    toast.success("Tools added to desk");
  };

  const removeTool = (tool: ToolId) => {
    setToolsByDesk((m) => {
      const cur = m[activeDeskId] ?? emptyTools();
      return {
        ...m,
        [activeDeskId]: { ...cur, selected: cur.selected.filter((t) => t !== tool) },
      };
    });
  };

  const addEmail = () => {
    const v = emailInput.trim();
    if (!v) return;
    setSetupDraft((d) => ({ ...d, extraEmails: [...d.extraEmails, v] }));
    setEmailInput("");
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

  // Order setup tools by the canonical TOOL_DEFS order so left = first checked in list
  const orderedSetupTools = TOOL_DEFS.map((d) => d.id).filter((id) => setupTools.includes(id));
  const orderedActiveTools = TOOL_DEFS.map((d) => d.id).filter((id) => activeTools.selected.includes(id));

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
                            <div className="fixed inset-0 z-40" onClick={() => setMenuFor(null)} />
                            <div className="absolute right-0 top-8 z-50 w-40 overflow-hidden rounded-md border border-hairline bg-card shadow-lg">
                              <button
                                onClick={() => togglePin(row.id)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-ink hover:bg-secondary"
                              >
                                {row.pinned ? (
                                  <><PinOff className="h-3.5 w-3.5" /> Unpin</>
                                ) : (
                                  <><Pin className="h-3.5 w-3.5" /> Pin to top</>
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

              {/* Plus + Edit buttons (top right) */}
              <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
                {hasTools && (
                  <button
                    onClick={openPicker}
                    aria-label="Edit desk tools"
                    className="grid h-9 w-9 place-items-center rounded-full bg-white/85 text-ink shadow-md backdrop-blur transition hover:bg-white"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={openPicker}
                  aria-label="Add tools to desk"
                  className="grid h-9 w-9 place-items-center rounded-full bg-white/85 text-ink shadow-md backdrop-blur transition hover:bg-white"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {!hasTools && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="mono text-[10px] uppercase tracking-[0.3em] text-white/70">
                    {mat.label} desk
                  </span>
                  <p className="mt-2 max-w-md text-sm text-white/80">
                    This is your {activeDesk?.name ?? "desk"}.
                  </p>
                  <p className="mt-4 text-xs text-white/60">
                    Tap + to add tools to this desk.
                  </p>
                </div>
              )}

              {hasTools && (
                <div className="absolute inset-x-4 bottom-4 top-16 grid gap-3" style={{ gridTemplateColumns: `repeat(${orderedActiveTools.length}, minmax(0,1fr))` }}>
                  {orderedActiveTools.map((tool) => (
                    <ToolColumn
                      key={tool}
                      tool={tool}
                      deskName={activeDesk?.name ?? "desk"}
                      tools={activeTools}
                      onRemove={() => removeTool(tool)}
                    />
                  ))}
                </div>
              )}
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

      {/* ── Tool picker dialog ── */}
      {pickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setPickerOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-hairline bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Add tools</h2>
              <button onClick={() => setPickerOpen(false)} className="text-muted-foreground hover:text-ink"><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">Common tools you use at your desk.</p>
            <div className="flex flex-col gap-1">
              {TOOL_DEFS.map((t) => {
                const checked = picked.includes(t.id);
                return (
                  <label key={t.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-secondary">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setPicked((p) => (e.target.checked ? [...p, t.id] : p.filter((x) => x !== t.id)));
                      }}
                      className="h-4 w-4 accent-foreground"
                    />
                    <t.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-ink">{t.label}</span>
                  </label>
                );
              })}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPickerOpen(false)} className="rounded-md border border-hairline px-3 py-1.5 text-xs text-muted-foreground hover:text-ink">Cancel</button>
              <button onClick={savePicker} className="rounded-md bg-ink px-3 py-1.5 text-xs text-background hover:opacity-90">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Setup dialog ── */}
      {setupOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-hairline bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <span className="mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Set up tools</span>
                <h2 className="text-lg font-semibold text-ink">{activeDesk?.name}'s desk</h2>
              </div>
              <button onClick={() => setSetupOpen(false)} className="text-muted-foreground hover:text-ink"><X className="h-4 w-4" /></button>
            </div>

            <div className="grid animate-in fade-in slide-in-from-bottom-2 gap-3 duration-300" style={{ gridTemplateColumns: `repeat(${orderedSetupTools.length}, minmax(0,1fr))` }}>
              {orderedSetupTools.map((tool, idx) => (
                <div
                  key={tool}
                  className={`rounded-xl border p-4 transition ${
                    idx === setupStep ? "border-ink bg-background shadow-sm" : "border-hairline bg-secondary/40 opacity-70"
                  }`}
                >
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
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Step {setupStep + 1} of {orderedSetupTools.length}
              </div>
              <div className="flex gap-2">
                {setupStep > 0 && (
                  <button onClick={() => setSetupStep((s) => s - 1)} className="rounded-md border border-hairline px-3 py-1.5 text-xs text-muted-foreground hover:text-ink">Back</button>
                )}
                {setupStep < orderedSetupTools.length - 1 ? (
                  <button onClick={() => setSetupStep((s) => s + 1)} className="rounded-md bg-ink px-3 py-1.5 text-xs text-background hover:opacity-90">Next</button>
                ) : (
                  <button onClick={finishSetup} className="rounded-md bg-ink px-4 py-1.5 text-xs text-background hover:opacity-90">Add tools</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subcomponents ──

function ToolColumn({
  tool,
  deskName,
  tools,
  onRemove,
}: {
  tool: ToolId;
  deskName: string;
  tools: DeskTools;
  onRemove: () => void;
}) {
  const def = TOOL_DEFS.find((t) => t.id === tool)!;
  const Icon = def.icon;
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/30 bg-white/85 backdrop-blur">
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-ink">
          <Icon className="h-3.5 w-3.5" />
          {def.label}
        </div>
        <button onClick={onRemove} aria-label={`Remove ${def.label}`} className="text-muted-foreground hover:text-destructive">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3 text-[11px] text-muted-foreground">
        {tool === "files" && (
          <>
            <button className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-hairline bg-background px-2 py-1 text-[11px] text-ink hover:bg-secondary">
              <Upload className="h-3 w-3" /> Add files
            </button>
            <p>All files added will be accessed through "{deskName}"'s desk.</p>
          </>
        )}
        {tool === "email" && (
          <p>
            Reading emails from members of {deskName}.
            {tools.extraEmails.length > 0 && (
              <> Plus: {tools.extraEmails.join(", ")}.</>
            )}
          </p>
        )}
        {tool === "postit" && (
          <div className="flex items-center gap-2">
            <span>Color:</span>
            <span className="inline-block h-4 w-4 rounded-sm border border-hairline" style={{ background: tools.postitColor }} />
          </div>
        )}
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
  const def = TOOL_DEFS.find((t) => t.id === tool)!;
  const Icon = def.icon;
  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-ink">
        <Icon className="h-3.5 w-3.5" />
        {def.label}
      </div>
      {tool === "files" && (
        <div className="space-y-2 text-xs text-muted-foreground">
          <button className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-background px-2.5 py-1.5 text-ink hover:bg-secondary">
            <Upload className="h-3 w-3" /> Add files
          </button>
          <p>All files added will be accessed through "{deskName}"'s desk.</p>
        </div>
      )}
      {tool === "email" && (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>This reads all emails from members of {deskName}.</p>
          <p>Add any extra email addresses?</p>
          <div className="flex gap-1.5">
            <input
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
              placeholder="name@example.com"
              className="min-w-0 flex-1 rounded-md border border-hairline bg-background px-2 py-1 text-xs text-ink outline-none"
            />
            <button onClick={addEmail} className="rounded-md bg-ink px-2 py-1 text-[11px] text-background hover:opacity-90">Add</button>
          </div>
          {draft.extraEmails.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {draft.extraEmails.map((e, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full border border-hairline bg-background px-2 py-0.5 text-[10px] text-ink">
                  {e}
                  <button onClick={() => onDraftChange({ ...draft, extraEmails: draft.extraEmails.filter((_, j) => j !== i) })}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {tool === "postit" && (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>Patches let you write anything and place them anywhere on the desk. More features coming.</p>
          <p>Pick a color for this desk:</p>
          <div className="flex flex-wrap gap-1.5">
            {POSTIT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onDraftChange({ ...draft, postitColor: c })}
                aria-label={`Color ${c}`}
                className={`grid h-6 w-6 place-items-center rounded-md border transition ${
                  draft.postitColor === c ? "border-ink ring-2 ring-ink/20" : "border-hairline"
                }`}
                style={{ background: c }}
              >
                {draft.postitColor === c && <Check className="h-3 w-3 text-ink" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
