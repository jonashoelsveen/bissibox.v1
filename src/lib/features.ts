/**
 * Local, compile-time feature flags for unfinished or staged UI.
 * Flip a value to `true` to show that surface; keep the implementing
 * component in the tree and gate it with `isFeatureEnabled` (non-entity)
 * or `isEntityFeatureEnabled` / `isFeatureEnabledForUser` (entity).
 *
 * Entity mode uses a master switch (`entityFlag`) plus sub-flags. A sub-flag
 * is only ever on if `entityFlag` is also on. `entityFlag: true` with all
 * sub-flags `true` is the launched state. `entityFlag: false` hides
 * everything regardless of sub-flag values — this is the emergency kill
 * switch.
 *
 * Beta testers (`profiles.is_beta_tester`) see entity surfaces via
 * `isFeatureEnabledForUser` even when the compile-time flags are off.
 *
 * Edge invite functions duplicate the launch bit as ENTITY_FLAG_LAUNCHED
 * in supabase/functions/_shared/entity-flag.ts — flip both in one commit.
 */
export const FEATURES = {
  /** Cloud apps menu tile + `/projects` workspace. */
  projectsApp: false,
  /** Cloud apps menu tile + `/events` workspace. */
  eventsApp: false,
  /** Cloud apps menu tile + `/clients` workspace (individual profiles). */
  clientsApp: false,
  /** Calendar left-rail ⋯ menu + upcoming-sessions list. */
  calendarThreeDotFlag: false,
  /** Left-panel calendar list and the session-menu calendar row. */
  calendarTabsFlag: false,

  /** Master switch for entity mode. Turning this on is the "launch" action. */
  entityFlag: false,

  /** Home dark band, `/cloud/entities`, footer audience link. */
  entityMarketing: false,
  /** Signup name/country/DOB; account first name/surname/DOB. */
  entityExtendedProfileFields: false,
  /** Entity profiles block; "Profiles" vs "Profile" nav label. */
  entityProfiles: false,
  /** Entity memberships tab + `/family` page. */
  entityMembershipManagement: false,
  /** "Browse entities" header on memberships — destination not wired yet. */
  entityBrowsePage: false,
  /** Entity rows + individual row in the profile icon menu. */
  entityProfileSwitcher: false,
  /** Apps launcher when the user owns at least one entity. */
  entityAppsLauncher: false,
  /** Calendar left-rail entity tabs. Member visibility of team sessions is separate. */
  entityCalendarSharing: false,
  /** `/entity` workspace. */
  entityWorkspace: false,
  /** Invite gate + `/accept-entity-invite`. */
  entityInviteFlow: false,
} as const;

export type FeatureFlag = keyof typeof FEATURES;

const ENTITY_SUB_FLAGS: readonly FeatureFlag[] = [
  "entityMarketing",
  "entityExtendedProfileFields",
  "entityProfiles",
  "entityMembershipManagement",
  "entityBrowsePage",
  "entityProfileSwitcher",
  "entityAppsLauncher",
  "entityCalendarSharing",
  "entityWorkspace",
  "entityInviteFlow",
];

/**
 * Team surfaces on the Vite dev server only. Production builds ignore this
 * because `import.meta.env.DEV` is false. Set to false to hide them in dev.
 */
const DEV_ENTITY_PREVIEW = false;

const DEV_ENTITY_PREVIEW_FLAGS: ReadonlySet<FeatureFlag> = new Set([
  "entityProfileSwitcher",
  "entityAppsLauncher",
  "entityProfiles",
  "entityMembershipManagement",
  "entityWorkspace",
]);

function isViteDev(): boolean {
  const env = (import.meta as { env?: { DEV?: boolean } }).env;
  return env?.DEV === true;
}

function devEntityPreviewEnabled(flag: FeatureFlag): boolean {
  return DEV_ENTITY_PREVIEW && isViteDev() && DEV_ENTITY_PREVIEW_FLAGS.has(flag);
}

function compileTimeEnabled(flag: FeatureFlag): boolean {
  if (flag === "entityFlag") return FEATURES.entityFlag;
  if ((ENTITY_SUB_FLAGS as readonly string[]).includes(flag)) {
    return FEATURES.entityFlag && FEATURES[flag];
  }
  return FEATURES[flag];
}

type FeatureFlagSnapshot =
  | { status: "empty" }
  | { status: "ready"; userId: string; flags: ReadonlySet<string> }
  | { status: "failed"; userId: string };

let featureFlagSnapshot: FeatureFlagSnapshot = { status: "empty" };
let featureFlagVersion = 0;
const featureFlagListeners = new Set<() => void>();

export function subscribeFeatureFlags(onStoreChange: () => void): () => void {
  featureFlagListeners.add(onStoreChange);
  return () => {
    featureFlagListeners.delete(onStoreChange);
  };
}

export function getFeatureFlagVersion(): number {
  return featureFlagVersion;
}

function publishFeatureFlags(): void {
  featureFlagVersion += 1;
  featureFlagListeners.forEach((listener) => listener());
}

/**
 * Accepted flag keys for one user. `flags === null` records a failed lookup,
 * which stays off. Tests set this directly.
 */
export function setFeatureFlagSnapshot(
  userId: string | null,
  flags: ReadonlySet<string> | null,
): void {
  if (!userId) {
    featureFlagSnapshot = { status: "empty" };
  } else if (flags === null) {
    featureFlagSnapshot = { status: "failed", userId };
  } else {
    featureFlagSnapshot = { status: "ready", userId, flags };
  }
  publishFeatureFlags();
}

/** Compile-time launch bit. Pass `userId` to also honor an accepted grant. */
export function isFeatureEnabled(flag: FeatureFlag): boolean;
export function isFeatureEnabled(flag: FeatureFlag, userId: string | null | undefined): boolean;
export function isFeatureEnabled(flag: FeatureFlag, userId?: string | null): boolean {
  if (compileTimeEnabled(flag)) return true;
  if (arguments.length < 2 || !userId) return false;
  if (featureFlagSnapshot.status !== "ready" || featureFlagSnapshot.userId !== userId) {
    return false;
  }
  return featureFlagSnapshot.flags.has(flag);
}

/** Compile-time launch, an internal tester account, or the Vite dev preview. */
export function isFeatureEnabledForUser(
  flag: FeatureFlag,
  user: { isBetaTester?: boolean } | null,
): boolean {
  if (devEntityPreviewEnabled(flag)) return true;
  if (isFeatureEnabled(flag)) return true;
  if (user?.isBetaTester && flag.startsWith("entity")) return true;
  return false;
}

/**
 * Client snapshot of `profiles.is_beta_tester`, set by AuthProvider.
 * Lets route `beforeLoad` and Worker-adjacent client code resolve entity
 * flags without a React hook.
 */
let betaTesterSnapshot = false;

export function setBetaTesterSnapshot(value: boolean): void {
  betaTesterSnapshot = value;
}

export function getBetaTesterSnapshot(): boolean {
  return betaTesterSnapshot;
}

/** Entity (and other) flags using the live beta-tester snapshot. */
export function isEntityFeatureEnabled(flag: FeatureFlag): boolean {
  return isFeatureEnabledForUser(flag, { isBetaTester: betaTesterSnapshot });
}
