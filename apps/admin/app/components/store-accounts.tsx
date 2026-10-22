import { useEffect, useState, type ReactNode } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  APP_ID,
  APP_ID_MAX,
  APPLE_TEAM_TYPES,
  type AppleTeamType,
  type StoreAccounts,
  type StoreField,
  type StoreIntent,
  type StoreResult,
} from "../models/store-accounts";

// The merchant's App ID and store accounts, on the Publishing page. Key files are read in
// the browser, sent once to Appsy, tested with Apple or Google, kept in the vault and never
// shown again (models/store-accounts.server.ts). The merchant still submits the app for
// review in their own consoles.

type Props = {
  appId: string | null;
  suggestedAppId: string;
  accounts: StoreAccounts;
};

export function StoreAccountsSection({
  appId,
  suggestedAppId,
  accounts,
}: Props) {
  return (
    <s-section heading="Store accounts">
      <s-stack gap="base">
        <s-paragraph color="subdued">
          Appsy builds your app and uploads it for testing with keys from your
          own Apple and Google developer accounts. You still send it for review
          yourself. Keys are tested, stored encrypted and never shown again.
        </s-paragraph>
        <AppIdField
          appId={appId}
          suggestedAppId={suggestedAppId}
          locked={Boolean(accounts.google)}
        />
        <s-divider />
        <AppleAccount appId={appId} apple={accounts.apple} />
        <s-divider />
        <GoogleAccount appId={appId} google={accounts.google} />
      </s-stack>
    </s-section>
  );
}

// One fetcher per part of the section, with its issues and a toast when it worked.
function useStoreAction() {
  const fetcher = useFetcher<StoreResult>();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";
  const result = busy ? undefined : fetcher.data;

  useEffect(() => {
    const data = fetcher.data;
    if (fetcher.state === "idle" && data?.notice && data.issues.length === 0) {
      shopify.toast.show(data.notice);
    }
  }, [fetcher.state, fetcher.data, shopify]);

  return {
    busy,
    pending: busy ? fetcher.formData?.get("intent") : null,
    result,
    succeeded: (intent: StoreIntent) =>
      result?.intent === intent && result.issues.length === 0,
    errorFor: (field: StoreField) =>
      result?.issues.find((issue) => issue.field === field)?.message,
    general: result?.issues.filter((issue) => issue.field === null) ?? [],
    submit: (intent: StoreIntent, fields: Record<string, string> = {}) =>
      fetcher.submit({ intent, ...fields }, { method: "POST" }),
  };
}

function Problems({ issues }: { issues: { message: string }[] }) {
  if (issues.length === 0) return null;
  return (
    <s-banner tone="critical" heading="That didn't work">
      {issues.map((issue) => (
        <s-paragraph key={issue.message}>{issue.message}</s-paragraph>
      ))}
    </s-banner>
  );
}

const testedOn = (iso: string) =>
  new Date(iso).toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

function AppIdField({
  appId,
  suggestedAppId,
  locked,
}: {
  appId: string | null;
  suggestedAppId: string;
  locked: boolean;
}) {
  const action = useStoreAction();
  const [value, setValue] = useState(appId ?? suggestedAppId);
  const valid = APP_ID.test(value) && value.length <= APP_ID_MAX;

  return (
    <s-stack gap="small">
      <s-text-field
        label="App ID"
        value={value}
        maxLength={APP_ID_MAX}
        disabled={locked || undefined}
        details="Your app's bundle ID on the App Store and package name on Google Play: lowercase letters, numbers and dots, like com.yourbrand.app. It can't change after your app's first release."
        error={
          action.errorFor("appId") ??
          (value && !valid
            ? "Use lowercase letters, numbers and dots, like com.yourbrand.app."
            : undefined)
        }
        onInput={(event) =>
          setValue(event.currentTarget.value.trim().toLowerCase())
        }
      />
      {!appId && (
        <s-text color="subdued">
          Not saved yet. Appsy suggests {suggestedAppId}.
        </s-text>
      )}
      {locked && (
        <s-text color="subdued">
          To change it, disconnect Google Play first.
        </s-text>
      )}
      <Problems issues={action.general} />
      <s-stack direction="inline">
        <s-button
          disabled={locked || !valid || value === appId || undefined}
          loading={action.busy || undefined}
          onClick={() => action.submit("app-id", { appId: value })}
        >
          Save App ID
        </s-button>
      </s-stack>
    </s-stack>
  );
}

