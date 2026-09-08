import { Pencil } from "lucide-react";

/** Compact pencil control for the right edge of account fields. */
export function AccountFieldEditButton({
  onClick,
  ariaLabel,
}: {
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex h-7 w-7 items-center justify-center rounded-md text-[#6e6e73] transition-colors hover:bg-black/[0.06] hover:text-[#1d1d1f]"
    >
      <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
    </button>
  );
}
