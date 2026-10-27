import { useEffect } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  ACTIVE_STATUSES,
  type BuildIntent,
  type BuildReadiness,
  type BuildResult,
  type BuildRow,
  type BuildStatus,
} from "../models/builds";

// Building the merchant's app and uploading it to Google Play's internal testing track, on
// the Publishing page (models/builds.server.ts). While a build moves along, the page looks
// again every 30 seconds.

const REFRESH_MS = 30_000;

const STATUS: Record<
  BuildStatus,
  { label: string; tone: "info" | "success" | "warning" | "critical" }
> = {
  starting: { label: "Starting", tone: "info" },
  building: { label: "Building", tone: "info" },
  uploading: { label: "Uploading to Google Play", tone: "info" },
  uploaded: { label: "On internal testing", tone: "success" },
  uploaded_draft: { label: "Draft release", tone: "warning" },
  upload_failed: { label: "Upload didn't work", tone: "critical" },
  upload_refused: { label: "Google Play has this version", tone: "warning" },
  failed: { label: "Build failed", tone: "critical" },
};

// What each finished build means for the merchant.
const NEXT_STEP: Partial<Record<BuildStatus, string>> = {
  uploaded: "Your testers get this version from Google Play within minutes.",
  uploaded_draft:
    "In Play Console, open Test and release › Testing › Internal testing, then review the release and start its rollout.",
};

// Times show in UTC, so the server's page and the browser's match.
const startedOn = (iso: string) =>
  `${new Date(iso).toLocaleString("en", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  })} UTC`;

type Props = { android: BuildReadiness; builds: BuildRow[] };

export function AppBuilds({ android, builds }: Props) {
  const fetcher = useFetcher<BuildResult>();
  const shopify = useAppBridge();
  const { revalidate } = useRevalidator();
  const busy = fetcher.state !== "idle";
  const pending = busy ? fetcher.formData : undefined;
  const result = busy ? undefined : fetcher.data;
  const active = builds.some((build) => ACTIVE_STATUSES.includes(build.status));

  useEffect(() => {
    const data = fetcher.data;
    if (fetcher.state === "idle" && data?.notice && data.issues.length === 0) {
      shopify.toast.show(data.notice);
    }
  }, [fetcher.state, fetcher.data, shopify]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void revalidate(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, revalidate]);

  const submit = (intent: BuildIntent, fields: Record<string, string> = {}) =>
    fetcher.submit({ intent, ...fields }, { method: "POST" });
  const ready = !android.unavailable && android.missing.length === 0;

  return (
    <s-section heading="Build and upload">
      <s-stack gap="base">
        <s-paragraph color="subdued">
          Appsy builds your Android app with your published design, app name and
          icon, and uploads it to Google Play&apos;s internal testing track.
          Building takes a while: you can leave this page, and the result shows
          here.
        </s-paragraph>

        {android.unavailable && (
          <s-banner tone="warning">{android.unavailable}</s-banner>
        )}
        {!android.unavailable && android.missing.length > 0 && (
          <s-banner tone="info" heading="Before you build">
            <s-unordered-list>
              {android.missing.map((step) => (
                <s-list-item key={step}>{step}</s-list-item>
              ))}
            </s-unordered-list>
          </s-banner>
        )}
        {result && result.issues.length > 0 && (
          <s-banner tone="critical" heading="That didn't work">
            {result.issues.map((issue) => (
              <s-paragraph key={issue.message}>{issue.message}</s-paragraph>
            ))}
          </s-banner>
        )}

        <s-stack direction="inline" gap="small" alignItems="center">
          <s-button
            variant="primary"
            disabled={!ready || active || undefined}
            loading={pending?.get("intent") === "build-android" || undefined}
            onClick={() => submit("build-android")}
          >
            Build Android app
          </s-button>
          <s-text color="subdued">
            App Store builds aren&apos;t available yet.
          </s-text>
        </s-stack>

        {builds.length > 0 && (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Started</s-table-header>
              <s-table-header listSlot="inline">Status</s-table-header>
              <s-table-header listSlot="labeled">Version</s-table-header>
              <s-table-header listSlot="secondary">Details</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {builds.map((build) => (
                <s-table-row key={build.id}>
                  <s-table-cell>{startedOn(build.createdAt)}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={STATUS[build.status].tone}>
                      {STATUS[build.status].label}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    {build.appVersion
                      ? `${build.appVersion}${build.buildNumber ? ` (${build.buildNumber})` : ""}`
                      : "—"}
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack gap="small-200">
                      {(build.error ?? NEXT_STEP[build.status] ?? "")
                        .split("\n")
                        .filter(Boolean)
                        .map((line, index) => (
                          <s-text key={index}>{line}</s-text>
                        ))}
                      <s-stack
                        direction="inline"
                        gap="small"
                        alignItems="center"
                      >
                        {build.artifactUrl && (
                          <s-link href={build.artifactUrl} target="_blank">
                            Download app file (.aab)
                          </s-link>
                        )}
                        {build.status === "upload_failed" && (
                          <s-button
                            disabled={busy || undefined}
                            loading={
                              pending?.get("buildId") === build.id || undefined
                            }
                            onClick={() =>
                              submit("upload-again", { buildId: build.id })
                            }
                          >
                            Try the upload again
                          </s-button>
                        )}
                      </s-stack>
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}

        <s-paragraph color="subdued">
          To add testers, open Test and release › Testing › Internal testing in
          Play Console, choose the Testers tab, create an email list and share
          the link shown there. An internal test can have up to 100 testers.
        </s-paragraph>
      </s-stack>
    </s-section>
  );
}
