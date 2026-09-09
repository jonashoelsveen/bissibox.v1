/**
 * Roster member search — shared logic with mobile (`mobile/lib/memberSearch.ts`).
 * Matches on name, email, and email local-part tokens.
 */

export type RosterSearchPerson = {
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  surname?: string | null;
};

function normalizeSearchTokens(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function memberNameParts(member: RosterSearchPerson): string {
  const fromFirstLast = [member.first_name, member.last_name].filter(Boolean).join(" ").trim();
  if (fromFirstLast) return fromFirstLast;
  return [member.name, member.surname].filter(Boolean).join(" ").trim();
}

/** Primary label for roster rows (name, then email, then fallback). */
export function rosterDisplayLabel(
  row: RosterSearchPerson,
  fallback = "Unnamed member",
): string {
  const name = memberNameParts(row);
  if (name) return name;
  const email = row.email?.trim();
  if (email) return email;
  return fallback;
}

function memberSearchHaystack(member: RosterSearchPerson): string {
  const name = memberNameParts(member);
  const email = member.email?.trim().toLowerCase() ?? "";
  const [localPart, domain = ""] = email.split("@");
  const localWords = localPart.replace(/[._+-]+/g, " ");
  return [name.toLowerCase(), email, localPart, localWords, domain].filter(Boolean).join(" ");
}

function memberMatchesSearch(member: RosterSearchPerson, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = memberSearchHaystack(member);
  return tokens.every((token) => haystack.includes(token));
}

export function filterAcceptedMembers<T extends RosterSearchPerson & { status?: string }>(
  members: T[],
  searchQuery: string,
): T[] {
  const tokens = normalizeSearchTokens(searchQuery);
  return members
    .filter((member) => member.status === "active")
    .filter((member) => memberMatchesSearch(member, tokens));
}
