/**
 * ProfileSwitcherBar — leftmost slot in the global top tab bar.
 * Renders only the avatar (ProfileMenuButton) within the rail width.
 */
import { useRef } from "react";
import { useAuth } from "@/lib/auth";
import { ProfileMenuButton } from "@/components/ProfileMenuButton";

const RAIL_WIDTH = 256;

export function ProfileSwitcherBar() {
  const { user } = useAuth();
  const wrapRef = useRef<HTMLDivElement | null>(null);

  if (!user) return null;

  return (
    <div
      ref={wrapRef}
      className="relative flex shrink-0 items-center"
      style={{ width: RAIL_WIDTH, height: 38, marginBottom: -1, paddingBottom: 1 }}
    >
      <div className="flex items-center gap-1 pl-2">
        <ProfileMenuButton hideChangeProfile align="left" />
      </div>
    </div>
  );
}