function AppleAccount({
  appId,
  apple,
}: {
  appId: string | null;
  apple: StoreAccounts["apple"];
}) {
  const action = useStoreAction();
  const [editing, setEditing] = useState(!apple);
  const [fields, setFields] = useState({
    issuerId: apple?.issuerId ?? "",
    keyId: apple?.keyId ?? "",
    teamId: apple?.teamId ?? "",
    teamType: (apple?.teamType ?? "COMPANY_OR_ORGANIZATION") as AppleTeamType,
  });
  const [ascAppId, setAscAppId] = useState(apple?.ascAppId ?? "");
  const [keyFile, setKeyFile] = useState<{ name: string; text: string } | null>(
    null,
  );
  const [fileProblem, setFileProblem] = useState<string>();

  // Disconnected elsewhere: show the form. Connected: close it and forget the key file.
  useEffect(() => {
    if (!apple) setEditing(true);
  }, [apple]);
  const connected = action.succeeded("apple");
  useEffect(() => {
    if (!connected) return;
    setEditing(false);
    setKeyFile(null);
  }, [connected]);

  const update = (change: Partial<typeof fields>) =>
    setFields((current) => ({ ...current, ...change }));

  return (
    <s-stack gap="base">
      <s-stack direction="inline" gap="small" alignItems="center">
        <s-heading>Apple App Store</s-heading>
        <s-badge tone={apple ? "success" : "neutral"}>
          {apple ? "Connected" : "Not connected"}
        </s-badge>
      </s-stack>
      <Problems issues={action.general} />

      {apple && !editing && (
        <s-stack gap="base">
          <s-paragraph>
            Key {apple.keyId}, team {apple.teamId} (
            {APPLE_TEAM_TYPES[apple.teamType]}). Tested{" "}
            {testedOn(apple.testedAt)}.
          </s-paragraph>
          {!appId ? (
            <s-text color="subdued">
              Save your App ID above, then register it with Apple here.
            </s-text>
          ) : apple.bundleRegistered ? (
            <s-text>Your App ID {appId} is registered with Apple.</s-text>
          ) : (
            <s-stack gap="small">
              <s-text>
                Your App ID isn&apos;t registered with Apple yet. Register it so
                you can choose it when you create your app in App Store Connect.
              </s-text>
              <s-stack direction="inline">
                <s-button
                  loading={action.pending === "register-bundle" || undefined}
                  onClick={() => action.submit("register-bundle")}
                >
                  Register App ID with Apple
                </s-button>
              </s-stack>
            </s-stack>
          )}
          <s-text-field
            label="Your app's Apple ID"
            value={ascAppId}
            details="In App Store Connect, open your app, then App Information. Add it once you've created the app."
            error={action.errorFor("ascAppId")}
            onInput={(event) => setAscAppId(event.currentTarget.value.trim())}
          />
          <s-stack direction="inline" gap="small">
            <s-button
              disabled={ascAppId === (apple.ascAppId ?? "") || undefined}
              loading={action.pending === "apple-app" || undefined}
              onClick={() => action.submit("apple-app", { ascAppId })}
            >
              Save Apple ID
            </s-button>
            <s-button variant="tertiary" onClick={() => setEditing(true)}>
              Replace key
            </s-button>
            <s-button
              variant="tertiary"
              tone="critical"
              commandFor="disconnect-apple"
              command="--show"
              loading={action.pending === "disconnect-apple" || undefined}
            >
              Disconnect
            </s-button>
          </s-stack>
        </s-stack>
      )}

      {editing && (
        <s-stack gap="base">
          <s-text-field
            label="Issuer ID"
            value={fields.issuerId}
            placeholder="57246542-96fe-1a63-e053-0824d011072a"
            details="App Store Connect › Users and Access › Integrations, at the top of the page."
            error={action.errorFor("issuerId")}
            onInput={(event) =>
              update({ issuerId: event.currentTarget.value.trim() })
            }
          />
          <s-text-field
            label="Key ID"
            value={fields.keyId}
            placeholder="2X9R4HXF34"
            details="Next to your key in the same list. Create the key with the Admin role."
            error={action.errorFor("keyId")}
            onInput={(event) =>
              update({ keyId: event.currentTarget.value.trim() })
            }
          />
          <s-text-field
            label="Team ID"
            value={fields.teamId}
            details="10 letters and numbers, under Membership details in your Apple Developer account."
            error={action.errorFor("teamId")}
            onInput={(event) =>
              update({ teamId: event.currentTarget.value.trim() })
            }
          />
          <s-select
            label="Account type"
            value={fields.teamType}
            error={action.errorFor("teamType")}
            onChange={(event) =>
              update({ teamType: event.currentTarget.value as AppleTeamType })
            }
          >
            {Object.entries(APPLE_TEAM_TYPES).map(([value, label]) => (
              <s-option key={value} value={value}>
                {label}
              </s-option>
            ))}
          </s-select>
          <s-drop-zone
            label="API key file (.p8)"
            accept=".p8"
            error={fileProblem ?? action.errorFor("privateKey")}
            onChange={(event) => {
              const file = event.currentTarget.files[0];
              setFileProblem(undefined);
              if (!file) return setKeyFile(null);
              if (file.size > 20_000) {
                setFileProblem(
                  "This file is too large to be an App Store Connect key.",
                );
                return;
              }
              void file
                .text()
                .then((text) => setKeyFile({ name: file.name, text }));
            }}
          />
          <s-text color="subdued">
            {keyFile
              ? `Chosen: ${keyFile.name}`
              : apple
                ? "Leave empty to keep the key you connected."
                : "Apple lets you download this file only once, when you create the key."}
          </s-text>
          <s-text-field
            label="Your app's Apple ID (optional)"
            value={ascAppId}
            details="In App Store Connect, open your app, then App Information. You can add it later."
            error={action.errorFor("ascAppId")}
            onInput={(event) => setAscAppId(event.currentTarget.value.trim())}
          />
          <s-stack direction="inline" gap="small">
            <s-button
              variant="primary"
              loading={action.pending === "apple" || undefined}
              onClick={() =>
                action.submit("apple", {
                  ...fields,
                  ascAppId,
                  privateKey: keyFile?.text ?? "",
                })
              }
            >
              Test and connect
            </s-button>
            {apple && (
              <s-button variant="tertiary" onClick={() => setEditing(false)}>
                Cancel
              </s-button>
            )}
          </s-stack>
        </s-stack>
      )}

      <DisconnectModal
        id="disconnect-apple"
        heading="Disconnect the App Store?"
        onConfirm={() => action.submit("disconnect-apple")}
      >
        Appsy deletes your App Store Connect key and can&apos;t upload new
        builds until you connect again. Your app and its listing stay in App
        Store Connect.
      </DisconnectModal>
    </s-stack>
  );
}

