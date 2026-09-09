import { Animated, View } from "react-native";
import { GlassChrome } from "@/components/GlassChrome";
import { OrgPageActionMenu, ORG_ACTION_BUTTON_SIZE } from "@/components/OrgPageActionMenu";
import { OrgPageExpandableSearch } from "@/components/OrgPageExpandableSearch";

export const ORG_HEADER_EDGE_INSET = 12;
export const ORG_HEADER_ROW_GAP = 8;

export function OrgPageHeaderActions({
  topOffset,
  searchQuery,
  onSearchChange,
  onSearchActivate,
  searchActive,
  searchModeAnim,
  searchPlaceholder,
  searchBorderRadius,
  searchExpandedWidth,
  onSearchCancel,
  onAddGroup,
  onInviteAdmin,
  onInviteMember,
  menuAnchorTop,
}: {
  topOffset: number;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchActivate: () => void;
  searchActive: boolean;
  searchModeAnim: Animated.Value;
  searchPlaceholder: string;
  searchBorderRadius: number;
  searchExpandedWidth: number;
  onSearchCancel: () => void;
  onAddGroup: () => void;
  onInviteAdmin: () => void;
  onInviteMember: () => void;
  menuAnchorTop: number;
}) {
  return (
    <GlassChrome.Container
      spacing={12}
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: ORG_HEADER_EDGE_INSET,
        right: ORG_HEADER_EDGE_INSET,
        top: topOffset,
        flexDirection: "row",
        alignItems: "center",
        gap: ORG_HEADER_ROW_GAP,
        zIndex: 13,
      }}
    >
      <OrgPageExpandableSearch
        value={searchQuery}
        onChange={onSearchChange}
        onActivate={onSearchActivate}
        active={searchActive}
        searchModeAnim={searchModeAnim}
        placeholder={searchPlaceholder}
        borderRadius={searchBorderRadius}
        expandedWidth={searchExpandedWidth}
      />
      <View style={{ flex: 1 }} pointerEvents="none" />
      <OrgPageActionMenu
        inline
        menuAnchorTop={menuAnchorTop}
        searchActive={searchActive}
        searchModeAnim={searchModeAnim}
        onSearchCancel={onSearchCancel}
        onAddGroup={onAddGroup}
        onInviteAdmin={onInviteAdmin}
        onInviteMember={onInviteMember}
      />
    </GlassChrome.Container>
  );
}

export { ORG_ACTION_BUTTON_SIZE };
