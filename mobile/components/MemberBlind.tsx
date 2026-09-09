import {
  Alert,
  Animated,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Check, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { EntitySegmentTabs } from "@/components/EntitySegmentTabs";
import { NativeSheetIconFooter } from "@/components/NativeSheetIconFooter";
import { RosterSearchField } from "@/components/RosterSearchField";
import { PeriwinkleFolderIcon } from "@/components/entity/EntityRosterIcons";
import { createSheetDismissPanResponder } from "@/lib/sheetDismissSwipe";
import {
  type SaveRosterPersonInput,
  type TeamAdmin,
  type TeamGroup,
  type TeamGroupLink,
  type TeamInviteMember,
  type TeamRoster,
} from "@/hooks/useTeams";

type MemberBlindTab = "about" | "contact" | "groups";
type MemberBlindKind = "admin" | "member";

const MEMBER_BLIND_TABS: Array<{ key: MemberBlindTab; label: string }> = [
  { key: "about", label: "About" },
  { key: "contact", label: "Contact" },
  { key: "groups", label: "Groups" },
];

const SEX_OPTIONS = ["Female", "Male", "Other"] as const;

const FIELD_HEIGHT = 52;
const TAB_CONTENT_GAP = 12;
const SECTION_GAP = 16;
const GROUPS_SEARCH_RADIUS = 24;
const GROUP_ROW_RADIUS = 16;
const GROUP_ROW_MIN_HEIGHT = 50;
const GROUP_ROW_GAP = 6;

function fieldStyle(C: ReturnType<typeof useTheme>["C"]) {
  return {
    backgroundColor: C.inputBg,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    height: FIELD_HEIGHT,
    color: C.text,
    fontSize: 16,
  } as const;
}

function personToForm(
  person: TeamAdmin | TeamInviteMember,
  groups: TeamGroup[],
): Omit<SaveRosterPersonInput, "id"> & { groups: TeamGroupLink[] } {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const mappedGroups =
    person.groups.length > 0
      ? person.groups.map((link) => {
          const g = groupById.get(link.groupId);
          return {
            id: link.id,
            groupId: link.groupId,
            name: g?.name ?? link.name,
            ageFrom: g?.age_from != null ? String(g.age_from) : link.ageFrom,
            ageTo: g?.age_to != null ? String(g.age_to) : link.ageTo,
          };
        })
      : [];
  return {
    first_name: person.first_name ?? "",
    last_name: person.last_name ?? "",
    sex: person.sex ?? "",
    date_of_birth: person.date_of_birth ?? "",
    email: person.email ?? "",
    phone: person.phone ?? "",
    status: person.status,
    payment_status:
      "payment_status" in person ? (person.payment_status ?? "") : undefined,
    groups: mappedGroups,
  };
}

function formsEqual(a: SaveRosterPersonInput, b: SaveRosterPersonInput): boolean {
  if (
    a.first_name !== b.first_name ||
    a.last_name !== b.last_name ||
    a.sex !== b.sex ||
    a.date_of_birth !== b.date_of_birth ||
    a.email !== b.email ||
    a.phone !== b.phone
  ) {
    return false;
  }
  const aGroups = a.groups.filter((g) => g.groupId).map((g) => g.groupId).sort();
  const bGroups = b.groups.filter((g) => g.groupId).map((g) => g.groupId).sort();
  return aGroups.length === bGroups.length && aGroups.every((id, i) => id === bGroups[i]);
}

export function MemberBlind({
  visible,
  kind,
  personId,
  roster,
  onClose,
  onDelete,
  bottomInset,
  maxHeight,
}: {
  visible: boolean;
  kind: MemberBlindKind;
  personId: string;
  roster: TeamRoster;
  onClose: () => void;
  onDelete: () => void;
  bottomInset: number;
  maxHeight: number;
}) {
  const { C, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const sheetHeight = maxHeight || screenH - insets.top;

  const sheetAnim = useRef(new Animated.Value(sheetHeight + 20)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const maxHeightRef = useRef(sheetHeight);
  maxHeightRef.current = sheetHeight;

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const panResponder = useRef(
    createSheetDismissPanResponder({
      slideAnim: sheetAnim,
      backdropAnim,
      getHeight: () => maxHeightRef.current,
      dismissOffset: 20,
      onDismiss: () => onCloseRef.current(),
    }),
  ).current;

  const person = useMemo(() => {
    if (kind === "admin") return roster.admins.find((a) => a.id === personId) ?? null;
    return roster.members.find((m) => m.id === personId) ?? null;
  }, [kind, personId, roster.admins, roster.members]);

  const [tab, setTab] = useState<MemberBlindTab>("about");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [sex, setSex] = useState("");
  const [born, setBorn] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [groupRows, setGroupRows] = useState<TeamGroupLink[]>([]);
  const [pendingAddGroupIds, setPendingAddGroupIds] = useState<Set<string>>(() => new Set());
  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const [removeGroupConfirm, setRemoveGroupConfirm] = useState<{
    rowId: string;
    groupId: string;
    groupName: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const formDirtyRef = useRef(false);
  const lastSavedRef = useRef<SaveRosterPersonInput | null>(null);

  const applyPerson = useCallback(
    (source: TeamAdmin | TeamInviteMember) => {
      const form = personToForm(source, roster.groups);
      setFirstName(form.first_name);
      setLastName(form.last_name);
      setSex(form.sex);
      setBorn(form.date_of_birth);
      setEmail(form.email);
      setPhone(form.phone);
      setGroupRows(form.groups);
      lastSavedRef.current = {
        id: source.id,
        ...form,
        first_name: form.first_name,
        last_name: form.last_name,
      };
    },
    [roster.groups],
  );

  useEffect(() => {
    if (!visible || !person) return;
    setTab("about");
    setGroupSearchQuery("");
    setPendingAddGroupIds(new Set());
    setRemoveGroupConfirm(null);
    formDirtyRef.current = false;
    applyPerson(person);
  }, [visible, person?.id, applyPerson, person]);

  useEffect(() => {
    if (!visible || !person || formDirtyRef.current) return;
    applyPerson(person);
  }, [visible, person, applyPerson]);

  useEffect(() => {
    if (!visible) return;
    sheetAnim.setValue(sheetHeight + 20);
    backdropAnim.setValue(0);
    Animated.parallel([
      Animated.spring(sheetAnim, { toValue: 0, damping: 28, stiffness: 280, useNativeDriver: false }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [visible, sheetHeight, sheetAnim, backdropAnim]);

  const dismiss = useCallback(() => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(sheetAnim, { toValue: sheetHeight + 20, duration: 220, useNativeDriver: false }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onCloseRef.current());
  }, [sheetAnim, backdropAnim, sheetHeight]);

  const markDirty = useCallback(() => {
    formDirtyRef.current = true;
  }, []);

  const buildSaveInput = useCallback((): SaveRosterPersonInput | null => {
    if (!person) return null;
    return {
      id: person.id,
      first_name: firstName,
      last_name: lastName,
      sex,
      date_of_birth: born,
      email,
      phone,
      status: person.status,
      payment_status:
        kind === "member" && "payment_status" in person
          ? (person.payment_status ?? "")
          : undefined,
      groups: groupRows.filter((g) => g.groupId),
    };
  }, [person, firstName, lastName, sex, born, email, phone, kind, groupRows]);

  const handleSave = useCallback(async () => {
    const input = buildSaveInput();
    if (!input) return;
    if (lastSavedRef.current && formsEqual(lastSavedRef.current, input)) {
      dismiss();
      return;
    }
    setSaving(true);
    try {
      const result =
        kind === "admin"
          ? await roster.saveAdministrator(input)
          : await roster.saveMember(input);
      if (!result.ok) {
        Alert.alert("Could not save", result.error);
        return;
      }
      formDirtyRef.current = false;
      lastSavedRef.current = input;
      dismiss();
    } finally {
      setSaving(false);
    }
  }, [buildSaveInput, kind, roster, dismiss]);

  const assignedGroupIds = useMemo(
    () => new Set(groupRows.map((g) => g.groupId).filter(Boolean) as string[]),
    [groupRows],
  );

  const personFullName = useMemo(() => {
    const name = `${firstName} ${lastName}`.trim();
    return name || email.trim() || "this person";
  }, [firstName, lastName, email]);

  const groupSearchNorm = groupSearchQuery.trim().toLowerCase();

  const matchesGroupSearch = useCallback(
    (name: string) => !groupSearchNorm || name.toLowerCase().includes(groupSearchNorm),
    [groupSearchNorm],
  );

  const topGroupRows = useMemo(
    () =>
      groupRows.filter(
        (row) => row.groupId && !pendingAddGroupIds.has(row.groupId) && matchesGroupSearch(row.name),
      ),
    [groupRows, pendingAddGroupIds, matchesGroupSearch],
  );

  const bottomGroups = useMemo(() => {
    const topIds = new Set(
      groupRows
        .filter((row) => row.groupId && !pendingAddGroupIds.has(row.groupId))
        .map((row) => row.groupId as string),
    );
    return roster.groups.filter(
      (group) => !topIds.has(group.id) && matchesGroupSearch(group.name),
    );
  }, [groupRows, pendingAddGroupIds, roster.groups, matchesGroupSearch]);

  const addGroupAssignment = useCallback(
    (group: TeamGroup) => {
      if (assignedGroupIds.has(group.id)) return;
      markDirty();
      setPendingAddGroupIds((prev) => new Set(prev).add(group.id));
      setGroupRows((rows) => [
        ...rows,
        {
          id: `new-${group.id}-${Date.now()}`,
          groupId: group.id,
          name: group.name,
          ageFrom: group.age_from != null ? String(group.age_from) : "",
          ageTo: group.age_to != null ? String(group.age_to) : "",
        },
      ]);
    },
    [assignedGroupIds, markDirty],
  );

  const undoPendingGroupAdd = useCallback(
    (groupId: string) => {
      markDirty();
      setPendingAddGroupIds((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
      setGroupRows((rows) => rows.filter((row) => row.groupId !== groupId));
    },
    [markDirty],
  );

  const confirmRemoveGroup = useCallback(
    (row: TeamGroupLink) => {
      if (!row.groupId) return;
      setRemoveGroupConfirm({
        rowId: row.id,
        groupId: row.groupId,
        groupName: row.name,
      });
    },
    [],
  );

  const executeRemoveGroup = useCallback(() => {
    if (!removeGroupConfirm) return;
    markDirty();
    setPendingAddGroupIds((prev) => {
      const next = new Set(prev);
      next.delete(removeGroupConfirm.groupId);
      return next;
    });
    setGroupRows((rows) => rows.filter((row) => row.id !== removeGroupConfirm.rowId));
    setRemoveGroupConfirm(null);
  }, [markDirty, removeGroupConfirm]);

  const searchPillFill = mode === "light" ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.18)";
  const searchPillBorder = mode === "light" ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.08)";

  const labelStyle = {
    color: C.secondary,
    fontSize: 13,
    fontWeight: "500" as const,
    marginBottom: 6,
  };

  const renderGroupRow = (
    group: TeamGroup,
    opts: {
      assigned: boolean;
      pendingAdd: boolean;
      rowId?: string;
    },
  ) => {
    const toned = !opts.assigned && !opts.pendingAdd;
    return (
      <View
        key={group.id}
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: GROUP_ROW_MIN_HEIGHT,
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderRadius: GROUP_ROW_RADIUS,
          backgroundColor: searchPillFill,
          borderWidth: 1,
          borderColor: searchPillBorder,
          opacity: toned ? 0.52 : 1,
          marginBottom: GROUP_ROW_GAP,
        }}
      >
        <View style={{ marginRight: 10 }}>
          <PeriwinkleFolderIcon size={18} />
        </View>
        <Text
          style={{
            flex: 1,
            color: C.text,
            fontSize: 16,
            fontWeight: "400",
          }}
          numberOfLines={1}
        >
          {group.name}
        </Text>
        {opts.assigned ? (
          <Pressable
            onPress={() => {
              const row = groupRows.find((r) => r.id === opts.rowId);
              if (row) confirmRemoveGroup(row);
            }}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <X size={18} color={C.danger} strokeWidth={2.25} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() =>
              opts.pendingAdd ? undoPendingGroupAdd(group.id) : addGroupAssignment(group)
            }
            hitSlop={8}
            style={({ pressed }) => ({
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Check
              size={20}
              color={opts.pendingAdd ? C.accent : C.secondary}
              strokeWidth={2.5}
            />
          </Pressable>
        )}
      </View>
    );
  };

  if (!visible || !person) return null;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 300,
        elevation: 300,
      }}
      pointerEvents="box-none"
    >
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.55)",
          opacity: backdropAnim,
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={dismiss} />
      </Animated.View>

      <Animated.View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: sheetHeight,
          backgroundColor: C.sheet,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingBottom: bottomInset,
          transform: [{ translateY: sheetAnim }],
          flexDirection: "column",
        }}
      >
        <View {...panResponder.panHandlers}>
          <View
            style={{
              alignSelf: "center",
              width: 38,
              height: 4,
              borderRadius: 2,
              backgroundColor: C.separator,
              marginTop: 12,
              marginBottom: 16,
            }}
          />
        </View>

        <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss}>
          <View style={{ paddingHorizontal: 20 }}>
            <NativeSheetIconFooter
              borderless
              compact
              onDelete={!saving ? onDelete : undefined}
              onCancel={!saving ? dismiss : undefined}
              onSave={() => void handleSave()}
              saveDisabled={saving}
            />
          </View>

          <EntitySegmentTabs tabs={MEMBER_BLIND_TABS} active={tab} onChange={setTab} />

          {tab === "about" && (
            <ScrollView
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingTop: TAB_CONTENT_GAP, paddingHorizontal: 20, paddingBottom: 24 }}
            >
              <Text style={labelStyle}>First name</Text>
              <TextInput
                value={firstName}
                onChangeText={(v) => {
                  markDirty();
                  setFirstName(v);
                }}
                placeholder="First name"
                placeholderTextColor={C.secondary}
                style={{ ...fieldStyle(C), marginBottom: SECTION_GAP }}
              />

              <Text style={labelStyle}>Last name</Text>
              <TextInput
                value={lastName}
                onChangeText={(v) => {
                  markDirty();
                  setLastName(v);
                }}
                placeholder="Last name"
                placeholderTextColor={C.secondary}
                style={{ ...fieldStyle(C), marginBottom: SECTION_GAP }}
              />

              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={labelStyle}>Sex</Text>
                  <Pressable
                    onPress={() => {
                      Alert.alert("Sex", undefined, [
                        ...SEX_OPTIONS.map((option) => ({
                          text: option,
                          onPress: () => {
                            markDirty();
                            setSex(option);
                          },
                        })),
                        { text: "Clear", style: "destructive", onPress: () => {
                          markDirty();
                          setSex("");
                        }},
                        { text: "Cancel", style: "cancel" },
                      ]);
                    }}
                    style={{
                      ...fieldStyle(C),
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: sex ? C.text : C.secondary, fontSize: 16 }}>
                      {sex || "Select…"}
                    </Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={labelStyle}>Date of birth</Text>
                  <TextInput
                    value={born}
                    onChangeText={(v) => {
                      markDirty();
                      setBorn(v);
                    }}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={C.secondary}
                    autoCapitalize="none"
                    style={fieldStyle(C)}
                  />
                </View>
              </View>
            </ScrollView>
          )}

          {tab === "contact" && (
            <ScrollView
              style={{ flex: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingTop: TAB_CONTENT_GAP, paddingHorizontal: 20, paddingBottom: 24 }}
            >
              <Text style={labelStyle}>Email</Text>
              <TextInput
                value={email}
                onChangeText={(v) => {
                  markDirty();
                  setEmail(v);
                }}
                placeholder="email@example.com"
                placeholderTextColor={C.secondary}
                autoCapitalize="none"
                keyboardType="email-address"
                style={{ ...fieldStyle(C), marginBottom: SECTION_GAP }}
              />

              <Text style={labelStyle}>Phone</Text>
              <TextInput
                value={phone}
                onChangeText={(v) => {
                  markDirty();
                  setPhone(v);
                }}
                placeholder="Phone number"
                placeholderTextColor={C.secondary}
                keyboardType="phone-pad"
                style={fieldStyle(C)}
              />
            </ScrollView>
          )}

          {tab === "groups" && (
            <View style={{ flex: 1 }}>
              <View style={{ paddingHorizontal: 20, paddingTop: TAB_CONTENT_GAP, paddingBottom: 10 }}>
                <RosterSearchField
                  value={groupSearchQuery}
                  onChange={setGroupSearchQuery}
                  placeholder="Search groups"
                  compact
                  variant="vipps"
                  borderRadius={GROUPS_SEARCH_RADIUS}
                />
              </View>
              <ScrollView
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 20,
                  paddingBottom: 24,
                }}
              >
                {topGroupRows.map((row) => {
                  const group = roster.groups.find((g) => g.id === row.groupId);
                  if (!group) return null;
                  return renderGroupRow(group, {
                    assigned: true,
                    pendingAdd: false,
                    rowId: row.id,
                  });
                })}
                {bottomGroups.map((group) =>
                  renderGroupRow(group, {
                    assigned: false,
                    pendingAdd: pendingAddGroupIds.has(group.id),
                  }),
                )}
                {topGroupRows.length === 0 && bottomGroups.length === 0 ? (
                  <Text
                    style={{
                      color: C.secondary,
                      fontSize: 14,
                      textAlign: "center",
                      paddingTop: 24,
                    }}
                  >
                    {groupSearchNorm ? "No groups match your search." : "No groups yet."}
                  </Text>
                ) : null}
              </ScrollView>
            </View>
          )}
        </Pressable>
      </Animated.View>

      <Modal
        visible={removeGroupConfirm != null}
        transparent
        animationType="fade"
        onRequestClose={() => setRemoveGroupConfirm(null)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 24,
          }}
          onPress={() => setRemoveGroupConfirm(null)}
        >
          <Pressable
            style={{
              backgroundColor: C.sheet,
              borderRadius: 16,
              padding: 20,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={{ color: C.text, fontSize: 17, fontWeight: "600", marginBottom: 8 }}>
              Remove from group
            </Text>
            <Text style={{ color: C.secondary, fontSize: 15, marginBottom: 20, lineHeight: 21 }}>
              Remove "{personFullName}" from "{removeGroupConfirm?.groupName}"?
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 16 }}>
              <Pressable onPress={() => setRemoveGroupConfirm(null)} hitSlop={8}>
                <Text style={{ color: C.secondary, fontSize: 16 }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={executeRemoveGroup} hitSlop={8}>
                <Text style={{ color: C.danger, fontSize: 16, fontWeight: "600" }}>Remove</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
