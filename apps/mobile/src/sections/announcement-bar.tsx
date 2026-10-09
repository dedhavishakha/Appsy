import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import type { z } from "zod";
import type { announcementBar } from "@appsy/sections/manifests";
import { gutter, space } from "@/lib/app-settings";

type Settings = z.output<typeof announcementBar.settings>;

export function AnnouncementBar({ settings }: { settings: Settings }) {
  if (!settings.text) return null;
  const textStyle = [styles.text, { color: settings.textColor }];

  return (
    <View style={[styles.bar, { backgroundColor: settings.background }]}>
      {settings.scrolling ? (
        <Marquee text={settings.text} style={textStyle} />
      ) : (
        <Text style={[textStyle, styles.centred]} numberOfLines={2}>
          {settings.text}
        </Text>
      )}
    </View>
  );
}

// Text that slides from right to left, then starts again.
function Marquee({ text, style }: { text: string; style: object[] }) {
  const [widths, setWidths] = useState({ bar: 0, text: 0 });
  const offset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!widths.bar || !widths.text) return;
    offset.setValue(widths.bar);
    const animation = Animated.loop(
      Animated.timing(offset, {
        toValue: -widths.text,
        duration: (widths.bar + widths.text) * 25,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [widths, offset]);

  return (
    <View
      style={styles.marquee}
      onLayout={(event) => {
        const bar = event.nativeEvent.layout.width;
        setWidths((current) => ({ ...current, bar }));
      }}
    >
      <Animated.Text
        numberOfLines={1}
        onLayout={(event) => {
          const textWidth = event.nativeEvent.layout.width;
          setWidths((current) => ({ ...current, text: textWidth }));
        }}
        style={[...style, styles.marqueeText, { transform: [{ translateX: offset }] }]}
      >
        {text}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingVertical: space.sm + 2, paddingHorizontal: gutter },
  text: { fontSize: 12, letterSpacing: 0.8 },
  centred: { textAlign: "center" },
  marquee: { flexDirection: "row", overflow: "hidden" },
  marqueeText: { flexShrink: 0 },
});
