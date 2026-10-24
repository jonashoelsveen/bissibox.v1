import { HELVETICA_STACK } from "@/lib/cloud-landing-design";

const TRACK = "#e5e5ea";
const INK = "#1d1d1f";
const MUTED = "#6e6e73";

/**
 * Full-width tab island. The track matches the grey account type-in field.
 * The selected tab is white; the others stay on the grey track.
 */
export function AccountSegmentIsland<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { id: T; label: string }[];
  ariaLabel: string;
}) {
  const count = options.length;
  const index = Math.max(
    0,
    options.findIndex((option) => option.id === value),
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="relative grid w-full p-0.5"
      style={{
        gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
        backgroundColor: TRACK,
        borderRadius: 10,
        height: 36,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0.5 top-0.5 rounded-[8px] bg-white"
        style={{
          width: `calc((100% - 4px) / ${count})`,
          left: 2,
          transform: `translateX(${index * 100}%)`,
          transition: "transform 180ms ease",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.08)",
        }}
      />
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.id)}
            className="relative z-10 cursor-pointer"
            style={{
              fontFamily: HELVETICA_STACK,
              fontSize: 15,
              fontWeight: selected ? 500 : 400,
              color: selected ? INK : MUTED,
              transition: "color 180ms ease",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
