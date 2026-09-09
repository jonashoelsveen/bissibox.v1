import {
  Alert,
  Animated,
  Keyboard,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ChevronRight, Moon, Sun } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "@/lib/auth";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { useProfileContext } from "@/lib/profile-context";
import { defaultNicknameFromEmail, loadNickname, saveNickname as persistNickname } from "@/lib/nickname";
import { canAccessTeamPlan, CHANGE_PLAN_URL, TEAM_CHECKOUT_URL } from "@/lib/features";
import { ProfileIcon, TeamIcon } from "@/components/icons/ProfileIcons";
import { BottomSheet, SheetCompactBody, SheetDismissArea } from "@/components/BottomSheet";
import { SheetTextInput } from "@/components/SheetTextInput";
import { compactSheetHeight } from "@/components/PrimaryButton";
import { TAB_BAR_SCROLL_EXTRA } from "@/components/BottomTabBar";
import { FadedTitle, PAGE_HEADER_PADDING_H, PageHeader } from "@/components/PageHeader";
import { BLIND_PRESENTATION, ProfilesBlind, topAnchorShift } from "@/components/ProfilesBlind";
import { useTeamRoster } from "@/hooks/useTeams";

type Page = "notifications" | "appearance" | "teams";

const PAGE_TITLES: Record<Page, string> = {
  notifications: "Notifications",
  appearance: "Appearance",
  teams: "My Teams",
};

