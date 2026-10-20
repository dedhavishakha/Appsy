import { useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, useWindowDimensions, View } from "react-native";
import type { z } from "zod";
import type { BlockInstance } from "@appsy/app-config";
import { slide } from "@appsy/blocks/manifests";
import type { bannerCarousel } from "@appsy/sections/manifests";
import { BannerSlide, bannerHeight, type BannerContent } from "@/components/banner-slide";
import { space } from "@/lib/app-settings";

type Settings = z.output<typeof bannerCarousel.settings>;
type Slide = BannerContent & { id: string };

// The slides to show, in order. Hidden slides and any this release can't read are skipped.
function readSlides(blocks: BlockInstance[]): Slide[] {
  return blocks.flatMap((block) => {
    if (block.hidden || block.type !== slide.id) return [];
    const parsed = slide.settings.safeParse(block.settings);
    return parsed.success ? [{ id: block.id, ...parsed.data }] : [];
  });
}

// Full-width slides that swipe, and move on by themselves every few seconds (from
// Seeaash's hero carousel). All slides share the first picture's shape.
export function BannerCarousel({ settings, blocks }: { settings: Settings; blocks: BlockInstance[] }) {
  const { width } = useWindowDimensions();
  const slides = readSlides(blocks);
  const count = slides.length;
  const list = useRef<FlatList<Slide>>(null);
  const current = useRef(0);
  const touching = useRef(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (count < 2 || settings.autoplay === 0) return;
    const timer = setInterval(() => {
      if (touching.current) return;
      const next = (current.current + 1) % count;
      list.current?.scrollToOffset({ offset: next * width, animated: true });
      current.current = next;
      setIndex(next);
    }, settings.autoplay * 1000);
    return () => clearInterval(timer);
  }, [count, settings.autoplay, width]);

  if (count === 0) return null;
  const height = bannerHeight(
    settings.height,
    width,
    slides.find((item) => item.image)?.image ?? null,
  );
  const active = Math.min(index, count - 1);

  return (
    <View>
      <FlatList
        ref={list}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        scrollEventThrottle={32}
        onScrollBeginDrag={() => (touching.current = true)}
        onScrollEndDrag={() => (touching.current = false)}
        onScroll={(event) => {
          const shown = Math.round(event.nativeEvent.contentOffset.x / width);
          current.current = shown;
          setIndex(shown);
        }}
        renderItem={({ item }) => (
          <BannerSlide content={item} overlay={settings.overlay} width={width} height={height} />
        )}
      />
      {settings.showDots && count > 1 && (
        <View style={styles.dots} pointerEvents="none">
          {slides.map((item, i) => (
            <View key={item.id} style={[styles.dot, i === active && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: {
    position: "absolute",
    bottom: space.md,
    alignSelf: "center",
    flexDirection: "row",
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255, 255, 255, 0.5)" },
  dotActive: { width: 18, backgroundColor: "#FFFFFF" },
});
