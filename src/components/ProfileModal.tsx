/**
 * ProfileModal — listens for "open-profile-modal" events and renders the
 * user's profile page inside a Notion-style centered modal.
 * Embeds the existing public profile route via iframe
 * so we reuse the exact same content + horizontal tab bar without
 * duplicating the page. An "Active" / "Not active" badge is shown in the
 * top-right based on the current profile's active flag.
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export function ProfileModal() {
  const { user, activeEntityId } = useAuth();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<boolean | null>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("open-profile-modal", onOpen as EventListener);
    return () => window.removeEventListener("open-profile-modal", onOpen as EventListener);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      if (activeEntityId) {
        const { data } = await supabase
          .from("teams")
          .select("active")
          .eq("id", activeEntityId)
          .maybeSingle();
        setActive(data?.active ?? null);
      } else {
        const { data } = await supabase
          .from("profiles")
          .select("athlete_active")
          .eq("id", user.id)
          .maybeSingle();
        setActive(data?.athlete_active ?? null);
      }
    })();
  }, [open, user, activeEntityId]);

  if (!open || !user) return null;

  const src = activeEntityId
    ? `/t/${activeEntityId}#embed=1`
    : `/u/${user.id}#embed=1`;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-6"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative h-[85vh] w-[min(1100px,95vw)] overflow-hidden rounded-xl bg-background shadow-2xl"
      >
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          {active !== null && (
            <span
              className={`mono rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${
                active
                  ? "bg-emerald-500/15 text-emerald-600"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {active ? "Active" : "Not active"}
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close profile"
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <iframe
          key={src}
          src={src}
          title="Profile"
          className="h-full w-full border-0 bg-background"
        />
      </div>
    </div>
  );
}
