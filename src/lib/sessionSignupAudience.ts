import { entitySessionVisibleToMember } from "./calendarVisiblePayload.ts";

export type SignupResponse = "accepted" | "declined";
export type SignupRosterTab = "accepted" | "declined" | "pending";

export type SignupAudienceMember = {
  status: string;
  userId?: string | null;
  groups?: { groupId: string | null }[];
};

/** Active and roster members the session is for. A blank group means everyone. */
export function sessionAudienceMembers<T extends SignupAudienceMember>(
  members: readonly T[],
  appGroupId: string | null | undefined,
): T[] {
  return members.filter((member) => {
    if (member.status !== "active" && member.status !== "roster") return false;
    const groupIds = (member.groups ?? [])
      .map((group) => group.groupId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    return entitySessionVisibleToMember(appGroupId, groupIds, true);
  });
}

/** No answer stays pending, including a member whose account is not linked yet. */
export function signupTabForMember(
  userId: string | null | undefined,
  responses: Readonly<Record<string, SignupResponse>>,
): SignupRosterTab {
  if (!userId) return "pending";
  const response = responses[userId];
  if (response === "accepted" || response === "declined") return response;
  return "pending";
}

const SIGNUP_ROSTER_ORDER: Record<SignupRosterTab, number> = {
  accepted: 0,
  declined: 1,
  pending: 2,
};

/** Search results: accepted, then cancelled, then pending, A–Z inside each. */
export function compareSignupRosterLabels(
  a: { tab: SignupRosterTab; label: string },
  b: { tab: SignupRosterTab; label: string },
): number {
  const byStatus = SIGNUP_ROSTER_ORDER[a.tab] - SIGNUP_ROSTER_ORDER[b.tab];
  if (byStatus !== 0) return byStatus;
  return a.label.localeCompare(b.label, "en", { sensitivity: "base" });
}

/** Prefer the roster-row match so an email-linked member still leaves Pending. */
export function signupTabForRosterMember(
  member: { id: string; userId?: string | null },
  byMemberId: Readonly<Record<string, SignupResponse>>,
  byUserId: Readonly<Record<string, SignupResponse>>,
): SignupRosterTab {
  const linked = byMemberId[member.id];
  if (linked === "accepted" || linked === "declined") return linked;
  return signupTabForMember(member.userId, byUserId);
}
