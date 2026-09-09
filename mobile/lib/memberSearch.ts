import type { TeamInviteMember } from "@/hooks/useTeams";

function normalizeSearchTokens(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function memberNameParts(member: Pick<TeamInviteMember, "first_name" | "last_name">): string {
  return [member.first_name, member.last_name].filter(Boolean).join(" ").trim();
}

/** Primary label for roster rows (name, then email, then fallback). */
export function rosterDisplayLabel(
  row: Pick<TeamInviteMember, "email" | "first_name" | "last_name">,
  fallback = "Unnamed member",
): string {
  const name = memberNameParts(row);
  if (name) return name;
  const email = row.email?.trim();
  if (email) return email;
  return fallback;
}

function memberSearchHaystack(
  member: Pick<TeamInviteMember, "email" | "first_name" | "last_name">,
): string {
  const name = memberNameParts(member);
  const email = member.email?.trim().toLowerCase() ?? "";
  const [localPart, domain = ""] = email.split("@");
  const localWords = localPart.replace(/[._+-]+/g, " ");
  return [name.toLowerCase(), email, localPart, localWords, domain].filter(Boolean).join(" ");
}

function memberMatchesSearch(
  member: Pick<TeamInviteMember, "email" | "first_name" | "last_name">,
  tokens: string[],
): boolean {
  if (tokens.length === 0) return true;
  const haystack = memberSearchHaystack(member);
  return tokens.every((token) => haystack.includes(token));
}

export function filterTeamMembers(
  members: TeamInviteMember[],
  opts: { groupId: string | null; searchQuery: string },
): TeamInviteMember[] {
  const tokens = normalizeSearchTokens(opts.searchQuery);
  return members.filter((member) => {
    if (opts.groupId != null && member.app_group_id !== opts.groupId) return false;
    return memberMatchesSearch(member, tokens);
  });
}

export function filterAcceptedMembers(
  members: TeamInviteMember[],
  searchQuery: string,
): TeamInviteMember[] {
  return filterTeamMembers(
    members.filter((member) => member.status === "active"),
    { groupId: null, searchQuery },
  );
}
