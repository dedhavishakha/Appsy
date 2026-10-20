import { useContext } from "react";
import type { z } from "zod";
import type { productGrid } from "@appsy/sections/manifests";
import { ProductResults } from "@/components/product-results";
import { CollectionContext } from "@/lib/page-context";

// The collection's products in the merchant's number of columns (Collection page), with the
// store's filters and sort orders when the merchant shows them.
export function ProductGrid({ settings }: { settings: z.output<typeof productGrid.settings> }) {
  const collection = useContext(CollectionContext);
  if (!collection) return null;
  return (
    <ProductResults
      {...collection.listing}
      products={collection.products}
      showFilters={settings.filters}
      showSorting={settings.sorting}
      columns={Number(settings.columns)}
      showPrice={settings.showPrice}
    />
  );
}
