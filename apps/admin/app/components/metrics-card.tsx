import { Fragment } from "react";

export type Metric = {
  label: string;
  value: string;
  // Percentage change against the period before, or null when there's nothing to compare.
  change?: number | null;
  note?: string;
};

// Polaris's "Metrics card" composition: numbers side by side (stacked in narrow windows),
// each with its change against the period before, as Polaris advises when history adds
// context. Each opens `href` when given.
export function MetricsCard({
  metrics,
  href,
}: {
  metrics: Metric[];
  href?: string;
}) {
  const columns = metrics.map(() => "1fr").join(" auto ");
  return (
    <s-section padding="base">
      <s-grid
        gridTemplateColumns={`@container (inline-size <= 400px) 1fr, ${columns}`}
        gap="small"
      >
        {metrics.map((metric, index) => (
          <Fragment key={metric.label}>
            {index > 0 && <s-divider direction="block" />}
            <s-clickable
              href={href}
              paddingBlock="small-400"
              paddingInline="small-100"
              borderRadius="base"
            >
              <s-grid gap="small-300">
                <s-heading>{metric.label}</s-heading>
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-text>{metric.value}</s-text>
                  <Change change={metric.change} />
                </s-stack>
                {metric.note && <s-text color="subdued">{metric.note}</s-text>}
              </s-grid>
            </s-clickable>
          </Fragment>
        ))}
      </s-grid>
    </s-section>
  );
}

function Change({ change }: { change?: number | null }) {
  if (change === undefined || change === null || !Number.isFinite(change))
    return null;
  const rounded = Math.round(Math.abs(change));
  if (rounded === 0) return <s-badge>0%</s-badge>;
  return change > 0 ? (
    <s-badge tone="success" icon="arrow-up">{`${rounded}%`}</s-badge>
  ) : (
    <s-badge tone="critical" icon="arrow-down">{`${rounded}%`}</s-badge>
  );
}

// The change from `before` to `now`, in percent; null when there was nothing before.
export function percentChange(now: number, before: number): number | null {
  return before > 0 ? ((now - before) / before) * 100 : null;
}

export function formatCount(value: number) {
  return value.toLocaleString("en");
}

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(
    amount,
  );
}
