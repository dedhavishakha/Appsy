import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// Settings: Appsy's own terms and privacy. The switches for what the merchant's app does are
// on the Functionality page.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Settings() {
  return (
    <s-page heading="Settings">
      {/* Always reachable here as well as on Home, opening in a new window (5.7.7); the
          commission line repeats Home's (5.7.6). */}
      <s-section heading="Terms and privacy">
        <s-stack gap="small">
          <s-paragraph>
            Appsy doesn&apos;t take a commission on sales made through your app.
          </s-paragraph>
          <s-link href="/terms" target="_blank">
            Terms and conditions
          </s-link>
          <s-link href="/privacy" target="_blank">
            Privacy policy
          </s-link>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
