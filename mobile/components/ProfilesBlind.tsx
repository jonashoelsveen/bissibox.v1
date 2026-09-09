import {
  Alert,
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Plus, X } from "lucide-react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GlassChrome } from "@/components/GlassChrome";
import { useTheme } from "@/lib/theme";
import type { ActiveProfile } from "@/lib/profile-context";
import { ProfileIcon, TeamIcon } from "@/components/icons/ProfileIcons";
import { PAGE_HEADER_HEIGHT } from "@/components/PageHeader";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export const BLIND_PRESENTATION = {
  scale: 0.93,
  opacity: 0.9,
  topRadius: 28,
  heightRatio: 0.91,
  contentHideShift: PAGE_HEADER_HEIGHT + 40,
  presentingHeightEstimate: SCREEN_HEIGHT * 0.78,
  openSpring: {
    damping: 30,
    stiffness: 220,
    mass: 1.15,
  },
  closeDuration: 220,
  rootBg: "#000000",
} as const;

export function topAnchorShift(height: number) {
  return height * (1 - BLIND_PRESENTATION.scale) / 2;
}

const DISMISS_DRAG_DISTANCE = 480;

export type ProfileEditTarget =
  | { type: "individual" }
  | { type: "team"; teamId: string; teamName: string };

interface ProfilesBlindProps {
  visible: boolean;
  progress: Animated.Value;
  onClose: () => void;
  displayName: string;
  nickname: string;
  userEmail?: string;
  teams: Array<{ id: string; name: string }>;
  activeProfile: ActiveProfile | null;
  onSelectIndividual: () => void;
  onSelectTeam: (teamId: string, teamName: string) => void;
  onSaveNickname: (value: string) => void;
  onUpdateTeam: (teamId: string, name: string) => Promise<{ ok: boolean; error?: string | null }>;
  onDeleteAccount: () => void;
  onDeleteTeam: (teamId: string, teamName: string) => void;
  onAddTeam: () => void;
  showAddButton: boolean;
}

