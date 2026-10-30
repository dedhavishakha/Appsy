import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { z } from "zod";
import type {
  buyButtons,
  collapsibleTab,
  featureWithIcon,
  productDescription,
  productPrice,
  productTitle,
  separator,
  text,
  variantPicker,
} from "@appsy/blocks/manifests";
import { Button } from "@/components/button";
import { FeatureIcon } from "@/components/feature-icon";
import { Text } from "@/components/text";
import { space, useColors } from "@/lib/app-settings";
import { useMoney } from "@/lib/currency";
import { isDiscounted } from "@/lib/format";
import type { ProductDetail } from "@/lib/queries";
import type { ProductSelection } from "@/lib/product-selection";
import { useSizeChartId } from "@/lib/size-chart";
import { paragraphs } from "@/lib/text";

// What the Product details section shares with its blocks.
export type ProductBlockState = ProductSelection & {
  product: ProductDetail;
  chosen: Record<string, string>;
  choose: (option: string, value: string) => void;
  showHint: boolean;
  buy: () => void;
  adding: boolean;
  addError: string | null;
};

type Props<Settings extends z.ZodType> = {
  settings: z.output<Settings>;
  state: ProductBlockState;
};

export function ProductTitle({ settings, state }: Props<typeof productTitle.settings>) {
  const colors = useColors();
  return (
    <Text
      accessibilityRole="header"
      style={[styles.title, { color: colors.text, textAlign: settings.alignment }]}
    >
      {state.product.title}
    </Text>
  );
}

export function ProductPrice({ settings, state }: Props<typeof productPrice.settings>) {
  const colors = useColors();
  const money = useMoney();
  const shown = state.variant ?? state.lowest;
  if (!shown) return null;
  const onSale = settings.showCompareAt && isDiscounted(shown.price, shown.compareAtPrice);
  return (
    <View style={styles.priceRow}>
      <Text style={[styles.price, { color: onSale ? colors.accent : colors.text }]}>
        {!state.variant && state.pricesVary ? "From " : ""}
        {money.format(shown.price)}
      </Text>
      {onSale && shown.compareAtPrice && (
        <Text style={[styles.compareAt, { color: colors.text }]}>
          {money.format(shown.compareAtPrice)}
        </Text>
      )}
    </View>
  );
}

// The product's options, then a "Size chart" link when it has a chart (lib/size-chart.ts).
export function VariantPicker({ settings, state }: Props<typeof variantPicker.settings>) {
  const colors = useColors();
  const chart = useSizeChartId(state.product);
  return (
    <>
      <Options state={state} showNames={settings.showOptionNames} />
      {settings.sizeChart && chart && (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: "/size-chart", params: { id: chart } })}
          hitSlop={8}
          style={styles.sizeChart}
        >
          <Ionicons name="resize-outline" size={16} color={colors.text} />
          <Text style={[styles.sizeChartLabel, { color: colors.text }]}>Size chart</Text>
        </Pressable>
      )}
    </>
  );
}

