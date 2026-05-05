/**
 * FolderMapView — workspace shown when a Map folder is selected.
 *
 * Modes:
 *   - View mode (default): one map showing every CHECKED location/course in
 *     the folder, each rendered in its own color. Top-left search input lets
 *     the user fuzzy-search items in this folder. If a match exists but is
 *     unchecked, a calm notice prompts the user to tick it on.
 *   - Edit location: full <SimplePinMap> editor for a single location.
 *   - Edit course: full <CourseMapEditor> editor for a single course.
 *
 * Right sidebar (320px): folder header + checkbox list of locations and
 * courses + an "+ Add" footer that creates an empty location or course in
 * this folder and immediately opens its editor.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  MapPin,
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
  editId: string | null;
  onSetEdit: (id: string | null) => void;
}

export function FolderMapView({ folder, items, onItemsChange, editId, onSetEdit }: Props) {
  const editing = editId ? items.find((i) => i.id === editId) ?? null : null;

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
    onSetEdit(id);
  };

  const deleteItem = (id: string) => {
    onItemsChange((prev) => prev.filter((i) => i.id !== id));
    if (editId === id) onSetEdit(null);
    toast.success("Deleted");
  };

  // Checked-state lives in localStorage per folder (UI-only).
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
      try {
        localStorage.setItem(checkedKey, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  };

  const locations = useMemo(() => items.filter((i) => i.kind === "location"), [items]);
  const courses = useMemo(() => items.filter((i) => i.kind === "course"), [items]);

  return (
    <div className="mt-4 grid h-[calc(100vh-12rem)] min-h-0 gap-4 md:grid-cols-[1fr_320px]">
      {/* Main area */}
      <div className="relative h-full min-h-0 overflow-hidden rounded-lg border border-hairline">
        {editing ? (
          editing.kind === "location" ? (
            <LocationEditPane
              item={editing}
              onChange={(pin) => updateItem(editing.id, { pin })}
              onBack={() => onSetEdit(null)}
              onDelete={() => deleteItem(editing.id)}
            />
          ) : (
            <CourseEditPane
              item={editing}
              onChange={(path, splits) => updateItem(editing.id, { path, splits })}
              onBack={() => onSetEdit(null)}
              onDelete={() => deleteItem(editing.id)}
            />
          )
        ) : (
          <FolderViewMap
            folder={folder}
            items={items}
            checked={checked}
          />
        )}
      </div>

      {/* Right sidebar */}
      <aside className="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-lg border border-hairline bg-card p-4">
        <div className="flex items-center gap-2 border-b border-hairline pb-3">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <span className="truncate text-sm font-medium text-ink">{folder.name}</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <SidebarSection
            title="Locations"
            icon={<MapPin className="h-3.5 w-3.5" />}
            items={locations}
            editId={editId}
            checked={checked}
            onToggleCheck={setItemChecked}
            onOpen={(id) => onSetEdit(id)}
            onDelete={deleteItem}
            emptyHint="No locations yet"
          />
          <SidebarSection
            title="Courses"
            icon={<RouteIcon className="h-3.5 w-3.5" />}
            items={courses}
            editId={editId}
            checked={checked}
            onToggleCheck={setItemChecked}
            onOpen={(id) => onSetEdit(id)}
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

function SidebarSection({
  title,
  icon,
  items,
  editId,
  checked,
  onToggleCheck,
  onOpen,
  onDelete,
  emptyHint,
}: {
  title: string;
  icon: React.ReactNode;
  items: MapItem[];
  editId: string | null;
  checked: Record<string, boolean>;
  onToggleCheck: (id: string, v: boolean) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  emptyHint: string;
}) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{title}</span>
        <span className="ml-auto text-muted-foreground/70">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-hairline px-3 py-3 text-center text-[11px] text-muted-foreground/70">
          {emptyHint}
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {items.map((it) => {
            const isChecked = !!checked[it.id];
            const isEditing = editId === it.id;
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
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-current"
                  style={{ accentColor: it.color }}
                  aria-label={`Show ${it.name} on map`}
                />
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: it.color }}
                />
                <button
                  onClick={() => onOpen(it.id)}
                  className="min-w-0 flex-1 truncate text-left text-xs text-ink"
                  title={it.name}
                >
                  {it.name}
                </button>
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
            onClick={() => {
              setOpen(false);
              onCreate("location");
            }}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-ink transition hover:bg-secondary"
          >
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Add location</span>
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onCreate("course");
            }}
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

