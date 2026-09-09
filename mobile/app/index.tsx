import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  InteractionManager,
  Platform,
  UIManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { LinearGradient } from "expo-linear-gradient";
import { withAlpha } from "@/lib/colorAlpha";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Menu, Plus } from "lucide-react-native";
import { Gesture, GestureDetector, ScrollView as GHScrollView } from "react-native-gesture-handler";
import Reanimated, {
  cancelAnimation,
  Easing as REasing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  Component,
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useAuth } from "@/lib/auth";
import { useTheme, type ThemeColors } from "@/lib/theme";
import {
  type CalendarSession,
  type LiveSessionSnapshot,
  liveSessionSnapshot,
  liveSessionSnapshotsEqual,
  liveSessionAutosaveEqual,
  resolveSessionCategoryId,
  useCalendarSessions,
  useCreateSession,
  useDeleteSession,
  useLiveCalendarSession,
  useUpdateSession,
} from "@/hooks/useCalendarSessions";
import { useCalendarSessionsRealtime } from "@/hooks/useCalendarSessionsRealtime";
import { useQueryClient } from "@tanstack/react-query";
import { useUserCategories, type UserCategory } from "@/hooks/useUserCategories";
import { ActivitiesBlind } from "@/components/ActivitiesBlind";
import { EntitySegmentTabs } from "@/components/EntitySegmentTabs";
import { ProfilePage } from "@/components/UserMenu";
import { BLIND_PRESENTATION } from "@/components/ProfilesBlind";
import { BottomTabBar, TAB_BAR_SCROLL_EXTRA, bottomTabBarHeight, type AppTab } from "@/components/BottomTabBar";
import { TeamPage, type MemberBlindTarget } from "@/components/TeamPage";
import { MemberBlind } from "@/components/MemberBlind";
import { useTeamRoster, type TeamGroup, type TeamInviteMember, type TeamRoster } from "@/hooks/useTeams";
import { ProfileProvider, useProfileContext } from "@/lib/profile-context";
import { supabase } from "@/lib/supabase";
import { PageHeader, PageHeaderControl, PAGE_HEADER_HEIGHT } from "@/components/PageHeader";
import { FLOATING_ACTION_CLEARANCE, PrimaryButton } from "@/components/PrimaryButton";
import { NativeSheetIconFooter } from "@/components/NativeSheetIconFooter";
import { SessionTitleField, SheetTextInput } from "@/components/SheetTextInput";
import { RosterSearchField } from "@/components/RosterSearchField";
import { filterAcceptedMembers, rosterDisplayLabel } from "@/lib/memberSearch";
import { createSheetDismissPanResponder } from "@/lib/sheetDismissSwipe";
import {
  sessionDateKeyFromDb,
  sessionTimeFromDb,
  sessionTimeToDb,
} from "@/lib/session-datetime";

const WEEK_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const CALENDAR_SELECTED_DAY_SIZE = 28;
const CALENDAR_SELECTED_DAY_RADIUS = 6;
const CALENDAR_NAV_DIVIDER_INSET = 16;
const CALENDAR_TOP_GAP = 10;
const CALENDAR_BOTTOM_GAP = 2;

function calendarNavDividerStyle(separator: string) {
  return {
    height: StyleSheet.hairlineWidth,
    backgroundColor: separator,
    marginHorizontal: CALENDAR_NAV_DIVIDER_INSET,
  };
}
const MONTH_WEEKDAY_HEADER_HEIGHT = CALENDAR_TOP_GAP + 14 + 2;
const MONTH_DAY_ROW_HEIGHT = 43;

function getMonthWeekRowCount(month: Date) {
  const start = startOfMonth(month);
  const leadingBlanks = (getDay(start) + 6) % 7;
  const daysInMonth = endOfMonth(month).getDate();
  return Math.ceil((leadingBlanks + daysInMonth) / 7);
}

function getMonthGridHeight(month: Date) {
  return (
    MONTH_WEEKDAY_HEADER_HEIGHT +
    getMonthWeekRowCount(month) * MONTH_DAY_ROW_HEIGHT +
    CALENDAR_BOTTOM_GAP
  );
}

const PICKER_HEIGHT = 176;
const PICKER_FADE_H = 56;
const GROUP_DROPDOWN_MAX_ROWS = 4;
const SESSION_FIELD_HEIGHT = 52;
const GROUP_DROPDOWN_RADIUS = 10;
const GROUP_DROPDOWN_BOTTOM_GAP = 10;
const SESSION_SECTION_GAP = 14;
const SESSION_DESCRIPTION_MAX_LENGTH = 500;
const SESSION_DESCRIPTION_LINE_HEIGHT = 24;
const SESSION_DESCRIPTION_FOOTER_GAP = 8;
const SESSION_ABOUT_SECTION_GAP = 24;
const SESSION_TAB_CONTENT_GAP = 12;
const SESSION_DESCRIPTION_KEYBOARD_GAP = 10;
const INDIVIDUAL_PICKER_TOP_GAP = 14;
/**
 * Individual wheels — shift native spinner up inside the clip so row count
 * above/below the selection matches; symmetric edge fades on the viewport.
 */
const INDIVIDUAL_TIME_WHEEL_OFFSET_Y = -17;
const INDIVIDUAL_TIME_WHEEL_EDGE_FADE_H = PICKER_FADE_H;
/** Gap below time wheels to the All day row; also used to center the selection row. */
const SESSION_TIME_WHEEL_GAP = 8;
/** Extra space between entity time wheels and the All day row. */
const SESSION_TIME_ALL_DAY_TOP_GAP = 16;
/** Pull entity time wheels up; labels overlay via z-index. */
const SESSION_TIME_WHEEL_LIFT = -28;
const SESSION_TIME_LABEL_BAND = 20;
/** Entity session wheels — symmetric fade above and below the selection row. */
const SESSION_TIME_WHEEL_FADE_H = 40;
/** Solid sheet band above the upward fade, below From/To labels. */
const SESSION_TIME_WHEEL_TOP_SOLID_H = 8;

type TeamSessionTab = "about" | "description" | "participants";

const TEAM_SESSION_TABS: Array<{ key: TeamSessionTab; label: string }> = [
  { key: "about", label: "About" },
  { key: "description", label: "Description" },
  { key: "participants", label: "Participants" },
];

const PARTICIPANT_SEARCH_RADIUS = 24;

function entitySessionTabPaneStyle(active: boolean) {
  return {
    ...StyleSheet.absoluteFill,
    opacity: active ? 1 : 0,
    zIndex: active ? 1 : 0,
  } as const;
}

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
/** Space left above bottom sheets so content peeks through for context and swipe-down affordance. */
const SHEET_TOP_PEEK = PAGE_HEADER_HEIGHT + 12;
/** Entity calendar session sheet — sits closer to the status bar. */
const ENTITY_SESSION_SHEET_TOP_PEEK = 0;
const PICKER_W = Math.floor((SCREEN_W - 40) / 2);
const PICKER_NATIVE_W = Math.round(SCREEN_W * 2 / 3);

type Tab = AppTab;

// ─── error boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ color: "#FF3B30", fontSize: 16, textAlign: "center" }}>{this.state.error}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── root ──────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  return (
    <ErrorBoundary>
      <Home />
    </ErrorBoundary>
  );
}

function Home() {
  const { user, loading } = useAuth();
  const { C } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.accent} size="large" />
      </View>
    );
  }

  if (!user) return <SignInView />;
  return (
    <ProfileProvider userId={user.id}>
      <MainApp userId={user.id} />
    </ProfileProvider>
  );
}

function MainApp({ userId }: { userId: string }) {
  const { scopeTeamId, isTeamProfile, activeProfile } = useProfileContext();
  const teamOwnerId = activeProfile?.type === "team" ? activeProfile.ownerId : null;
  const teamName = activeProfile?.type === "team" ? activeProfile.teamName : undefined;
  const roster = useTeamRoster(scopeTeamId);
  const { groups, members } = roster;
  const insets = useSafeAreaInsets();
  const { C } = useTheme();
  const [tab, setTab] = useState<Tab>("calendar");

  // Leave team tab when switching back to individual; do not auto-open team tab on profile change
  useEffect(() => {
    if (!activeProfile) return;
    if (activeProfile.type === "individual") {
      setTab((current) => (current === "team" ? "calendar" : current));
    }
  }, [activeProfile]);

  // Session sheet state lives here so the sheet can cover the tab bar
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<CalendarSession | null>(null);
  const [memberBlind, setMemberBlind] = useState<MemberBlindTarget | null>(null);
  const memberBlindDeleteRef = useRef<(() => void) | null>(null);
  const sheetOpenRef = useRef(false);
  const editingSessionRef = useRef<CalendarSession | null>(null);
  sheetOpenRef.current = sheetOpen;
  editingSessionRef.current = editingSession;

  // Calendar navigation state lives here so switching to calendar tab preserves it
  const [selected, setSelected] = useState(() => new Date());
  const [month, setMonth] = useState(() => new Date());

  const handleRemoteSessionDelete = useCallback((sessionId: string) => {
    if (sheetOpenRef.current && editingSessionRef.current?.id === sessionId) {
      setSheetOpen(false);
      setEditingSession(null);
    }
  }, []);

  useCalendarSessionsRealtime(userId, isTeamProfile ? scopeTeamId : null, {
    onSessionDeleted: handleRemoteSessionDelete,
  });

  const qc = useQueryClient();
  const editingSessionId = editingSession?.id ?? null;

  // Keep the sheet's session prop aligned with React Query so remote edits
  // (cloud web) propagate without closing and reopening.
  useEffect(() => {
    if (!sheetOpen || !editingSessionId) return;

    const syncEditingSession = () => {
      const entries = qc.getQueriesData<CalendarSession[]>({
        queryKey: ["calendar-sessions", userId, isTeamProfile ? scopeTeamId : null],
        exact: false,
      });
      for (const [, rows] of entries) {
        const found = rows?.find((s) => s.id === editingSessionId);
        if (!found) continue;
        setEditingSession((prev) => {
          if (!prev || prev.id !== editingSessionId) return prev;
          if (
            prev.title === found.title &&
            prev.starts_at === found.starts_at &&
            prev.ends_at === found.ends_at &&
            prev.category_id === found.category_id &&
            prev.description === found.description &&
            prev.all_day === found.all_day &&
            (prev.app_group_id ?? null) === (found.app_group_id ?? null)
          ) {
            return prev;
          }
          return found;
        });
        return;
      }
    };

    syncEditingSession();
    return qc.getQueryCache().subscribe((event) => {
      const key = event.query?.queryKey;
      if (Array.isArray(key) && key[0] === "calendar-sessions") {
        syncEditingSession();
      }
    });
  }, [sheetOpen, editingSessionId, userId, isTeamProfile, scopeTeamId, qc]);

  const { categories, create, update, remove } = useUserCategories(
    userId,
    isTeamProfile ? scopeTeamId : null,
    isTeamProfile ? teamOwnerId : null,
  );
  const [sessionsAreaHeight, setSessionsAreaHeight] = useState(0);
  const [calendarAreaHeight, setCalendarAreaHeight] = useState(0);
  const [tabBarHeight, setTabBarHeight] = useState(0);
  const [profilesBlindOpen, setProfilesBlindOpen] = useState(false);
  const [activitiesBlindOpen, setActivitiesBlindOpen] = useState(false);

  function openActivitiesBlind() {
    if (sheetOpen) closeSheet();
    setActivitiesBlindOpen(true);
  }

  function closeActivitiesBlind() {
    setActivitiesBlindOpen(false);
  }

  // Stop just below the status bar, leaving the month header peeking for context and drag affordance.
  const sessionSheetTopPeek = isTeamProfile ? ENTITY_SESSION_SHEET_TOP_PEEK : SHEET_TOP_PEEK;
  const sessionSheetMaxHeight = SCREEN_H - insets.top - sessionSheetTopPeek;
  const memberBlindMaxHeight = SCREEN_H - insets.top - ENTITY_SESSION_SHEET_TOP_PEEK;
  const activitiesSheetHeight = SCREEN_H - insets.top - SHEET_TOP_PEEK;

  function openNew() { setEditingSession(null); setSheetOpen(true); }
  function openEdit(s: CalendarSession) { setEditingSession(s); setSheetOpen(true); }
  function closeSheet() { setSheetOpen(false); setEditingSession(null); }

  const handleTabChange = (t: Tab) => {
    if (sheetOpen) closeSheet();
    if (memberBlind) setMemberBlind(null);
    setTab(t);
  };

  return (
    <View style={{ flex: 1, backgroundColor: profilesBlindOpen ? BLIND_PRESENTATION.rootBg : C.bg }}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        {tab === "team" && isTeamProfile && scopeTeamId && (
          <TeamPage
            roster={roster}
            memberBlind={memberBlind}
            onMemberBlindChange={setMemberBlind}
            memberBlindDeleteRef={memberBlindDeleteRef}
          />
        )}
        {tab === "calendar" && (
          <CalendarContent
            key={scopeTeamId ?? "individual"}
            userId={userId}
            teamId={isTeamProfile ? scopeTeamId : null}
            selected={selected}
            onSelectDate={setSelected}
            month={month}
            onChangeMonth={setMonth}
            categories={categories}
            onOpenSheet={openNew}
            onEditSession={openEdit}
            onOpenActivities={openActivitiesBlind}
            onSessionsAreaHeight={setSessionsAreaHeight}
            onCalendarAreaHeight={setCalendarAreaHeight}
          />
        )}
        {tab === "profile" && (
          <ProfilePage onProfilesBlindOpenChange={setProfilesBlindOpen} />
        )}
      </SafeAreaView>

      <View
        pointerEvents="box-none"
        style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
        onLayout={(e) => setTabBarHeight(e.nativeEvent.layout.height)}
      >
        <BottomTabBar tab={tab} onChange={handleTabChange} showTeamTab={isTeamProfile} />
      </View>

      {/* ── Session sheet — absolute, covers the tab bar when open ── */}
      <SessionSheet
        visible={sheetOpen}
        session={editingSession}
        selectedDate={selected}
        userId={userId}
        teamId={scopeTeamId}
        teamOwnerId={teamOwnerId}
        teamName={teamName}
        groups={isTeamProfile ? groups : []}
        members={isTeamProfile ? members : []}
        categories={categories}
        onClose={closeSheet}
        bottomInset={Math.max(insets.bottom, 16)}
        maxHeight={Math.min(
          isTeamProfile && calendarAreaHeight && tabBarHeight
            ? calendarAreaHeight + tabBarHeight
            : sessionsAreaHeight && tabBarHeight
              ? sessionsAreaHeight + tabBarHeight
              : SCREEN_H * 0.6,
          sessionSheetMaxHeight,
        )}
      />

      <MemberBlind
        visible={memberBlind != null && tab === "team"}
        kind={memberBlind?.type ?? "admin"}
        personId={memberBlind?.id ?? ""}
        roster={roster}
        onClose={() => setMemberBlind(null)}
        onDelete={() => memberBlindDeleteRef.current?.()}
        bottomInset={Math.max(insets.bottom, 16)}
        maxHeight={memberBlindMaxHeight}
      />

      <ActivitiesBlind
        visible={activitiesBlindOpen}
        onClose={closeActivitiesBlind}
        maxHeight={activitiesSheetHeight}
        categories={categories}
        onCreate={create}
        onUpdate={update}
        onRemove={remove}
        teamName={isTeamProfile ? teamName : undefined}
        groups={isTeamProfile ? groups : undefined}
      />
    </View>
  );
}

