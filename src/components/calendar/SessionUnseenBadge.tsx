/**
 * SessionUnseenBadge — overlapping speech-bubble icon(s) shown on the
 * top-right corner of a session block when notes have not yet been seen
 * by the current viewer.
 *
 * - Owner viewer: single black bubble pointing right (unseen leader notes).
 * - Leader viewer: gray bubble pointing left (unseen owner note) and/or
 *   black bubble pointing right (unseen other-leader notes). Always exactly
 *   one bubble per axis regardless of how many notes are unseen.
 *
 * Hover behavior is owned by the parent (UnifiedElasticGrid):
 *  - parent passes `triggerSeen` boolean. When it flips true (after 2s hover
 *    or details click), we play the magnify-then-fade animation and on
 *    completion call `onSeen`.
 */
import { motion, AnimatePresence } from "framer-motion";

const OWNER_GRAY = "#9CA3AF"; // matches the side-line on member/owner notes
const LEADER_BLACK = "#111827"; // matches the side-line on leader notes (near-black)

function BubbleLeft({ color }: { color: string }) {
  // Speech bubble whose tail points down-left.
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        d="M12 3.5c5.247 0 9.5 3.246 9.5 7.25 0 4.004-4.253 7.25-9.5 7.25-1.066 0-2.092-.135-3.05-.385L4.6 20.4a.5.5 0 0 1-.81-.49l.84-3.18C3.16 15.39 2.5 13.78 2.5 12.05 2.5 6.746 6.753 3.5 12 3.5z"
        fill={color}
      />
    </svg>
  );
}

function BubbleRight({ color }: { color: string }) {
  // Mirrored — tail points down-right.
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <g transform="translate(24,0) scale(-1,1)">
        <path
          d="M12 3.5c5.247 0 9.5 3.246 9.5 7.25 0 4.004-4.253 7.25-9.5 7.25-1.066 0-2.092-.135-3.05-.385L4.6 20.4a.5.5 0 0 1-.81-.49l.84-3.18C3.16 15.39 2.5 13.78 2.5 12.05 2.5 6.746 6.753 3.5 12 3.5z"
          fill={color}
        />
      </g>
    </svg>
  );
}

export interface SessionUnseenBadgeProps {
  hasUnseenOwner: boolean;
  hasUnseenLeader: boolean;
  /** When true, play the magnify + fade-out animation, then call onSeen. */
  dismissing: boolean;
  onSeen: () => void;
}

export function SessionUnseenBadge({
  hasUnseenOwner,
  hasUnseenLeader,
  dismissing,
  onSeen,
}: SessionUnseenBadgeProps) {
  if (!hasUnseenOwner && !hasUnseenLeader) return null;

  return (
    <AnimatePresence onExitComplete={onSeen}>
      {!dismissing && (
        <motion.div
          key="badge"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.4, opacity: 0 }}
          transition={{
            scale: { duration: 0.18, ease: [0.2, 0.9, 0.2, 1.2] },
            opacity: { duration: 0.16, ease: [0.4, 0, 0.6, 1] },
          }}
          className="pointer-events-none absolute -top-1.5 -right-1.5 z-[15] flex items-center"
          style={{
            filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.25))",
          }}
        >
          {hasUnseenOwner && (
            <span style={{ marginRight: hasUnseenLeader ? -6 : 0 }}>
              <BubbleLeft color={OWNER_GRAY} />
            </span>
          )}
          {hasUnseenLeader && <BubbleRight color={LEADER_BLACK} />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
