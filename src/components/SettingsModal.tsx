import { useEffect, useState } from "react";
import { SettingsView } from "@/routes/settings";

/**
 * Listens for the global "open-settings" event and renders the Settings UI
 * inside a Notion-style centered modal. The settings icon in the top tab bar
 * dispatches this event instead of navigating to /settings.
 */
export function SettingsModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("open-settings", onOpen as EventListener);
    return () => window.removeEventListener("open-settings", onOpen as EventListener);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return <SettingsView onClose={() => setOpen(false)} />;
}
