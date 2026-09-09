/**
 * Balloon glyph for the Events app tile and event document tabs.
 * Matches lucide outline weight used by Calendar / Organization icons.
 */
export function EventBalloonIcon({
  className,
  strokeWidth = 1.75,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3c-2.8 0-5 2.2-5 5.2 0 2.4 1.6 4.4 3.8 5.1V16a1 1 0 0 0 1 1h.4a1 1 0 0 0 1-1v-2.7c2.2-.7 3.8-2.7 3.8-5.1C17 5.2 14.8 3 12 3Z" />
      <path d="M12 17v2.5" />
      <path d="M10 21h4" />
    </svg>
  );
}
