/** Alphabet for shareable Entity request-IDs. Excludes 0, 1, l, o to avoid confusion. */
export const ENTITY_CODE_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyz";
export const ENTITY_CODE_LENGTH = 32;

export function generateEntityCode(): string {
  const bytes = new Uint8Array(ENTITY_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    out += ENTITY_CODE_ALPHABET[byte % ENTITY_CODE_ALPHABET.length];
  }
  return out;
}

export function isEntityCode(value: string): boolean {
  if (value.length !== ENTITY_CODE_LENGTH) return false;
  for (const ch of value) {
    if (!ENTITY_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    try {
      const written = await navigator.clipboard.readText();
      if (written !== text) return false;
    } catch {
      /* read may be blocked; write already succeeded */
    }
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}
