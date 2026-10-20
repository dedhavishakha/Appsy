import { StyleSheet, View } from "react-native";
import { gutter, space } from "@/lib/app-settings";
import { isPreview } from "@/lib/settings";
import { Text } from "./text";

// A hint shown only in the editor's phone, for a section that needs a setting before it
// can show anything. Shoppers never see it.
export function PreviewNote({ text }: { text: string }) {
  if (!isPreview) return null;
  return (
    <View style={styles.note}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    marginTop: space.xxl,
    marginHorizontal: gutter,
    padding: space.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#B5B5B5",
    borderRadius: 8,
  },
  text: { color: "#6B6B6B", fontSize: 13, textAlign: "center" },
});