// ─── sessions scroll view ────────────────────────────────────────────────────
function SessionScrollView({
  sessions,
  onEditSession,
  C,
}: {
  sessions: CalendarSession[];
  onEditSession: (s: CalendarSession) => void;
  C: ThemeColors;
}) {
  return (
    <GHScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: FLOATING_ACTION_CLEARANCE + TAB_BAR_SCROLL_EXTRA,
        gap: 8,
      }}
      showsVerticalScrollIndicator={false}
    >
      {sessions.length === 0 ? (
        <Text style={{ color: C.secondary, fontSize: 15, marginTop: 4 }}>No sessions</Text>
      ) : (
        sessions.map((s) => (
          <SessionRow key={s.id} session={s} onPress={() => onEditSession(s)} />
        ))
      )}
    </GHScrollView>
  );
}

// ─── calendar content ──────────────────────────────────────────────────────────

// Instagram-style tab pager: ~28% drag commits; quick flicks need less travel.
const SWIPE_COMMIT_RATIO = 0.28;
const SWIPE_MIN_DRAG_RATIO = 0.08;
const SWIPE_REVERSAL_MIN_RATIO = 0.008;
const SWIPE_OPPOSING_PEAK_RATIO = 0.01;
const SWIPE_SAME_DIR_RETRACE_RATIO = 0.02;
const SWIPE_RELEASE_OPPOSE_VELOCITY = 20;
const SWIPE_VELOCITY = 500;
const SWIPE_VELOCITY_MIN_RATIO = 0.12;
const SWIPE_PEAK_RETRACT_RATIO = 0.97;
const SWIPE_DURATION_MONTH = 240;
const SWIPE_DURATION_DAY = 200;

function releaseMatchesDirection(direction: "next" | "prev", velocityX: number): boolean {
  "worklet";
  if (direction === "next") return velocityX <= SWIPE_RELEASE_OPPOSE_VELOCITY;
  return velocityX >= -SWIPE_RELEASE_OPPOSE_VELOCITY;
}

function shouldCommitSwipeWorklet(
  translationX: number,
  peakAbsTranslation: number,
  peakNegative: number,
  peakPositive: number,
  width: number,
  velocityX: number,
  crossedCenter: boolean,
): "next" | "prev" | null {
  "worklet";
  const absNet = Math.abs(translationX);
  const progress = absNet / width;
  const peakProgress = peakAbsTranslation / width;
  const reversalMin = width * SWIPE_REVERSAL_MIN_RATIO;
  const dominantPeak = Math.max(peakNegative, peakPositive);
  const weakerPeak = Math.min(peakNegative, peakPositive);

  const hasOpposingTravel =
    crossedCenter
    || weakerPeak >= reversalMin
    || (dominantPeak >= reversalMin && weakerPeak > 0)
    || (dominantPeak > 0 && weakerPeak / dominantPeak >= SWIPE_OPPOSING_PEAK_RATIO);

  let sameDirRetrace = false;
  if (translationX < -reversalMin && peakNegative > reversalMin) {
    sameDirRetrace =
      (peakNegative + translationX) / peakNegative > SWIPE_SAME_DIR_RETRACE_RATIO;
  } else if (translationX > reversalMin && peakPositive > reversalMin) {
    sameDirRetrace =
      (peakPositive - translationX) / peakPositive > SWIPE_SAME_DIR_RETRACE_RATIO;
  }

  const gestureReversed = hasOpposingTravel || sameDirRetrace;

  if (progress < SWIPE_MIN_DRAG_RATIO) return null;

  // Any counter-movement during the gesture cancels — even a small wiggle back.
  if (gestureReversed) return null;

  // Pulled back from peak without staying past the commit line.
  if (
    peakProgress >= SWIPE_MIN_DRAG_RATIO
    && progress < SWIPE_COMMIT_RATIO
    && progress < peakProgress * SWIPE_PEAK_RETRACT_RATIO
  ) {
    return null;
  }

  const direction = translationX < 0 ? "next" : "prev";

  // Must release while still moving in the swipe direction (not while pulling back).
  if (!releaseMatchesDirection(direction, velocityX)) return null;

  if (progress >= SWIPE_COMMIT_RATIO) return direction;

  if (progress < peakProgress * SWIPE_PEAK_RETRACT_RATIO) return null;

  const minTravel = width * SWIPE_VELOCITY_MIN_RATIO;
  if (direction === "next" && velocityX < -SWIPE_VELOCITY && translationX < -minTravel) {
    return "next";
  }
  if (direction === "prev" && velocityX > SWIPE_VELOCITY && translationX > minTravel) {
    return "prev";
  }

  return null;
}

export type SwipeStripHandle = { resetToCenter: () => void };

function rubberBandWorklet(offset: number, min: number, max: number) {
  "worklet";
  if (offset > max) return max + (offset - max) * 0.18;
  if (offset < min) return min + (offset - min) * 0.18;
  return offset;
}

function buildSessionsByDay(sessions: CalendarSession[]) {
  const map = new Map<string, CalendarSession[]>();
  const seenByDay = new Map<string, Set<string>>();
  for (const s of sessions) {
    const k = sessionDateKeyFromDb(s.starts_at);
    let seen = seenByDay.get(k);
    if (!seen) {
      seen = new Set();
      seenByDay.set(k, seen);
    }
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    map.set(k, [...(map.get(k) ?? []), s]);
  }
  return map;
}

function getDaySessions(
  date: Date,
  byDay: Map<string, CalendarSession[]>,
  hiddenCategoryIds: Set<string>,
) {
  const k = format(date, "yyyy-MM-dd");
  return [...(byDay.get(k) ?? [])]
    .filter((s) => !s.category_id || !hiddenCategoryIds.has(s.category_id))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

const HorizontalSwipeStrip = forwardRef<
  SwipeStripHandle,
  {
    renderPrev: () => ReactNode;
    renderCurrent: () => ReactNode;
    renderNext: () => ReactNode;
    onCommitPrev: () => void;
    onCommitNext: () => void;
    onPreviewPrev?: () => void;
    onPreviewNext?: () => void;
    fill?: boolean;
    durationMs?: number;
    contentHeight?: number;
  }
>(function HorizontalSwipeStrip(
  {
    renderPrev,
    renderCurrent,
    renderNext,
    onCommitPrev,
    onCommitNext,
    onPreviewPrev,
    onPreviewNext,
    fill,
    durationMs = SWIPE_DURATION_MONTH,
    contentHeight,
  },
  ref,
) {
  const [layoutWidth, setLayoutWidth] = useState(SCREEN_W);
  const widthSV = useSharedValue(SCREEN_W);
  const translateX = useSharedValue(-SCREEN_W);
  const startX = useSharedValue(-SCREEN_W);
  const peakAbsTranslationSV = useSharedValue(0);
  const peakNegativeSV = useSharedValue(0);
  const peakPositiveSV = useSharedValue(0);
  const crossedCenterSV = useSharedValue(false);
  const lastTranslationSignSV = useSharedValue(0);
  const animatingRef = useRef(false);

  const onCommitPrevRef = useRef(onCommitPrev);
  const onCommitNextRef = useRef(onCommitNext);
  const onPreviewPrevRef = useRef(onPreviewPrev);
  const onPreviewNextRef = useRef(onPreviewNext);
  onCommitPrevRef.current = onCommitPrev;
  onCommitNextRef.current = onCommitNext;
  onPreviewPrevRef.current = onPreviewPrev;
  onPreviewNextRef.current = onPreviewNext;

  const durationMsSV = useSharedValue(durationMs);
  durationMsSV.value = durationMs;

  useEffect(() => {
    if (animatingRef.current) return;
    const center = -layoutWidth;
    widthSV.value = layoutWidth;
    translateX.value = center;
    startX.value = center;
  }, [layoutWidth, translateX, startX, widthSV]);

  const snapToCenter = useCallback(() => {
    animatingRef.current = false;
    const center = -layoutWidth;
    translateX.value = center;
    startX.value = center;
  }, [layoutWidth, translateX, startX]);

  useImperativeHandle(ref, () => ({ resetToCenter: snapToCenter }), [snapToCenter]);

  const setAnimating = useCallback((value: boolean) => {
    animatingRef.current = value;
  }, []);

  const completeNext = useCallback(() => {
    onCommitNextRef.current();
  }, []);

  const completePrev = useCallback(() => {
    onCommitPrevRef.current();
  }, []);

  const maybePreviewNext = useCallback(() => {
    onPreviewNextRef.current?.();
  }, []);

  const maybePreviewPrev = useCallback(() => {
    onPreviewPrevRef.current?.();
  }, []);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-14, 14])
        .failOffsetY([-12, 12])
        .onBegin(() => {
          cancelAnimation(translateX);
          startX.value = translateX.value;
          peakAbsTranslationSV.value = 0;
          peakNegativeSV.value = 0;
          peakPositiveSV.value = 0;
          crossedCenterSV.value = false;
          lastTranslationSignSV.value = 0;
        })
        .onUpdate((e) => {
          const w = widthSV.value;
          const tx = e.translationX;
          if (tx < 0) {
            peakNegativeSV.value = Math.max(peakNegativeSV.value, -tx);
          } else if (tx > 0) {
            peakPositiveSV.value = Math.max(peakPositiveSV.value, tx);
          }
          peakAbsTranslationSV.value = Math.max(peakAbsTranslationSV.value, Math.abs(tx));
          const sign = tx > 0 ? 1 : tx < 0 ? -1 : 0;
          if (sign !== 0) {
            if (lastTranslationSignSV.value !== 0 && sign !== lastTranslationSignSV.value) {
              crossedCenterSV.value = true;
            }
            lastTranslationSignSV.value = sign;
          }
          translateX.value = rubberBandWorklet(startX.value + tx, -2 * w, 0);
        })
        .onEnd((e) => {
          const w = widthSV.value;
          const center = -w;
          const dur = durationMsSV.value;
          const commit = shouldCommitSwipeWorklet(
            e.translationX,
            peakAbsTranslationSV.value,
            peakNegativeSV.value,
            peakPositiveSV.value,
            w,
            e.velocityX,
            crossedCenterSV.value,
          );
          const timing = { duration: dur, easing: REasing.out(REasing.cubic) };

          if (commit === "next") {
            runOnJS(setAnimating)(true);
            runOnJS(maybePreviewNext)();
            translateX.value = withTiming(-2 * w, timing, (finished) => {
              if (finished) runOnJS(completeNext)();
            });
            return;
          }
          if (commit === "prev") {
            runOnJS(setAnimating)(true);
            runOnJS(maybePreviewPrev)();
            translateX.value = withTiming(0, timing, (finished) => {
              if (finished) runOnJS(completePrev)();
            });
            return;
          }
          translateX.value = withTiming(center, timing);
        }),
    [
      completeNext,
      completePrev,
      crossedCenterSV,
      durationMsSV,
      lastTranslationSignSV,
      maybePreviewNext,
      maybePreviewPrev,
      peakAbsTranslationSV,
      peakNegativeSV,
      peakPositiveSV,
      setAnimating,
      startX,
      translateX,
      widthSV,
    ],
  );

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <View
        style={{
          overflow: "hidden",
          width: "100%",
          ...(contentHeight != null ? { height: contentHeight } : null),
          ...(fill ? { flex: 1 } : null),
        }}
        onLayout={(e) => {
          const nextWidth = e.nativeEvent.layout.width;
          if (nextWidth > 0 && Math.abs(nextWidth - layoutWidth) > 0.5) {
            setLayoutWidth(nextWidth);
          }
        }}
      >
        <Reanimated.View
          style={[
            {
              flexDirection: "row",
              alignItems: "flex-start",
              width: layoutWidth * 3,
              flex: fill ? 1 : undefined,
            },
            rowStyle,
          ]}
        >
          <View style={{ width: layoutWidth, alignSelf: "flex-start", flex: fill ? 1 : undefined }}>
            {renderPrev()}
          </View>
          <View style={{ width: layoutWidth, alignSelf: "flex-start", flex: fill ? 1 : undefined }}>
            {renderCurrent()}
          </View>
          <View style={{ width: layoutWidth, alignSelf: "flex-start", flex: fill ? 1 : undefined }}>
            {renderNext()}
          </View>
        </Reanimated.View>
      </View>
    </GestureDetector>
  );
});

