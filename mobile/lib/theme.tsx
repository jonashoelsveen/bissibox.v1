import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeColors = {
  bg: string;
  card: string;
  sheet: string;
  separator: string;
  text: string;
  secondary: string;
  accent: string;
  today: string;
  danger: string;
  drawer: string;
  cancelBg: string;
  tabBg: string;
  tabBorder: string;
  divider: string;
  primaryBtnText: string;
  inputBg: string;
};

export const darkColors: ThemeColors = {
  bg: "#000000",
  card: "#1C1C1E",
  sheet: "#2C2C2E",
  separator: "#38383A",
  text: "#FFFFFF",
  secondary: "#8E8E93",
  accent: "#007AFF",
  today: "#FF3B30",
  danger: "#FF3B30",
  drawer: "#141416",
  cancelBg: "#48484A",
  tabBg: "rgba(255,255,255,0.04)",
  tabBorder: "rgba(255,255,255,0.10)",
  divider: "rgba(255,255,255,0.08)",
  primaryBtnText: "#FFFFFF",
  inputBg: "#1C1C1E",
};

export const lightColors: ThemeColors = {
  bg: "#F2F2F7",
  card: "#FFFFFF",
  sheet: "#FFFFFF",
  separator: "#C6C6C8",
  text: "#1C1C1E",
  secondary: "#8E8E93",
  accent: "#007AFF",
  today: "#FF3B30",
  danger: "#FF3B30",
  drawer: "#FFFFFF",
  cancelBg: "#E5E5EA",
  tabBg: "rgba(0,0,0,0.03)",
  tabBorder: "rgba(0,0,0,0.10)",
  divider: "rgba(0,0,0,0.07)",
  primaryBtnText: "#1C1C1E",
  inputBg: "#E5E5EA",
};

export type ThemeMode = "dark" | "light";

type ThemeContextValue = {
  C: ThemeColors;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  C: darkColors,
  mode: "dark",
  setMode: () => {},
});

const STORAGE_KEY = "@theme_mode";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === "light" || v === "dark") setModeState(v);
    });
  }, []);

  function setMode(m: ThemeMode) {
    setModeState(m);
    void AsyncStorage.setItem(STORAGE_KEY, m);
  }

  return (
    <ThemeContext.Provider value={{ C: mode === "dark" ? darkColors : lightColors, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
