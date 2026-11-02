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

// Building the merchant's app and uploading it for testing, on the Publishing page
// (models/builds.server.ts): Android to Google Play's internal testing track, iPhone to App
// Store Connect for TestFlight. While a build moves along, the page looks again every 30
// seconds.

const REFRESH_MS = 30_000;

type Platform = "android" | "ios";

const PLATFORM_NAME: Record<Platform, string> = {
  android: "Android",
  ios: "iPhone",
};

const TONE: Record<BuildStatus, "info" | "success" | "warning" | "critical"> = {
  starting: "info",
  building: "info",
  uploading: "info",
  uploaded: "success",
  uploaded_draft: "warning",
  upload_failed: "critical",
  upload_refused: "warning",
  failed: "critical",
};

// The status in each store's words.
function statusLabel(status: BuildStatus, platform: Platform) {
  const ios = platform === "ios";
  switch (status) {
    case "starting":
      return "Starting";
    case "building":
      return "Building";
    case "uploading":
      return ios
        ? "Uploading to App Store Connect"
        : "Uploading to Google Play";
    case "uploaded":
      return ios ? "Sent to TestFlight" : "On internal testing";
    case "uploaded_draft":
      return "Draft release";
    case "upload_failed":
      return "Upload didn't work";
    case "upload_refused":
      return ios
        ? "App Store Connect has this build"
        : "Google Play has this version";
    case "failed":
      return "Build failed";
  }
}

// What each finished build means for the merchant.
function nextStep(status: BuildStatus, platform: Platform) {
  if (status === "uploaded") {
    return platform === "ios"
      ? "Apple processes the build first. Then it shows under TestFlight for your app in App Store Connect, where you invite testers."
      : "Your testers get this version from Google Play within minutes.";
  }
  if (status === "uploaded_draft") {
    return "In Play Console, open Test and release › Testing › Internal testing, then review the release and start its rollout.";
  }
  return "";
}

const asPlatform = (value: string): Platform =>
  value === "ios" ? "ios" : "android";

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

type Props = {
  android: BuildReadiness;
  ios: BuildReadiness;
  // What changed since each platform's last build (models/build-contents.server.ts).
  rebuild: Record<Platform, string[]>;
  builds: BuildRow[];
};

// How a new build reaches testers.
const REBUILD_STEP: Record<Platform, string> = {
  android:
    "Click Build Android app below, then update the app on your phone from Google Play.",
  ios: "Click Build iPhone app below. Testers get it in TestFlight once Apple has processed it.",
};

export function AppBuilds({ android, ios, rebuild, builds }: Props) {
  const fetcher = useFetcher<BuildResult>();
  const shopify = useAppBridge();
  const { revalidate } = useRevalidator();
  const busy = fetcher.state !== "idle";
  const pending = busy ? fetcher.formData : undefined;
  const result = busy ? undefined : fetcher.data;
  const active = builds.some((build) => ACTIVE_STATUSES.includes(build.status));
  const building = (platform: Platform) =>
    builds.some(
      (build) =>
        build.platform === platform && ACTIVE_STATUSES.includes(build.status),
    );

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
  // The same reason stops both, when builds can't run at all right now.
  const unavailable = android.unavailable ?? ios.unavailable;

  const platformBlock = (
    platform: Platform,
    readiness: BuildReadiness,
    intent: BuildIntent,
  ) => {
    const ready = !readiness.unavailable && readiness.missing.length === 0;
    const changes = rebuild[platform];
    return (
      <s-stack gap="small">
        {!building(platform) && changes.length > 0 && (
          <s-banner
            tone="warning"
            heading={`Build your ${PLATFORM_NAME[platform]} app again`}
          >
            <s-paragraph>Since its last build:</s-paragraph>
            <s-unordered-list>
              {changes.map((change) => (
                <s-list-item key={change}>{change}</s-list-item>
              ))}
            </s-unordered-list>
            <s-paragraph>{REBUILD_STEP[platform]}</s-paragraph>
          </s-banner>
        )}
        {!unavailable && readiness.missing.length > 0 && (
          <s-banner
            tone="info"
            heading={`Before you build for ${PLATFORM_NAME[platform]}`}
          >
            <s-unordered-list>
              {readiness.missing.map((step) => (
                <s-list-item key={step}>{step}</s-list-item>
              ))}
            </s-unordered-list>
          </s-banner>
        )}
        <s-stack direction="inline">
          <s-button
            variant={platform === "android" ? "primary" : "secondary"}
            disabled={!ready || building(platform) || undefined}
            loading={pending?.get("intent") === intent || undefined}
            onClick={() => submit(intent)}
          >
            {`Build ${PLATFORM_NAME[platform]} app`}
          </s-button>
        </s-stack>
      </s-stack>
    );
  };

  return (
    <s-section heading="Build and upload">
      <s-stack gap="base">
        <s-paragraph color="subdued">
          Appsy builds your app with your published design, app name and icon,
          and uploads it for testing: the Android app to Google Play&apos;s
          internal testing track, the iPhone app to App Store Connect for
          TestFlight. Building takes a while: you can leave this page, and the
          result shows here.
        </s-paragraph>

        {unavailable && <s-banner tone="warning">{unavailable}</s-banner>}
        {result && result.issues.length > 0 && (
          <s-banner tone="critical" heading="That didn't work">
            {result.issues.map((issue) => (
              <s-paragraph key={issue.message}>{issue.message}</s-paragraph>
            ))}
          </s-banner>
        )}

        {platformBlock("android", android, "build-android")}
        {platformBlock("ios", ios, "build-ios")}

        {builds.length > 0 && (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Started</s-table-header>
              <s-table-header listSlot="labeled">App</s-table-header>
              <s-table-header listSlot="inline">Status</s-table-header>
              <s-table-header listSlot="labeled">Version</s-table-header>
              <s-table-header listSlot="secondary">Details</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {builds.map((build) => {
                const platform = asPlatform(build.platform);
                return (
                  <s-table-row key={build.id}>
                    <s-table-cell>{startedOn(build.createdAt)}</s-table-cell>
                    <s-table-cell>{PLATFORM_NAME[platform]}</s-table-cell>
                    <s-table-cell>
                      <s-badge tone={TONE[build.status]}>
                        {statusLabel(build.status, platform)}
                      </s-badge>
                    </s-table-cell>
                    <s-table-cell>
                      {build.appVersion
                        ? `${build.appVersion}${build.buildNumber ? ` (${build.buildNumber})` : ""}`
                        : "—"}
                    </s-table-cell>
                    <s-table-cell>
                      <s-stack gap="small-200">
                        {(build.error ?? nextStep(build.status, platform))
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
                              {platform === "ios"
                                ? "Download app file (.ipa)"
                                : "Download app file (.aab)"}
                            </s-link>
                          )}
                          {build.status === "upload_failed" && (
                            <s-button
                              disabled={busy || undefined}
                              loading={
                                pending?.get("buildId") === build.id ||
                                undefined
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
                );
              })}
            </s-table-body>
          </s-table>
        )}

        <s-paragraph color="subdued">
          To add Android testers, open Test and release › Testing › Internal
          testing in Play Console, choose the Testers tab, create an email list
          and share the link shown there. An internal test can have up to 100
          testers. For iPhone, open your app in App Store Connect, then
          TestFlight, to invite testers by email or a public link.
        </s-paragraph>
      </s-stack>
    </s-section>
  );
}
