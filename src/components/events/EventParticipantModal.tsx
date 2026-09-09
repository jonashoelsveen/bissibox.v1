/**
 * Participant modal — visual twin of the entity Member modal, but scoped to
 * event participants only. No shared state with entity roster.
 */

import { useEffect, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SUBEVENT_COLOR,
  type EventParticipantDraft,
  type EventSubeventDraft,
} from "./event-ui-types";

function FolderIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 shrink-0">
      <path
        d="M1.5 3.25C1.5 2.56 2.06 2 2.75 2h3.05l1.2 1.2h6.25c.69 0 1.25.56 1.25 1.25v7.3c0 .69-.56 1.25-1.25 1.25H2.75c-.69 0-1.25-.56-1.25-1.25V3.25Z"
        fill={color}
      />
      <path
        d="M1.5 4.75h13v6.05c0 .69-.56 1.25-1.25 1.25H2.75c-.69 0-1.25-.56-1.25-1.25V4.75Z"
        fill={color}
        opacity={0.82}
      />
    </svg>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: EventParticipantDraft | null;
  subevents: EventSubeventDraft[];
  onSave: (row: EventParticipantDraft) => void;
};

export function EventParticipantModal({
  open,
  onOpenChange,
  initial,
  subevents,
  onSave,
}: Props) {
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [sex, setSex] = useState("");
  const [born, setBorn] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subeventId, setSubeventId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !initial) return;
    setName(initial.name);
    setSurname(initial.surname);
    setSex(initial.sex);
    setBorn(initial.born);
    setEmail(initial.email);
    setPhone(initial.phone);
    setSubeventId(initial.subeventId);
  }, [open, initial]);

  if (!initial) return null;

  const title = `${initial.name} ${initial.surname}`.trim() || "Edit participant";
  const sortedSubevents = [...subevents].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleSave = () => {
    onSave({
      ...initial,
      name,
      surname,
      sex,
      born,
      email,
      phone,
      subeventId,
    });
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex w-[640px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col",
            "border border-hairline bg-white shadow-xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-3">
            <DialogPrimitive.Title className="min-w-0 flex-1 font-sans text-sm font-semibold text-ink">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="grid h-6 w-6 shrink-0 place-items-center text-muted-foreground hover:text-ink"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="px-5 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>First name</FieldLabel>
                <SharpInput value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <FieldLabel>Surname</FieldLabel>
                <SharpInput
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                />
              </div>
              <div className="mt-2">
                <FieldLabel>Sex</FieldLabel>
                <SharpSelect value={sex} onChange={(e) => setSex(e.target.value)}>
                  <option value="">—</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </SharpSelect>
              </div>
              <div className="mt-2">
                <FieldLabel>Date of birth</FieldLabel>
                <SharpInput
                  type="date"
                  value={born}
                  onChange={(e) => setBorn(e.target.value)}
                />
              </div>
            </div>

            <div className="my-4 border-t border-hairline" />
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink">
                Contact
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Email</FieldLabel>
                  <SharpInput
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>Phone</FieldLabel>
                  <SharpInput
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="my-4 border-t border-hairline" />
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink">
                Subevent
              </div>
              <div className="space-y-1">
                <SubeventOption
                  selected={subeventId == null}
                  label="Unassigned"
                  color="#AEAEB2"
                  onSelect={() => setSubeventId(null)}
                />
                {sortedSubevents.map((s) => (
                  <SubeventOption
                    key={s.id}
                    selected={subeventId === s.id}
                    label={s.name || "Untitled"}
                    color={s.color || DEFAULT_SUBEVENT_COLOR}
                    onSelect={() => setSubeventId(s.id)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-hairline px-4 py-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-8 border border-hairline bg-white px-3.5 text-sm text-ink transition-colors hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim() && !surname.trim()}
              className="h-8 bg-ink px-3.5 text-sm text-white transition-colors hover:bg-ink/90 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SubeventOption({
  selected,
  label,
  color,
  onSelect,
}: {
  selected: boolean;
  label: string;
  color: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
        selected ? "bg-secondary text-ink" : "text-ink hover:bg-secondary/60",
      )}
    >
      <FolderIcon color={color} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1.5 block font-sans text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </label>
  );
}

function SharpInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-9 w-full border border-hairline bg-white px-3 text-sm text-ink outline-none focus:border-ink/30",
        props.className,
      )}
    />
  );
}

function SharpSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-9 w-full border border-hairline bg-white px-3 text-sm text-ink outline-none focus:border-ink/30",
        props.className,
      )}
    />
  );
}
