import { UserRound, UsersRound } from "lucide-react-native";

/** Single user icon — matches web UserRound / profile glyph */
export function ProfileIcon({
  size = 24,
  color,
  strokeWidth = 2,
}: {
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  return <UserRound size={size} color={color} strokeWidth={strokeWidth} />;
}

/** Duo user icon — matches web Clients (UsersRound) tab icon */
export function TeamIcon({
  size = 24,
  color,
  strokeWidth = 2,
}: {
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  return <UsersRound size={size} color={color} strokeWidth={strokeWidth} />;
}