export function ProfilesBlind({
  visible,
  progress,
  onClose,
  displayName,
  nickname,
  userEmail,
  teams,
  activeProfile,
  onSelectIndividual,
  onSelectTeam,
  onSaveNickname,
  onUpdateTeam,
  onDeleteAccount,
  onDeleteTeam,
  onAddTeam,
  showAddButton,
}: ProfilesBlindProps) {
  const insets = useSafeAreaInsets();
  const { C } = useTheme();
  const [editTarget, setEditTarget] = useState<ProfileEditTarget | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const progressAtPanStart = useRef(1);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const blindHeight = SCREEN_HEIGHT * BLIND_PRESENTATION.heightRatio;

  const slideOffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [blindHeight, 0],
  });

  useEffect(() => {
    if (!visible) {
      setEditTarget(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!editTarget) return;
    if (editTarget.type === "individual") {
      setNameDraft(nickname);
    } else {
      setNameDraft(editTarget.teamName);
    }
  }, [editTarget, nickname]);

  const closeBlind = () => {
    Keyboard.dismiss();
    Animated.timing(progress, {
      toValue: 0,
      duration: BLIND_PRESENTATION.closeDuration,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        setEditTarget(null);
        onCloseRef.current();
      }
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dy) > Math.abs(gs.dx) && gs.dy > 10,
      onPanResponderGrant: () => {
        Keyboard.dismiss();
        progress.stopAnimation((value) => {
          progressAtPanStart.current = value;
        });
      },
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) {
          const dragRatio = gs.dy / DISMISS_DRAG_DISTANCE;
          const next = Math.max(0, progressAtPanStart.current - dragRatio * 0.35);
          progress.setValue(next);
        }
      },
      onPanResponderRelease: () => {
        Animated.spring(progress, {
          toValue: 1,
          damping: 28,
          stiffness: 280,
          useNativeDriver: false,
        }).start();
      },
    }),
  ).current;

  const closeEdit = () => setEditTarget(null);

  const isIndividualActive = activeProfile?.type === "individual";
  const isTeamActive = (id: string) =>
    activeProfile?.type === "team" && activeProfile.teamId === id;

  const saveEditName = async () => {
    if (!editTarget) return;
    const name = nameDraft.trim();
    if (editTarget.type === "individual") {
      onSaveNickname(name);
      return;
    }
    const finalName = name || "New team";
    if (finalName === editTarget.teamName) return;
    const { ok, error } = await onUpdateTeam(editTarget.teamId, finalName);
    if (!ok) {
      Alert.alert("Could not save team name", error ?? "Unknown error");
      setNameDraft(editTarget.teamName);
    } else {
      setEditTarget({ ...editTarget, teamName: finalName });
    }
  };

  const handleDelete = () => {
    if (!editTarget) return;
    if (editTarget.type === "individual") {
      onDeleteAccount();
      return;
    }
    onDeleteTeam(editTarget.teamId, editTarget.teamName);
    setEditTarget(null);
  };

  if (!visible) return null;

  const editTitle =
    editTarget?.type === "individual"
      ? displayName
      : editTarget?.teamName ?? "";

  const gutterHeight = SCREEN_HEIGHT * (1 - BLIND_PRESENTATION.heightRatio);

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={{ flex: 1 }} pointerEvents="box-none">
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: gutterHeight,
          }}
        />
        <Animated.View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: blindHeight,
            backgroundColor: C.sheet,
            borderTopLeftRadius: BLIND_PRESENTATION.topRadius,
            borderTopRightRadius: BLIND_PRESENTATION.topRadius,
            transform: [{ translateY: slideOffset }],
          }}
        >
        <View {...panResponder.panHandlers}>
          {editTarget ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
                paddingTop: 12,
                paddingBottom: 12,
              }}
            >
              <GlassChrome.Lens shape="circle" interactive size={34}>
                <Pressable
                  onPress={closeEdit}
                  hitSlop={12}
                  style={{
                    width: 34,
                    height: 34,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                >
                  <ArrowLeft size={22} color={C.accent} />
                </Pressable>
              </GlassChrome.Lens>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ color: C.text, fontSize: 17, fontWeight: "600" }} numberOfLines={1}>
                  {editTitle}
                </Text>
              </View>
              <GlassChrome.Lens shape="circle" interactive size={34}>
                <Pressable
                  onPress={closeBlind}
                  hitSlop={12}
                  style={{
                    width: 34,
                    height: 34,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <X size={22} color={C.secondary} />
                </Pressable>
              </GlassChrome.Lens>
            </View>
          ) : (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingTop: 28,
                paddingBottom: 8,
              }}
            >
              <View style={{ width: 34 }} />
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ color: C.text, fontSize: 21, fontWeight: "700" }}>Profiles</Text>
              </View>
              <GlassChrome.Lens shape="circle" interactive size={34}>
                <Pressable
                  onPress={closeBlind}
                  hitSlop={12}
                  style={{
                    width: 34,
                    height: 34,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <X size={22} color={C.secondary} />
                </Pressable>
              </GlassChrome.Lens>
            </View>
          )}
        </View>

        {editTarget ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, gap: 20, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View>
              <Text style={labelStyle(C)}>
                {editTarget.type === "individual" ? "Nickname" : "Team name"}
              </Text>
              <TextInput
                style={{
                  backgroundColor: C.inputBg,
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  color: C.text,
                  fontSize: 16,
                }}
                value={nameDraft}
                onChangeText={setNameDraft}
                onEndEditing={() => void saveEditName()}
                placeholder={editTarget.type === "individual" ? "Your nickname" : "Team name"}
                placeholderTextColor={C.secondary}
              />
            </View>
            {editTarget.type === "individual" && (
              <View>
                <Text style={labelStyle(C)}>Email</Text>
                <View
                  style={{
                    backgroundColor: C.inputBg,
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                  }}
                >
                  <Text style={{ color: C.secondary, fontSize: 16 }}>{userEmail ?? "—"}</Text>
                </View>
              </View>
            )}
            <Pressable
              onPress={handleDelete}
              style={({ pressed }) => ({ alignSelf: "center", paddingVertical: 6, opacity: pressed ? 0.5 : 1 })}
            >
              <Text style={{ color: C.danger, fontSize: 14 }}>
                {editTarget.type === "individual" ? "Delete account" : "Delete profile"}
              </Text>
            </Pressable>
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 28,
                paddingBottom: showAddButton ? 88 : 32,
                gap: 12,
              }}
              showsVerticalScrollIndicator={false}
            >
              <ProfileTabRow
                icon={<ProfileIcon size={20} color={C.secondary} />}
                label={displayName}
                selected={isIndividualActive}
                onPress={onSelectIndividual}
                onEdit={() => setEditTarget({ type: "individual" })}
                C={C}
              />
              {teams.map((t) => (
                <ProfileTabRow
                  key={t.id}
                  icon={<TeamIcon size={20} color={C.secondary} />}
                  label={t.name}
                  selected={isTeamActive(t.id)}
                  onPress={() => onSelectTeam(t.id, t.name)}
                  onEdit={() => setEditTarget({ type: "team", teamId: t.id, teamName: t.name })}
                  C={C}
                />
              ))}
            </ScrollView>

            {showAddButton && (
              <Pressable
                onPress={onAddTeam}
                style={({ pressed }) => ({
                  position: "absolute",
                  right: 24,
                  bottom: Math.max(insets.bottom, 24),
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: C.accent,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.85 : 1,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 8,
                  elevation: 6,
                })}
              >
                <Plus size={26} color="#FFFFFF" strokeWidth={2.5} />
              </Pressable>
            )}
          </View>
        )}
      </Animated.View>
      </View>
    </Modal>
  );
}

function ProfileTabRow({
  icon,
  label,
  selected,
  onPress,
  onEdit,
  C,
}: {
  icon: ReactNode;
  label: string;
  selected: boolean;
  onPress: () => void;
  onEdit: () => void;
  C: ReturnType<typeof useTheme>["C"];
}) {
  const inset = 14;

  return (
    <View
      style={{
        borderRadius: 12,
        borderWidth: 2,
        borderColor: selected ? "#000000" : C.separator,
        backgroundColor: C.card,
        minHeight: 64,
        overflow: "hidden",
      }}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          paddingTop: inset,
          paddingRight: inset,
          paddingBottom: 6,
          backgroundColor: pressed ? C.tabBg : "transparent",
        })}
      >
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: inset }}>
          <View
            style={{
              width: 36,
              height: 36,
              flexShrink: 0,
              borderRadius: 18,
              backgroundColor: C.inputBg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {icon}
          </View>
          <Text
            style={{
              marginLeft: 12,
              flex: 1,
              color: C.text,
              fontSize: 16,
              lineHeight: 20,
              fontWeight: selected ? "600" : "500",
            }}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      </Pressable>
      <View style={{ alignItems: "flex-end", paddingRight: inset, paddingBottom: inset }}>
        <Pressable
          onPress={onEdit}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          <Text style={{ color: C.accent, fontSize: 15, fontWeight: "600", lineHeight: 20 }}>Edit</Text>
        </Pressable>
      </View>
    </View>
  );
}

function labelStyle(C: ReturnType<typeof useTheme>["C"]) {
  return {
    color: C.secondary,
    fontSize: 12,
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  };
}
