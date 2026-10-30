import { Image } from "expo-image";
import { Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import type { SizeChartTable } from "@appsy/app-config";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { gutter, space, useColors } from "@/lib/app-settings";
import { useSizeChart } from "@/lib/size-chart";

// A size chart, sliding up over the product page: its table, then its picture, "How to
// measure" note and the store's size guide page, each only if the store added one.
export default function SizeChartScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const colors = useColors();
  const { data: chart, isLoading, isError } = useSizeChart(typeof id === "string" ? id : undefined);

  if (isLoading) {
    return (
      <View style={[styles.centred, { backgroundColor: colors.background }]}>
        <ActivityIndicator />
      </View>
    );
  }
  if (isError || !chart) {
    return (
      <View style={[styles.centred, { backgroundColor: colors.background }]}>
        <Text style={[styles.message, { color: colors.text }]}>
          {"This size chart couldn't be loaded. Please try again."}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: chart.name || "Size chart" }} />
      {chart.table && <SizeTable table={chart.table} />}
      {chart.image && (
        <Image
          source={chart.image.url}
          accessibilityLabel={chart.image.alt || `${chart.name} size chart`}
          contentFit="contain"
          style={[styles.image, { aspectRatio: chart.image.aspectRatio }]}
        />
      )}
      {chart.note ? <Text style={[styles.note, { color: colors.text }]}>{chart.note}</Text> : null}
      {chart.page && (
        <Button
          title={chart.page.title || "Size guide"}
          variant="secondary"
          onPress={() => void WebBrowser.openBrowserAsync(chart.page?.url ?? "")}
        />
      )}
    </ScrollView>
  );
}

// The table, scrolling sideways when it's wider than the phone. Each row reads as one
// sentence to screen readers ("Size S, Chest 36, Waist 30").
function SizeTable({ table }: { table: SizeChartTable }) {
  const colors = useColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View style={[styles.row, styles.headingRow, { borderColor: colors.text }]}>
          {table.columns.map((heading, column) => (
            <Text key={column} style={[styles.cell, styles.heading, { color: colors.text }]}>
              {heading}
            </Text>
          ))}
        </View>
        {table.rows.map((cells, row) => (
          <View
            key={row}
            accessible
            accessibilityLabel={table.columns
              .map((heading, column) => `${heading} ${cells[column] ?? ""}`.trim())
              .join(", ")}
            style={styles.row}
          >
            {table.columns.map((_, column) => (
              <Text key={column} style={[styles.cell, { color: colors.text }]}>
                {cells[column] ?? ""}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const CELL_WIDTH = 88;

const styles = StyleSheet.create({
  centred: { flex: 1, alignItems: "center", justifyContent: "center", padding: gutter },
  message: { fontSize: 15, textAlign: "center" },
  content: { padding: gutter, gap: space.xl },
  row: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#D4D4D4" },
  headingRow: { borderBottomWidth: 1 },
  cell: { width: CELL_WIDTH, paddingVertical: space.md, paddingRight: space.md, fontSize: 14 },
  heading: { fontWeight: "600" },
  image: { width: "100%" },
  note: { fontSize: 14, lineHeight: 21 },
});
