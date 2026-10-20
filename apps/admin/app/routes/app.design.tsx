import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { EDITOR_WINDOW_ID, EditorWindow } from "../components/editor-window";
import { authenticate } from "../shopify.server";
import { ensureShopSetup } from "../models/shop.server";
import { listVersions, liveKey } from "../models/design.server";
import { publicUrl } from "../models/storage.server";

// App design, like Shopify's Themes page: which version of the design the app has, and the
// button that opens the editor.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const appProjectId = shop.appProject.id;
  const versions = await listVersions(appProjectId);
  // eslint-disable-next-line no-undef
  const appUrl = process.env.SHOPIFY_APP_URL ?? "";

  return {
    versions,
    liveUrl: versions.some((version) => version.status === "published")
      ? publicUrl(appUrl, liveKey(appProjectId))
      : null,
  };
};

export default function AppDesign() {
  const { versions, liveUrl } = useLoaderData<typeof loader>();
  const live = versions.find((version) => version.status === "published");
  const draft = versions.find((version) => version.status === "draft");

  return (
    <s-page heading="App design">
      <EditorWindow />

      <s-section heading="Your app's design">
        <s-stack gap="base">
          <s-paragraph>
            {live
              ? `Version ${live.number} is live in your app.`
              : "Your app's design hasn't been published yet."}
            {draft ? " You have saved changes that aren't published." : ""}
          </s-paragraph>
          <s-stack direction="inline">
            <s-button variant="primary" commandFor={EDITOR_WINDOW_ID} command="--show">
              Customize
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Versions">
        <s-stack gap="small">
          {versions.map((version) => (
            <s-stack key={version.number} direction="inline" gap="small" alignItems="center">
              <s-text>Version {version.number}</s-text>
              <s-badge tone={STATUS_TONES[version.status]}>
                {STATUS_LABELS[version.status]}
              </s-badge>
              <s-text color="subdued">
                {formatUtc(version.publishedAt ?? version.updatedAt)}
              </s-text>
            </s-stack>
          ))}
          {liveUrl && (
            <s-link href={liveUrl} target="_blank">
              Open the live settings file
            </s-link>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

const STATUS_LABELS = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Live",
  archived: "Earlier",
} as const;

const STATUS_TONES = {
  draft: "info",
  scheduled: "warning",
  published: "success",
  archived: "neutral",
} as const;

// Shown in UTC so the server and browser render the same text.
function formatUtc(value: string | Date) {
  return `${new Date(value).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
