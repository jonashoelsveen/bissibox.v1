import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { CoOrganizerDraft } from "./event-ui-types";

function newRowId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `co-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function NewEventModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, coOrganizers: CoOrganizerDraft[]) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [rows, setRows] = useState<CoOrganizerDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setRows([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Event name is required");
      return;
    }
    if (saving) return;
    const coOrganizers = rows.filter((r) => r.email.trim().length > 0);
    setSaving(true);
    void Promise.resolve(onSave(trimmed, coOrganizers)).finally(() => {
      setSaving(false);
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative z-10 w-full max-w-lg rounded-2xl border border-hairline bg-card p-6 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">New event</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Event name"
          autoFocus
          className="mb-6 w-full border-0 bg-transparent text-2xl font-semibold text-ink outline-none placeholder:text-muted-foreground/60"
        />

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-ink">Add co-organizers</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Invite people to help organize this event by email.
            </p>
          </div>

          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-2">
              <input
                type="email"
                value={row.email}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, email: e.target.value } : r)),
                  )
                }
                placeholder="name@example.com"
                className="min-w-0 flex-1 rounded-xl border border-hairline bg-background px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => toast.message("Invites coming soon")}
                className="shrink-0 rounded-full border border-hairline px-4 py-2 text-sm font-medium text-ink hover:bg-secondary"
              >
                Invite
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, { id: newRowId(), email: "" }])}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-ink"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add co-organizer
          </button>
        </div>

        <div className="mt-8 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
