import {
  Alert,
  Animated,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronDown, EyeOff, Pencil } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlassChrome } from "@/components/GlassChrome";
import type { UserCategory } from "@/hooks/useUserCategories";
import { useTheme } from "@/lib/theme";
import { focusSheetInput, SheetTextInput } from "@/components/SheetTextInput";
import { SWATCHES } from "@/components/ActivityMenu";
import { createSheetDismissPanResponder } from "@/lib/sheetDismissSwipe";

const NEW_ACTIVITY_NAME = "New activity";
const GROUP_SELECTOR_RADIUS = 20;
const GROUP_SELECTOR_ROW_H = 52;
const GROUP_SELECTOR_MAX_ROWS = 5;

type TeamGroup = { id: string; name: string };

type EditState = {
  cat: UserCategory;
  name: string;
  color: string;
  isNew: boolean;
} | null;

type Props = {
  visible: boolean;
  onClose: () => void;
  maxHeight: number;
  categories: UserCategory[];
  onCreate: (name: string, color: string, groupId?: string | null) => Promise<UserCategory | null>;
  onUpdate: (id: string, patch: Partial<Pick<UserCategory, "name" | "color" | "hidden">>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  teamName?: string;
  groups?: TeamGroup[];
};

function ActivitiesGroupSelector({
  options,
  value,
  open,
  onOpenChange,
  onChange,
}: {
  options: Array<{ id: string | null; label: string }>;
  value: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (id: string | null) => void;
}) {
  const { C } = useTheme();
  const selectedLabel = options.find((o) => o.id === value)?.label ?? options[0]?.label ?? "";
  const listHeight = GROUP_SELECTOR_ROW_H * Math.min(options.length, GROUP_SELECTOR_MAX_ROWS);

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 12, zIndex: open ? 30 : 0 }}>
      <View
        style={{
          borderWidth: 1,
          borderColor: C.separator,
          borderRadius: GROUP_SELECTOR_RADIUS,
          backgroundColor: C.card,
          overflow: "hidden",
        }}
      >
        <Pressable
          onPress={() => onOpenChange(!open)}
          style={{
            height: GROUP_SELECTOR_ROW_H,
            paddingHorizontal: 16,
            justifyContent: "center",
            borderBottomWidth: open ? StyleSheet.hairlineWidth : 0,
            borderBottomColor: C.separator,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ flex: 1, color: C.text, fontSize: 16, fontWeight: "500" }} numberOfLines={1}>
              {selectedLabel}
            </Text>
            <View style={open ? { transform: [{ rotate: "180deg" }] } : undefined}>
              <ChevronDown size={20} color={C.secondary} />
            </View>
          </View>
        </Pressable>
        {open ? (
          <ScrollView
            style={{ maxHeight: listHeight }}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={options.length > GROUP_SELECTOR_MAX_ROWS}
          >
            {options.map((option, index) => {
              const selected = option.id === value;
              return (
                <Pressable
                  key={option.id ?? "entity"}
                  onPress={() => {
                    onChange(option.id);
                    onOpenChange(false);
                  }}
                  style={{
                    height: GROUP_SELECTOR_ROW_H,
                    paddingHorizontal: 16,
                    justifyContent: "center",
                    borderBottomWidth: index < options.length - 1 ? StyleSheet.hairlineWidth : 0,
                    borderBottomColor: C.separator,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text
                      style={{
                        flex: 1,
                        color: C.text,
                        fontSize: 16,
                        fontWeight: selected ? "600" : "400",
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
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}

function ActivityRow({
  cat,
  onEdit,
  onToggleHidden,
}: {
  cat: UserCategory;
  onEdit: () => void;
  onToggleHidden: () => void;
}) {
  const { C, mode } = useTheme();
  const tabBg = mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: 52,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.tabBorder,
        backgroundColor: tabBg,
        marginBottom: 6,
        overflow: "hidden",
      }}
    >
      <Pressable onPress={onToggleHidden} style={{ flex: 1, flexDirection: "row", alignItems: "center", paddingLeft: 14 }}>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            backgroundColor: cat.color,
            opacity: cat.hidden ? 0.3 : 1,
            marginRight: 12,
          }}
        />
        <Text
          style={{
            flex: 1,
            fontSize: 16,
            fontWeight: "500",
            color: cat.hidden ? C.secondary : C.text,
          }}
          numberOfLines={1}
        >
          {cat.name}
        </Text>
        {cat.hidden ? <EyeOff size={15} color={C.secondary} style={{ marginRight: 8, opacity: 0.55 }} /> : null}
      </Pressable>
      <Pressable onPress={onEdit} hitSlop={8} style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
        <Pencil size={17} color={C.secondary} />
      </Pressable>
    </View>
  );
}

function ActivityEditKeyboardModal({
  editState,
  visible,
  onClose,
  onSave,
  onDelete,
}: {
  editState: NonNullable<EditState>;
  visible: boolean;
  onClose: () => void;
  onSave: (name: string, color: string) => void;
  onDelete?: () => void;
}) {
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(editState.name);
  const [color, setColor] = useState(editState.color);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const titleInputRef = useRef<TextInput>(null);

  useEffect(() => {
    setName(editState.name);
    setColor(editState.color);
  }, [editState.cat.id, editState.name, editState.color]);

  useEffect(() => {
    if (!visible) return;
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => focusSheetInput(titleInputRef), 80);
    return () => clearTimeout(t);
  }, [visible, editState.cat.id]);

  const bottomPad = Math.max(insets.bottom, 12);
  const keyboardPad = keyboardHeight > 0 ? keyboardHeight - bottomPad + 8 : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={onClose} />
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: keyboardPad,
            paddingHorizontal: 12,
            paddingBottom: bottomPad,
          }}
        >
          <View
            style={{
              backgroundColor: C.sheet,
              borderRadius: 16,
              paddingHorizontal: 14,
              paddingTop: 12,
              paddingBottom: 14,
              borderWidth: 1,
              borderColor: C.separator,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              {!editState.isNew && onDelete ? (
                <Pressable onPress={onDelete} hitSlop={8}>
                  <Text style={{ color: C.danger, fontSize: 16, fontWeight: "500" }}>Delete</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 20 }}>
                <Pressable onPress={onClose} hitSlop={8}>
                  <Text style={{ color: C.secondary, fontSize: 16, fontWeight: "500" }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    onSave(name.trim() || (editState.isNew ? NEW_ACTIVITY_NAME : editState.cat.name), color)
                  }
                  hitSlop={8}
                >
                  <Text style={{ color: C.accent, fontSize: 16, fontWeight: "700" }}>Save</Text>
                </Pressable>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  backgroundColor: color,
                }}
              />
              <SheetTextInput
                ref={titleInputRef}
                value={name}
                onChangeText={setName}
                placeholder={editState.isNew ? NEW_ACTIVITY_NAME : undefined}
                placeholderTextColor={C.secondary}
                selectTextOnFocus={!editState.isNew}
                autoCorrect={false}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                style={{
                  flex: 1,
                  backgroundColor: C.inputBg,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: C.text,
                  fontSize: 16,
                }}
              />
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
              {SWATCHES.map((hex) => (
                <Pressable key={hex} onPress={() => setColor(hex)}>
                  {({ pressed }) => (
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: hex,
                        opacity: pressed ? 0.7 : 1,
                        borderWidth: color === hex ? 2.5 : 0,
                        borderColor: "#FFFFFF",
                      }}
                    />
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function ActivitiesBlind({
  visible,
  onClose,
  maxHeight,
  categories,
  onCreate,
  onUpdate,
  onRemove,
  teamName,
  groups,
}: Props) {
  const insets = useSafeAreaInsets();
  const { C } = useTheme();
  const isTeamMode = !!teamName;
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [editState, setEditState] = useState<EditState>(null);
  const [editVisible, setEditVisible] = useState(false);

  const maxHeightRef = useRef(maxHeight);
  maxHeightRef.current = maxHeight;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const sheetAnim = useRef(new Animated.Value(maxHeight + 20)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    createSheetDismissPanResponder({
      slideAnim: sheetAnim,
      backdropAnim,
      getHeight: () => maxHeightRef.current,
      dismissOffset: 20,
      onDismiss: () => onCloseRef.current(),
    }),
  ).current;

  const groupOptions = useMemo(() => {
    if (!isTeamMode) return [{ id: null as string | null, label: "Me" }];
    return [
      { id: null as string | null, label: teamName ?? "Entity" },
      ...(groups ?? []).map((g) => ({ id: g.id, label: g.name })),
    ];
  }, [isTeamMode, teamName, groups]);

  const scopedCategories = useMemo(() => {
    if (!isTeamMode) return categories;
    return categories.filter((c) => (c.app_group_id ?? null) === selectedGroupId);
  }, [categories, isTeamMode, selectedGroupId]);

  useEffect(() => {
    if (!visible) {
      setGroupMenuOpen(false);
      setEditVisible(false);
      setEditState(null);
      sheetAnim.setValue(maxHeight + 20);
      backdropAnim.setValue(0);
      return;
    }
    setGroupMenuOpen(false);
    sheetAnim.setValue(maxHeight + 20);
    backdropAnim.setValue(0);
    Animated.parallel([
      Animated.spring(sheetAnim, { toValue: 0, damping: 28, stiffness: 280, useNativeDriver: false }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [visible, maxHeight, sheetAnim, backdropAnim]);

  const dismiss = useCallback(() => {
    Keyboard.dismiss();
    setEditVisible(false);
    setEditState(null);
    Animated.parallel([
      Animated.timing(sheetAnim, { toValue: maxHeight + 20, duration: 220, useNativeDriver: false }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onCloseRef.current();
    });
  }, [maxHeight, sheetAnim, backdropAnim]);

  const openEdit = useCallback((state: NonNullable<EditState>) => {
    setEditState({ ...state, name: state.isNew ? "" : state.name });
    setEditVisible(true);
  }, []);

  const handleAdd = useCallback(async () => {
    Keyboard.dismiss();
    setGroupMenuOpen(false);
    const created = await onCreate(NEW_ACTIVITY_NAME, SWATCHES[5], isTeamMode ? selectedGroupId : null);
    if (!created) {
      Alert.alert(
        "Could not add activity",
        "Your activity list could not be saved. Check your connection and try again.",
      );
      return;
    }
    openEdit({
      cat: created,
      name: "",
      color: created.color,
      isNew: true,
    });
  }, [isTeamMode, onCreate, openEdit, selectedGroupId]);

  const handleToggleHidden = useCallback(
    (cat: UserCategory) => {
      void onUpdate(cat.id, { hidden: !cat.hidden });
    },
    [onUpdate],
  );

  const handleSaveEdit = useCallback(
    async (name: string, color: string) => {
      if (!editState) return;
      const { cat } = editState;
      const patch: Partial<Pick<UserCategory, "name" | "color">> = {};
      if (name !== cat.name) patch.name = name;
      if (color !== cat.color) patch.color = color;
      if (Object.keys(patch).length > 0) await onUpdate(cat.id, patch);
      setEditVisible(false);
      setEditState(null);
      Keyboard.dismiss();
    },
    [editState, onUpdate],
  );

  const handleDeleteEdit = useCallback(() => {
    if (!editState || editState.isNew) return;
    Alert.alert(
      "Delete activity",
      `Delete "${editState.cat.name}"? Sessions in this activity will remain but lose their activity type.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void onRemove(editState.cat.id);
            setEditVisible(false);
            setEditState(null);
            Keyboard.dismiss();
          },
        },
      ],
    );
  }, [editState, onRemove]);

  if (!visible) return null;

  const bottomInset = Math.max(insets.bottom, 16);

  return (
    <>
      <View
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
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
            height: maxHeight,
            backgroundColor: C.sheet,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingBottom: bottomInset,
            transform: [{ translateY: sheetAnim }],
            flexDirection: "column",
          }}
        >
          <View {...panResponder.panHandlers} style={styles.dragHandleArea}>
            <View
              style={{
                alignSelf: "center",
                width: 38,
                height: 4,
                borderRadius: 2,
                backgroundColor: C.separator,
              }}
            />
          </View>

          <Text
            style={{
              color: C.text,
              fontSize: 17,
              fontWeight: "600",
              textAlign: "center",
              marginBottom: 12,
              paddingHorizontal: 16,
            }}
          >
            Activities
          </Text>

          <ActivitiesGroupSelector
            options={groupOptions}
            value={selectedGroupId}
            open={groupMenuOpen}
            onOpenChange={setGroupMenuOpen}
            onChange={setSelectedGroupId}
          />

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 12,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={() => setGroupMenuOpen(false)}
          >
            {scopedCategories.length === 0 ? (
              <Text
                style={{
                  color: C.secondary,
                  fontSize: 15,
                  textAlign: "center",
                  marginTop: 24,
                  paddingHorizontal: 24,
                }}
              >
                No activities yet. Tap Add activity below.
              </Text>
            ) : (
              scopedCategories.map((cat) => (
                <ActivityRow
                  key={cat.id}
                  cat={cat}
                  onEdit={() =>
                    openEdit({
                      cat,
                      name: cat.name,
                      color: cat.color,
                      isNew: false,
                    })
                  }
                  onToggleHidden={() => handleToggleHidden(cat)}
                />
              ))
            )}
          </ScrollView>

          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
            <GlassChrome.Lens shape="capsule" interactive style={{ alignSelf: "stretch" }}>
              <Pressable
                onPress={() => void handleAdd()}
                style={{
                  paddingVertical: 15,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                accessibilityRole="button"
                accessibilityLabel="Add activity"
              >
                <Text style={{ color: C.text, fontSize: 16, fontWeight: "600" }}>Add activity</Text>
              </Pressable>
            </GlassChrome.Lens>
          </View>
        </Animated.View>
      </View>

      {editState ? (
        <ActivityEditKeyboardModal
          editState={editState}
          visible={editVisible}
          onClose={() => {
            setEditVisible(false);
            setEditState(null);
            Keyboard.dismiss();
          }}
          onSave={(name, color) => void handleSaveEdit(name, color)}
          onDelete={editState.isNew ? undefined : handleDeleteEdit}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  dragHandleArea: {
    paddingTop: 12,
    paddingBottom: 12,
    alignItems: "center",
  },
});
