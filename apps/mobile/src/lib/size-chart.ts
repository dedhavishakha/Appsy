import { useQuery } from "@tanstack/react-query";
import {
  pickSizeChart,
  readSizeChartTable,
  sizeChartSettingsOf,
  type PublishedSettings,
  type SizeChartTable,
} from "@appsy/app-config";
import { useSettings } from "./app-settings";
import { SIZE_CHART_QUERY, type ProductDetail, type SizeChartData } from "./queries";
import { storefront } from "./storefront";

// Size charts (app-config size-charts.ts): which chart a product shows, from the store's
// settings, and the chart itself, read from the store's Shopify when it opens.

// The chart this product shows; null when it has none or size charts are off.
export function useSizeChartId(product: ProductDetail): string | null {
  const settings = sizeChartSettingsOf(useSettings());
  if (!settings) return null;
  return pickSizeChart(
    {
      id: product.id,
      productType: product.productType ?? "",
      vendor: product.vendor ?? "",
      tags: product.tags ?? [],
      collectionIds: product.collections?.nodes.map((collection) => collection.id) ?? [],
    },
    settings,
  );
}

export type SizeChart = {
  name: string;
  table: SizeChartTable | null;
  note: string;
  image: { url: string; alt: string; aspectRatio: number } | null;
  page: { title: string; url: string } | null;
};

async function loadSizeChart(settings: PublishedSettings, id: string): Promise<SizeChart | null> {
  const { metaobject } = await storefront<SizeChartData>(settings.shop, SIZE_CHART_QUERY, { id });
  if (!metaobject) return null;
  const image = metaobject.image?.reference?.image;
  const page = metaobject.page?.reference;
  return {
    name: metaobject.name?.value ?? "",
    table: readSizeChartTable(metaobject.table?.value),
    note: metaobject.note?.value ?? "",
    image:
      image && image.width > 0 && image.height > 0
        ? { url: image.url, alt: image.altText ?? "", aspectRatio: image.width / image.height }
        : null,
    page: page?.onlineStoreUrl ? { title: page.title, url: page.onlineStoreUrl } : null,
  };
}

export function useSizeChart(id: string | undefined) {
  const settings = useSettings();
  return useQuery({
    queryKey: ["size-chart", id],
    queryFn: () => loadSizeChart(settings, id ?? ""),
    enabled: Boolean(id),
  });
}