function Options({ state, showNames }: { state: ProductBlockState; showNames: boolean }) {
  const colors = useColors();
  return state.options.map((option) => (
    <View key={option.name} style={styles.option}>
      {(showNames || (state.showHint && !state.chosen[option.name])) && (
        <Text style={[styles.optionName, { color: colors.text }]}>
          {state.showHint && !state.chosen[option.name]
            ? `Please choose a ${option.name.toLowerCase()}`
            : option.name}
        </Text>
      )}
      <View style={styles.choices}>
        {option.optionValues.map(({ name }) => {
          const active = state.chosen[option.name] === name;
          return (
            <Pressable
              key={name}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => state.choose(option.name, name)}
              style={[
                styles.choice,
                {
                  borderColor: active ? colors.text : "#D4D4D4",
                  backgroundColor: active ? colors.text : "transparent",
                },
              ]}
            >
              <Text style={{ color: active ? colors.background : colors.text }}>{name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  ));
}

export function BuyButtons({ settings, state }: Props<typeof buyButtons.settings>) {
  return (
    <View>
      <Button
        title={state.soldOut ? "Sold out" : settings.label || "Add to bag"}
        disabled={state.soldOut}
        loading={state.adding}
        onPress={state.buy}
        style={styles.buy}
      />
      {state.addError && <Text style={styles.error}>{state.addError}</Text>}
    </View>
  );
}

export function ProductDescription({ settings, state }: Props<typeof productDescription.settings>) {
  const colors = useColors();
  if (!state.product.description) return null;
  return (
    <View style={styles.description}>
      {settings.heading ? (
        <Text style={[styles.descriptionHeading, { color: colors.text }]}>{settings.heading}</Text>
      ) : null}
      <Text style={[styles.descriptionText, { color: colors.text }]}>
        {state.product.description}
      </Text>
    </View>
  );
}

const TEXT_SIZES = { small: 13, regular: 15, large: 18 } as const;

export function TextBlock({ settings }: Props<typeof text.settings>) {
  const colors = useColors();
  const body = paragraphs(settings.text);
  if (body.length === 0) return null;
  const fontSize = TEXT_SIZES[settings.size];
  return (
    <View style={styles.description}>
      {body.map((paragraph, index) => (
        <Text
          key={index}
          style={[styles.descriptionText, { color: colors.text, fontSize, lineHeight: fontSize * 1.5 }]}
        >
          {paragraph}
        </Text>
      ))}
    </View>
  );
}

export function Separator(_props: Props<typeof separator.settings>) {
  return <View style={styles.separator} />;
}

export function FeatureWithIcon({ settings }: Props<typeof featureWithIcon.settings>) {
  const colors = useColors();
  if (!settings.text) return null;
  return (
    <View style={styles.feature}>
      <FeatureIcon name={settings.icon} color={colors.brand} size={20} />
      <Text style={[styles.featureText, { color: colors.text }]}>{settings.text}</Text>
    </View>
  );
}

export function CollapsibleTab({ settings }: Props<typeof collapsibleTab.settings>) {
  const colors = useColors();
  const [open, setOpen] = useState(settings.open);
  const body = paragraphs(settings.content);
  if (!settings.heading) return null;
  return (
    <View style={styles.tab}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={styles.tabHeader}
      >
        <Text style={[styles.tabHeading, { color: colors.text }]}>{settings.heading}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.text} />
      </Pressable>
      {open &&
        body.map((paragraph, index) => (
          <Text key={index} style={[styles.descriptionText, { color: colors.text }]}>
            {paragraph}
          </Text>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: "#D4D4D4" },
  feature: { flexDirection: "row", alignItems: "center", gap: space.sm },
  featureText: { flex: 1, fontSize: 14 },
  tab: {
    gap: space.sm,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#D4D4D4",
  },
  tabHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tabHeading: { fontSize: 13, letterSpacing: 1, textTransform: "uppercase" },
  title: { fontSize: 18, letterSpacing: 1.2, textTransform: "uppercase" },
  priceRow: { flexDirection: "row", justifyContent: "center", alignItems: "baseline", gap: space.sm },
  price: { fontSize: 18, fontWeight: "500" },
  compareAt: { fontSize: 14, opacity: 0.55, textDecorationLine: "line-through" },
  option: { gap: space.sm },
  optionName: { fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  sizeChart: { flexDirection: "row", alignItems: "center", gap: space.xs, alignSelf: "flex-start" },
  sizeChartLabel: { fontSize: 14, textDecorationLine: "underline" },
  choice: {
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minWidth: 44,
    alignItems: "center",
  },
  buy: { alignSelf: "stretch", marginTop: 0 },
  error: { color: "#B3261E", textAlign: "center", marginTop: space.xs },
  description: { gap: space.sm },
  descriptionHeading: { fontSize: 13, letterSpacing: 1, textTransform: "uppercase" },
  descriptionText: { fontSize: 14, lineHeight: 21 },
});
