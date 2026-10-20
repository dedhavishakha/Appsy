import type { ProductDetail, ProductVariant } from "./queries";

// Which variant the shopper's option choices point to, and what to show before they've
// chosen (the lowest price).
export function selectVariant(product: ProductDetail, chosen: Record<string, string>) {
  const variants = product.variants.nodes;
  const singleVariant = variants.length === 1 && variants[0]?.title === "Default Title";
  const variant: ProductVariant | null = singleVariant
    ? (variants[0] ?? null)
    : (variants.find((candidate) =>
        candidate.selectedOptions.every((option) => chosen[option.name] === option.value),
      ) ?? null);
  const lowest = variants.reduce<ProductVariant | null>(
    (min, candidate) =>
      !min || Number(candidate.price.amount) < Number(min.price.amount) ? candidate : min,
    null,
  );
  return {
    variant,
    lowest,
    options: singleVariant ? [] : product.options,
    pricesVary: variants.some((candidate) => candidate.price.amount !== lowest?.price.amount),
    soldOut: variant ? !variant.availableForSale : !product.availableForSale,
  };
}

export type ProductSelection = ReturnType<typeof selectVariant>;
