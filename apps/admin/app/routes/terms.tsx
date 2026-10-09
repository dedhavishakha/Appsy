import type { MetaFunction } from "react-router";

// Public page linked from the account section, opening in a new window (App Store
// requirement 5.7.7). Scopegen's real terms replace this text before Appsy's review.

export const meta: MetaFunction = () => [{ title: "Appsy terms and conditions" }];

export default function Terms() {
  return (
    <main
      style={{
        maxWidth: "40rem",
        margin: "0 auto",
        padding: "3rem 1rem",
        fontFamily: "Inter, sans-serif",
        lineHeight: 1.5,
      }}
    >
      <h1>Appsy terms and conditions</h1>
      <p>
        Appsy&apos;s full terms and conditions will be published here before Appsy
        launches on the Shopify App Store.
      </p>
    </main>
  );
}
