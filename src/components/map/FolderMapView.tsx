/**
 * FolderMapView — workspace shown when a Map folder is selected.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  MapPin,
  Pencil,
  Plus,
  Route as RouteIcon,
  Search as SearchIcon,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useMapbox, useMapStyle, MAP_STYLES, observeVisibleMapContainer } from "@/lib/mapbox";
import { MapStylePicker } from "@/components/MapStylePicker";
import { SimplePinMap } from "@/components/SimplePinMap";
import { CourseMapEditor, type LatLng, type SplitPoint } from "@/components/CourseMapEditor";
import {
  type MapFolder,
  type MapItem,
  type MapItemKind,
  pickFolderColor,
} from "./MapPage";

type Updater = (prev: MapItem[]) => MapItem[];

interface Props {
  folder: MapFolder;
  items: MapItem[];
  onItemsChange: (updater: Updater) => void;
  onFolderRename: (newName: string) => void;
  editId: string | null;
  onSetEdit: (id: string | null) => void;
}

export function FolderMapView({
  folder,
  items,
  onItemsChange,
  onFolderRename,
  editId,
  onSetEdit,
}: Props) {
  const editing = editId ? items.find((i) => i.id === editId) ?? null : null;

  // Track which item should auto-focus its name input (set on creation).
  const [autoFocusNameId, setAutoFocusNameId] = useState<string | null>(null);

  // Saved-state per item — only saved items get an edit icon in the sidebar.
  const savedKey = `map:folder:saved:${folder.id}`;
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(savedKey);
      setSaved(raw ? (JSON.parse(raw) as Record<string, boolean>) : {});
    } catch {
      setSaved({});
    }
  }, [savedKey]);
  const markSaved = (id: string) => {
    setSaved((prev) => {
      const next = { ...prev, [id]: true };
      try { localStorage.setItem(savedKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const updateItem = (id: string, patch: Partial<MapItem>) => {
    onItemsChange((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const createItem = (kind: MapItemKind) => {
    const used = items.map((i) => i.color);
    const id = crypto.randomUUID();
    const it: MapItem = {
      id,
      kind,
      name: kind === "course" ? "Untitled course" : "Untitled location",
      pinned: false,
      folder: folder.name,
      folderId: folder.id,
      color: pickFolderColor(used),
      created_at: new Date().toISOString(),
      pin: kind === "location" ? null : undefined,
      path: kind === "course" ? [] : undefined,
      splits: kind === "course" ? [] : undefined,
    };
    onItemsChange((prev) => [...prev, it]);
    setAutoFocusNameId(id);
    onSetEdit(id);
  };

  const deleteItem = (id: string) => {
    onItemsChange((prev) => prev.filter((i) => i.id !== id));
    setSaved((prev) => {
      const next = { ...prev };
      delete next[id];
      try { localStorage.setItem(savedKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    if (editId === id) onSetEdit(null);
    toast.success("Deleted");
  };

  // Checked-state per folder.
  const checkedKey = `map:folder:checked:${folder.id}`;
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(checkedKey);
      setChecked(raw ? (JSON.parse(raw) as Record<string, boolean>) : {});
    } catch {
      setChecked({});
    }
  }, [checkedKey]);
  const setItemChecked = (id: string, v: boolean) => {
    setChecked((prev) => {
      const next = { ...prev, [id]: v };
      try { localStorage.setItem(checkedKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const locations = useMemo(() => items.filter((i) => i.kind === "location"), [items]);
  const courses = useMemo(() => items.filter((i) => i.kind === "course"), [items]);

  // Section open/closed state — collapsible "tabs".
  const [openSections, setOpenSections] = useState<{ locations: boolean; courses: boolean }>({
    locations: true,
    courses: true,
  });

  // Folder name editing
  const [editingFolderName, setEditingFolderName] = useState(false);
  const [folderNameDraft, setFolderNameDraft] = useState(folder.name);
  useEffect(() => { setFolderNameDraft(folder.name); }, [folder.name]);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (editingFolderName) {
      requestAnimationFrame(() => {
        folderInputRef.current?.focus();
        folderInputRef.current?.select();
      });
    }
  }, [editingFolderName]);
  const commitFolderName = () => {
    const trimmed = folderNameDraft.trim();
    if (trimmed && trimmed !== folder.name) onFolderRename(trimmed);
    else setFolderNameDraft(folder.name);
    setEditingFolderName(false);
  };

  return (
    <div className="mt-4 grid h-[calc(100vh-12rem)] min-h-0 gap-4 md:grid-cols-[1fr_320px]">
      {/* Main area */}
      <div className="relative h-full min-h-0 overflow-hidden rounded-lg border border-hairline">
        {editing ? (
          editing.kind === "location" ? (
            <LocationEditPane
              item={editing}
              onChange={(pin) => updateItem(editing.id, { pin })}
              onSaved={() => {
                markSaved(editing.id);
                onSetEdit(null);
              }}
            />
          ) : (
            <CourseEditPane
              item={editing}
              onChange={(path, splits) => updateItem(editing.id, { path, splits })}
              onSaved={() => {
                markSaved(editing.id);
                onSetEdit(null);
              }}
              onDelete={() => deleteItem(editing.id)}
            />
          )
        ) : (
          <FolderViewMap folder={folder} items={items} checked={checked} />
        )}
      </div>

      {/* Right sidebar */}
      <aside className="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-lg border border-hairline bg-card p-4">
        {/* Folder header — editable name */}
        <div className="flex items-center gap-2 border-b border-hairline pb-3">
          <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
          {editingFolderName ? (
            <input
              ref={folderInputRef}
              value={folderNameDraft}
              onChange={(e) => setFolderNameDraft(e.target.value)}
              onBlur={commitFolderName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitFolderName();
                if (e.key === "Escape") { setFolderNameDraft(folder.name); setEditingFolderName(false); }
              }}
              className="min-w-0 flex-1 rounded border border-hairline bg-background px-1.5 py-0.5 text-sm font-medium text-ink outline-none focus:border-ink"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{folder.name}</span>
          )}
          {!editingFolderName && (
            <button
              onClick={() => setEditingFolderName(true)}
              className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground/60 transition hover:bg-secondary hover:text-ink"
              aria-label="Rename folder"
              title="Rename folder"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <CollapsibleSection
            title="Locations"
            count={locations.length}
            open={openSections.locations}
            onToggle={() => setOpenSections((s) => ({ ...s, locations: !s.locations }))}
            items={locations}
            saved={saved}
            editId={editId}
            checked={checked}
            onToggleCheck={setItemChecked}
            onEdit={(id) => onSetEdit(id)}
            onDelete={deleteItem}
            emptyHint="No locations yet"
          />
          <CollapsibleSection
            title="Courses"
            count={courses.length}
            open={openSections.courses}
            onToggle={() => setOpenSections((s) => ({ ...s, courses: !s.courses }))}
            items={courses}
            saved={saved}
            editId={editId}
            checked={checked}
            onToggleCheck={setItemChecked}
            onEdit={(id) => onSetEdit(id)}
            onDelete={deleteItem}
            emptyHint="No courses yet"
          />
        </div>

        <AddItemFooter onCreate={createItem} />
      </aside>
    </div>
  );
}

