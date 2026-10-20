import { Image } from "expo-image";
import { Pressable, StyleSheet, View } from "react-native";
import type { ImageValue, LinkValue } from "@appsy/app-config";
import { gutter, space, useColors } from "@/lib/app-settings";
import { imageUrl } from "@/lib/format";
import { linkLabel, openLink } from "@/lib/links";
import { Text } from "./text";

export type BannerHeight = "adapt" | "small" | "medium" | "large";

export type BannerContent = {
  image: ImageValue | null;
  link: LinkValue | null;
  heading: string;
  buttonLabel: string;
};

const HEIGHT_SHARE = { small: 0.5, medium: 0.8, large: 1.15 } as const;

// A banner's height at this width: the picture's own shape (capped for very tall
// pictures), or a fixed share of the width.
export function bannerHeight(height: BannerHeight, width: number, image: ImageValue | null) {
  if (height === "adapt") {
    const ratio = image ? image.height / image.width : 0.6;
    return Math.round(width * Math.min(ratio, 1.6));
  }
  return Math.round(width * HEIGHT_SHARE[height]);
}

// One banner picture with its heading and button; a tap opens its link. Without a picture
// it's a block of the brand colour, so a newly added banner shows straight away.
export function BannerSlide({
  content,
  overlay,
  width,
  height,
}: {
  content: BannerContent;
  overlay: number;
  width: number;
  height: number;
}) {
  const colors = useColors();
  const { image, link, heading, buttonLabel } = content;

  const body = (
    <View style={{ width, height, backgroundColor: image ? "#F5F3EF" : colors.brand }}>
      {image && (
        <>
          <Image
            source={imageUrl(image.url, width * 3)}
            alt={image.alt || heading}
            contentFit="cover"
            transition={200}
            style={StyleSheet.absoluteFill}
          />
          {overlay > 0 && (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0, 0, 0, ${overlay / 100})` }]}
            />
          )}
        </>
      )}
      {heading || buttonLabel ? (
        <View style={styles.caption}>
          {heading ? (
            <Text accessibilityRole="header" style={styles.heading}>
              {heading}
            </Text>
          ) : null}
          {buttonLabel ? <Text style={styles.button}>{buttonLabel}</Text> : null}
        </View>
      ) : null}
    </View>
  );

  if (!link) return body;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={heading || buttonLabel || linkLabel(link)}
      onPress={() => openLink(link)}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  caption: {
    position: "absolute",
    left: gutter,
    right: gutter,
    bottom: space.xxl,
    alignItems: "center",
    gap: space.md,
  },
  heading: {
    color: "#FFFFFF",
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "600",
    letterSpacing: 0.5,
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.25)",
    textShadowRadius: 8,
  },
  button: {
    color: "#FFFFFF",
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    borderBottomWidth: 1,
    borderBottomColor: "#FFFFFF",
    paddingBottom: 2,
  },
});
