import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SettingsContext } from "@/lib/app-settings";
import { fetchSettings } from "@/lib/settings";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <DesignGate />
    </QueryClientProvider>
  );
}

// Loads the merchant's published design before any screen draws.
function DesignGate() {
  const { data: settings, error, isLoading, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings,
  });

  if (isLoading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!settings) {
    return (
      <View style={styles.centred}>
        <Text style={styles.message}>
          {error instanceof Error ? error.message : "The app couldn't load."}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => refetch()}>
          <Text style={styles.retry}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const { colors } = settings.theme;
  return (
    <SettingsContext.Provider value={settings}>
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerTitleAlign: "center",
          headerTintColor: colors.text,
          headerStyle: { backgroundColor: colors.background },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Home" }} />
        <Stack.Screen name="collections/[handle]" options={{ title: "" }} />
      </Stack>
      <StatusBar style="dark" />
    </SettingsContext.Provider>
  );
}

const styles = StyleSheet.create({
  centred: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  message: { textAlign: "center", fontSize: 15 },
  retry: { fontSize: 15, fontWeight: "600", textDecorationLine: "underline" },
});
