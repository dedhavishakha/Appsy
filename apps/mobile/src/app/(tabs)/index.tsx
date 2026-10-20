import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet } from "react-native";
import { space, useSettings } from "@/lib/app-settings";
import { Sections } from "@/sections";

// The home screen, built entirely from the published design's home page sections.
export default function HomeScreen() {
  const settings = useSettings();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  // Pull to refresh reloads the design and the store data.
  const refresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={{ backgroundColor: settings.theme.colors.background }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <Sections sections={settings.pages.home.sections} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xxl },
});
