import "../global.css";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider, useTheme } from "@/lib/theme";
import type { ReactNode } from "react";

function AppShell({ children }: { children: ReactNode }) {
  const { mode } = useTheme();
  return (
    <>
      {children}
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ThemeProvider>
              <AppShell>
                <Slot />
              </AppShell>
            </ThemeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
