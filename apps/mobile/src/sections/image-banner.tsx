import { useWindowDimensions } from "react-native";
import type { z } from "zod";
import type { imageBanner } from "@appsy/sections/manifests";
import { BannerSlide, bannerHeight } from "@/components/banner-slide";

type Settings = z.output<typeof imageBanner.settings>;

// One full-width picture; a tap opens its link.
export function ImageBanner({ settings }: { settings: Settings }) {
  const { width } = useWindowDimensions();
  return (
    <BannerSlide
      content={settings}
      overlay={settings.overlay}
      width={width}
      height={bannerHeight(settings.height, width, settings.image)}
    />
  );
}