export function ProfilePage(
  { onProfilesBlindOpenChange }: { onProfilesBlindOpenChange?: (open: boolean) => void } = {},
) {
  const insets = useSafeAreaInsets();
  const { C, mode, setMode } = useTheme();
  const { user, signOut, deleteAccount } = useAuth();
  const {
    plan,
    profileSwitcherEnabled,
    enableProfileSwitcher,
    activeProfile,
    setActiveProfile,
    teams,
    createTeam,
    updateTeam,
    deleteTeam,
    isTeamProfile,
  } = useProfileContext();

  const [page, setPage] = useState<Page | null>(null);
  const [nickname, setNickname] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [profilesBlindOpen, setProfilesBlindOpen] = useState(false);
  const [upgradeSheetOpen, setUpgradeSheetOpen] = useState(false);
  const blindProgress = useRef(new Animated.Value(0)).current;
  const [teamSheetOpen, setTeamSheetOpen] = useState(false);
  const [teamSheetName, setTeamSheetName] = useState("");
  const [deleteProfileOpen, setDeleteProfileOpen] = useState(false);
  const [secondAdminId, setSecondAdminId] = useState("");
  const [presentingHeight, setPresentingHeight] = useState(
    BLIND_PRESENTATION.presentingHeightEstimate,
  );

  const teamId = activeProfile?.type === "team" ? activeProfile.teamId : null;
  const teamProfileName = activeProfile?.type === "team" ? activeProfile.teamName : "";
  const { admins } = useTeamRoster(isTeamProfile ? teamId : null);
  const activeAdmins = admins.filter((a) => a.status === "active" || a.status === "pending");

  const currentAdminId = useMemo(
    () => admins.find(
      (a) => a.user_id === user?.id
        || (user?.email && a.email && a.email.toLowerCase() === user.email.toLowerCase()),
    )?.id,
    [admins, user?.id, user?.email],
  );

  const displayName =
    nickname.trim() || defaultNicknameFromEmail(user?.email);

  useEffect(() => {
    void loadNickname(user?.email).then(setNickname);
    void import("@react-native-async-storage/async-storage").then(({ default: AS }) =>
      AS.getItem("@notifications_enabled").then((v) => {
        if (v !== null) setNotificationsEnabled(v === "true");
      }),
    );
  }, [user?.email]);

  useEffect(() => {
    onProfilesBlindOpenChange?.(profilesBlindOpen);
  }, [profilesBlindOpen, onProfilesBlindOpenChange]);

  useEffect(() => {
    return () => onProfilesBlindOpenChange?.(false);
  }, [onProfilesBlindOpenChange]);

  useEffect(() => {
    if (!profilesBlindOpen) {
      blindProgress.setValue(0);
    }
  }, [profilesBlindOpen, blindProgress]);

  const dismissProfilesBlind = () => {
    setProfilesBlindOpen(false);
  };

  const closeProfilesBlind = () => {
    Animated.timing(blindProgress, {
      toValue: 0,
      duration: BLIND_PRESENTATION.closeDuration,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) setProfilesBlindOpen(false);
    });
  };

  const openProfilesBlind = () => {
    onProfilesBlindOpenChange?.(true);
    blindProgress.stopAnimation();
    blindProgress.setValue(0);
    setProfilesBlindOpen(true);
    Animated.spring(blindProgress, {
      toValue: 1,
      useNativeDriver: false,
      ...BLIND_PRESENTATION.openSpring,
    }).start();
  };

  const presentingScale = blindProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, BLIND_PRESENTATION.scale],
  });
  const presentingRadius = blindProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BLIND_PRESENTATION.topRadius],
  });
  const presentingAnchorY = blindProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -topAnchorShift(presentingHeight)],
  });
  const presentingContentY = blindProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BLIND_PRESENTATION.contentHideShift],
  });

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete account",
      "Are you sure you want to delete your account? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error } = await deleteAccount();
            if (error) Alert.alert("Error", error);
          },
        },
      ],
    );
  };

  async function performDeleteProfile() {
    if (activeProfile?.type !== "team") return;
    const { ok, error } = await deleteTeam(activeProfile.teamId);
    if (!ok) {
      Alert.alert("Could not delete profile", error ?? "Unknown error");
      return;
    }
    setDeleteProfileOpen(false);
    setSecondAdminId("");
    Animated.timing(blindProgress, {
      toValue: 0,
      duration: BLIND_PRESENTATION.closeDuration,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) setProfilesBlindOpen(false);
    });
  }

  const handleSignOut = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => void signOut() },
    ]);
  };

  const saveNickname = (v: string) => {
    setNickname(v);
    void persistNickname(v);
  };

  const toggleNotifications = (v: boolean) => {
    setNotificationsEnabled(v);
    void import("@react-native-async-storage/async-storage").then(({ default: AS }) =>
      AS.setItem("@notifications_enabled", String(v)),
    );
  };

  const openAddTeam = () => {
    setTeamSheetName("");
    setTeamSheetOpen(true);
  };

  const handleSaveTeam = async () => {
    const name = teamSheetName.trim() || "New team";

    const { team, error } = await createTeam(name, user?.email ?? undefined);
    if (error || !team) {
      Alert.alert("Could not create team", error ?? "Unknown error");
      return;
    }

    setTeamSheetOpen(false);
  };

  const selectIndividual = () => {
    if (!user) return;
    setActiveProfile({ type: "individual", userId: user.id });
    closeProfilesBlind();
  };

  const selectTeam = (teamId: string, teamName: string) => {
    if (!user) return;
    setActiveProfile({
      type: "team",
      teamId,
      teamName,
      ownerId: user.id,
    });
    closeProfilesBlind();
  };

  const handleDeleteTeamFromBlind = (teamId: string, teamName: string) => {
    if (activeProfile?.type === "team" && activeProfile.teamId === teamId && admins.length >= 2) {
      setDeleteProfileOpen(true);
      return;
    }
    Alert.alert(
      "Delete profile",
      `Are you sure you want to delete "${teamName}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { ok, error } = await deleteTeam(teamId);
            if (!ok) Alert.alert("Could not delete profile", error ?? "Unknown error");
          },
        },
      ],
    );
  };

  const handleUpgradeCTA = () => {
    if (canAccessTeamPlan(plan)) {
      enableProfileSwitcher();
      setUpgradeSheetOpen(false);
    } else {
      void Linking.openURL(TEAM_CHECKOUT_URL);
    }
  };

  const handleChangePlan = () => {
    void Linking.openURL(CHANGE_PLAN_URL);
  };

  const hasTeamUpgrade = profileSwitcherEnabled;

  const TEAM_PLAN_FEATURES = [
    "Team profiles with separate calendars",
    "Admins, groups, athletes and coaches",
    "Team activities and session scheduling",
  ];

  function renderNotifications() {
    return (
      <View style={{ paddingHorizontal: 20, paddingTop: 24 }}>
        <View
          style={{
            backgroundColor: C.card,
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: C.text, fontSize: 16 }}>Allow notifications</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={toggleNotifications}
            trackColor={{ false: C.separator, true: C.accent }}
            thumbColor="#FFFFFF"
            ios_backgroundColor={C.separator}
          />
        </View>
      </View>
    );
  }

  function renderAppearance() {
    const tiles: Array<{ key: ThemeMode; label: string }> = [
      { key: "dark", label: "Dark" },
      { key: "light", label: "Light" },
    ];
    return (
      <View style={{ paddingHorizontal: 20, paddingTop: 24, flexDirection: "row", gap: 14 }}>
        {tiles.map(({ key, label }) => {
          const isDarkTile = key === "dark";
          const tileBg = isDarkTile ? "#1C1C1E" : "#F2F2F7";
          const tileText = isDarkTile ? "#FFFFFF" : "#1C1C1E";
          const selected = mode === key;
          return (
            <Pressable key={key} onPress={() => setMode(key)} style={{ flex: 1 }}>
              {({ pressed }) => (
                <View
                  style={{
                    backgroundColor: tileBg,
                    borderRadius: 16,
                    paddingVertical: 22,
                    alignItems: "center",
                    gap: 10,
                    borderWidth: 2,
                    borderColor: selected ? C.accent : "transparent",
                    opacity: pressed ? 0.8 : 1,
                  }}
                >
                  {isDarkTile ? <Moon size={26} color={tileText} /> : <Sun size={26} color={tileText} />}
                  <Text style={{ color: tileText, fontSize: 15, fontWeight: "600" }}>{label}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    );
  }

  function renderMyTeams() {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 8 }}>
        <Text style={{ color: C.secondary, fontSize: 14, marginBottom: 8 }}>
          Teams where you are an athlete or coach (not teams you created).
        </Text>
        <Text style={{ color: C.secondary, fontSize: 15, textAlign: "center", marginTop: 24 }}>
          No memberships yet.
        </Text>
      </ScrollView>
    );
  }

  const MENU_ITEMS: Array<{ key: Page; label: string }> = [
    { key: "notifications", label: "Notifications" },
    { key: "appearance", label: "Appearance" },
    ...(isTeamProfile ? [] : [{ key: "teams" as Page, label: "My Teams" }]),
  ];

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: profilesBlindOpen ? BLIND_PRESENTATION.rootBg : C.bg,
      }}
    >
      {profilesBlindOpen && <StatusBar style="light" />}
      <Animated.View
        onLayout={(e) => {
          const height = e.nativeEvent.layout.height;
          if (height > 0 && Math.abs(height - presentingHeight) > 1) {
            setPresentingHeight(height);
          }
        }}
        style={{
          flex: 1,
          backgroundColor: C.bg,
          borderRadius: presentingRadius,
          overflow: "hidden",
          transform: [
            { translateY: presentingAnchorY },
            { scale: presentingScale },
          ],
        }}
      >
        <Animated.View
          style={{
            flex: 1,
            transform: [{ translateY: presentingContentY }],
          }}
        >
      {page !== null ? (
        <PageHeader>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Pressable onPress={() => setPage(null)} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 6 })}>
              <ArrowLeft size={22} color={C.accent} />
            </Pressable>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ color: C.text, fontSize: 17, fontWeight: "600" }}>{PAGE_TITLES[page]}</Text>
            </View>
            <View style={{ width: 34 }} />
          </View>
        </PageHeader>
      ) : (
        <PageHeader style={{ paddingHorizontal: 0 }} fadeInsetRight={18}>
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: PAGE_HEADER_PADDING_H,
              gap: 10,
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: C.card,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: C.separator,
              }}
            >
              {isTeamProfile ? (
                <TeamIcon size={18} color={C.secondary} />
              ) : (
                <ProfileIcon size={18} color={C.secondary} />
              )}
            </View>
            <FadedTitle
              text={isTeamProfile && activeProfile?.type === "team" ? activeProfile.teamName : displayName}
              fontSize={15}
              fontWeight="600"
            />
          </View>
        </PageHeader>
      )}

      {page === null ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 24) + TAB_BAR_SCROLL_EXTRA,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
            <Pressable onPress={openProfilesBlind}>
              {({ pressed }) => (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 14,
                    paddingVertical: 15,
                    borderRadius: 12,
                    backgroundColor: pressed ? C.tabBg : "transparent",
                  }}
                >
                  <Text style={{ flex: 1, color: C.text, fontSize: 16, fontWeight: "500" }}>
                    Profiles
                  </Text>
                  <ChevronRight size={18} color={C.secondary} />
                </View>
              )}
            </Pressable>
          </View>

          {!isTeamProfile && (
            <Pressable onPress={() => setUpgradeSheetOpen(true)} style={{ paddingHorizontal: 16, marginBottom: 4 }}>
              {({ pressed }) => (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 14,
                    paddingVertical: 15,
                    borderRadius: 12,
                    backgroundColor: pressed ? C.tabBg : "transparent",
                  }}
                >
                  <Text style={{ flex: 1, color: C.text, fontSize: 16, fontWeight: "500" }}>
                    {hasTeamUpgrade ? "View plan" : "Upgrade to Team"}
                  </Text>
                  <ChevronRight size={18} color={C.secondary} />
                </View>
              )}
            </Pressable>
          )}

          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            {MENU_ITEMS.map((item) => (
              <Pressable key={item.key} onPress={() => setPage(item.key)}>
                {({ pressed }) => (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 14,
                      paddingVertical: 15,
                      borderRadius: 12,
                      backgroundColor: pressed ? C.tabBg : "transparent",
                    }}
                  >
                    <Text style={{ flex: 1, color: C.text, fontSize: 16, fontWeight: "500" }}>
                      {item.label}
                    </Text>
                    <ChevronRight size={18} color={C.secondary} />
                  </View>
                )}
              </Pressable>
            ))}
          </View>

          <View style={{ height: 1, backgroundColor: C.separator, marginHorizontal: 16, marginBottom: 8 }} />

          <View style={{ paddingHorizontal: 16 }}>
            <Pressable onPress={handleSignOut}>
              {({ pressed }) => (
                <View
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 15,
                    borderRadius: 12,
                    backgroundColor: pressed ? "rgba(255,59,48,0.08)" : "transparent",
                  }}
                >
                  <Text style={{ color: C.danger, fontSize: 16, fontWeight: "500" }}>Log out</Text>
                </View>
              )}
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingBottom: Math.max(insets.bottom, 24) }}>
          {page === "notifications" && renderNotifications()}
          {page === "appearance" && renderAppearance()}
          {page === "teams" && renderMyTeams()}
        </View>
      )}
        </Animated.View>
      </Animated.View>

      <ProfilesBlind
        visible={profilesBlindOpen}
        progress={blindProgress}
        onClose={dismissProfilesBlind}
        displayName={displayName}
        nickname={nickname}
        userEmail={user?.email}
        teams={teams}
        activeProfile={activeProfile}
        onSelectIndividual={selectIndividual}
        onSelectTeam={selectTeam}
        onSaveNickname={saveNickname}
        onUpdateTeam={updateTeam}
        onDeleteAccount={handleDeleteAccount}
        onDeleteTeam={handleDeleteTeamFromBlind}
        onAddTeam={openAddTeam}
        showAddButton={hasTeamUpgrade}
      />

      <BottomSheet visible={upgradeSheetOpen} onClose={() => setUpgradeSheetOpen(false)}>
        <View style={{ flex: 1, paddingHorizontal: 20 }}>
          {hasTeamUpgrade ? (
            <>
              <Text style={{ color: C.secondary, fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
                Current plan
              </Text>
              <View
                style={{
                  backgroundColor: C.card,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: C.separator,
                  padding: 20,
                  marginBottom: 20,
                }}
              >
                <Text style={{ color: C.text, fontSize: 22, fontWeight: "700", marginBottom: 4 }}>
                  Team
                </Text>
                <Text style={{ color: C.secondary, fontSize: 15, lineHeight: 22, marginBottom: 16 }}>
                  Full access to team profiles, roster management, and shared calendars.
                </Text>
                {TEAM_PLAN_FEATURES.map((feature) => (
                  <View key={feature} style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                    <Text style={{ color: C.accent, fontSize: 15, lineHeight: 22 }}>·</Text>
                    <Text style={{ flex: 1, color: C.text, fontSize: 15, lineHeight: 22 }}>{feature}</Text>
                  </View>
                ))}
              </View>
              <Pressable
                onPress={handleChangePlan}
                style={({ pressed }) => ({
                  alignSelf: "center",
                  paddingVertical: 14,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text style={{ color: C.accent, fontSize: 16, fontWeight: "600" }}>Change plan</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={{ color: C.text, fontSize: 20, fontWeight: "700", marginBottom: 12 }}>
                Upgrade to Team
              </Text>
              <Text style={{ color: C.secondary, fontSize: 15, lineHeight: 22, marginBottom: 20 }}>
                Create team profiles, manage admins, groups, athletes and coaches. Each profile has its
                own calendar, activities and settings.
              </Text>
              {TEAM_PLAN_FEATURES.map((feature) => (
                <View key={feature} style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                  <Text style={{ color: C.accent, fontSize: 15, lineHeight: 22 }}>·</Text>
                  <Text style={{ flex: 1, color: C.text, fontSize: 15, lineHeight: 22 }}>{feature}</Text>
                </View>
              ))}
              <Pressable
                onPress={handleUpgradeCTA}
                style={({ pressed }) => ({
                  alignSelf: "center",
                  paddingVertical: 14,
                  marginTop: 12,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text style={{ color: C.accent, fontSize: 16, fontWeight: "600" }}>
                  {canAccessTeamPlan(plan) ? "Upgrade to Team" : "Subscribe via web"}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </BottomSheet>

      <BottomSheet
        visible={teamSheetOpen}
        height={compactSheetHeight(insets.bottom, false)}
        onClose={() => setTeamSheetOpen(false)}
      >
        <SheetDismissArea>
        <SheetCompactBody>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <SheetTextInput
              key="new-team"
              focusOnOpen
              value={teamSheetName}
              onChangeText={setTeamSheetName}
              placeholder="New team"
              placeholderTextColor={C.secondary}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              style={{
                flex: 1,
                backgroundColor: C.inputBg,
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 14,
                color: C.text,
                fontSize: 16,
              }}
            />
            <Pressable
              onPress={() => void handleSaveTeam()}
              style={({ pressed }) => ({
                backgroundColor: C.accent,
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 14,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ color: C.primaryBtnText, fontWeight: "600", fontSize: 15 }}>
                Create
              </Text>
            </Pressable>
          </View>
        </SheetCompactBody>
        </SheetDismissArea>
      </BottomSheet>

      <Modal visible={deleteProfileOpen} transparent animationType="fade">
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
              Are you sure you want to delete "{teamProfileName}"? Select a second admin to confirm.
            </Text>
            <ScrollView style={{ maxHeight: 160, marginBottom: 16 }}>
              {activeAdmins.map((a) => {
                const disabled = a.id === currentAdminId;
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
              <Pressable onPress={() => { setDeleteProfileOpen(false); setSecondAdminId(""); }}>
                <Text style={{ color: C.secondary, fontSize: 16 }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void performDeleteProfile()}
                disabled={!secondAdminId}
              >
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

export { ProfilePage as UserMenu };
