/**
 * ProfileSwitcherBar — leftmost slot in the global top tab bar. Contains:
 *   • Avatar circle (opens the profile menu — Profile, Settings, Log out)
 *   • Profile name + chevron (opens a simple dropdown to switch profile)
 *
 * Total width matches the left side panel on Calendar/Diary/Photos/Cloud
 * (256px), so its right edge aligns with the right edge of the panel.
 * The name truncates with a fade before the chevron when overflowing.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

const SKIP_PERSIST_ROUTES = new Set(["/", "/auth", "/login"]);

function defaultRouteForProfile(entityId: string | null): string {
  return entityId ? "/clients" : "/calendar";
}

function lastRouteKey(userId: string, entityId: string | null): string {
  return `aponna:last-route:${userId}:${entityId ?? "individual"}`;
}

function saveLastRoute(userId: string, entityId: string | null, path: string): void {
  if (SKIP_PERSIST_ROUTES.has(path)) return;
  try {
    localStorage.setItem(lastRouteKey(userId, entityId), path);
  } catch { /* storage full */ }
}

function loadLastRoute(userId: string, entityId: string | null): string {
  try {
    return localStorage.getItem(lastRouteKey(userId, entityId)) ?? defaultRouteForProfile(entityId);
  } catch {
    return defaultRouteForProfile(entityId);
  }
}
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { ProfileMenuButton } from "@/components/ProfileMenuButton";

type Entity = { id: string; name: string; entity_type: "team" | "company" | "cooperation" };

const ENTITY_LABEL: Record<Entity["entity_type"], string> = {
  team: "Team",
  company: "Company",
  cooperation: "Cooperation",
};

const RAIL_WIDTH = 256;

export function ProfileSwitcherBar() {
  const { user, activeEntityId, setActiveEntity } = useAuth();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef<HTMLSpanElement | null>(null);
  const nameBtnRef = useRef<HTMLButtonElement | null>(null);

  const [open, setOpen] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [individualName, setIndividualName] = useState("");
  const [entities, setEntities] = useState<Entity[]>([]);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!user) return;
    saveLastRoute(user.id, activeEntityId, path);
  }, [path, user?.id, activeEntityId]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: prof }, { data: ents }] = await Promise.all([
        supabase
          .from("profiles")
          .select("first_name,last_name,email")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("teams")
          .select("id,name,entity_type")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: true }),
      ]);
      const name =
        [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim() ||
        prof?.email ||
        user.email ||
        "Individual";
      setIndividualName(name);
      setEntities((ents ?? []) as Entity[]);
    })();
  }, [user]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!nameBtnRef.current) return;
      const target = e.target as Node;
      // Allow clicks inside the dropdown
      const menu = document.getElementById("profile-switch-menu");
      if (nameBtnRef.current.contains(target) || (menu && menu.contains(target))) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeEntity = entities.find((e) => e.id === activeEntityId);
  const displayName = activeEntity?.name || individualName || "Profile";

  useLayoutEffect(() => {
    const measure = () => {
      const el = nameRef.current;
      const wrap = nameBtnRef.current;
      if (!el || !wrap) return;
      setOverflow(el.scrollWidth > wrap.clientWidth - 18 + 0.5);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (nameRef.current) ro.observe(nameRef.current);
    if (nameBtnRef.current) ro.observe(nameBtnRef.current);
    return () => ro.disconnect();
  }, [displayName]);

  if (!user) return null;

  const switchTo = (id: string | null) => {
    setOpen(false);
    setActiveEntity(id);
  };

  const profiles: { id: string | null; name: string; type: string }[] = [
    { id: null, name: individualName || "Individual", type: "Personal" },
    ...entities.map((e) => ({ id: e.id, name: e.name, type: ENTITY_LABEL[e.entity_type] })),
  ];

  const maskStyle = overflow
    ? {
        maskImage:
          "linear-gradient(to right, black calc(100% - 18px), transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, black calc(100% - 18px), transparent)",
      }
    : undefined;

  return (
    <div
      ref={wrapRef}
      className="relative flex shrink-0 items-center"
      style={{ width: RAIL_WIDTH, height: 38, marginBottom: -1, paddingBottom: 1 }}
    >
      <div className="flex items-center gap-1 pl-2" style={{ width: "100%" }}>
        <ProfileMenuButton hideChangeProfile align="left" />
        <button
          ref={nameBtnRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          data-nav-icon=""
          data-nav-key="profile-switch"
          className="relative flex h-9 min-w-0 flex-1 items-center gap-1 rounded-md px-2 text-left text-[13px] font-medium"
          style={{ color: "#ffffff" }}
        >
          <span
            className="min-w-0 flex-1 overflow-hidden whitespace-nowrap"
            style={maskStyle}
          >
            <span ref={nameRef} className="inline-block">{displayName}</span>
          </span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 opacity-80"
            strokeWidth={2}
          />
        </button>
        {open && (
          <div
            id="profile-switch-menu"
            role="menu"
            className="mac-menu absolute top-full z-[100] mt-1.5 overflow-visible rounded-lg p-1"
            style={{
              left: 44,
              right: 8,
              transition: "none",
            }}
          >
            {profiles.map((p) => {
              const isActive =
                (activeEntityId == null && p.id == null) || p.id === activeEntityId;
              return (
                <button
                  key={p.id ?? "individual"}
                  type="button"
                  role="menuitem"
                  onClick={() => switchTo(p.id)}
                  className={
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-black/[0.06] " +
                    (isActive ? "bg-black/[0.04]" : "")
                  }
                  style={{ transition: "none", color: "#1d1d1f" }}
                >
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className="mono ml-2 shrink-0 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                    {p.type}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