function MonthGrid({
  month,
  selected,
  byDay,
  hiddenCategoryIds,
  onSelectDate,
  C,
  themeMode,
}: {
  month: Date;
  selected: Date;
  byDay: Map<string, CalendarSession[]>;
  hiddenCategoryIds: Set<string>;
  onSelectDate: (d: Date) => void;
  C: ThemeColors;
  themeMode: "dark" | "light";
}) {
  const selectedDayBg = themeMode === "dark" ? "#FFFFFF" : "#000000";
  const selectedDayText = themeMode === "dark" ? "#000000" : "#FFFFFF";
  const { allDays, leadingBlanks } = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    return {
      allDays: eachDayOfInterval({ start, end }),
      leadingBlanks: (getDay(start) + 6) % 7,
    };
  }, [month]);

  return (
    <>
      <View style={{ flexDirection: "row", paddingHorizontal: 8, paddingTop: CALENDAR_TOP_GAP, marginBottom: 2 }}>
        {WEEK_LABELS.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ color: C.secondary, fontSize: 12, fontWeight: "500" }}>{d}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8, paddingBottom: CALENDAR_BOTTOM_GAP }}>
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <View key={`blank-${i}`} style={cellStyle} />
        ))}
        {allDays.map((day) => {
          const k = format(day, "yyyy-MM-dd");
          const dots = getDaySessions(day, byDay, hiddenCategoryIds);
          const sel = isSameDay(day, selected);
          const todayDay = isToday(day);

          return (
            <Pressable key={k} onPress={() => onSelectDate(day)} style={cellStyle}>
              <View
                style={[
                  {
                    width: CALENDAR_SELECTED_DAY_SIZE,
                    height: CALENDAR_SELECTED_DAY_SIZE,
                    borderRadius: CALENDAR_SELECTED_DAY_RADIUS,
                    alignItems: "center",
                    justifyContent: "center",
                  },
                  sel && { backgroundColor: selectedDayBg },
                ]}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: todayDay && !sel ? "700" : sel ? "600" : "400",
                    color: sel ? selectedDayText : todayDay ? C.today : C.text,
                  }}
                >
                  {format(day, "d")}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 2, marginTop: 3, height: 5 }}>
                {dots.slice(0, 3).map((s) => (
                  <View
                    key={s.id}
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: sel ? (themeMode === "dark" ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.7)") : (s.color ?? C.accent),
                    }}
                  />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const MonthCalendarPanel = memo(function MonthCalendarPanel({
  month,
  selected,
  byDay,
  hiddenCategoryIds,
  onSelectDate,
  C,
  themeMode,
}: {
  month: Date;
  selected: Date;
  byDay: Map<string, CalendarSession[]>;
  hiddenCategoryIds: Set<string>;
  onSelectDate: (d: Date) => void;
  C: ThemeColors;
  themeMode: "dark" | "light";
}) {
  return (
    <MonthGrid
      month={month}
      selected={selected}
      byDay={byDay}
      hiddenCategoryIds={hiddenCategoryIds}
      onSelectDate={onSelectDate}
      C={C}
      themeMode={themeMode}
    />
  );
});

function MonthNavHeader({
  month,
  onOpenActivities,
  C,
}: {
  month: Date;
  onOpenActivities: () => void;
  C: ThemeColors;
}) {
  return (
    <>
      <PageHeader
        style={{ borderBottomWidth: 0 }}
        trailing={(
          <PageHeaderControl>
            <Pressable
              onPress={onOpenActivities}
              hitSlop={10}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}
            >
              <Menu size={22} color={C.text} />
            </Pressable>
          </PageHeaderControl>
        )}
      >
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text
            style={{
              color: C.text,
              fontSize: 17,
              fontWeight: "600",
              letterSpacing: -0.3,
              textAlign: "center",
            }}
          >
            {format(month, "MMMM yyyy")}
          </Text>
        </View>
      </PageHeader>
      <View style={calendarNavDividerStyle(C.separator)} />
    </>
  );
}

const DaySessionsPanel = memo(function DaySessionsPanel({
  date,
  sessions,
  isLoading,
  onEditSession,
  C,
}: {
  date: Date;
  sessions: CalendarSession[];
  isLoading: boolean;
  onEditSession: (s: CalendarSession) => void;
  C: ThemeColors;
}) {
  const dayLabel = isToday(date) ? "Today" : format(date, "EEEE, MMMM d");

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <Text
          style={{
            color: C.secondary,
            fontSize: 12,
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {dayLabel}
        </Text>
      </View>
      {isLoading && sessions.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", paddingTop: 32 }}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : (
        <SessionScrollView sessions={sessions} onEditSession={onEditSession} C={C} />
      )}
    </View>
  );
});

function CalendarContent({
  userId,
  teamId,
  selected,
  onSelectDate,
  month,
  onChangeMonth,
  categories,
  onOpenSheet,
  onEditSession,
  onOpenActivities,
  onSessionsAreaHeight,
  onCalendarAreaHeight,
}: {
  userId: string;
  teamId: string | null;
  selected: Date;
  onSelectDate: (d: Date) => void;
  month: Date;
  onChangeMonth: (m: Date) => void;
  categories: UserCategory[];
  onOpenSheet: () => void;
  onEditSession: (s: CalendarSession) => void;
  onOpenActivities: () => void;
  onSessionsAreaHeight: (h: number) => void;
  onCalendarAreaHeight: (h: number) => void;
}) {
  const { C, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const monthRef = useRef(month);
  const selectedRef = useRef(selected);
  monthRef.current = month;
  selectedRef.current = selected;

  const monthStripRef = useRef<SwipeStripHandle>(null);
  const sessionStripRef = useRef<SwipeStripHandle>(null);
  const monthSwipePendingResetRef = useRef(false);
  const sessionSwipePendingResetRef = useRef(false);

  const [sessionCarouselDay, setSessionCarouselDay] = useState(selected);
  const sessionSwipeAnimatingRef = useRef(false);

  useEffect(() => {
    if (!sessionSwipeAnimatingRef.current) {
      setSessionCarouselDay(selected);
    }
  }, [selected]);

  useLayoutEffect(() => {
    if (!monthSwipePendingResetRef.current) return;
    monthSwipePendingResetRef.current = false;
    monthStripRef.current?.resetToCenter();
  }, [month]);

  useLayoutEffect(() => {
    if (!sessionSwipePendingResetRef.current) return;
    sessionSwipePendingResetRef.current = false;
    sessionStripRef.current?.resetToCenter();
  }, [sessionCarouselDay]);

  const prevMonth = useMemo(() => subMonths(month, 1), [month]);
  const nextMonth = useMemo(() => addMonths(month, 1), [month]);
  const carouselPrevDay = useMemo(() => subDays(sessionCarouselDay, 1), [sessionCarouselDay]);
  const carouselNextDay = useMemo(() => addDays(sessionCarouselDay, 1), [sessionCarouselDay]);
  const prevDayMonth = useMemo(() => startOfMonth(carouselPrevDay), [carouselPrevDay]);
  const nextDayMonth = useMemo(() => startOfMonth(carouselNextDay), [carouselNextDay]);

  const { data: prevSessions = [] } = useCalendarSessions(userId, prevMonth, teamId);
  const { data: sessions = [], isLoading } = useCalendarSessions(userId, month, teamId);
  const { data: nextSessions = [] } = useCalendarSessions(userId, nextMonth, teamId);
  const { data: prevDayMonthSessions = [] } = useCalendarSessions(userId, prevDayMonth, teamId);
  const { data: nextDayMonthSessions = [] } = useCalendarSessions(userId, nextDayMonth, teamId);

  const hiddenCategoryIds = useMemo(
    () => new Set(categories.filter((c) => c.hidden).map((c) => c.id)),
    [categories],
  );

  const byDay = useMemo(
    () =>
      buildSessionsByDay([
        ...prevSessions,
        ...sessions,
        ...nextSessions,
        ...prevDayMonthSessions,
        ...nextDayMonthSessions,
      ]),
    [prevSessions, sessions, nextSessions, prevDayMonthSessions, nextDayMonthSessions],
  );

  const carouselDaySessions = useMemo(
    () => getDaySessions(sessionCarouselDay, byDay, hiddenCategoryIds),
    [sessionCarouselDay, byDay, hiddenCategoryIds],
  );
  const prevDaySessions = useMemo(
    () => getDaySessions(carouselPrevDay, byDay, hiddenCategoryIds),
    [carouselPrevDay, byDay, hiddenCategoryIds],
  );
  const nextDaySessions = useMemo(
    () => getDaySessions(carouselNextDay, byDay, hiddenCategoryIds),
    [carouselNextDay, byDay, hiddenCategoryIds],
  );

  const goToPrevMonth = () => {
    monthSwipePendingResetRef.current = true;
    onChangeMonth(subMonths(monthRef.current, 1));
  };
  const goToNextMonth = () => {
    monthSwipePendingResetRef.current = true;
    onChangeMonth(addMonths(monthRef.current, 1));
  };

  const previewPrevDay = () => {
    sessionSwipeAnimatingRef.current = true;
    const prev = subDays(selectedRef.current, 1);
    onSelectDate(prev);
    if (!isSameMonth(prev, monthRef.current)) onChangeMonth(startOfMonth(prev));
  };
  const previewNextDay = () => {
    sessionSwipeAnimatingRef.current = true;
    const next = addDays(selectedRef.current, 1);
    onSelectDate(next);
    if (!isSameMonth(next, monthRef.current)) onChangeMonth(startOfMonth(next));
  };
  const syncSessionCarousel = () => {
    sessionSwipeAnimatingRef.current = false;
    sessionSwipePendingResetRef.current = true;
    setSessionCarouselDay(selectedRef.current);
  };

  const monthPanelProps = {
    selected,
    byDay,
    hiddenCategoryIds,
    onSelectDate,
    C,
    themeMode: mode,
  };

  const monthPrevPanel = useMemo(
    () => <MonthCalendarPanel month={prevMonth} {...monthPanelProps} />,
    [prevMonth, selected, byDay, hiddenCategoryIds, onSelectDate, C, mode],
  );
  const monthCurrentPanel = useMemo(
    () => <MonthCalendarPanel month={month} {...monthPanelProps} />,
    [month, selected, byDay, hiddenCategoryIds, onSelectDate, C, mode],
  );
  const monthNextPanel = useMemo(
    () => <MonthCalendarPanel month={nextMonth} {...monthPanelProps} />,
    [nextMonth, selected, byDay, hiddenCategoryIds, onSelectDate, C, mode],
  );

  const sessionPrevPanel = useMemo(
    () => (
      <DaySessionsPanel
        date={carouselPrevDay}
        sessions={prevDaySessions}
        isLoading={false}
        onEditSession={onEditSession}
        C={C}
      />
    ),
    [carouselPrevDay, prevDaySessions, onEditSession, C],
  );
  const sessionCurrentPanel = useMemo(
    () => (
      <DaySessionsPanel
        date={sessionCarouselDay}
        sessions={carouselDaySessions}
        isLoading={
          isLoading &&
          carouselDaySessions.length === 0 &&
          isSameMonth(sessionCarouselDay, month)
        }
        onEditSession={onEditSession}
        C={C}
      />
    ),
    [sessionCarouselDay, carouselDaySessions, isLoading, month, onEditSession, C],
  );
  const sessionNextPanel = useMemo(
    () => (
      <DaySessionsPanel
        date={carouselNextDay}
        sessions={nextDaySessions}
        isLoading={false}
        onEditSession={onEditSession}
        C={C}
      />
    ),
    [carouselNextDay, nextDaySessions, onEditSession, C],
  );

  const monthGridHeight = useMemo(() => getMonthGridHeight(month), [month]);

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => onCalendarAreaHeight(e.nativeEvent.layout.height)}
    >
      <MonthNavHeader month={month} onOpenActivities={onOpenActivities} C={C} />
      <HorizontalSwipeStrip
        ref={monthStripRef}
        contentHeight={monthGridHeight}
        durationMs={SWIPE_DURATION_MONTH}
        onCommitPrev={goToPrevMonth}
        onCommitNext={goToNextMonth}
        renderPrev={() => monthPrevPanel}
        renderCurrent={() => monthCurrentPanel}
        renderNext={() => monthNextPanel}
      />

      <View style={calendarNavDividerStyle(C.separator)} />

      <View
        style={{ flex: 1, position: "relative" }}
        onLayout={(e) => onSessionsAreaHeight(e.nativeEvent.layout.height)}
      >
        <HorizontalSwipeStrip
          ref={sessionStripRef}
          fill
          durationMs={SWIPE_DURATION_DAY}
          onPreviewPrev={previewPrevDay}
          onPreviewNext={previewNextDay}
          onCommitPrev={syncSessionCarousel}
          onCommitNext={syncSessionCarousel}
          renderPrev={() => sessionPrevPanel}
          renderCurrent={() => sessionCurrentPanel}
          renderNext={() => sessionNextPanel}
        />

        <PrimaryButton
          label="Add session"
          onPress={onOpenSheet}
          floating
          floatingBottomInset={bottomTabBarHeight(insets.bottom)}
          backgroundColor="#000000"
          icon={<Plus size={18} color="#ffffff" />}
        />
      </View>
    </View>
  );
}

