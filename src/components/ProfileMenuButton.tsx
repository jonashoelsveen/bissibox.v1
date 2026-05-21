/**
 * ProfileMenuButton — the round profile-initial circle that sits at the far
 * right of the top tab bar (after the Apps icon). Clicking it opens a
 * macOS-style menu (same surface as the group-members hover menu, but
 * click-only) with: Profile, Settings, Change profile (submenu), Log out.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, LogOut, Settings as SettingsIcon, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

type Entity = { id: string; name: string; entity_type: "team" | "company" | "cooperation" };

const ENTITY_LABEL: Record<Entity["entity_type"], string> = {
  team: "Team",
  company: "Company",
  cooperation: "Cooperation",
};

export function ProfileMenuButton() {
  const { user, activeEntityId, setActiveEntity, signOut } = useAuth();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [changeHover, setChangeHover] = useState(false);
  const [individualName, setIndividualName] = useState("");
  const [individualAvatar, setIndividualAvatar] = useState<string | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [activeEntityName, setActiveEntityName] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: prof }, { data: ents }] = await Promise.all([
        supabase
          .from("profiles")
          .select("first_name,last_name,email,avatar_url")
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
      setIndividualAvatar(prof?.avatar_url ?? null);
      const list = (ents ?? []) as Entity[];
      setEntities(list);
      if (activeEntityId) {
        const found = list.find((e) => e.id === activeEntityId);
        setActiveEntityName(found?.name ?? "");
      } else {
        setActiveEntityName("");
      }
    })();
  }, [user, activeEntityId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        setOpen(false);
        setChangeHover(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setChangeHover(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const displayName = activeEntityId ? activeEntityName || "Profile" : individualName;
  const initial = (displayName || "?").trim().charAt(0).toUpperCase();
  const avatarUrl = activeEntityId ? null : individualAvatar;

  const openProfileModal = () => {
    setOpen(false);
    setChangeHover(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("open-profile-modal"));
    }
  };

  const openSettings = () => {
    setOpen(false);
    setChangeHover(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("open-settings"));
    }
  };

  const switchTo = (id: string | null) => {
    setOpen(false);
    setChangeHover(false);
    setActiveEntity(id);
  };

  const doSignOut = async () => {
    setOpen(false);
    setChangeHover(false);
    await signOut();
    void navigate({ to: "/auth" });
  };

  const Avatar = ({ size = 18 }: { size?: number }) => (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-[10px] font-medium text-ink"
      style={{ width: size, height: size }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );

  const otherProfiles: { id: string | null; name: string; entity_type?: Entity["entity_type"] }[] = [];
  if (activeEntityId) otherProfiles.push({ id: null, name: individualName || "Individual" });
  for (const e of entities) {
    if (e.id !== activeEntityId) otherProfiles.push({ id: e.id, name: e.name, entity_type: e.entity_type });
  }

  return (
    <div className="relative mb-1" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Profile menu"
        aria-haspopup="menu"
        aria-expanded={open}
        data-nav-icon=""
        data-nav-key="profile-menu"
        className="flex h-9 w-9 items-center justify-center rounded-md"
      >
        <span className="relative inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-white/15 text-[11px] font-medium text-white">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="mac-menu absolute right-0 top-full z-[100] mt-1.5 w-64 overflow-visible rounded-lg p-1"
          style={{ transition: "none" }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={openProfileModal}
            onMouseEnter={() => setChangeHover(false)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-black/[0.06]"
            style={{ transition: "none", color: "#1d1d1f" }}
          >
            <Avatar size={20} />
            <span className="min-w-0 flex-1 truncate">{displayName}</span>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={openSettings}
            onMouseEnter={() => setChangeHover(false)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-black/[0.06]"
            style={{ transition: "none", color: "#1d1d1f" }}
          >
            <SettingsIcon className="h-3.5 w-3.5" />
            <span className="min-w-0 flex-1 truncate">Settings</span>
          </button>

          <div
            className="relative"
            onMouseEnter={() => setChangeHover(true)}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => setChangeHover((v) => !v)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-black/[0.06]"
              style={{ transition: "none", color: "#1d1d1f" }}
            >
              <UserIcon className="h-3.5 w-3.5" />
              <span className="min-w-0 flex-1 truncate">Change profile</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            {changeHover && (
              <>
                <div className="absolute right-full top-0 h-full w-2" />
                <div
                  role="menu"
                  className="mac-menu absolute right-full top-0 z-[110] w-60 overflow-visible rounded-lg p-1"
                  style={{ marginRight: 8, transition: "none" }}
                >
                  {otherProfiles.length === 0 && (
                    <div className="px-2 py-1 text-[11px] text-muted-foreground">
                      No other profiles.
                    </div>
                  )}
                  {otherProfiles.map((p) => (
                    <button
                      key={p.id ?? "individual"}
                      type="button"
                      role="menuitem"
                      onClick={() => switchTo(p.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-black/[0.06]"
                      style={{ transition: "none", color: "#1d1d1f" }}
                    >
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span className="mono ml-2 shrink-0 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                        {p.entity_type ? ENTITY_LABEL[p.entity_type] : "Personal"}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={doSignOut}
            onMouseEnter={() => setChangeHover(false)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-black/[0.06]"
            style={{ transition: "none", color: "#1d1d1f" }}
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="min-w-0 flex-1 truncate">Log out</span>
          </button>
        </div>
      )}
    </div>
  );
}