/* ---------------- Sidebar pieces ---------------- */

function CollapsibleSection({
  title,
  count,
  open,
  onToggle,
  items,
  saved,
  editId,
  checked,
  onToggleCheck,
  onEdit,
  onDelete,
  emptyHint,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  items: MapItem[];
  saved: Record<string, boolean>;
  editId: string | null;
  checked: Record<string, boolean>;
  onToggleCheck: (id: string, v: boolean) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  emptyHint: string;
}) {
  return (
    <div className="mt-2 first:mt-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground transition hover:bg-secondary/60 hover:text-ink"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span>{title}</span>
        <span className="ml-auto text-[10px] text-muted-foreground/70">{count}</span>
      </button>
      {open && (
        items.length === 0 ? (
          <div className="mt-1 rounded-md border border-dashed border-hairline px-3 py-3 text-center text-[11px] text-muted-foreground/70">
            {emptyHint}
          </div>
        ) : (
          <div className="mt-1 flex flex-col gap-0.5">
            {items.map((it) => {
              const isChecked = !!checked[it.id];
              const isEditing = editId === it.id;
              const isSaved = !!saved[it.id];
              return (
                <div
                  key={it.id}
                  className={`group flex items-center gap-2 rounded-md px-1.5 py-1 transition ${
                    isEditing ? "bg-secondary" : "hover:bg-secondary/60"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => onToggleCheck(it.id, e.target.checked)}
                    className="h-3.5 w-3.5 shrink-0 cursor-pointer"
                    style={{ accentColor: it.color }}
                    aria-label={`Show ${it.name} on map`}
                  />
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: it.color }}
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-left text-xs text-ink"
                    title={it.name}
                  >
                    {it.name}
                  </span>
                  {isSaved && (
                    <button
                      onClick={() => onEdit(it.id)}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground/60 transition hover:bg-secondary hover:text-ink"
                      aria-label={`Edit ${it.name}`}
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${it.name}"?`)) onDelete(it.id);
                    }}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground/50 opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    aria-label={`Delete ${it.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

function AddItemFooter({ onCreate }: { onCreate: (kind: MapItemKind) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-hairline pt-3">
      {open ? (
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => { setOpen(false); onCreate("location"); }}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-ink transition hover:bg-secondary"
          >
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Add location</span>
          </button>
          <button
            onClick={() => { setOpen(false); onCreate("course"); }}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-ink transition hover:bg-secondary"
          >
            <RouteIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Add course</span>
          </button>
          <button
            onClick={() => setOpen(false)}
            className="self-start rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:text-ink"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-hairline py-2 text-xs text-muted-foreground transition hover:border-ink hover:text-ink"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add</span>
        </button>
      )}
    </div>
  );
}

/* ---------------- Editable name chip (top-left of edit pane) ---------------- */

function EditableNameChip({
  value,
  autoFocus,
  onConsumeAutoFocus,
  onChange,
  icon,
}: {
  value: string;
  autoFocus: boolean;
  onConsumeAutoFocus: () => void;
  onChange: (v: string) => void;
  icon: React.ReactNode;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    if (autoFocus) {
      requestAnimationFrame(() => {
        ref.current?.focus();
        ref.current?.select();
        onConsumeAutoFocus();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);
  const commit = () => {
    const t = draft.trim();
    if (t && t !== value) onChange(t);
    else setDraft(value);
  };
  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-[450] flex items-center gap-1.5 rounded-md border border-hairline bg-card/95 px-2 py-1.5 shadow-sm backdrop-blur">
      <span className="text-muted-foreground">{icon}</span>
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { commit(); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Escape") { setDraft(value); (e.target as HTMLInputElement).blur(); }
        }}
        className="w-[220px] bg-transparent text-xs text-ink outline-none"
      />
    </div>
  );
}

/* ---------------- Edit panes ---------------- */

function LocationEditPane({
  item,
  onChange,
  onSaved,
}: {
  item: MapItem;
  onChange: (pin: { lat: number; lng: number } | null) => void;
  onSaved: () => void;
}) {
  return (
    <div className="absolute inset-0 flex">
      <SimplePinMap
        scopeId={`folder-loc:${item.id}`}
        pin={item.pin ?? null}
        description=""
        name={item.name}
        showDescription={false}
        showName={false}
        kindLabel="location"
        hideSidebar
        onChange={({ pin }) => onChange(pin)}
        onSave={() => {
          toast.success("Location saved");
          onSaved();
        }}
      />
    </div>
  );
}

function CourseEditPane({
  item,
  onChange,
  onSaved,
  onDelete,
}: {
  item: MapItem;
  onChange: (path: LatLng[], splits: SplitPoint[]) => void;
  onSaved: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="relative flex-1 min-h-0">
        <CourseMapEditor
          scopeId={`folder-course:${item.id}`}
          path={item.path ?? []}
          splits={(item.splits as SplitPoint[]) ?? []}
          title={item.name}
          onChange={({ path, splits }) => onChange(path, splits)}
          onSave={() => {
            toast.success("Course saved");
            onSaved();
          }}
          onDelete={() => {
            if (confirm(`Delete "${item.name}"?`)) onDelete();
          }}
        />
      </div>
    </div>
  );
}

/* ---------------- View map (multi-overlay + search) ---------------- */

function FolderViewMap({
  folder,
  items,
  checked,
}: {
  folder: MapFolder;
  items: MapItem[];
  checked: Record<string, boolean>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const styleLoadedRef = useRef(false);
  const mapbox = useMapbox();
  const [style, setStyle] = useMapStyle(`folder-view:${folder.id}`);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!mapbox || !containerRef.current || mapRef.current) return;
    const container = containerRef.current;
    let map: MapboxMap | null = null;
    let ro: ResizeObserver | null = null;
    let raf = 0;

    const stop = observeVisibleMapContainer(container, "FolderViewMap", () => {
      if (mapRef.current || map) return;
      try {
        map = new mapbox.default.Map({
          container,
          style: MAP_STYLES[style].url,
          center: [10.7522, 59.9139],
          zoom: 5,
          attributionControl: false,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[mapbox] FolderViewMap init failed:", err);
        return;
      }
      map.addControl(new mapbox.default.NavigationControl({ showCompass: false }), "bottom-right");
      map.addControl(new mapbox.default.AttributionControl({ compact: true }));
      map.on("style.load", () => {
        styleLoadedRef.current = true;
        renderOverlays();
      });
      raf = requestAnimationFrame(() => { try { map?.resize(); } catch { /* ignore */ } });
      ro = new ResizeObserver(() => { try { map?.resize(); } catch { /* ignore */ } });
      ro.observe(container);
      mapRef.current = map;
    });

    return () => {
      stop();
      cancelAnimationFrame(raf);
      ro?.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map?.remove();
      mapRef.current = null;
      styleLoadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapbox]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    styleLoadedRef.current = false;
    map.setStyle(MAP_STYLES[style].url);
  }, [style]);

  const visibleItems = useMemo(() => items.filter((i) => checked[i.id]), [items, checked]);

  const renderOverlays = () => {
    const map = mapRef.current;
    if (!map || !mapbox || !styleLoadedRef.current) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const existing = (map.getStyle().sources ?? {}) as Record<string, unknown>;
    Object.keys(existing).forEach((src) => {
      if (src.startsWith("fv-course-")) {
        const layerCasing = `${src}-casing`;
        const layerLine = `${src}-line`;
        if (map.getLayer(layerLine)) map.removeLayer(layerLine);
        if (map.getLayer(layerCasing)) map.removeLayer(layerCasing);
        if (map.getSource(src)) map.removeSource(src);
      }
    });

    const allCoords: [number, number][] = [];

    visibleItems.forEach((it) => {
      if (it.kind === "location" && it.pin) {
        const el = document.createElement("div");
        el.style.width = "26px";
        el.style.height = "30px";
        el.innerHTML = `<svg viewBox='0 0 24 32' width='26' height='30' xmlns='http://www.w3.org/2000/svg'><path d='M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z' fill='${it.color}' stroke='white' stroke-width='1.5'/><circle cx='12' cy='12' r='4' fill='white'/></svg>`;
        const m = new mapbox.default.Marker({ element: el, anchor: "bottom" })
          .setLngLat([it.pin.lng, it.pin.lat])
          .addTo(map);
        markersRef.current.push(m);
        allCoords.push([it.pin.lng, it.pin.lat]);
      } else if (it.kind === "course" && it.path && it.path.length >= 2) {
        const srcId = `fv-course-${it.id}`;
        map.addSource(srcId, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [{
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: it.path.map((p) => [p[1], p[0]]) },
            }],
          },
        });
        map.addLayer({
          id: `${srcId}-casing`, type: "line", source: srcId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.95 },
        });
        map.addLayer({
          id: `${srcId}-line`, type: "line", source: srcId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": it.color, "line-width": 4 },
        });
        it.path.forEach((p) => allCoords.push([p[1], p[0]]));

        (it.splits ?? []).forEach((s) => {
          const el = document.createElement("div");
          el.style.width = "14px";
          el.style.height = "14px";
          el.style.borderRadius = "9999px";
          el.style.background = it.color;
          el.style.border = "2px solid #fff";
          el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.4)";
          el.title = s.label;
          const m = new mapbox.default.Marker({ element: el, anchor: "center" })
            .setLngLat([s.position[1], s.position[0]])
            .addTo(map);
          markersRef.current.push(m);
        });
      }
    });

    if (allCoords.length > 0) {
      try {
        const bounds = new (mapbox as any).default.LngLatBounds();
        allCoords.forEach((c) => bounds.extend(c));
        map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 600 });
      } catch { /* ignore */ }
    }
  };

  useEffect(() => {
    if (styleLoadedRef.current) renderOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems.map((i) => `${i.id}:${i.color}:${(i.path?.length ?? 0)}:${i.pin ? `${i.pin.lat},${i.pin.lng}` : "x"}:${(i.splits?.length ?? 0)}`).join("|")]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onLoad = () => {
      styleLoadedRef.current = true;
      renderOverlays();
    };
    map.on("style.load", onLoad);
    return () => { map.off("style.load", onLoad); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapbox, visibleItems]);

  const trimmed = query.trim().toLowerCase();
  const matches = trimmed ? items.filter((i) => i.name.toLowerCase().includes(trimmed)) : [];
  const matchedHidden = matches.filter((m) => !checked[m.id]);
  const matchedVisible = matches.filter((m) => checked[m.id]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 z-0 h-full w-full bg-secondary" />

      <div className="absolute left-4 top-4 z-[400] w-[320px] max-w-[calc(100%-2rem)]">
        <div className="flex h-[42px] items-center gap-2 rounded-xl border border-hairline bg-card/95 px-3 shadow-md backdrop-blur">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search in ${folder.name}…`}
            className="h-full flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-ink"
              aria-label="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {trimmed && (
          <div className="mt-2 rounded-xl border border-hairline bg-card/95 px-3 py-2 text-xs shadow-md backdrop-blur">
            {matches.length === 0 ? (
              <span className="text-muted-foreground">
                No locations or courses in this folder match “{query}”.
              </span>
            ) : matchedHidden.length > 0 ? (
              <div className="text-ink">
                {matchedHidden.map((m, idx) => (
                  <div key={m.id} className={idx > 0 ? "mt-1" : ""}>
                    <span className="font-medium">“{m.name}”</span>{" "}
                    <span className="text-muted-foreground">
                      is in this folder but not shown — tick it on the right to display it.
                    </span>
                  </div>
                ))}
                {matchedVisible.length > 0 && (
                  <div className="mt-1 text-muted-foreground">
                    {matchedVisible.length} other match{matchedVisible.length === 1 ? "" : "es"} already shown.
                  </div>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground">
                {matchedVisible.length} match{matchedVisible.length === 1 ? "" : "es"} already shown on the map.
              </span>
            )}
          </div>
        )}
      </div>

      <div className="absolute right-4 top-4 z-[400]">
        <MapStylePicker value={style} onChange={setStyle} compact />
      </div>

      {visibleItems.length === 0 && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-[400] -translate-x-1/2 rounded-md border border-hairline bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
          Tick a location or course on the right to show it here.
        </div>
      )}

      {!mapbox && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-secondary text-sm text-muted-foreground">
          Loading map…
        </div>
      )}
    </>
  );
}
