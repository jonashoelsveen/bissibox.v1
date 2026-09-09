import AsyncStorage from "@react-native-async-storage/async-storage";

const NICK_KEY = "@user_nickname";

export function defaultNicknameFromEmail(email: string | null | undefined): string {
  if (!email) return "User";
  const local = email.split("@")[0]?.trim();
  return local || "User";
}

export async function loadNickname(email: string | null | undefined): Promise<string> {
  const stored = await AsyncStorage.getItem(NICK_KEY);
  if (stored?.trim()) return stored.trim();
  return defaultNicknameFromEmail(email);
}

export async function saveNickname(value: string): Promise<void> {
  await AsyncStorage.setItem(NICK_KEY, value);
}

export { NICK_KEY };
