import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { z } from "zod";
import type { countdown } from "@appsy/sections/manifests";
import { Linked } from "@/components/linked";
import { PreviewNote } from "@/components/preview-note";
import { Text } from "@/components/text";
import { gutter, space } from "@/lib/app-settings";

type Settings = z.output<typeof countdown.settings>;

// Milliseconds until `endsAt`, updated every second; null without an end.
function useTimeLeft(endsAt: string | null) {
  const end = endsAt ? new Date(endsAt).getTime() : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (end === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [end]);
  return end === null ? null : Math.max(0, end - now);
}

function split(ms: number) {
  const total = Math.floor(ms / 1000);
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

// Time left until a sale or launch, as a block or a slim bar. Gone once the time is up.
export function Countdown({ settings }: { settings: Settings }) {
  const left = useTimeLeft(settings.endsAt);
  if (left === null) return <PreviewNote text="Choose when the countdown ends." />;
  if (left === 0) return null;

  const time = split(left);
  const color = settings.textColor;

  if (settings.style === "bar") {
    return (
      <Linked link={settings.link} label={settings.heading}>
        <View style={[styles.bar, { backgroundColor: settings.background }]}>
          <Text numberOfLines={1} style={[styles.barText, { color }]}>
            {settings.heading ? `${settings.heading}  ` : ""}
            {time.days > 0 ? `${time.days}d ` : ""}
            {pad(time.hours)}:{pad(time.minutes)}:{pad(time.seconds)}
          </Text>
        </View>
      </Linked>
    );
  }

  const units = [
    ["Days", time.days],
    ["Hours", time.hours],
    ["Minutes", time.minutes],
    ["Seconds", time.seconds],
  ] as const;
  return (
    <Linked link={settings.link} label={settings.heading}>
      <View style={[styles.block, { backgroundColor: settings.background }]}>
        {settings.heading ? (
          <Text accessibilityRole="header" style={[styles.heading, { color }]}>
            {settings.heading}
          </Text>
        ) : null}
        <View style={styles.units}>
          {units.map(([label, value]) => (
            <View key={label} style={styles.unit}>
              <Text style={[styles.value, { color }]}>{pad(value)}</Text>
              <Text style={[styles.label, { color }]}>{label}</Text>
            </View>
          ))}
        </View>
        {settings.text ? <Text style={[styles.text, { color }]}>{settings.text}</Text> : null}
        {settings.buttonLabel && settings.link ? (
          <Text style={[styles.button, { color, borderBottomColor: color }]}>
            {settings.buttonLabel}
          </Text>
        ) : null}
      </View>
    </Linked>
  );
}

const styles = StyleSheet.create({
  bar: { paddingVertical: space.sm + 2, paddingHorizontal: gutter, alignItems: "center" },
  barText: { fontSize: 12, letterSpacing: 1, fontVariant: ["tabular-nums"] },
  block: {
    marginTop: space.xxl,
    paddingVertical: space.xl,
    paddingHorizontal: gutter,
    alignItems: "center",
    gap: space.md,
  },
  heading: { fontSize: 16, letterSpacing: 1.6, textTransform: "uppercase", textAlign: "center" },
  units: { flexDirection: "row", gap: space.lg },
  unit: { alignItems: "center", minWidth: 56 },
  value: { fontSize: 30, fontWeight: "600", fontVariant: ["tabular-nums"] },
  label: { fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.8 },
  text: { fontSize: 14, lineHeight: 21, textAlign: "center", opacity: 0.9 },
  button: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    borderBottomWidth: 1,
    paddingBottom: 2,
  },
});
