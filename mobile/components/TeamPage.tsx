import {
  Alert,
  Animated,
  Easing,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { ChevronRight, Pencil, Check } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { withAlpha } from "@/lib/colorAlpha";
import {
  type TeamGroup,
  type TeamInviteMember,
  type TeamRoster,
} from "@/hooks/useTeams";
import { rosterDisplayLabel } from "@/lib/memberSearch";
import {
  buildAllTabRows,
  filterAdminsByGroup,
  filterMembersByGroup,
  filterRosterPeople,
  rosterPersonLabel,
  type OverviewRow,
} from "@/lib/entityOverview";
import { compactSheetHeight, groupSheetHeight } from "@/components/PrimaryButton";
import { TAB_BAR_SCROLL_EXTRA } from "@/components/BottomTabBar";
import { ORG_ACTION_BUTTON_SIZE } from "@/components/OrgPageActionMenu";
import {
  ORG_HEADER_EDGE_INSET,
  ORG_HEADER_ROW_GAP,
  OrgPageHeaderActions,
} from "@/components/OrgPageHeaderActions";
import { BottomSheet, SheetCompactBody, SheetDismissArea, SheetFooter } from "@/components/BottomSheet";
import { SheetTextInput } from "@/components/SheetTextInput";
import { EntitySegmentTabs } from "@/components/EntitySegmentTabs";
import {
  MEMBER_USER_ICON_COLOR,
  OverviewUserIcon,
  PeriwinkleFolderIcon,
} from "@/components/entity/EntityRosterIcons";

type RosterTab = "all" | "admins" | "members";

type InviteSheetKind = { type: "admin" | "member"; email: string } | null;

type GroupSheetKind = {
  type: "group";
  id?: string;
  name: string;
  age_from: string;
  age_to: string;
} | null;

export type MemberBlindTarget = { type: "admin" | "member"; id: string };

const ROW_RADIUS = 14;
const ROW_PAD_V = 8;
const ROW_PAD_H = 12;
const ROW_ICON_SIZE = 13;
const ROW_LABEL_SIZE = 14;
const ROW_SUB_SIZE = 11;
const SEARCH_RADIUS = 24;
const GROUP_SELECTOR_TAB_HEIGHT = 52;
const GROUP_TITLE_BLOCK_HEIGHT = 76;
const TABS_BLOCK_HEIGHT = 44;
const SCROLL_HEADER_GAP = 0;
const HEADER_EXPANDED_HEIGHT = GROUP_TITLE_BLOCK_HEIGHT + TABS_BLOCK_HEIGHT;
/** Space below tab island before roster rows. */
const ROSTER_BELOW_TABS_GAP = SCROLL_HEADER_GAP;
/** Extra space below tab island when search is active. */
const ROSTER_BELOW_TABS_GAP_SEARCH = 8;
const SCROLL_PADDING_SEARCH_ACTIVE =
  HEADER_EXPANDED_HEIGHT + ROSTER_BELOW_TABS_GAP + ROSTER_BELOW_TABS_GAP_SEARCH;
/** Bottom scroll inset for roster list (tab bar only — no floating action button). */
const ROSTER_SCROLL_BOTTOM_PADDING = 24 + TAB_BAR_SCROLL_EXTRA;

const TOP_BAR_PAD_TOP = 14;
const TOP_BAR_PAD_BOTTOM = 10;
const TOP_BAR_H_PADDING = 24;
/** Extra inset for search / + buttons inside the top bar (beyond horizontal padding). */
const ORG_TOP_BAR_EDGE_INSET = ORG_HEADER_EDGE_INSET;
const TOP_BAR_ROW_GAP = ORG_HEADER_ROW_GAP;
const TOP_BAR_CONTENT_HEIGHT = GROUP_TITLE_BLOCK_HEIGHT - TOP_BAR_PAD_TOP - TOP_BAR_PAD_BOTTOM;
const TOP_BAR_BUTTON_OFFSET = (TOP_BAR_CONTENT_HEIGHT - ORG_ACTION_BUTTON_SIZE) / 2;
const ORG_MENU_ANCHOR_TOP = TOP_BAR_PAD_TOP + TOP_BAR_BUTTON_OFFSET;

const SEARCH_OPEN_SPRING = {
  useNativeDriver: false as const,
  damping: 20,
  stiffness: 300,
  mass: 0.72,
  overshootClamping: true,
};

const SEARCH_CLOSE_TIMING = {
  toValue: 0 as const,
  duration: 280,
  easing: Easing.out(Easing.cubic),
  useNativeDriver: false as const,
};

const TABS: Array<{ key: RosterTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "admins", label: "Admins" },
  { key: "members", label: "Members" },
];