// ─── sign-in / sign-up / otp ───────────────────────────────────────────────────
type AuthMode = "signin" | "signup" | "otp";

function SignInView() {
  const { signIn, signUp, activateSession } = useAuth();
  const { C } = useTheme();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [otpAttemptId, setOtpAttemptId] = useState<string | null>(null);
  const [pendingAccessToken, setPendingAccessToken] = useState<string | null>(null);
  const [pendingRefreshToken, setPendingRefreshToken] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [otpResendIn, setOtpResendIn] = useState(0);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const otpRefs = useRef<Array<TextInput | null>>([null, null, null, null, null, null]);

  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  useEffect(() => {
    if (otpResendIn <= 0) return;
    const t = setTimeout(() => setOtpResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [otpResendIn]);

  const inputStyle = {
    backgroundColor: C.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: C.text,
    fontSize: 16,
  } as const;

  const emailInputStyle = { ...inputStyle, backgroundColor: C.inputBg };

  async function handleSignIn() {
    if (!email || !password) return;
    setBusy(true);
    setError(null);
    const result = await signIn(email.trim(), password);
    setBusy(false);
    if (result.error) { setError(result.error); return; }
    if (result.needsOtpVerification && result.userId && result._pendingAccessToken && result._pendingRefreshToken) {
      Keyboard.dismiss();
      setPendingAccessToken(result._pendingAccessToken);
      setPendingRefreshToken(result._pendingRefreshToken);
      setPendingUserId(result.userId);
      setOtpDigits(["", "", "", "", "", ""]);
      setOtpError(null);
      setOtpAttemptId(null);
      setOtpSending(true);
      setMode("otp");
      void sendOtp(email.trim(), result.userId, result._pendingAccessToken);
    }
  }

  async function handleSignUp() {
    if (!email || !password || !confirmPassword) return;
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    Keyboard.dismiss();
    setOtpDigits(["", "", "", "", "", ""]);
    setOtpError(null);
    setOtpAttemptId(null);
    setOtpSending(true);
    setMode("otp");

    const result = await signUp({ email: email.trim(), password });
    if (result.error) { setOtpError(result.error); setOtpSending(false); return; }
    if (result.needsEmailConfirmation) {
      setOtpError("Check your email to confirm your account.");
      setOtpSending(false);
      return;
    }
    if (result.needsOtpVerification && result.userId) {
      const access = result._pendingAccessToken ?? "";
      const refresh = result._pendingRefreshToken ?? "";
      setPendingAccessToken(access);
      setPendingRefreshToken(refresh);
      setPendingUserId(result.userId);
      void sendOtp(email.trim(), result.userId, access);
    }
  }

  async function sendOtp(destEmail: string, userId: string, accessToken: string) {
    setOtpSending(true);
    setOtpError(null);
    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
      const res = await fetch(`${supabaseUrl}/functions/v1/send-verification-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "apikey": supabaseAnonKey,
        },
        body: JSON.stringify({
          channel: "email",
          destination: destEmail,
          target_kind: "account_signup",
          target_id: userId,
          target_meta: {},
        }),
      });
      const payload = await res.json().catch(() => ({})) as { error?: string; attempt_id?: string; masked?: string };
      if (payload?.error) throw new Error(payload.error);
      if (!payload?.attempt_id) throw new Error("Failed to send code");
      setOtpAttemptId(payload.attempt_id);
      if (payload.masked) setMaskedEmail(payload.masked);
      setOtpResendIn(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (e) {
      setOtpError((e as Error).message || "Failed to send code");
    } finally {
      setOtpSending(false);
    }
  }

  async function verifyOtp(codeStr?: string) {
    const code = codeStr ?? otpDigits.join("");
    if (code.length !== 6 || !otpAttemptId || !pendingAccessToken) return;
    setOtpVerifying(true);
    setOtpError(null);
    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
      const res = await fetch(`${supabaseUrl}/functions/v1/verify-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${pendingAccessToken}`,
          "apikey": supabaseAnonKey,
        },
        body: JSON.stringify({ attempt_id: otpAttemptId, code }),
      });
      const payload = await res.json().catch(() => ({})) as { error?: string; ok?: boolean };
      if (payload?.error) throw new Error(payload.error);
      if (pendingRefreshToken) {
        await activateSession(pendingAccessToken, pendingRefreshToken);
      }
    } catch (e) {
      setOtpError((e as Error).message || "Verification failed");
      setOtpDigits(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
      setOtpVerifying(false);
    }
  }

  // ── sign-in screen ─────────────────────────────────────────────────────────
  if (mode === "signin") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 32, gap: 16 }}>
            <Text style={{ color: C.text, fontSize: 28, fontWeight: "700", letterSpacing: -0.5, marginBottom: 8 }}>
              Calendar
            </Text>
            <View style={{ gap: 10 }}>
              <TextInput
                style={emailInputStyle}
                placeholder="Email"
                placeholderTextColor={C.secondary}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
              <TextInput
                ref={passwordRef}
                style={inputStyle}
                placeholder="Password"
                placeholderTextColor={C.secondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
              />
            </View>
            {error ? (
              <Text style={{ color: C.danger, fontSize: 13, textAlign: "center", marginTop: 4 }}>{error}</Text>
            ) : null}
            <Pressable
              onPress={handleSignIn}
              disabled={busy || !email || !password}
              style={({ pressed }) => ({
                backgroundColor: "#ffffff", borderRadius: 12, paddingVertical: 14,
                alignItems: "center", marginTop: 8,
                opacity: pressed || busy || !email || !password ? 0.5 : 1,
              })}
            >
              {busy ? <ActivityIndicator color="#000000" /> : (
                <Text style={{ color: "#000000", fontWeight: "600", fontSize: 16 }}>Sign in</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => { setError(null); setMode("signup"); }}
              style={{ alignItems: "center", paddingTop: 12 }}
            >
              <Text style={{ color: C.secondary, fontSize: 14 }}>Sign up</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── sign-up screen ─────────────────────────────────────────────────────────
  if (mode === "signup") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 32, paddingVertical: 48 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={{ color: C.text, fontSize: 28, fontWeight: "700", letterSpacing: -0.5, marginBottom: 24 }}>
              Create account
            </Text>
            <View style={{ gap: 10, marginBottom: 24 }}>
              <TextInput
                style={emailInputStyle}
                placeholder="Email"
                placeholderTextColor={C.secondary}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                textContentType="username"
                autoComplete="username"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
              <TextInput
                ref={passwordRef}
                style={inputStyle}
                placeholder="Password"
                placeholderTextColor={C.secondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="newPassword"
                autoComplete="new-password"
                returnKeyType="next"
                onSubmitEditing={() => confirmPasswordRef.current?.focus()}
              />
              <TextInput
                ref={confirmPasswordRef}
                style={inputStyle}
                placeholder="Confirm password"
                placeholderTextColor={C.secondary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                textContentType="newPassword"
                autoComplete="new-password"
                returnKeyType="done"
                onSubmitEditing={handleSignUp}
              />
            </View>
            {error ? <Text style={{ color: C.danger, fontSize: 13, marginBottom: 14 }}>{error}</Text> : null}
            <Pressable
              onPress={handleSignUp}
              disabled={!email || !password || !confirmPassword}
              style={({ pressed }) => ({
                backgroundColor: "#ffffff", borderRadius: 12, paddingVertical: 14, alignItems: "center",
                opacity: pressed || !email || !password || !confirmPassword ? 0.5 : 1,
              })}
            >
              <Text style={{ color: "#000000", fontWeight: "600", fontSize: 16 }}>Send verification code</Text>
            </Pressable>
            <Pressable
              onPress={() => { setError(null); setMode("signin"); }}
              style={{ alignItems: "center", paddingTop: 28, paddingBottom: 8 }}
            >
              <Text style={{ color: C.secondary, fontSize: 14 }}>Back to sign in</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── otp screen ─────────────────────────────────────────────────────────────
  const sendingInitial = otpSending && !otpAttemptId;
  const displayEmail = maskedEmail ?? email;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 32, gap: 28 }}>
          <View style={{ gap: 8 }}>
            <Text style={{ color: C.text, fontSize: 24, fontWeight: "700", letterSpacing: -0.5 }}>
              Verify your email
            </Text>
            <Text style={{ color: C.secondary, fontSize: 14, lineHeight: 20 }}>
              {sendingInitial
                ? "Sending a 6-digit code to your email address…"
                : `We sent a 6-digit code to ${displayEmail}. Enter it below.`}
            </Text>
          </View>

          {sendingInitial ? (
            <View style={{ alignItems: "center", paddingVertical: 20 }}>
              <ActivityIndicator color={C.accent} size="large" />
            </View>
          ) : (
            <OtpInputs
              digits={otpDigits}
              setDigits={setOtpDigits}
              refs={otpRefs}
              verifying={otpVerifying}
              sending={otpSending}
              onComplete={verifyOtp}
              C={C}
            />
          )}

          {otpError ? (
            <Text style={{ color: C.danger, fontSize: 13, textAlign: "center" }}>{otpError}</Text>
          ) : null}

          {!sendingInitial && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Pressable
                onPress={() => {
                  if (otpResendIn > 0 || otpSending || !pendingAccessToken || !pendingUserId) return;
                  void sendOtp(email, pendingUserId, pendingAccessToken);
                }}
                disabled={otpResendIn > 0 || otpSending}
              >
                <Text style={{
                  fontSize: 13,
                  color: otpResendIn > 0 || otpSending ? C.secondary : C.accent,
                  textDecorationLine: otpResendIn > 0 || otpSending ? "none" : "underline",
                }}>
                  {otpSending ? "Sending…" : otpResendIn > 0 ? `Resend in ${otpResendIn}s` : "Resend code"}
                </Text>
              </Pressable>
              <Text style={{ color: C.secondary, fontSize: 12 }}>Check your spam folder.</Text>
            </View>
          )}

          {!sendingInitial && (
            <Pressable
              onPress={() => verifyOtp()}
              disabled={otpVerifying || otpSending || otpDigits.some((d) => !d)}
              style={({ pressed }) => ({
                backgroundColor: C.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center",
                opacity: pressed || otpVerifying || otpSending || otpDigits.some((d) => !d) ? 0.5 : 1,
              })}
            >
              {otpVerifying ? <ActivityIndicator color="#fff" /> : (
                <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Verify</Text>
              )}
            </Pressable>
          )}

          <Pressable
            onPress={() => {
              setMode("signin");
              setOtpDigits(["", "", "", "", "", ""]);
              setOtpError(null);
              setOtpAttemptId(null);
              setMaskedEmail(null);
              setPendingAccessToken(null);
              setPendingRefreshToken(null);
              setPendingUserId(null);
            }}
            style={{ alignItems: "center", paddingTop: sendingInitial ? 8 : 0 }}
          >
            <Text style={{ color: C.secondary, fontSize: 14 }}>← Back to sign in</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── otp digit inputs ──────────────────────────────────────────────────────────
function OtpInputs({
  digits, setDigits, refs, verifying, sending, onComplete, C,
}: {
  digits: string[];
  setDigits: (d: string[]) => void;
  refs: React.MutableRefObject<Array<TextInput | null>>;
  verifying: boolean;
  sending: boolean;
  onComplete: (code: string) => void;
  C: ThemeColors;
}) {
  function handleChange(i: number, v: string) {
    const clean = v.replace(/\D/g, "");
    if (!clean) {
      const next = [...digits]; next[i] = ""; setDigits(next); return;
    }
    if (clean.length > 1) {
      const chars = clean.slice(0, 6).split("");
      const next = ["", "", "", "", "", ""];
      chars.forEach((c, idx) => { next[idx] = c; });
      setDigits(next);
      const lastIdx = Math.min(chars.length, 6) - 1;
      refs.current[lastIdx]?.focus();
      if (chars.length >= 6) onComplete(next.join(""));
      return;
    }
    const next = [...digits]; next[i] = clean[0]; setDigits(next);
    if (i < 5) refs.current[i + 1]?.focus();
    if (i === 5 && next.every((d) => d)) onComplete(next.join(""));
  }

  function handleKeyPress(i: number, e: { nativeEvent: { key: string } }) {
    if (e.nativeEvent.key === "Backspace" && !digits[i] && i > 0) {
      const next = [...digits]; next[i - 1] = ""; setDigits(next);
      refs.current[i - 1]?.focus();
    }
  }

  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {digits.map((d, i) => (
        <TextInput
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          style={{
            flex: 1, height: 56, borderRadius: 12,
            backgroundColor: C.card, color: C.text,
            fontSize: 22, fontWeight: "600", textAlign: "center",
          }}
          value={d}
          onChangeText={(v) => handleChange(i, v)}
          onKeyPress={(e) => handleKeyPress(i, e)}
          keyboardType="number-pad"
          maxLength={6}
          textContentType="oneTimeCode"
          editable={!verifying && !sending}
          selectTextOnFocus
        />
      ))}
    </View>
  );
}

// ─── session row ───────────────────────────────────────────────────────────────
function SessionRow({ session, onPress }: { session: CalendarSession; onPress: () => void }) {
  const { C } = useTheme();
  const color = session.color || C.accent;
  const startTime = session.all_day ? "All day" : format(sessionTimeFromDb(session.starts_at), "HH:mm");
  const endTime = session.all_day ? null : format(sessionTimeFromDb(session.ends_at), "HH:mm");

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}>
      <View style={{ flexDirection: "row", backgroundColor: C.card, borderRadius: 10, overflow: "hidden" }}>
        <View style={{ width: 4, backgroundColor: color }} />
        <View style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 3 }}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: "500" }} numberOfLines={1}>
            {session.title}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Text style={{ color: C.secondary, fontSize: 13 }}>
              {endTime ? `${startTime} – ${endTime}` : startTime}
            </Text>
            {session.distance_km != null && (
              <Text style={{ color: C.secondary, fontSize: 13 }}>
                {session.distance_km % 1 === 0 ? `${session.distance_km} km` : `${session.distance_km.toFixed(1)} km`}
              </Text>
            )}
            {!!session.sport_type && (
              <Text style={{ color: C.secondary, fontSize: 13, textTransform: "capitalize" }}>
                {session.sport_type.replace(/_/g, " ")}
              </Text>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── session sheet ─────────────────────────────────────────────────────────────
type SessionGroupOption = {
  id: string | null;
  label: string;
  deleted: boolean;
  selectable: boolean;
};

interface SessionSheetProps {
  visible: boolean;
  session: CalendarSession | null;
  selectedDate: Date;
  userId: string;
  teamId: string | null;
  teamOwnerId: string | null;
  teamName?: string;
  groups: TeamGroup[];
  members: TeamInviteMember[];
  categories: UserCategory[];
  onClose: () => void;
  bottomInset: number;
  maxHeight: number;
}

function SessionSheet({
  visible, session, selectedDate, userId, teamId, teamOwnerId, teamName, groups, members, categories, onClose, bottomInset, maxHeight,
}: SessionSheetProps) {
  const { C } = useTheme();
  const maxHeightRef = useRef(maxHeight);
  maxHeightRef.current = maxHeight;

  const sheetAnim = useRef(new Animated.Value(maxHeight + 20)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const panResponder = useRef(
    createSheetDismissPanResponder({
      slideAnim: sheetAnim,
      backdropAnim,
      getHeight: () => maxHeightRef.current,
      dismissOffset: 20,
      onDismiss: () => onCloseRef.current(),
    }),
  ).current;

  const [title, setTitle] = useState("");
  const [sessionDate, setSessionDate] = useState(() => new Date());
  const [description, setDescription] = useState("");
  const [fromTime, setFromTime] = useState(() => { const d = new Date(); d.setHours(9, 0, 0, 0); return d; });
  const [toTime, setToTime] = useState(() => { const d = new Date(); d.setHours(10, 0, 0, 0); return d; });
  const [allDay, setAllDay] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => startOfMonth(new Date()));
  const [groupDropdownTop, setGroupDropdownTop] = useState<number | null>(null);
  const [dateDropdownLayout, setDateDropdownLayout] = useState<{ top: number; height: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [teamSessionTab, setTeamSessionTab] = useState<TeamSessionTab>("about");
  const [participantSearchQuery, setParticipantSearchQuery] = useState("");
  const [participantSearchActive, setParticipantSearchActive] = useState(false);
  const participantSearchModeAnim = useRef(new Animated.Value(0)).current;
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [titleFocusOnOpen, setTitleFocusOnOpen] = useState(false);
  const [archivedSessionGroup, setArchivedSessionGroup] = useState<{ id: string; name: string } | null>(
    null,
  );

  const sheetBodyRef = useRef<View>(null);
  const groupTriggerRef = useRef<View>(null);
  const dateTriggerRef = useRef<View>(null);
  const descriptionInputRef = useRef<TextInput>(null);
  const titleInputRef = useRef<TextInput>(null);
  /** True while the user has unsaved description edits — remote must not clobber. */
  const descriptionDirtyRef = useRef(false);
  const lastSyncedRemoteDescriptionRef = useRef<string | null>(null);
  const descriptionValueRef = useRef("");
  /** Last remote snapshot applied to the form — avoids echo loops on save. */
  const lastRemoteSnapshotRef = useRef<ReturnType<typeof liveSessionSnapshot> | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveInFlightRef = useRef(false);
  const autosavePromiseRef = useRef<Promise<void> | null>(null);
  const flushAutosaveRef = useRef<() => Promise<void>>(async () => {});
  const flushSessionSaveRef = useRef<() => Promise<void>>(async () => {});

  const requireCategory = !!teamId;
  const hideBelowDateOverlay = dateMenuOpen;
  const pickerHeight = PICKER_HEIGHT;
  const pickerFadeH = PICKER_FADE_H;

  const groupOptions = useMemo((): SessionGroupOption[] => {
    if (!requireCategory || !teamName) return [];
    const opts: SessionGroupOption[] = [
      { id: null, label: teamName, deleted: false, selectable: true },
      ...groups.map((g) => ({
        id: g.id,
        label: g.name,
        deleted: false,
        selectable: true,
      })),
    ];
    if (
      archivedSessionGroup
      && !groups.some((g) => g.id === archivedSessionGroup.id)
    ) {
      opts.push({
        id: archivedSessionGroup.id,
        label: archivedSessionGroup.name,
        deleted: true,
        selectable: true,
      });
    }
    return opts;
  }, [requireCategory, teamName, groups, archivedSessionGroup]);

  const selectedGroupLabel =
    groupOptions.find((o) => o.id === groupId)?.label ?? teamName ?? "Team";

  const acceptedMembers = useMemo(
    () => members.filter((member) => member.status === "active"),
    [members],
  );

  const filteredParticipants = useMemo(
    () => filterAcceptedMembers(members, participantSearchQuery),
    [members, participantSearchQuery],
  );

  useEffect(() => {
    if (!participantSearchActive) return;
    Animated.spring(participantSearchModeAnim, {
      toValue: 1,
      useNativeDriver: false,
      damping: 24,
      stiffness: 280,
      overshootClamping: true,
    }).start();
  }, [participantSearchActive, participantSearchModeAnim]);

  const activateParticipantSearch = useCallback(() => {
    setParticipantSearchActive(true);
  }, []);

  const exitParticipantSearch = useCallback(() => {
    Keyboard.dismiss();
    Animated.timing(participantSearchModeAnim, {
      toValue: 0,
      duration: 340,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) return;
      setParticipantSearchQuery("");
      setParticipantSearchActive(false);
    });
  }, [participantSearchModeAnim]);

  const resetParticipantSearch = useCallback(() => {
    participantSearchModeAnim.setValue(0);
    setParticipantSearchQuery("");
    setParticipantSearchActive(false);
  }, [participantSearchModeAnim]);

  const showParticipantRows =
    !participantSearchActive || participantSearchQuery.trim().length > 0;

  const visibleParticipants = useMemo(() => {
    if (!showParticipantRows) return [];
    if (participantSearchQuery.trim()) return filteredParticipants;
    return acceptedMembers;
  }, [
    acceptedMembers,
    filteredParticipants,
    participantSearchQuery,
    showParticipantRows,
  ]);

  const groupDropdownHeight = useMemo(
    () =>
      SESSION_FIELD_HEIGHT
      * (1 + Math.min(groupOptions.length, GROUP_DROPDOWN_MAX_ROWS)),
    [groupOptions.length],
  );

  const groupDropdownListHeight = useMemo(
    () => SESSION_FIELD_HEIGHT * Math.min(groupOptions.length, GROUP_DROPDOWN_MAX_ROWS),
    [groupOptions.length],
  );

  function measureDropdown(
    triggerRef: RefObject<View | null>,
    onMeasured: (layout: { top: number; height: number }) => void,
  ) {
    const sheet = sheetBodyRef.current;
    const trigger = triggerRef.current;
    if (!sheet || !trigger) {
      onMeasured({ top: 0, height: 0 });
      return;
    }
    trigger.measureLayout(
      sheet,
      (_x, triggerY) => {
        sheet.measure((_sx, _sy, _sw, sheetHeight) => {
          onMeasured({
            top: triggerY,
            height: Math.max(0, sheetHeight - triggerY - GROUP_DROPDOWN_BOTTOM_GAP),
          });
        });
      },
      () => onMeasured({ top: 0, height: 0 }),
    );
  }

  function measureGroupDropdownTop(onMeasured: (top: number) => void) {
    const sheet = sheetBodyRef.current;
    const trigger = groupTriggerRef.current;
    if (!sheet || !trigger) {
      onMeasured(0);
      return;
    }
    trigger.measureLayout(
      sheet,
      (_x, triggerY) => onMeasured(triggerY),
      () => onMeasured(0),
    );
  }

  function measureDateDropdown(onMeasured: (layout: { top: number; height: number }) => void) {
    measureDropdown(dateTriggerRef, (layout) => {
      onMeasured({
        top: layout.top + SESSION_FIELD_HEIGHT,
        height: Math.max(0, layout.height - SESSION_FIELD_HEIGHT),
      });
    });
  }

  function toggleGroupMenu() {
    dismissKeyboard();
    if (groupMenuOpen) {
      setGroupMenuOpen(false);
      return;
    }
    setDateMenuOpen(false);
    measureGroupDropdownTop((top) => {
      setGroupDropdownTop(top);
      setGroupMenuOpen(true);
    });
  }

  function toggleDateMenu() {
    dismissKeyboard();
    if (dateMenuOpen) {
      setDateMenuOpen(false);
      return;
    }
    setGroupMenuOpen(false);
    setPickerMonth(startOfMonth(sessionDate));
    measureDateDropdown((layout) => {
      setDateDropdownLayout(layout);
      setDateMenuOpen(true);
    });
  }

  const visibleCategories = useMemo(
    () => categories.filter((c) => {
      if (c.hidden) return false;
      if (!requireCategory) return true;
      return (c.app_group_id ?? null) === groupId;
    }),
    [categories, requireCategory, groupId],
  );

  const dismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  const selectTeamSessionTab = useCallback((tab: TeamSessionTab) => {
    setTeamSessionTab(tab);
  }, []);

  const prevTeamSessionTabRef = useRef<TeamSessionTab | null>(null);

  useEffect(() => {
    if (!visible) {
      prevTeamSessionTabRef.current = null;
      resetParticipantSearch();
    }
  }, [resetParticipantSearch, visible]);

  useEffect(() => {
    if (teamSessionTab === "participants") return;
    resetParticipantSearch();
  }, [resetParticipantSearch, teamSessionTab]);

  useEffect(() => {
    if (!requireCategory || !visible) return;
    if (prevTeamSessionTabRef.current === null) {
      prevTeamSessionTabRef.current = teamSessionTab;
      return;
    }
    if (prevTeamSessionTabRef.current === teamSessionTab) return;
    prevTeamSessionTabRef.current = teamSessionTab;
    setGroupMenuOpen(false);
    setDateMenuOpen(false);
    setTitleFocusOnOpen(false);
    if (teamSessionTab !== "description") {
      InteractionManager.runAfterInteractions(() => {
        dismissKeyboard();
      });
    }
  }, [dismissKeyboard, requireCategory, teamSessionTab, visible]);

  const handleDescriptionChange = useCallback((text: string) => {
    descriptionDirtyRef.current = true;
    setDescription(text.slice(0, SESSION_DESCRIPTION_MAX_LENGTH));
  }, []);

  useEffect(() => {
    descriptionValueRef.current = description;
  }, [description]);

  const descriptionTabActive = requireCategory && teamSessionTab === "description";

  useEffect(() => {
    if (descriptionTabActive) return;
    const task = InteractionManager.runAfterInteractions(() => {
      setKeyboardHeight(0);
    });
    return () => task.cancel?.();
  }, [descriptionTabActive]);

  useEffect(() => {
    if (!descriptionTabActive) return;
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (e) => {
      LayoutAnimation.configureNext({
        duration: Platform.OS === "ios" ? e.duration ?? 250 : 250,
        update: { type: LayoutAnimation.Types.easeInEaseOut },
      });
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [descriptionTabActive]);

  useEffect(() => {
    if (!descriptionTabActive) return;
    const timer = setTimeout(() => descriptionInputRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [descriptionTabActive]);

  const createSession = useCreateSession(userId, teamId);
  const updateSession = useUpdateSession(userId, teamId);
  const deleteSession = useDeleteSession(userId, teamId);
  const liveSession = useLiveCalendarSession(userId, teamId, session);
  const activeSession = liveSession ?? session;

  const applyRemoteSession = useCallback(
    (source: CalendarSession) => {
      const remote = liveSessionSnapshot(source);
      const remoteDesc = remote.description ?? null;
      const prev = lastRemoteSnapshotRef.current;
      const isInitialApply = !prev;
      const otherFieldsChanged = isInitialApply || !liveSessionAutosaveEqual(prev, remote);
      const descriptionSavedRemotely =
        remoteDesc !== lastSyncedRemoteDescriptionRef.current;

      if (!otherFieldsChanged && !descriptionSavedRemotely) return;

      if (otherFieldsChanged) {
        setTitle(remote.title);
        const start = sessionTimeFromDb(remote.starts_at);
        setSessionDate(start);
        setPickerMonth(startOfMonth(start));
        setFromTime(start);
        setToTime(sessionTimeFromDb(remote.ends_at));
        setAllDay(remote.all_day);

        const resolvedCategoryId =
          remote.category_id ?? resolveSessionCategoryId(source, categories);
        setCategoryId(resolvedCategoryId);
        const fromCategory = resolvedCategoryId
          ? (categories.find((c) => c.id === resolvedCategoryId)?.app_group_id ?? null)
          : null;
        setGroupId(remote.app_group_id ?? fromCategory);
      }

      if (
        requireCategory &&
        !descriptionDirtyRef.current &&
        (isInitialApply || descriptionSavedRemotely)
      ) {
        setDescription(remote.description ?? "");
        lastSyncedRemoteDescriptionRef.current = remoteDesc;
      }

      // Track persisted remote state only — never merge local dirty description here,
      // or flushSessionSave will think description is already saved and skip the API call.
      lastRemoteSnapshotRef.current = remote;
    },
    [categories, requireCategory],
  );

  // Apply cloud/web edits while the sheet stays open (all fields, not just description).
  useEffect(() => {
    if (!visible || !activeSession?.id) return;
    applyRemoteSession(activeSession);
  }, [visible, activeSession, applyRemoteSession]);

  useEffect(() => {
    if (!requireCategory || session) return;
    setCategoryId((prev) => {
      if (prev && visibleCategories.some((c) => c.id === prev)) return prev;
      return visibleCategories[0]?.id ?? null;
    });
  }, [requireCategory, groupId, visibleCategories, session?.id]);

  useEffect(() => {
    if (!visible) {
      setTeamSessionTab("about");
      setParticipantSearchQuery("");
      setKeyboardHeight(0);
      sheetAnim.setValue(maxHeight + 20);
      backdropAnim.setValue(0);
      lastRemoteSnapshotRef.current = null;
      descriptionDirtyRef.current = false;
      lastSyncedRemoteDescriptionRef.current = null;
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      return;
    }
    setGroupMenuOpen(false);
    setDateMenuOpen(false);
    setTeamSessionTab("about");
    setTitleFocusOnOpen(true);
    sheetAnim.setValue(maxHeight + 20);
    backdropAnim.setValue(0);
    Animated.parallel([
      Animated.spring(sheetAnim, { toValue: 0, damping: 28, stiffness: 280, useNativeDriver: false }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();

    if (!session) {
      setTitle("");
      setDescription("");
      lastRemoteSnapshotRef.current = null;
      setSessionDate(new Date(selectedDate));
      setPickerMonth(startOfMonth(selectedDate));
      const d1 = new Date(selectedDate); d1.setHours(9, 0, 0, 0); setFromTime(d1);
      const d2 = new Date(selectedDate); d2.setHours(10, 0, 0, 0); setToTime(d2);
      setAllDay(false);
      setGroupId(null);
      const initialGroupCategories = categories.filter(
        (c) => !c.hidden && (c.app_group_id ?? null) === null,
      );
      setCategoryId(requireCategory ? (initialGroupCategories[0]?.id ?? null) : null);
    }
    // Existing sessions: form fields sync from liveSession via applyRemoteSession.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, maxHeight, session?.id, selectedDate]);

  useEffect(() => {
    if (!visible || !activeSession?.app_group_id) {
      setArchivedSessionGroup(null);
      return;
    }
    if (groups.some((g) => g.id === activeSession.app_group_id)) {
      setArchivedSessionGroup(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from("app_team_groups")
      .select("id, name")
      .eq("id", activeSession.app_group_id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setArchivedSessionGroup(data ? { id: data.id as string, name: data.name as string } : null);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, activeSession?.id, activeSession?.app_group_id, groups]);

  useEffect(() => {
    if (!visible || groupId == null) return;
    if (groups.some((g) => g.id === groupId)) return;
    if (activeSession?.app_group_id === groupId) return;
    setGroupId(null);
  }, [visible, groupId, groups, activeSession?.app_group_id]);

  function dismiss() {
    Keyboard.dismiss();
    const close = () => {
      Animated.parallel([
        Animated.timing(sheetAnim, { toValue: maxHeight + 20, duration: 220, useNativeDriver: false }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => onClose());
    };
    if (activeSession?.id) {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      void flushAutosaveRef.current().finally(close);
      return;
    }
    close();
  }

  function buildAllDayRange(base: Date): { starts: string; ends: string } {
    const start = new Date(base);
    start.setHours(0, 0, 0, 0);
    const end = new Date(base);
    end.setHours(23, 59, 59, 0);
    return { starts: sessionTimeToDb(start), ends: sessionTimeToDb(end) };
  }

  function buildDateTime(base: Date, time: Date): string {
    const d = new Date(base);
    d.setHours(time.getHours(), time.getMinutes(), 0, 0);
    return sessionTimeToDb(d);
  }

  function timeOfDayMinutes(d: Date): number {
    return d.getHours() * 60 + d.getMinutes();
  }

  function handleFromTimeChange(newFrom: Date) {
    const prevFromMins = timeOfDayMinutes(fromTime);
    const prevToMins = timeOfDayMinutes(toTime);
    const durationMins = prevToMins - prevFromMins;
    const newFromMins = timeOfDayMinutes(newFrom);

    setFromTime(newFrom);

    if (newFromMins >= prevToMins) {
      const newTo = new Date(newFrom);
      const newToMins = Math.min(newFromMins + durationMins, 23 * 60 + 59);
      newTo.setHours(Math.floor(newToMins / 60), newToMins % 60, 0, 0);
      setToTime(newTo);
    }
  }

  function handleToTimeChange(newTo: Date) {
    const prevFromMins = timeOfDayMinutes(fromTime);
    const prevToMins = timeOfDayMinutes(toTime);
    const durationMins = prevToMins - prevFromMins;
    const newToMins = timeOfDayMinutes(newTo);

    setToTime(newTo);

    if (newToMins <= prevFromMins) {
      const newFrom = new Date(newTo);
      const newFromMins = Math.max(newToMins - durationMins, 0);
      newFrom.setHours(Math.floor(newFromMins / 60), newFromMins % 60, 0, 0);
      setFromTime(newFrom);
    }
  }

  const AUTOSAVE_DEBOUNCE_MS = 400;

  const buildFormSnapshot = useCallback(
    (includeDescription: boolean) => {
      const trimmed = title.trim();
      if (!trimmed) return null;
      const { starts, ends } = allDay
        ? buildAllDayRange(sessionDate)
        : { starts: buildDateTime(sessionDate, fromTime), ends: buildDateTime(sessionDate, toTime) };
      const trimmedDescription = description.trim();
      return {
        title: trimmed,
        starts_at: starts,
        ends_at: ends,
        all_day: allDay,
        category_id: categoryId,
        app_group_id: requireCategory ? groupId : null,
        description: includeDescription && requireCategory ? trimmedDescription || null : null,
      };
    },
    [
      title,
      sessionDate,
      fromTime,
      toTime,
      allDay,
      categoryId,
      groupId,
      description,
      requireCategory,
    ],
  );

  const persistSession = useCallback(
    async (includeDescription: boolean) => {
      if (autosaveInFlightRef.current) {
        if (!includeDescription) return;
        if (autosavePromiseRef.current) {
          try {
            await autosavePromiseRef.current;
          } catch {
            // Autosave failed; still attempt explicit save below.
          }
        }
      }
      const sessionId = activeSession?.id;
      if (!visible || !sessionId) return;

      const snapshot = buildFormSnapshot(includeDescription);
      if (!snapshot) return;

      const mustSaveDescription = includeDescription && descriptionDirtyRef.current;
      const unchanged =
        !mustSaveDescription &&
        (includeDescription
          ? lastRemoteSnapshotRef.current &&
            liveSessionSnapshotsEqual(lastRemoteSnapshotRef.current, snapshot)
          : lastRemoteSnapshotRef.current &&
            liveSessionAutosaveEqual(lastRemoteSnapshotRef.current, snapshot));
      if (unchanged) return;

      const color = categories.find((c) => c.id === categoryId)?.color ?? null;
      const nextSnapshot: LiveSessionSnapshot = includeDescription
        ? snapshot
        : {
            ...snapshot,
            description: lastRemoteSnapshotRef.current?.description ?? null,
          };
      lastRemoteSnapshotRef.current = nextSnapshot;

      autosaveInFlightRef.current = true;
      const savePromise = (async () => {
        try {
          await updateSession.mutateAsync({
            id: sessionId,
            title: snapshot.title,
            starts_at: snapshot.starts_at,
            ends_at: snapshot.ends_at,
            category_id: snapshot.category_id,
            color,
            app_group_id: requireCategory ? groupId : undefined,
            ...(includeDescription && requireCategory
              ? { description: snapshot.description }
              : {}),
            all_day: snapshot.all_day,
          });
          if (includeDescription && requireCategory) {
            descriptionDirtyRef.current = false;
            lastSyncedRemoteDescriptionRef.current = snapshot.description;
          }
        } catch {
          lastRemoteSnapshotRef.current = null;
          throw new Error("Session save failed");
        } finally {
          autosaveInFlightRef.current = false;
          autosavePromiseRef.current = null;
        }
      })();
      autosavePromiseRef.current = savePromise;
      await savePromise;
    },
    [
      activeSession?.id,
      visible,
      buildFormSnapshot,
      categories,
      categoryId,
      groupId,
      requireCategory,
      updateSession,
    ],
  );

  const flushAutosave = useCallback(
    () => persistSession(false),
    [persistSession],
  );

  const flushSessionSave = useCallback(
    () => persistSession(true),
    [persistSession],
  );

  flushAutosaveRef.current = flushAutosave;
  flushSessionSaveRef.current = flushSessionSave;

  const scheduleAutosave = useCallback(
    (debounceMs: number) => {
      if (!visible || !activeSession?.id) return;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (debounceMs <= 0) {
        void flushAutosave();
        return;
      }
      autosaveTimerRef.current = setTimeout(() => {
        autosaveTimerRef.current = null;
        void flushAutosave();
      }, debounceMs);
    },
    [visible, activeSession?.id, flushAutosave],
  );

  // Debounced — title, date/time (description saved only on explicit Done/Save).
  useEffect(() => {
    if (!visible || !activeSession?.id) return;
    scheduleAutosave(AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [
    visible,
    activeSession?.id,
    title,
    sessionDate,
    fromTime,
    toTime,
    scheduleAutosave,
  ]);

  // Immediate — discrete picks (activity, group, all-day toggle).
  useEffect(() => {
    if (!visible || !activeSession?.id) return;
    scheduleAutosave(0);
  }, [visible, activeSession?.id, categoryId, groupId, allDay, scheduleAutosave]);

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) { Alert.alert("Title required", "Please enter a session title."); return; }

    if (activeSession?.id) {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      try {
        await flushSessionSave();
      } catch (e: unknown) {
        Alert.alert("Error", (e as Error)?.message ?? "Could not save session.");
        return;
      }
      Keyboard.dismiss();
      Animated.parallel([
        Animated.timing(sheetAnim, { toValue: maxHeight + 20, duration: 220, useNativeDriver: false }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => onClose());
      return;
    }

    if (requireCategory && !categoryId) {
      Alert.alert("Activity required", "Choose an activity type before saving this team session.");
      return;
    }
    const color = categories.find((c) => c.id === categoryId)?.color ?? null;
    const dateBase = sessionDate;
    const { starts, ends } = allDay
      ? buildAllDayRange(dateBase)
      : { starts: buildDateTime(dateBase, fromTime), ends: buildDateTime(dateBase, toTime) };
    const sessionUserId = teamId ? (teamOwnerId ?? userId) : userId;
    const trimmedDescription = description.trim();
    setSaving(true);
    try {
      await createSession.mutateAsync({
          user_id: sessionUserId,
          title: trimmed,
          starts_at: starts,
          ends_at: ends,
          category_id: categoryId,
          color,
          entity_id: teamId,
          app_group_id: requireCategory ? groupId : undefined,
          description: requireCategory ? (trimmedDescription || null) : undefined,
        all_day: allDay,
      });
      dismiss();
    } catch (e: unknown) {
      Alert.alert("Error", (e as Error)?.message ?? "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!activeSession) return;
    Alert.alert(
      "Delete Session",
      `Delete "${activeSession.title}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            setSaving(true);
            try { await deleteSession.mutateAsync(activeSession.id); dismiss(); }
            catch (e: unknown) { Alert.alert("Error", (e as Error)?.message ?? "Something went wrong"); }
            finally { setSaving(false); }
          },
        },
      ],
    );
  }

  const groupDropdownShellStyle = {
    borderWidth: 1,
    borderColor: C.separator,
    borderRadius: GROUP_DROPDOWN_RADIUS,
    backgroundColor: C.card,
    overflow: "hidden" as const,
    alignSelf: "stretch" as const,
  };

  const groupRowStyle = {
    backgroundColor: C.card,
    paddingHorizontal: 16,
    height: SESSION_FIELD_HEIGHT,
    justifyContent: "center" as const,
    width: "100%" as const,
  };

  const sessionFieldTextStyle = {
    flex: 1,
    flexShrink: 1,
    color: C.text,
    fontSize: 16,
  } as const;

  const sessionFieldRowStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    width: "100%" as const,
  };

  const sessionFieldIconSlotStyle = {
    flexShrink: 0,
    marginLeft: 8,
    width: 20,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };

  const labelStyle = {
    color: C.secondary, fontSize: 12, fontWeight: "600" as const,
    textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 8,
  };

  const sessionTimeColumnLabelStyle = {
    color: C.secondary,
    fontSize: 12,
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    width: PICKER_W,
    textAlign: "center" as const,
  };

  const sessionTimeColumnLabelOverlayStyle = {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    height: SESSION_TIME_LABEL_BAND,
    justifyContent: "center" as const,
    zIndex: 10,
    elevation: 10,
    backgroundColor: C.sheet,
  };

  const sessionTimeWheelSlotStyle = {
    width: PICKER_W,
    height: pickerHeight + SESSION_TIME_WHEEL_GAP,
    paddingTop: SESSION_TIME_WHEEL_GAP / 2,
    paddingBottom: SESSION_TIME_WHEEL_GAP / 2,
    marginTop: SESSION_TIME_LABEL_BAND + SESSION_TIME_WHEEL_LIFT,
    overflow: "hidden" as const,
    zIndex: 1,
  };

  const sessionTimeWheelWrapStyle = {
    width: PICKER_W,
    height: pickerHeight,
    overflow: "hidden" as const,
  };

  const sessionTimeWheelFadeStyle = {
    position: "absolute" as const,
    left: 0,
    right: 0,
    zIndex: 2,
  };

  const entityWheelTopOffset =
    SESSION_TIME_LABEL_BAND + SESSION_TIME_WHEEL_LIFT + SESSION_TIME_WHEEL_GAP / 2;
  const entityLabelOverlapOnWheel = Math.max(0, SESSION_TIME_LABEL_BAND - entityWheelTopOffset);
  const entityWheelTopSolidH = entityLabelOverlapOnWheel + SESSION_TIME_WHEEL_TOP_SOLID_H;

  const sessionTimeWheelTopSolidStyle = {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    height: entityWheelTopSolidH,
    backgroundColor: C.sheet,
    zIndex: 3,
  };

  const renderEntityTimeWheel = (
    label: "From" | "To",
    value: Date,
    onChange: (date: Date) => void,
  ) => (
    <View style={{ width: PICKER_W, position: "relative" }}>
      <View style={sessionTimeWheelSlotStyle}>
        <View style={sessionTimeWheelWrapStyle}>
          <DateTimePicker
            value={value}
            mode="time"
            display="spinner"
            is24Hour
            onChange={(_, date) => {
              if (date) onChange(date);
            }}
            textColor={C.text}
            themeVariant={C.bg === "#000000" ? "dark" : "light"}
            style={{
              width: PICKER_NATIVE_W,
              height: pickerHeight,
              alignSelf: "center",
              backgroundColor: "transparent",
            }}
          />
          <View style={sessionTimeWheelTopSolidStyle} pointerEvents="none" />
          <LinearGradient
            colors={[C.sheet, C.sheet + "00"]}
            style={[
              sessionTimeWheelFadeStyle,
              {
                top: entityWheelTopSolidH,
                height: SESSION_TIME_WHEEL_FADE_H,
              },
            ]}
            pointerEvents="none"
          />
          <LinearGradient
            colors={[C.sheet + "00", C.sheet]}
            style={[
              sessionTimeWheelFadeStyle,
              { bottom: 0, height: SESSION_TIME_WHEEL_FADE_H },
            ]}
            pointerEvents="none"
          />
        </View>
      </View>
      <View style={sessionTimeColumnLabelOverlayStyle} pointerEvents="none">
        <Text style={sessionTimeColumnLabelStyle}>{label}</Text>
      </View>
    </View>
  );

  const renderIndividualTimeWheel = (
    label: "From" | "To",
    value: Date,
    onChange: (date: Date) => void,
  ) => (
    <View style={{ width: PICKER_W }}>
      <Text style={[labelStyle, { width: PICKER_W, textAlign: "center" }]}>{label}</Text>
      <View style={{ width: PICKER_W, height: pickerHeight, overflow: "hidden" }}>
        <DateTimePicker
          value={value}
          mode="time"
          display="spinner"
          is24Hour
          onChange={(_, date) => {
            if (date) onChange(date);
          }}
          textColor={C.text}
          themeVariant={C.bg === "#000000" ? "dark" : "light"}
          style={{
            width: PICKER_NATIVE_W,
            height: pickerHeight,
            alignSelf: "center",
            backgroundColor: "transparent",
            transform: [{ translateY: INDIVIDUAL_TIME_WHEEL_OFFSET_Y }],
          }}
        />
        <LinearGradient
          colors={[C.sheet, withAlpha(C.sheet, 0)]}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: INDIVIDUAL_TIME_WHEEL_EDGE_FADE_H,
            zIndex: 2,
          }}
          pointerEvents="none"
        />
        <LinearGradient
          colors={[withAlpha(C.sheet, 0), C.sheet]}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: INDIVIDUAL_TIME_WHEEL_EDGE_FADE_H,
            zIndex: 2,
          }}
          pointerEvents="none"
        />
      </View>
    </View>
  );

  const saveDisabled =
    saving ||
    (requireCategory && !session && (!categoryId || visibleCategories.length === 0));

  if (!visible) return null;

  const descriptionKeyboardPad =
    keyboardHeight > 0
      ? Math.max(
          SESSION_DESCRIPTION_KEYBOARD_GAP,
          keyboardHeight - bottomInset + SESSION_DESCRIPTION_KEYBOARD_GAP,
        )
      : 0;

  return (
    // Absolutely covers the full screen (including bottom tab bar)
    <View
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      pointerEvents={visible ? "box-none" : "none"}
    >
      <Animated.View
        style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.55)", opacity: backdropAnim,
        }}
        pointerEvents={visible ? "auto" : "none"}
      >
        <Pressable style={{ flex: 1 }} onPress={dismiss} />
      </Animated.View>

      <Animated.View
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: maxHeight,
          backgroundColor: C.sheet,
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
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

        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 20 }}>
            <NativeSheetIconFooter
              borderless
              compact
              onDelete={
                activeSession && !saving
                  ? handleDelete
                  : undefined
              }
              onCancel={!saving ? dismiss : undefined}
              onSave={() => void handleSave()}
              saveDisabled={saveDisabled || saving}
            />
          </View>

        {requireCategory ? (
        <>
          <EntitySegmentTabs
            tabs={TEAM_SESSION_TABS}
            active={teamSessionTab}
            onChange={selectTeamSessionTab as (tab: string) => void}
          />

          <View ref={sheetBodyRef} style={{ flex: 1, position: "relative" }}>
          <View style={{ flex: 1 }}>
          <View style={{ flex: 1, position: "relative" }}>
          <View
            style={entitySessionTabPaneStyle(teamSessionTab === "about")}
            pointerEvents={teamSessionTab === "about" ? "auto" : "none"}
          >
        <ScrollView
          style={{ flex: 1, backgroundColor: C.sheet }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          contentContainerStyle={{ paddingTop: SESSION_TAB_CONTENT_GAP }}
        >
        <View style={{ paddingHorizontal: 20, backgroundColor: C.sheet, alignSelf: "stretch" }}>
          <Text style={labelStyle}>Title</Text>
          <SessionTitleField
            ref={titleInputRef}
            key={session?.id ?? "new-session"}
            focusOnOpen={titleFocusOnOpen}
            containerStyle={{ marginBottom: SESSION_ABOUT_SECTION_GAP }}
            style={{
              backgroundColor: C.inputBg,
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 14,
              height: SESSION_FIELD_HEIGHT,
              color: C.text,
              fontSize: 16,
            }}
            placeholder="Session title"
            placeholderTextColor={C.secondary}
            value={title}
            onChangeText={setTitle}
            onFocus={() => { setGroupMenuOpen(false); setDateMenuOpen(false); }}
            returnKeyType="done"
            autoCorrect={false}
          />

          <View style={{ alignSelf: "stretch", marginBottom: SESSION_ABOUT_SECTION_GAP }}>
            <Text style={labelStyle}>Group</Text>
            <View
              ref={groupTriggerRef}
              collapsable={false}
              style={[
                groupDropdownShellStyle,
                groupMenuOpen && { opacity: 0 },
              ]}
              pointerEvents={groupMenuOpen ? "none" : "auto"}
            >
              <Pressable onPress={toggleGroupMenu} style={groupRowStyle}>
                <View style={sessionFieldRowStyle}>
                  <Text style={sessionFieldTextStyle} numberOfLines={1}>
                    {selectedGroupLabel}
                  </Text>
                  <View style={sessionFieldIconSlotStyle}>
                    <ChevronDown size={20} color={C.secondary} />
                  </View>
                </View>
              </Pressable>
            </View>
          </View>
        </View>

        <View
          style={{
            paddingHorizontal: 20,
            paddingBottom: SESSION_ABOUT_SECTION_GAP,
          }}
        >
          <Text style={[labelStyle, { marginBottom: 6 }]}>Activity</Text>
          {visibleCategories.length === 0 ? (
            <Text style={{ color: C.secondary, fontSize: 14 }}>
              Add team activities in the Activity tab before scheduling sessions.
            </Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {visibleCategories.map((cat) => (
                <Pressable
                  key={cat.id}
                  onPress={() => {
                    dismissKeyboard();
                    setCategoryId(cat.id);
                  }}
                  style={{
                    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
                    borderWidth: 1, borderColor: cat.color,
                    backgroundColor: categoryId === cat.id ? cat.color : "transparent",
                  }}
                >
                  <Text style={{ color: categoryId === cat.id ? "#fff" : cat.color, fontSize: 14, fontWeight: "500" }}>
                    {cat.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={{ paddingHorizontal: 20, paddingBottom: SESSION_ABOUT_SECTION_GAP }}>
          <Text style={labelStyle}>Date</Text>
          <View
            ref={dateTriggerRef}
            collapsable={false}
            style={{
              backgroundColor: C.inputBg,
              borderRadius: 12,
              height: SESSION_FIELD_HEIGHT,
              justifyContent: "center",
            }}
          >
            <Pressable onPress={toggleDateMenu} style={{ paddingHorizontal: 16, height: SESSION_FIELD_HEIGHT, justifyContent: "center" }}>
              <View style={sessionFieldRowStyle}>
                <Text style={sessionFieldTextStyle} numberOfLines={1}>
                  {format(sessionDate, "MMMM d yyyy")}
                </Text>
                <View style={sessionFieldIconSlotStyle}>
                  <CalendarDays size={20} color={dateMenuOpen ? C.accent : C.secondary} />
                </View>
              </View>
            </Pressable>
          </View>
        </View>

        <View
          style={{
            paddingHorizontal: 20,
            paddingBottom: SESSION_DESCRIPTION_FOOTER_GAP,
            opacity: hideBelowDateOverlay ? 0 : 1,
          }}
          pointerEvents={hideBelowDateOverlay ? "none" : "auto"}
        >
          <View style={{
            flexDirection: "row",
            alignItems: "flex-start",
            opacity: allDay ? 0.35 : 1,
          }}
          pointerEvents={allDay ? "none" : "auto"}
          >
            {renderEntityTimeWheel("From", fromTime, handleFromTimeChange)}
            {renderEntityTimeWheel("To", toTime, handleToTimeChange)}
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: C.inputBg,
              borderRadius: 12,
              paddingHorizontal: 16,
              height: SESSION_FIELD_HEIGHT,
              marginTop: SESSION_TIME_ALL_DAY_TOP_GAP,
            }}
          >
            <Text style={{ color: C.text, fontSize: 16, lineHeight: 20 }}>All day</Text>
            <View style={{ height: SESSION_FIELD_HEIGHT, justifyContent: "center" }}>
              <Switch
                value={allDay}
                onValueChange={setAllDay}
                trackColor={{ false: C.separator, true: C.accent }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={C.separator}
              />
            </View>
          </View>
        </View>
        </ScrollView>
          </View>

          <View
            style={entitySessionTabPaneStyle(teamSessionTab === "description")}
            pointerEvents={teamSessionTab === "description" ? "auto" : "none"}
          >
          <View
            style={{
              flex: 1,
              paddingTop: SESSION_TAB_CONTENT_GAP,
              paddingHorizontal: 20,
              paddingBottom: keyboardHeight > 0 ? descriptionKeyboardPad : SESSION_DESCRIPTION_FOOTER_GAP,
            }}
          >
            <Text style={labelStyle}>Description</Text>
            <View
              style={{
                flex: 1,
                backgroundColor: C.inputBg,
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <TextInput
                ref={descriptionInputRef}
                value={description}
                onChangeText={handleDescriptionChange}
                maxLength={SESSION_DESCRIPTION_MAX_LENGTH}
                placeholder="Add details…"
                placeholderTextColor={C.secondary}
                multiline
                scrollEnabled
                blurOnSubmit={false}
                textAlignVertical="top"
                showSoftInputOnFocus
                {...(Platform.OS === "android" ? { textBreakStrategy: "highQuality" as const } : {})}
                style={{
                  flex: 1,
                  paddingHorizontal: 16,
                  paddingTop: 14,
                  paddingBottom: 8,
                  color: C.text,
                  fontSize: 16,
                  lineHeight: SESSION_DESCRIPTION_LINE_HEIGHT,
                }}
              />
            </View>
          </View>
          </View>

          <View
            style={entitySessionTabPaneStyle(teamSessionTab === "participants")}
            pointerEvents={teamSessionTab === "participants" ? "auto" : "none"}
          >
          <View style={{ flex: 1 }}>
            <RosterSearchField
              value={participantSearchQuery}
              onChange={setParticipantSearchQuery}
              onActivate={activateParticipantSearch}
              onCancel={exitParticipantSearch}
              active={participantSearchActive}
              searchModeAnim={participantSearchModeAnim}
              placeholder="Search participants"
              compact
              variant="vipps"
              borderRadius={PARTICIPANT_SEARCH_RADIUS}
            />
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {!showParticipantRows ? null : visibleParticipants.length === 0 ? (
                <Text
                  style={{
                    color: C.secondary,
                    fontSize: 14,
                    textAlign: "center",
                    paddingHorizontal: 24,
                    paddingTop: 24,
                  }}
                >
                  {acceptedMembers.length === 0
                    ? "No participants yet."
                    : "No participants match your search."}
                </Text>
              ) : (
                visibleParticipants.map((row, i) => (
                  <View
                    key={row.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      backgroundColor: i % 2 === 1 ? C.tabBg : "transparent",
                      borderBottomWidth: 0.5,
                      borderBottomColor: C.separator,
                    }}
                  >
                    <Text
                      style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: "500" }}
                      numberOfLines={1}
                    >
                      {rosterDisplayLabel(row)}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
          </View>
          </View>
          </View>

        {requireCategory && groupMenuOpen && groupDropdownTop != null && (
          <View
            style={{
              position: "absolute",
              left: 20,
              right: 20,
              top: groupDropdownTop,
              height: groupDropdownHeight,
              zIndex: 300,
              ...groupDropdownShellStyle,
            }}
          >
            <Pressable
              onPress={toggleGroupMenu}
              style={[
                groupRowStyle,
                {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: C.separator,
                },
              ]}
            >
              <View style={sessionFieldRowStyle}>
                <Text style={sessionFieldTextStyle} numberOfLines={1}>
                  {selectedGroupLabel}
                </Text>
                <View style={[sessionFieldIconSlotStyle, { transform: [{ rotate: "180deg" }] }]}>
                  <ChevronDown size={20} color={C.secondary} />
                </View>
              </View>
            </Pressable>
            <ScrollView
              style={{ height: groupDropdownListHeight, backgroundColor: C.card }}
              contentContainerStyle={{ backgroundColor: C.card }}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator={groupOptions.length > GROUP_DROPDOWN_MAX_ROWS}
              indicatorStyle={C.bg === "#000000" ? "white" : "black"}
            >
              {groupOptions.map((option, index) => {
                const selected = option.id === groupId;
                const faded = option.deleted;
                return (
                  <Pressable
                    key={option.id ?? "team"}
                    disabled={!option.selectable}
                    onPress={() => {
                      if (!option.selectable) return;
                      setGroupId(option.id);
                      setGroupMenuOpen(false);
                    }}
                    style={[
                      groupRowStyle,
                      faded ? { opacity: 0.45 } : null,
                      index < groupOptions.length - 1
                        ? {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: C.separator,
                          }
                        : null,
                    ]}
                  >
                    <View style={sessionFieldRowStyle}>
                      <Text
                        style={[
                          sessionFieldTextStyle,
                          { fontWeight: selected ? "600" : "400" },
                          faded ? { color: C.secondary } : null,
                        ]}
                        numberOfLines={1}
                      >
                        {option.label}
                      </Text>
                      <View style={sessionFieldIconSlotStyle}>
                        {selected ? (
                          <Check size={20} color={C.accent} strokeWidth={2.5} />
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {requireCategory && dateMenuOpen && dateDropdownLayout != null && dateDropdownLayout.height > 0 && (
          <View
            style={{
              position: "absolute",
              left: 20,
              right: 20,
              top: dateDropdownLayout.top,
              height: dateDropdownLayout.height,
              zIndex: 300,
              backgroundColor: C.sheet,
              overflow: "hidden",
            }}
          >
            <ScrollView
              style={{ flex: 1, backgroundColor: C.sheet }}
              contentContainerStyle={{ paddingBottom: 12, backgroundColor: C.sheet }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 28,
                paddingTop: 14,
                paddingBottom: 10,
              }}>
                <Pressable
                  onPress={() => setPickerMonth((m) => subMonths(m, 1))}
                  hitSlop={14}
                  style={({ pressed }) => ({ opacity: pressed ? 0.4 : 1 })}
                >
                  <ChevronLeft size={22} color={C.accent} />
                </Pressable>
                <Text style={{
                  color: C.text, fontSize: 17, fontWeight: "600",
                  letterSpacing: -0.3, minWidth: 150, textAlign: "center",
                }}>
                  {format(pickerMonth, "MMMM yyyy")}
                </Text>
                <Pressable
                  onPress={() => setPickerMonth((m) => addMonths(m, 1))}
                  hitSlop={14}
                  style={({ pressed }) => ({ opacity: pressed ? 0.4 : 1 })}
                >
                  <ChevronRight size={22} color={C.accent} />
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", paddingHorizontal: 8, marginBottom: 4 }}>
                {WEEK_LABELS.map((d, i) => (
                  <View key={i} style={{ flex: 1, alignItems: "center" }}>
                    <Text style={{ color: C.secondary, fontSize: 12, fontWeight: "500" }}>{d}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8 }}>
                {(() => {
                  const start = startOfMonth(pickerMonth);
                  const end = endOfMonth(pickerMonth);
                  const days = eachDayOfInterval({ start, end });
                  const leadingBlanks = (getDay(start) + 6) % 7;
                  return (
                    <>
                      {Array.from({ length: leadingBlanks }).map((_, i) => (
                        <View key={`blank-${i}`} style={sessionDateCellStyle} />
                      ))}
                      {days.map((day) => {
                        const sel = isSameDay(day, sessionDate);
                        const todayDay = isToday(day);
                        return (
                          <Pressable
                            key={format(day, "yyyy-MM-dd")}
                            onPress={() => {
                              setSessionDate(day);
                              setDateMenuOpen(false);
                            }}
                            style={sessionDateCellStyle}
                          >
                            <View style={[
                              { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
                              sel && { backgroundColor: C.accent },
                            ]}>
                              <Text style={{
                                fontSize: 15,
                                fontWeight: todayDay ? "700" : "400",
                                color: sel ? "#fff" : todayDay ? C.today : C.text,
                              }}>
                                {format(day, "d")}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </>
                  );
                })()}
              </View>
            </ScrollView>
          </View>
        )}
          </View>
        </>
        ) : (
        <Pressable style={{ flex: 1 }} onPress={dismissKeyboard}>
        <View style={{ paddingHorizontal: 20, backgroundColor: C.sheet, alignSelf: "stretch" }}>
          <Text style={labelStyle}>Title</Text>
          <SessionTitleField
            key={session?.id ?? "new-session"}
            focusOnOpen
            containerStyle={{ marginBottom: 12 }}
            style={{
              backgroundColor: C.inputBg,
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 14,
              height: SESSION_FIELD_HEIGHT,
              color: C.text,
              fontSize: 16,
            }}
            placeholder="Session title"
            placeholderTextColor={C.secondary}
            value={title}
            onChangeText={setTitle}
            onFocus={() => { setGroupMenuOpen(false); setDateMenuOpen(false); }}
            returnKeyType="done"
            autoCorrect={false}
          />
        </View>

        {categories.length > 0 && (
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: SESSION_SECTION_GAP,
              paddingBottom: SESSION_SECTION_GAP,
            }}
          >
            <Text style={[labelStyle, { marginBottom: 6 }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Pressable
                onPress={() => {
                  dismissKeyboard();
                  setCategoryId(null);
                }}
                style={{
                  borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
                  borderWidth: 1, borderColor: C.separator,
                  backgroundColor: categoryId === null ? C.secondary : "transparent",
                }}
              >
                <Text style={{ color: categoryId === null ? "#fff" : C.secondary, fontSize: 14, fontWeight: "500" }}>
                  None
                </Text>
              </Pressable>
              {visibleCategories.map((cat) => (
                <Pressable
                  key={cat.id}
                  onPress={() => {
                    dismissKeyboard();
                    setCategoryId(cat.id);
                  }}
                  style={{
                    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
                    borderWidth: 1, borderColor: cat.color,
                    backgroundColor: categoryId === cat.id ? cat.color : "transparent",
                  }}
                >
                  <Text style={{ color: categoryId === cat.id ? "#fff" : cat.color, fontSize: 14, fontWeight: "500" }}>
                    {cat.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <ScrollView
          style={{ flex: 1, backgroundColor: C.sheet, zIndex: 0 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={dismissKeyboard}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: INDIVIDUAL_PICKER_TOP_GAP,
            paddingBottom: 8,
            backgroundColor: C.sheet,
          }}
        >
          <View style={{
            flexDirection: "row",
            alignItems: "flex-start",
            marginTop: 4,
            opacity: allDay ? 0.35 : 1,
          }}
          pointerEvents={allDay ? "none" : "auto"}
          >
            {renderIndividualTimeWheel("From", fromTime, handleFromTimeChange)}
            {renderIndividualTimeWheel("To", toTime, handleToTimeChange)}
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: C.inputBg,
              borderRadius: 12,
              paddingHorizontal: 16,
              height: SESSION_FIELD_HEIGHT,
              marginTop: SESSION_TIME_ALL_DAY_TOP_GAP,
            }}
          >
            <Text style={{ color: C.text, fontSize: 16, lineHeight: 20 }}>All day</Text>
            <View style={{ height: SESSION_FIELD_HEIGHT, justifyContent: "center" }}>
              <Switch
                value={allDay}
                onValueChange={setAllDay}
                trackColor={{ false: C.separator, true: C.accent }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={C.separator}
              />
            </View>
          </View>
        </ScrollView>
        </Pressable>
        )}
        </View>
      </Animated.View>
    </View>
  );
}

const CELL_WIDTH = `${(100 / 7).toFixed(4)}%`;
const cellStyle = {
  width: CELL_WIDTH as `${number}%`,
  alignItems: "center" as const,
  paddingTop: 2,
  paddingBottom: 1,
};
const sessionDateCellStyle = {
  width: CELL_WIDTH as `${number}%`,
  alignItems: "center" as const,
  paddingVertical: 4,
};
