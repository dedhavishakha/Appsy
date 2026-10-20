import type { Ref } from "react";
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";
import { useTypography, type Families } from "@/lib/fonts";

// Text in the merchant's fonts (Theme settings in the editor). Headings, which screen
// readers know by accessibilityRole "header", use the heading font; everything else the
// body font. Every screen uses these in place of React Native's own.
export function Text({ ref, ...props }: TextProps & { ref?: Ref<NativeText> }) {
  const { heading, body } = useTypography();
  const isHeading = props.accessibilityRole === "header" || props.role === "heading";
  return (
    <NativeText {...props} ref={ref} style={withFont(props.style, isHeading ? heading : body)} />
  );
}

// What shoppers type, in the body font.
export function TextInput({ ref, ...props }: TextInputProps & { ref?: Ref<NativeTextInput> }) {
  const { body } = useTypography();
  return <NativeTextInput {...props} ref={ref} style={withFont(props.style, body)} />;
}

const BOLD_NAMES = new Set(["bold", "semibold", "heavy", "black", "condensedBold"]);

// Bold text (weight 600 and up) uses the font's bold file, drawn at its own weight rather
// than made bolder again. A style that names its own font keeps it.
function withFont(style: StyleProp<TextStyle>, families: Families): StyleProp<TextStyle> {
  if (!families) return style;
  const { fontFamily, fontWeight } = StyleSheet.flatten(style) ?? {};
  if (fontFamily) return style;
  const bold =
    typeof fontWeight === "number"
      ? fontWeight >= 600
      : fontWeight !== undefined && (BOLD_NAMES.has(fontWeight) || Number(fontWeight) >= 600);
  return [style, { fontFamily: bold ? families.bold : families.regular, fontWeight: "normal" }];
}