export function TeamPage({
  roster,
  memberBlind,
  onMemberBlindChange,
  memberBlindDeleteRef,
}: {
  roster: TeamRoster;
  memberBlind: MemberBlindTarget | null;
  onMemberBlindChange: (target: MemberBlindTarget | null) => void;
  memberBlindDeleteRef: MutableRefObject<(() => void) | null>;
}) {
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const [tab, setTab] = useState<RosterTab>("all");
  const [inviteSheet, setInviteSheet] = useState<InviteSheetKind>(null);
  const [groupSheet, setGroupSheet] = useState<GroupSheetKind>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    table: "app_team_admins" | "app_team_groups" | "entity_members";
    id: string;
    label: string;
    excludeAdminId?: string;
  } | null>(null);
  const [secondAdminId, setSecondAdminId] = useState<string>("");
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [lockedExpandedWidth, setLockedExpandedWidth] = useState<number | null>(null);
  const searchModeAnim = useRef(new Animated.Value(0)).current;
  const { admins, groups, members, invite, saveGroup, deleteRow } = roster;

  const activeAdmins = admins.filter((a) => a.status === "active" || a.status === "pending");

  const selectedGroupLabel =
    groupFilter == null ? "All" : (groups.find((g) => g.id === groupFilter)?.name ?? "All");

  const exitSearch = useCallback(() => {
    Keyboard.dismiss();
    searchModeAnim.stopAnimation();
    Animated.timing(searchModeAnim, SEARCH_CLOSE_TIMING).start(({ finished }) => {
      if (!finished) return;
      setSearchQuery("");
      setSearchActive(false);
      setLockedExpandedWidth(null);
    });
  }, [searchModeAnim]);

  const toggleGroupPicker = useCallback(() => {
    if (searchActive) exitSearch();
    setGroupPickerOpen((open) => !open);
  }, [exitSearch, searchActive]);

  const showRosterRows = !searchActive || searchQuery.trim().length > 0;

  useEffect(() => {
    if (groupFilter == null) return;
    if (groups.some((g) => g.id === groupFilter)) return;
    setGroupFilter(null);
  }, [groups, groupFilter]);

  const filteredAdmins = useMemo(
    () => filterRosterPeople(filterAdminsByGroup(admins, groupFilter), searchQuery),
    [admins, groupFilter, searchQuery],
  );

  const filteredMembers = useMemo(
    () => filterRosterPeople(filterMembersByGroup(members, groupFilter), searchQuery),
    [members, groupFilter, searchQuery],
  );

  const allTabRows = useMemo(
    () => buildAllTabRows(groups, admins, members, searchQuery, groupFilter),
    [groups, admins, members, searchQuery, groupFilter],
  );

  const requestDelete = useCallback(
    (
      table: "app_team_admins" | "app_team_groups" | "entity_members",
      id: string,
      label: string,
      excludeAdminId?: string,
    ) => {
      const adminCount = admins.length;
      if (adminCount >= 2) {
        setSecondAdminId("");
        setConfirmDelete({ table, id, label, excludeAdminId });
        return;
      }
      Alert.alert("Delete", `Are you sure you want to delete "${label}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const ok = await deleteRow(table, id);
              if (ok && table === "app_team_groups") setGroupSheet(null);
            })();
          },
        },
      ]);
    },
    [admins.length, deleteRow],
  );

  const confirmSecondAdminDelete = useCallback(async () => {
    if (!confirmDelete || !secondAdminId) return;
    const ok = await deleteRow(confirmDelete.table, confirmDelete.id);
    if (ok && confirmDelete.table === "app_team_groups") setGroupSheet(null);
    setConfirmDelete(null);
    setSecondAdminId("");
  }, [confirmDelete, secondAdminId, deleteRow]);

  const openInviteAdmin = useCallback(() => {
    setInviteSheet({ type: "admin", email: "" });
  }, []);

  const openInviteMember = useCallback(() => {
    setInviteSheet({ type: "member", email: "" });
  }, []);

  const openAddGroup = useCallback(() => {
    setGroupSheet({ type: "group", name: "", age_from: "", age_to: "" });
  }, []);

  const saveInviteSheet = async () => {
    if (!inviteSheet) return;
    Keyboard.dismiss();
    setInviteBusy(true);
    try {
      const email = inviteSheet.email.trim().toLowerCase();
      if (!email) {
        Alert.alert("Email required", "Please enter an email address.");
        return;
      }
      const role = inviteSheet.type;
      const { error } = await invite(email, role);
      if (error) Alert.alert("Invite failed", error);
      else setInviteSheet(null);
    } finally {
      setInviteBusy(false);
    }
  };

  const saveGroupSheet = async () => {
    if (!groupSheet || groupSheet.type !== "group") return;
    Keyboard.dismiss();
    setInviteBusy(true);
    try {
      const ageFrom = groupSheet.age_from.trim() ? parseInt(groupSheet.age_from, 10) : null;
      const ageTo = groupSheet.age_to.trim() ? parseInt(groupSheet.age_to, 10) : null;
      if (ageFrom != null && (ageFrom < 1 || ageFrom > 130)) {
        Alert.alert("Invalid age", "Age from must be between 1 and 130.");
        return;
      }
      if (ageTo != null && (ageTo < 1 || ageTo > 130)) {
        Alert.alert("Invalid age", "Age to must be between 1 and 130.");
        return;
      }
      const result = await saveGroup({
        id: groupSheet.id,
        name: groupSheet.name,
        age_from: ageFrom,
        age_to: ageTo,
      });
      if (result.ok) setGroupSheet(null);
      else Alert.alert("Could not save group", result.error);
    } finally {
      setInviteBusy(false);
    }
  };

  const openPersonRowEdit = (row: OverviewRow) => {
    if (row.kind === "admin" && row.adminRef && row.adminRef.status !== "pending") {
      onMemberBlindChange({ type: "admin", id: row.adminRef.id });
      return;
    }
    if (row.kind === "member" && row.memberRef && row.memberRef.status !== "pending") {
      onMemberBlindChange({ type: "member", id: row.memberRef.id });
    }
  };

  const openAdminEdit = (id: string) => onMemberBlindChange({ type: "admin", id });
  const openMemberEdit = (id: string) => onMemberBlindChange({ type: "member", id });

  const requestMemberBlindDelete = useCallback(() => {
    if (!memberBlind) return;
    const table = memberBlind.type === "admin" ? "app_team_admins" : "entity_members";
    const person =
      memberBlind.type === "admin"
        ? admins.find((a) => a.id === memberBlind.id)
        : members.find((m) => m.id === memberBlind.id);
    const label = person
      ? `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim() ||
        person.email ||
        "this person"
      : "this person";
    onMemberBlindChange(null);
    requestDelete(
      table,
      memberBlind.id,
      label,
      memberBlind.type === "admin" ? memberBlind.id : undefined,
    );
  }, [memberBlind, admins, members, requestDelete, onMemberBlindChange]);

  useEffect(() => {
    memberBlindDeleteRef.current = requestMemberBlindDelete;
    return () => {
      memberBlindDeleteRef.current = null;
    };
  }, [memberBlindDeleteRef, requestMemberBlindDelete]);

  const searchPlaceholder =
    tab === "all"
      ? "Search people"
      : tab === "admins"
        ? "Search admins"
        : "Search members";

  const [topBarWidth, setTopBarWidth] = useState(windowWidth);
  const searchExpandedWidthRef = useRef(ORG_ACTION_BUTTON_SIZE);

  const resolvedTopBarWidth =
    topBarWidth > 0 ? topBarWidth : Math.max(0, windowWidth - TOP_BAR_H_PADDING * 2);

  const searchExpandedWidth = Math.max(
    ORG_ACTION_BUTTON_SIZE,
    resolvedTopBarWidth
      - ORG_TOP_BAR_EDGE_INSET * 2
      - ORG_ACTION_BUTTON_SIZE
      - TOP_BAR_ROW_GAP,
  );

  searchExpandedWidthRef.current = searchExpandedWidth;

  const activateSearch = useCallback(() => {
    setGroupPickerOpen(false);
    setLockedExpandedWidth(searchExpandedWidthRef.current);
    setSearchActive(true);
  }, []);

  useLayoutEffect(() => {
    if (!searchActive) return;
    searchModeAnim.stopAnimation((value) => {
      if (value !== 0) searchModeAnim.setValue(0);
      Animated.spring(searchModeAnim, {
        toValue: 1,
        ...SEARCH_OPEN_SPRING,
      }).start();
    });
  }, [searchActive, searchModeAnim]);

  const searchFieldExpandedWidth =
    searchActive && lockedExpandedWidth != null ? lockedExpandedWidth : searchExpandedWidth;

  const titleOpacity = useMemo(
    () =>
      searchModeAnim.interpolate({
        inputRange: [0, 0.35, 1],
        outputRange: [1, 0, 0],
        extrapolate: "clamp",
      }),
    [searchModeAnim],
  );
  const scrollPaddingTop = useMemo(
    () =>
      searchModeAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [
          HEADER_EXPANDED_HEIGHT + ROSTER_BELOW_TABS_GAP,
          SCROLL_PADDING_SEARCH_ACTIVE,
        ],
        extrapolate: "clamp",
      }),
    [searchModeAnim],
  );

  return (
    <View style={{ flex: 1, position: "relative" }}>
      {groupPickerOpen ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: GROUP_TITLE_BLOCK_HEIGHT + 8,
            paddingBottom: 32,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <GroupPickerList
            groups={groups}
            value={groupFilter}
            onSelect={(groupId) => {
              setGroupFilter(groupId);
              setGroupPickerOpen(false);
            }}
          />
        </ScrollView>
      ) : (
        <Animated.ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: scrollPaddingTop,
            paddingBottom: ROSTER_SCROLL_BOTTOM_PADDING,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {showRosterRows ? (
            tab === "all" ? (
              allTabRows.length === 0 ? (
                <EmptyMessage
                  text={
                    groups.length === 0
                      ? "No groups yet."
                      : searchQuery.trim()
                        ? "No matching people."
                        : groupFilter
                          ? "No people in this group."
                          : "No admins or members yet."
                  }
                />
              ) : (
                allTabRows.map((row, i) => (
                  <OverviewChildRow
                    key={row.id}
                    row={row}
                    shaded={i % 2 === 1}
                    onEdit={() => openPersonRowEdit(row)}
                  />
                ))
              )
            ) : tab === "admins" ? (
              filteredAdmins.length === 0 ? (
                <EmptyMessage
                  text={
                    admins.length === 0
                      ? "No admins yet."
                      : searchQuery.trim()
                        ? "No admins match your search."
                        : "No admins yet."
                  }
                />
              ) : (
                filteredAdmins.map((row, i) => (
                  <PersonRow
                    key={row.id}
                    label={rosterPersonLabel(row, "Administrator")}
                    sub={row.status === "pending" ? "Pending" : undefined}
                    shaded={i % 2 === 1}
                    iconColor={MEMBER_USER_ICON_COLOR}
                    onEdit={row.status === "pending" ? undefined : () => openAdminEdit(row.id)}
                  />
                ))
              )
            ) : filteredMembers.length === 0 ? (
              <EmptyMessage
                text={
                  members.length === 0
                    ? "No members yet."
                    : searchQuery.trim()
                      ? "No members match your search."
                      : "No members yet."
                }
              />
            ) : (
              filteredMembers.map((row, i) => (
                <PersonRow
                  key={row.id}
                  label={rosterDisplayLabel(row)}
                  sub={row.status === "pending" ? "Pending" : undefined}
                  shaded={i % 2 === 1}
                  iconColor={MEMBER_USER_ICON_COLOR}
                  onEdit={row.status === "pending" ? undefined : () => openMemberEdit(row.id)}
                />
              ))
            )
          ) : null}
        </Animated.ScrollView>
      )}

      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: groupPickerOpen || searchActive ? 100 : 10,
        }}
      >
        {groupPickerOpen ? (
          <View style={{ backgroundColor: C.bg }}>
            <GroupSelectorTitle
              label={selectedGroupLabel}
              showFolderIcon={groupFilter != null}
              open={groupPickerOpen}
              onPress={toggleGroupPicker}
            />
          </View>
        ) : (
          <View style={{ position: "relative", backgroundColor: C.bg }}>
            <View
              onLayout={(event) => {
                const width = event.nativeEvent.layout.width;
                if (width > 0 && width !== topBarWidth) setTopBarWidth(width);
              }}
              style={{
                height: GROUP_TITLE_BLOCK_HEIGHT,
                paddingHorizontal: TOP_BAR_H_PADDING,
                paddingTop: TOP_BAR_PAD_TOP,
                paddingBottom: TOP_BAR_PAD_BOTTOM,
                flexDirection: "row",
                alignItems: "center",
                position: "relative",
              }}
            >
              <Animated.View
                pointerEvents={searchActive ? "none" : "auto"}
                style={{
                  flex: 1,
                  minWidth: 0,
                  marginLeft: ORG_TOP_BAR_EDGE_INSET + ORG_ACTION_BUTTON_SIZE + TOP_BAR_ROW_GAP,
                  marginRight: ORG_TOP_BAR_EDGE_INSET + ORG_ACTION_BUTTON_SIZE,
                  opacity: titleOpacity,
                }}
              >
                <GroupSelectorTitle
                  label={selectedGroupLabel}
                  showFolderIcon={groupFilter != null}
                  open={groupPickerOpen}
                  onPress={toggleGroupPicker}
                  embedded
                />
              </Animated.View>

              <OrgPageHeaderActions
                topOffset={TOP_BAR_PAD_TOP + TOP_BAR_BUTTON_OFFSET}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onSearchActivate={activateSearch}
                searchActive={searchActive}
                searchModeAnim={searchModeAnim}
                searchPlaceholder={searchPlaceholder}
                searchBorderRadius={SEARCH_RADIUS}
                searchExpandedWidth={searchFieldExpandedWidth}
                onSearchCancel={exitSearch}
                onAddGroup={openAddGroup}
                onInviteAdmin={openInviteAdmin}
                onInviteMember={openInviteMember}
                menuAnchorTop={ORG_MENU_ANCHOR_TOP}
              />
            </View>

            <View style={{ position: "relative", overflow: "visible" }}>
              <LinearGradient
                colors={[
                  withAlpha(C.bg, 1),
                  withAlpha(C.bg, 0.96),
                  withAlpha(C.bg, 0.82),
                  withAlpha(C.bg, 0.58),
                ]}
                locations={[0, 0.28, 0.62, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <EntitySegmentTabs tabs={TABS} active={tab} onChange={setTab} />
            </View>
          </View>
        )}
      </View>

      <BottomSheet
        visible={inviteSheet !== null || groupSheet !== null}
        height={
          groupSheet?.type === "group"
            ? groupSheetHeight(insets.top)
            : compactSheetHeight(insets.bottom, false)
        }
        fixedHeight={groupSheet?.type === "group"}
        swipeToDismiss={groupSheet?.type === "group"}
        onClose={() => {
          Keyboard.dismiss();
          setInviteSheet(null);
          setGroupSheet(null);
        }}
      >
        {groupSheet?.type === "group" ? (
          <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <SheetFooter
              borderless
              compact
              onDelete={
                groupSheet.id
                  ? () => {
                      Keyboard.dismiss();
                      requestDelete("app_team_groups", groupSheet.id!, groupSheet.name);
                    }
                  : undefined
              }
              onCancel={
                groupSheet.id
                  ? () => {
                      Keyboard.dismiss();
                      setGroupSheet(null);
                    }
                  : undefined
              }
              onSave={() => void saveGroupSheet()}
              saveLabel={inviteBusy ? "Saving…" : "Save"}
            />
            <View style={{ flex: 1 }}>
              <SheetTextInput
                key={groupSheet.id ?? "new-group"}
                focusOnOpen={!groupSheet.id}
                value={groupSheet.name}
                onChangeText={(v) => setGroupSheet({ ...groupSheet, name: v })}
                placeholder="New group"
                placeholderTextColor={C.secondary}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                style={{
                  ...inputStyle(C),
                  textAlign: "center",
                  marginBottom: 12,
                }}
              />
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.secondary, fontSize: 12, marginBottom: 6 }}>Age from</Text>
                  <TextInput
                    value={groupSheet.age_from}
                    onChangeText={(v) => setGroupSheet({ ...groupSheet, age_from: v.replace(/\D/g, "") })}
                    keyboardType="number-pad"
                    placeholder="1–130"
                    placeholderTextColor={C.secondary}
                    onSubmitEditing={() => Keyboard.dismiss()}
                    style={inputStyle(C)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.secondary, fontSize: 12, marginBottom: 6 }}>Age to</Text>
                  <TextInput
                    value={groupSheet.age_to}
                    onChangeText={(v) => setGroupSheet({ ...groupSheet, age_to: v.replace(/\D/g, "") })}
                    keyboardType="number-pad"
                    placeholder="1–130"
                    placeholderTextColor={C.secondary}
                    onSubmitEditing={() => Keyboard.dismiss()}
                    style={inputStyle(C)}
                  />
                </View>
              </View>
            </View>
          </View>
        ) : inviteSheet ? (
          <SheetDismissArea>
            <SheetCompactBody>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <SheetTextInput
                  key={`invite-${inviteSheet.type}`}
                  focusOnOpen
                  value={inviteSheet.email}
                  onChangeText={(v) => setInviteSheet({ ...inviteSheet, email: v })}
                  placeholder={inviteSheet.type === "admin" ? "admin@team.com" : "member@team.com"}
                  placeholderTextColor={C.secondary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                  style={{ ...inputStyle(C), backgroundColor: C.inputBg, flex: 1 }}
                />
                <Pressable
                  onPress={() => void saveInviteSheet()}
                  disabled={inviteBusy}
                  style={({ pressed }) => ({
                    backgroundColor: C.accent,
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    opacity: pressed || inviteBusy ? 0.7 : 1,
                  })}
                >
                  <Text style={{ color: C.primaryBtnText, fontWeight: "600", fontSize: 15 }}>
                    Invite
                  </Text>
                </Pressable>
              </View>
            </SheetCompactBody>
          </SheetDismissArea>
        ) : null}
      </BottomSheet>

      <Modal visible={confirmDelete !== null} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View style={{ backgroundColor: C.sheet, borderRadius: 16, padding: 20 }}>
            <Text style={{ color: C.text, fontSize: 17, fontWeight: "600", marginBottom: 8 }}>
              Confirm deletion
            </Text>
            <Text style={{ color: C.secondary, fontSize: 15, marginBottom: 16 }}>
              Are you sure you want to delete "{confirmDelete?.label}"? Select a second admin to
              confirm.
            </Text>
            <ScrollView style={{ maxHeight: 160, marginBottom: 16 }}>
              {activeAdmins.map((a) => {
                const disabled = a.id === confirmDelete?.excludeAdminId;
                const selected = secondAdminId === a.id;
                return (
                  <Pressable
                    key={a.id}
                    disabled={disabled}
                    onPress={() => setSecondAdminId(a.id)}
                    style={{
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderRadius: 8,
                      backgroundColor: selected ? C.tabBg : "transparent",
                      opacity: disabled ? 0.35 : 1,
                      marginBottom: 4,
                    }}
                  >
                    <Text style={{ color: disabled ? C.secondary : C.text, fontSize: 15 }}>
                      {a.email?.trim() || "Administrator"}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 16 }}>
              <Pressable onPress={() => setConfirmDelete(null)}>
                <Text style={{ color: C.secondary, fontSize: 16 }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => void confirmSecondAdminDelete()} disabled={!secondAdminId}>
                <Text
                  style={{
                    color: secondAdminId ? C.danger : C.secondary,
                    fontSize: 16,
                    fontWeight: "600",
                  }}
                >
                  Delete
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function GroupSelectorTitle({
  label,
  showFolderIcon,
  open,
  onPress,
  leadingClearance = 0,
  trailingClearance = 0,
  embedded = false,
}: {
  label: string;
  showFolderIcon: boolean;
  open: boolean;
  onPress: () => void;
  leadingClearance?: number;
  trailingClearance?: number;
  /** When true, omits outer padding for use inside the top-bar flex row. */
  embedded?: boolean;
}) {
  const { C } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [laneWidth, setLaneWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);

  const chevronSlot = 24;
  const folderSlot = showFolderIcon ? 26 : 0;
  const horizontalPad = embedded ? 0 : 12;
  const labelMaxWidth = Math.max(
    80,
    windowWidth - horizontalPad * 2 - folderSlot - chevronSlot - trailingClearance - leadingClearance,
  );
  const centerInset =
    laneWidth > 0 && contentWidth > 0 ? Math.max(0, (laneWidth - contentWidth) / 2) : 0;

  return (
    <View
      pointerEvents="box-none"
      style={
        embedded
          ? { width: "100%" }
          : {
              width: "100%",
              paddingLeft: horizontalPad + leadingClearance,
              paddingRight: horizontalPad + trailingClearance,
              paddingTop: 14,
              paddingBottom: 10,
            }
      }
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Selected group: ${label}. Tap to change.`}
        onLayout={(event) => setLaneWidth(event.nativeEvent.layout.width)}
        style={({ pressed }) => ({
          width: "100%",
          height: GROUP_SELECTOR_TAB_HEIGHT,
          borderRadius: SEARCH_RADIUS,
          borderWidth: 1,
          borderColor: "transparent",
          backgroundColor: "transparent",
          justifyContent: "center",
          opacity: pressed ? 0.72 : 1,
        })}
      >
        <View
          onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginLeft: centerInset,
            alignSelf: "flex-start",
          }}
        >
          {showFolderIcon ? (
            <View style={{ marginRight: 8, flexShrink: 0 }}>
              <PeriwinkleFolderIcon size={18} />
            </View>
          ) : null}
          <Text
            style={{
              color: C.text,
              fontSize: 19,
              fontWeight: "700",
              maxWidth: labelMaxWidth,
            }}
            numberOfLines={1}
          >
            {label}
          </Text>
          <View
            style={{
              marginLeft: 4,
              width: 20,
              height: 20,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transform: [{ rotate: open ? "90deg" : "0deg" }],
            }}
          >
            <ChevronRight size={20} color={C.secondary} strokeWidth={2.5} />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

function GroupPickerList({
  groups,
  value,
  onSelect,
}: {
  groups: TeamGroup[];
  value: string | null;
  onSelect: (groupId: string | null) => void;
}) {
  const { C } = useTheme();

  const options = useMemo(
    () => [
      { id: null as string | null, label: "All" },
      ...groups.map((group) => ({ id: group.id, label: group.name })),
    ],
    [groups],
  );

  if (options.length === 1) {
    return (
      <EmptyMessage text="No groups yet." />
    );
  }

  return (
    <View style={{ paddingHorizontal: 12 }}>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id ?? "all"}
            onPress={() => onSelect(option.id)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.82 : 1,
            })}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 14,
                marginBottom: 4,
                borderRadius: ROW_RADIUS,
                backgroundColor: C.bg,
              }}
            >
              {option.id ? (
                <View style={{ marginRight: 10 }}>
                  <PeriwinkleFolderIcon size={16} />
                </View>
              ) : (
                <View style={{ width: 26 }} />
              )}
              <Text
                style={{
                  flex: 1,
                  color: C.text,
                  fontSize: 16,
                  fontWeight: "400",
                }}
                numberOfLines={1}
              >
                {option.label}
              </Text>
              {selected ? <Check size={20} color={C.accent} strokeWidth={2.5} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function rosterRowBorder(mode: "light" | "dark") {
  return mode === "light" ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.1)";
}

function rosterRowFill(mode: "light" | "dark", shaded: boolean, C: ReturnType<typeof useTheme>["C"]) {
  if (shaded) {
    return mode === "light" ? "#F5F5F7" : C.tabBg;
  }
  return C.card;
}

function RosterCard({
  shaded,
  indent = 0,
  onPress,
  children,
}: {
  shaded: boolean;
  indent?: number;
  onPress?: () => void;
  children: ReactNode;
}) {
  const { C, mode } = useTheme();
  const fill = rosterRowFill(mode, shaded, C);

  const shellStyle = {
    marginHorizontal: 12,
    marginBottom: 3,
    borderRadius: ROW_RADIUS,
    overflow: "hidden" as const,
    backgroundColor: fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: rosterRowBorder(mode),
  };

  const bodyStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: ROW_PAD_H,
    paddingVertical: ROW_PAD_V,
    paddingLeft: ROW_PAD_H + indent,
    minHeight: 36,
  };

  const content = <View style={[shellStyle, bodyStyle]}>{children}</View>;

  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }
  return content;
}

function RowPendingLabel() {
  const { C } = useTheme();
  return (
    <Text style={{ color: C.secondary, fontSize: ROW_SUB_SIZE, fontWeight: "500" }} numberOfLines={1}>
      Pending
    </Text>
  );
}

function OverviewChildRow({
  row,
  shaded,
  onEdit,
}: {
  row: OverviewRow;
  shaded: boolean;
  onEdit: () => void;
}) {
  const { C } = useTheme();
  const iconColor = MEMBER_USER_ICON_COLOR;
  const pending = row.status === "pending";

  return (
    <RosterCard shaded={shaded}>
      <View style={{ marginRight: 8 }}>
        <OverviewUserIcon color={iconColor} size={ROW_ICON_SIZE} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: C.text, fontSize: ROW_LABEL_SIZE, fontWeight: "400" }} numberOfLines={1}>
          {row.label}
        </Text>
      </View>
      {pending ? (
        <RowPendingLabel />
      ) : (
        <Pressable onPress={onEdit} hitSlop={8} style={{ padding: 4 }}>
          <Pencil size={16} color={C.secondary} />
        </Pressable>
      )}
    </RosterCard>
  );
}

function PersonRow({
  label,
  sub,
  shaded,
  iconColor,
  onEdit,
}: {
  label: string;
  sub?: string;
  shaded: boolean;
  iconColor: string;
  onEdit?: () => void;
}) {
  const { C } = useTheme();

  return (
    <RosterCard shaded={shaded}>
      <View style={{ marginRight: 8 }}>
        <OverviewUserIcon color={iconColor} size={ROW_ICON_SIZE} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: C.text, fontSize: ROW_LABEL_SIZE, fontWeight: "400" }} numberOfLines={1}>
          {label}
        </Text>
      </View>
      {sub === "Pending" ? (
        <RowPendingLabel />
      ) : onEdit ? (
        <Pressable onPress={onEdit} hitSlop={8} style={{ padding: 4 }}>
          <Pencil size={16} color={C.secondary} />
        </Pressable>
      ) : null}
    </RosterCard>
  );
}

function EmptyMessage({ text }: { text: string }) {
  const { C } = useTheme();
  return (
    <Text
      style={{
        color: C.secondary,
        fontSize: 14,
        textAlign: "center",
        paddingHorizontal: 24,
        paddingTop: 24,
      }}
    >
      {text}
    </Text>
  );
}

function inputStyle(C: ReturnType<typeof useTheme>["C"]) {
  return {
    backgroundColor: C.inputBg,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: C.text,
    fontSize: 16,
  };
}
