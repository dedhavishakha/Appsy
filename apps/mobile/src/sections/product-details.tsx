import { Image } from "expo-image";
import { router } from "expo-router";
import { useContext, useState } from "react";
import { FlatList, StyleSheet, useWindowDimensions, View } from "react-native";
import type { z } from "zod";
import type { BlockInstance } from "@appsy/app-config";
import type { productDetails } from "@appsy/sections/manifests";
import { ProductBlocks } from "@/blocks";
import { gutter, space } from "@/lib/app-settings";
import { useCartActions } from "@/lib/cart";
import { imageUrl } from "@/lib/format";
import { ProductContext } from "@/lib/page-context";
import { selectVariant } from "@/lib/product-selection";
import { isPreview } from "@/lib/settings";

// The product's images, then its blocks in the merchant's order (Product page).
export function ProductDetails({
  settings,
  blocks,
}: {
  settings: z.output<typeof productDetails.settings>;
  blocks: BlockInstance[];
}) {
  const product = useContext(ProductContext);
  const { width } = useWindowDimensions();
  const { add } = useCartActions();
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [showHint, setShowHint] = useState(false);
  if (!product) return null;

  const selection = selectVariant(product, chosen);
  const images = product.images.nodes.length
    ? product.images.nodes
    : product.featuredImage
      ? [product.featuredImage]
      : [];
  const imageWidth = Math.min(width, 600);
  const imageHeight = settings.imageShape === "square" ? imageWidth : (imageWidth * 4) / 3;

  const buy = () => {
    if (!selection.variant) {
      setShowHint(true);
      return;
    }
    // The editor's preview shows the button without creating carts on the store.
    if (isPreview) return;
    add.mutate(selection.variant.id, { onSuccess: () => router.push("/cart") });
  };

  return (
    <View>
      <FlatList
        horizontal
        pagingEnabled
        data={images}
        keyExtractor={(image) => image.url}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <Image
            source={imageUrl(item.url, imageWidth * 2)}
            alt={item.altText ?? product.title}
            contentFit="cover"
            transition={200}
            style={{ width: imageWidth, height: imageHeight, backgroundColor: "#F5F3EF" }}
          />
        )}
      />
      <View style={styles.blocks}>
        <ProductBlocks
          blocks={blocks}
          state={{
            ...selection,
            product,
            chosen,
            choose: (option, value) => setChosen((current) => ({ ...current, [option]: value })),
            showHint,
            buy,
            adding: add.isPending,
            addError: add.error?.message ?? null,
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  blocks: { paddingHorizontal: gutter, paddingTop: space.lg, gap: space.md },
});