/* ---------------- Edit panes (wrap existing editors) ---------------- */

function BackChip({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button
      onClick={onBack}
      className="pointer-events-auto absolute left-4 top-4 z-[450] inline-flex items-center gap-1.5 rounded-md border border-hairline bg-card/95 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur transition hover:text-ink"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      <span>Back to {label}</span>
    </button>
  );
}

function LocationEditPane({
  item,
  onChange,
  onBack,
  onDelete,
}: {
  item: MapItem;
  onChange: (pin: { lat: number; lng: number } | null) => void;
  onBack: () => void;
  onDelete: () => void;
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
          onBack();
        }}
      />
      <BackChip onBack={onBack} label={item.folder ?? "folder"} />
      <button
        onClick={() => {
          if (confirm(`Delete "${item.name}"?`)) {
            onDelete();
            onBack();
          }
        }}
        className="pointer-events-auto absolute right-[260px] top-4 z-[450] inline-flex items-center gap-1.5 rounded-md border border-hairline bg-card/95 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur transition hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" /> Delete
      </button>
    </div>
  );
}

function CourseEditPane({
  item,
  onChange,
  onBack,
  onDelete,
}: {
  item: MapItem;
  onChange: (path: LatLng[], splits: SplitPoint[]) => void;
  onBack: () => void;
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
            onBack();
          }}
          onDelete={() => {
            if (confirm(`Delete "${item.name}"?`)) {
              onDelete();
              onBack();
            }
          }}
        />
        <BackChip onBack={onBack} label={item.folder ?? "folder"} />
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

  // Init
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

  // Style change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    styleLoadedRef.current = false;
    map.setStyle(MAP_STYLES[style].url);
  }, [style]);

  const visibleItems = useMemo(() => items.filter((i) => checked[i.id]), [items, checked]);

  // Overlay renderer (lines via per-item sources/layers + markers)
  const renderOverlays = () => {
    const map = mapRef.current;
    if (!map || !mapbox || !styleLoadedRef.current) return;

    // Clean up old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Remove old course layers/sources (we suffix sources with item id)
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
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: it.path.map((p) => [p[1], p[0]]),
                },
              },
            ],
          },
        });
        map.addLayer({
          id: `${srcId}-casing`,
          type: "line",
          source: srcId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.95 },
        });
        map.addLayer({
          id: `${srcId}-line`,
          type: "line",
          source: srcId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": it.color, "line-width": 4 },
        });
        it.path.forEach((p) => allCoords.push([p[1], p[0]]));

        // Render split markers in the item's color
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

    // Fit bounds
    if (allCoords.length > 0) {
      try {
        const bounds = new (mapbox as any).default.LngLatBounds();
        allCoords.forEach((c) => bounds.extend(c));
        map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 600 });
      } catch { /* ignore */ }
    }
  };

  // Re-render when checked items or geometry change
  useEffect(() => {
    if (styleLoadedRef.current) renderOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems.map((i) => `${i.id}:${i.color}:${(i.path?.length ?? 0)}:${i.pin ? `${i.pin.lat},${i.pin.lng}` : "x"}:${(i.splits?.length ?? 0)}`).join("|")]);

  // Re-render on style.load (handled in init), but also when style changes
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

  // Search behavior
  const trimmed = query.trim().toLowerCase();
  const matches = trimmed
    ? items.filter((i) => i.name.toLowerCase().includes(trimmed))
    : [];
  const matchedHidden = matches.filter((m) => !checked[m.id]);
  const matchedVisible = matches.filter((m) => checked[m.id]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 z-0 h-full w-full bg-secondary" />

      {/* Top-left search */}
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

      {/* Top-right style picker */}
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

// Unused import suppressions — keep references for tree-shaking & types.
void ChevronDown;
void ChevronRight;
