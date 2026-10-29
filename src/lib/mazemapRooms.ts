/**
 * Gløshaugen teaching-room nickname → MazeMap facility identifier (hyphen form).
 * Source: NTNU undervisningsrom wiki MazeMap hrefs + MazeMap identifier API.
 * Keys are lowercase nicknames.
 */
export const NTNU_GLOSHAUGEN_ROOM_IDENTIFIERS: Record<string, string> = {
  // Realfagbygget
  r1: "360-CU1-101",
  r2: "360-CU1-100",
  r3: "360-DU1-183",
  r4: "360-EU1-109",
  r5: "360-BU1-100",
  r6: "360-BU1-102",
  r7: "360-AU1-105",
  r8: "360-AU1-103",
  r9: "360-AU1-101",
  r22: "360-BU2-153",
  r23: "360-BU2-117",
  "a4-112": "360-A4-112",
  "c4-118": "360-C4-118",
  "d1-185": "360-D1-185",
  // IT-bygget
  f1: "318-152",
  // Sentralbygg 1
  s1: "321-117",
  s2: "321-116",
  s3: "321-113",
  s4: "321-111",
  // Sentralbygg 2
  s5: "322-115",
  s6: "322-146",
  s7: "322-105",
  s8: "322-156",
  s21: "322-255B",
  // Hovedbygningen
  h1: "301-116",
  h2: "301-129",
  h3: "301-340",
  h423: "301-423",
  h426: "301-426",
  "316": "301-316",
  "326": "301-326",
  // Gamle fysikk
  f2: "319-263",
  f3: "319-213",
  f4: "319-215",
  f6: "319-258",
  // Elektro
  el1: "325-G224",
  el2: "325-G212",
  el3: "325-G102",
  el4: "327-B110",
  el5: "325-G160",
  el6: "325-G170",
  // Adolf Øien
  a1: "380-2027A",
  a2: "380-2021",
  a3: "380-1017",
  a31: "380-3078",
  a32: "380-3080",
  a34: "380-3084",
  // Tapir / Høgskoleringen 3 labs (from MazeMap titles)
  bober: "358-314",
  rall: "358-421",
  rill: "358-411",
};

/** Wiki display codes use dots; MazeMap identifiers use hyphens. */
export function normalizeFacilityId(raw: string): string {
  let id = raw.trim();
  if (!id) return "";
  // 360BU2-117 → 360-BU2-117 (missing separator after building number)
  id = id.replace(/^(\d{3})([A-Za-z])/, "$1-$2");
  // 360.CU1.101 / 360.CU1-101 → 360-CU1-101
  id = id.replace(/\./g, "-");
  return id;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract a short room nickname from a full label like "Realfagbygget R1". */
export function roomNicknameFromFull(fullRoom: string): string {
  const q = fullRoom.trim();
  if (!q) return "";

  // Prefer the longest known nickname that appears as a whole token.
  const keys = Object.keys(NTNU_GLOSHAUGEN_ROOM_IDENTIFIERS).sort(
    (a, b) => b.length - a.length,
  );
  const lower = q.toLowerCase();
  for (const key of keys) {
    const re = new RegExp(`(?:^|\\s)${escapeRegExp(key)}(?:\\s|$)`, "i");
    if (re.test(lower)) return key;
  }

  // Trailing compact code: R1, F1, S3, H3, 316, A4-112, EL1…
  const code = q.match(/\b([A-Za-z]{1,4}\d{1,3}(?:-\d{1,4})?|\d{2,4})\s*$/);
  if (code) return code[1];

  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens[tokens.length - 1] ?? q;
}

export function lookupGloshaugenFacilityId(nickname: string): string | null {
  const key = nickname.trim().toLowerCase();
  if (!key) return null;
  const raw = NTNU_GLOSHAUGEN_ROOM_IDENTIFIERS[key];
  return raw ? normalizeFacilityId(raw) : null;
}