function GoogleAccount({
  appId,
  google,
}: {
  appId: string | null;
  google: StoreAccounts["google"];
}) {
  const action = useStoreAction();
  const [editing, setEditing] = useState(!google);
  const [keyFile, setKeyFile] = useState<{ name: string; text: string } | null>(
    null,
  );
  const [fileProblem, setFileProblem] = useState<string>();

  useEffect(() => {
    if (!google) setEditing(true);
  }, [google]);
  const connected = action.succeeded("google");
  useEffect(() => {
    if (!connected) return;
    setEditing(false);
    setKeyFile(null);
  }, [connected]);

  return (
    <s-stack gap="base">
      <s-stack direction="inline" gap="small" alignItems="center">
        <s-heading>Google Play</s-heading>
        <s-badge tone={google ? "success" : "neutral"}>
          {google ? "Connected" : "Not connected"}
        </s-badge>
      </s-stack>
      <Problems issues={action.general} />

      {google && !editing && (
        <s-stack gap="base">
          <s-paragraph>
            Service account {google.clientEmail}. Tested{" "}
            {testedOn(google.testedAt)}.
          </s-paragraph>
          <s-text color={google.appAccess ? undefined : "subdued"}>
            {google.appAccess
              ? `It can manage ${appId} in Play Console.`
              : `Google Play confirms its access to ${appId} at your app's first upload.`}
          </s-text>
          <s-stack direction="inline" gap="small">
            <s-button variant="tertiary" onClick={() => setEditing(true)}>
              Replace key
            </s-button>
            <s-button
              variant="tertiary"
              tone="critical"
              commandFor="disconnect-google"
              command="--show"
              loading={action.pending === "disconnect-google" || undefined}
            >
              Disconnect
            </s-button>
          </s-stack>
        </s-stack>
      )}

      {editing &&
        (!appId ? (
          <s-text color="subdued">
            Save your App ID above first: Google Play&apos;s key is tested for
            it.
          </s-text>
        ) : (
          <s-stack gap="base">
            <s-drop-zone
              label="Service account key (.json)"
              accept=".json,application/json"
              error={fileProblem ?? action.errorFor("serviceAccount")}
              onChange={(event) => {
                const file = event.currentTarget.files[0];
                setFileProblem(undefined);
                if (!file) return setKeyFile(null);
                if (file.size > 20_000) {
                  setFileProblem(
                    "This file is too large to be a service account key.",
                  );
                  return;
                }
                void file
                  .text()
                  .then((text) => setKeyFile({ name: file.name, text }));
              }}
            />
            <s-text color="subdued">
              {keyFile
                ? `Chosen: ${keyFile.name}`
                : `From Google Cloud, for a service account with access to ${appId} in Play Console.`}
            </s-text>
            <s-stack direction="inline" gap="small">
              <s-button
                variant="primary"
                disabled={!keyFile || undefined}
                loading={action.pending === "google" || undefined}
                onClick={() =>
                  keyFile &&
                  action.submit("google", { serviceAccount: keyFile.text })
                }
              >
                Test and connect
              </s-button>
              {google && (
                <s-button variant="tertiary" onClick={() => setEditing(false)}>
                  Cancel
                </s-button>
              )}
            </s-stack>
          </s-stack>
        ))}

      <DisconnectModal
        id="disconnect-google"
        heading="Disconnect Google Play?"
        onConfirm={() => action.submit("disconnect-google")}
      >
        Appsy deletes your service account key and can&apos;t upload new builds
        until you connect again. Your app and its listing stay in Play Console.
      </DisconnectModal>
    </s-stack>
  );
}

function DisconnectModal({
  id,
  heading,
  onConfirm,
  children,
}: {
  id: string;
  heading: string;
  onConfirm: () => void;
  children: ReactNode;
}) {
  return (
    <s-modal id={id} heading={heading}>
      <s-paragraph>{children}</s-paragraph>
      <s-button
        slot="primary-action"
        variant="primary"
        tone="critical"
        commandFor={id}
        command="--hide"
        onClick={onConfirm}
      >
        Disconnect
      </s-button>
      <s-button slot="secondary-actions" commandFor={id} command="--hide">
        Cancel
      </s-button>
    </s-modal>
  );
}
