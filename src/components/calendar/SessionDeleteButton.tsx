import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { SessionDeleteScope } from "@/lib/sessionRepeat";
import { SessionScopeMenu } from "./SessionScopeMenu";

export function SessionDeleteButton({
  repeatSession,
  onDelete,
  onDeleteScope,
}: {
  repeatSession: boolean;
  /** Single-session delete (non-repeat or direct). */
  onDelete: () => void;
  /** Repeat-series scoped delete. */
  onDeleteScope: (scope: SessionDeleteScope) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (repeatSession) {
      setMenuOpen((v) => !v);
      return;
    }
    onDelete();
  };

  return (
    <>
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          aria-label="Delete session"
          aria-haspopup={repeatSession ? "menu" : undefined}
          aria-expanded={repeatSession ? menuOpen : undefined}
          title="Delete"
          onClick={handleClick}
          onMouseDown={(e) => e.stopPropagation()}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>
      <SessionScopeMenu
        open={repeatSession && menuOpen}
        anchorRef={wrapRef}
        onSelect={(scope) => {
          setMenuOpen(false);
          onDeleteScope(scope);
        }}
        onDismiss={() => setMenuOpen(false)}
        heading="Delete:"
      />
    </>
  );
}
