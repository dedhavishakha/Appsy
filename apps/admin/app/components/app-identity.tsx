import { useEffect, useRef, useState, type FormEvent } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { ImageValue } from "@appsy/app-config";
import {
  ANDROID_SHOWN_RATIO,
  APP_NAME_MAX,
  ICON_SIZE,
  SPLASH_IMAGE_WIDTH,
  type IdentityField,
  type IdentityIssue,
  type IdentitySettings,
} from "../models/identity";
import { ImagePicker } from "./setting-control";
import { ColorSetting } from "./theme-settings";
import { usePickImage } from "./use-pick-image";

// The app's name, icon and splash screen, on the Publishing page. Unlike the design, they
// reach the app with its next build (models/identity.server.ts makes the files). Saved
// with Shopify's save bar, as in the editor (a hidden field carries the choices), or with
// the section's own Save button: the save bar sits above the page, where merchants
// testing the build button missed it (2026-10-26).

type Saved = { appName: string; settings: IdentitySettings };

export function AppIdentity({
  appName: savedName,
  settings: savedSettings,
  filesAccess,
}: Saved & { filesAccess: boolean }) {
  const shopify = useAppBridge();
  const pickImage = usePickImage();
  const fetcher = useFetcher<{ issues: IdentityIssue[] }>();
  const [initialJson] = useState(() =>
    JSON.stringify({ appName: savedName, settings: savedSettings }),
  );
  const [savedJson, setSavedJson] = useState(initialJson);
  const [appName, setAppName] = useState(savedName);
  const [settings, setSettings] = useState(savedSettings);
  const choices = useRef<HTMLInputElement>(null);
  const pendingJson = useRef<string | null>(null);

  const json = JSON.stringify({ appName, settings });
  const dirty = json !== savedJson;
  const busy = fetcher.state !== "idle";
  const issues = busy ? [] : (fetcher.data?.issues ?? []);
  const errorFor = (field: IdentityField) =>
    issues.find((issue) => issue.field === field)?.message;
  const general = issues.filter((issue) => issue.field === null);

  // Shopify's save bar watches the form's fields (Save Bar docs: a hidden input bridges
  // React state to data-save-bar).
  useEffect(() => {
    const input = choices.current;
    if (!input || input.value === json) return;
    input.value = json;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, [json]);

  useEffect(() => {
    if (
      fetcher.state !== "idle" ||
      !fetcher.data ||
      pendingJson.current === null
    )
      return;
    if (fetcher.data.issues.length === 0) {
      setSavedJson(pendingJson.current);
      if (choices.current) {
        // Saved values are the form's new starting point, so the save bar hides too when
        // the section's Save button was used.
        choices.current.defaultValue = pendingJson.current;
        choices.current.dispatchEvent(new Event("input", { bubbles: true }));
      }
      shopify.toast.show("Saved. Your app gets these with its next build.");
    } else {
      // Nothing was saved, so bring the save bar back.
      choices.current?.dispatchEvent(new Event("input", { bubbles: true }));
    }
    pendingJson.current = null;
  }, [fetcher.state, fetcher.data, shopify]);

  const save = () => {
    pendingJson.current = json;
    fetcher.submit(
      { intent: "identity", appName, settings: JSON.stringify(settings) },
      { method: "POST" },
    );
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save();
  };

  const discard = () => {
    const saved = JSON.parse(savedJson) as Saved;
    setAppName(saved.appName);
    setSettings(saved.settings);
  };

  const update = (change: Partial<IdentitySettings>) =>
    setSettings((current) => ({ ...current, ...change }));
  const tools = { pickImage, filesAccess };
  const icon = settings.icon;
  const tooSmall =
    icon && Math.min(icon.width, icon.height) < ICON_SIZE
      ? `Choose an icon at least ${ICON_SIZE} × ${ICON_SIZE} pixels. This one is ${icon.width} × ${icon.height}.`
      : undefined;

  return (
    <s-section heading="App name and icon">
      <form
        data-save-bar
        data-discard-confirmation
        onSubmit={submit}
        onReset={discard}
      >
        <input
          ref={choices}
          type="hidden"
          name="identity"
          defaultValue={initialJson}
        />
      </form>
      <s-stack gap="base">
        <s-paragraph color="subdued">
          These reach your app with its next build. Design changes you publish
          still show in your app straight away.
        </s-paragraph>
        {general.length > 0 && (
          <s-banner tone="critical" heading="Your changes weren't saved">
            {general.map((issue) => (
              <s-paragraph key={issue.message}>{issue.message}</s-paragraph>
            ))}
          </s-banner>
        )}

        <s-text-field
          label="App name"
          value={appName}
          maxLength={APP_NAME_MAX}
          details={`Shown under your app's icon on phones. Up to ${APP_NAME_MAX} characters.`}
          error={errorFor("appName")}
          onInput={(event) => setAppName(event.currentTarget.value)}
        />

        <s-divider />

        <ImagePicker
          label="Icon"
          value={icon}
          error={errorFor("icon") ?? tooSmall}
          tools={tools}
          onChange={(picked) => update({ icon: picked })}
        />
        <s-text color="subdued">
          Square, at least {ICON_SIZE} × {ICON_SIZE} pixels, and filling the
          whole square with no rounded corners: phones round the corners
          themselves. A picture that isn&apos;t square is cropped to its middle.
        </s-text>
        <ColorSetting
          label="Icon background"
          details="Shows behind see-through parts of your icon, and around it on Android phones."
          value={settings.iconBackground}
          error={errorFor("iconBackground")}
          onChange={(color) => update({ iconBackground: color })}
        />
        {icon && (
          <IconPreviews icon={icon} background={settings.iconBackground} />
        )}

        <s-divider />

        <ImagePicker
          label="Splash screen picture"
          value={settings.splashImage}
          error={errorFor("splashImage")}
          tools={tools}
          onChange={(picked) => update({ splashImage: picked })}
        />
        <s-text color="subdued">
          Shown in the middle of the screen while your app opens. Leave it empty
          to use your icon. A logo with a see-through background looks best.
        </s-text>
        <ColorSetting
          label="Splash screen background"
          details="Fills the screen behind the picture."
          value={settings.splashBackground}
          error={errorFor("splashBackground")}
          onChange={(color) => update({ splashBackground: color })}
        />
        <SplashPreview
          image={settings.splashImage ?? icon}
          background={settings.splashBackground}
        />

        <s-stack direction="inline" gap="small" alignItems="center">
          <s-button
            variant="primary"
            disabled={!dirty || busy || undefined}
            loading={busy || undefined}
            onClick={save}
          >
            Save app name and icon
          </s-button>
          {dirty && !busy && (
            <s-text color="subdued">You have unsaved changes.</s-text>
          )}
        </s-stack>
      </s-stack>
    </s-section>
  );
}

const PREVIEW_ICON = 72;

// How the icon looks on each phone: an iPhone rounds its corners; Android puts it in a
// shape the phone chooses (shown as a circle), on the background colour.
function IconPreviews({
  icon,
  background,
}: {
  icon: ImageValue;
  background: string;
}) {
  const inner = Math.round(PREVIEW_ICON * ANDROID_SHOWN_RATIO);
  return (
    <s-stack direction="inline" gap="large">
      <s-stack gap="small" alignItems="center">
        <div
          style={{
            width: PREVIEW_ICON,
            height: PREVIEW_ICON,
            borderRadius: PREVIEW_ICON * 0.225,
            overflow: "hidden",
            background,
          }}
        >
          <img
            src={icon.url}
            alt="Your icon on an iPhone"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
        <s-text color="subdued">iPhone</s-text>
      </s-stack>
      <s-stack gap="small" alignItems="center">
        <div
          style={{
            width: PREVIEW_ICON,
            height: PREVIEW_ICON,
            borderRadius: "50%",
            overflow: "hidden",
            background,
            display: "grid",
            placeItems: "center",
          }}
        >
          <img
            src={icon.url}
            alt="Your icon on an Android phone"
            style={{ width: inner, height: inner, objectFit: "cover" }}
          />
        </div>
        <s-text color="subdued">Android</s-text>
      </s-stack>
    </s-stack>
  );
}

// A phone-shaped card (390 × 844 points, scaled down) with the picture in the middle,
// as wide as the app draws it.
const PHONE = { width: 130, height: 281 };

function SplashPreview({
  image,
  background,
}: {
  image: ImageValue | null;
  background: string;
}) {
  return (
    <s-stack gap="small">
      <div
        style={{
          width: PHONE.width,
          height: PHONE.height,
          borderRadius: 18,
          border: "1px solid #E3E3E3",
          background,
          display: "grid",
          placeItems: "center",
        }}
      >
        {image && (
          <img
            src={image.url}
            alt="Your splash screen"
            style={{
              width: Math.round((PHONE.width * SPLASH_IMAGE_WIDTH) / 390),
              height: "auto",
            }}
          />
        )}
      </div>
      <s-text color="subdued">Splash screen</s-text>
    </s-stack>
  );
}
