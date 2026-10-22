import { useState } from "react";
import {
  FONT_OPTIONS,
  THEME_PRESETS,
  type AppDesign,
  type ImageValue,
  type ThemePreset,
} from "@appsy/app-config";
import { ImagePicker, type SettingTools } from "./setting-control";

type Theme = AppDesign["theme"];
type Colors = Theme["colors"];

const COLOR_FIELDS: { key: keyof Colors; label: string; details: string }[] = [
  {
    key: "brand",
    label: "Buttons and highlights",
    details: "Main buttons, the selected tab, hearts, the bag count and ticks.",
  },
  {
    key: "background",
    label: "Background",
    details: "Behind every page.",
  },
  {
    key: "text",
    label: "Text and icons",
    details: "Words, and icons such as Search and Bag.",
  },
  {
    key: "accent",
    label: "Sale prices",
    details: "Sale prices and discounts.",
  },
];

const SHAPES: Record<Theme["buttons"]["shape"], string> = {
  square: "Square",
  rounded: "Rounded",
  pill: "Pill",
};

const STYLES: Record<Theme["buttons"]["style"], string> = {
  filled: "Filled",
  outline: "Outline",
};

const LOGO_HEIGHT = { min: 16, max: 64, start: 28 };
// The widest logo the app accepts, as width over height.
const MAX_LOGO_RATIO = 20;

const HEX = /^#[0-9A-Fa-f]{6}$/;

// The app's look, like Theme settings in Shopify's theme editor: a starting style, then
// the logo, colours, fonts and buttons. Changes show on the phone straight away and save
// with the rest of the design. `errors` are keyed by path inside the theme, e.g.
// "colors.brand".
export function ThemeSettings({
  theme,
  errors,
  tools,
  backLabel,
  onBack,
  onChange,
  onPresetApplied,
}: {
  theme: Theme;
  errors: Record<string, string>;
  tools: SettingTools;
  backLabel: string;
  onBack: () => void;
  onChange: (update: (theme: Theme) => Theme) => void;
  // Lets the editor offer Undo, since a style replaces the colours, fonts and buttons.
  onPresetApplied: (preset: ThemePreset, previous: Theme) => void;
}) {
  const inUse = THEME_PRESETS.find((preset) => matches(theme, preset));
  const base = THEME_PRESETS.find((preset) => preset.id === theme.preset);
  const { logo } = theme;

  const applyPreset = (preset: ThemePreset) => {
    onChange((current) => ({
      ...current,
      preset: preset.id,
      colors: { ...preset.colors },
      fonts: { ...preset.fonts },
      buttons: { ...preset.buttons },
    }));
    onPresetApplied(preset, theme);
  };

  // The picker draws the picture in its own shape, which the logo keeps as a ratio.
  const logoImage: ImageValue | null = logo?.id
    ? {
        id: logo.id,
        url: logo.url,
        width: Math.round((logo.aspectRatio ?? 1) * 1000),
        height: 1000,
        alt: "",
      }
    : null;

  const chooseLogo = (image: ImageValue | null) =>
    onChange((current) => ({
      ...current,
      logo: image
        ? {
            url: image.url,
            id: image.id,
            aspectRatio: Math.min(MAX_LOGO_RATIO, image.width / image.height),
            height: current.logo?.height ?? LOGO_HEIGHT.start,
          }
        : undefined,
    }));

  return (
    <s-stack gap="base">
      <s-grid gridTemplateColumns="auto 1fr" gap="small" alignItems="center">
        <s-button
          variant="tertiary"
          icon="arrow-left"
          accessibilityLabel={backLabel}
          onClick={onBack}
        />
        <s-heading>Theme settings</s-heading>
      </s-grid>

      <s-stack gap="small">
        <s-heading>Style</s-heading>
        <s-text color="subdued">
          {inUse
            ? `Your app uses the ${inUse.title} style.`
            : base
              ? `Your app uses the ${base.title} style, with your changes.`
              : "Your app uses your own style."}{" "}
          Choosing a style replaces your colours, fonts and buttons.
        </s-text>
        <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="small">
          {THEME_PRESETS.map((preset) => (
            <s-clickable
              key={preset.id}
              border="base"
              borderRadius="base"
              padding="small"
              accessibilityLabel={`Use the ${preset.title} style: ${preset.fonts.heading} and ${preset.fonts.body}`}
              onClick={() => applyPreset(preset)}
            >
              <s-stack gap="small-200">
                <Swatches colors={preset.colors} />
                <s-text type="strong">{preset.title}</s-text>
                <s-text color="subdued">{preset.fonts.heading}</s-text>
                {inUse?.id === preset.id && (
                  <s-badge tone="success">In use</s-badge>
                )}
              </s-stack>
            </s-clickable>
          ))}
        </s-grid>
      </s-stack>

      <s-divider />

      <s-stack gap="small">
        <ImagePicker
          label="Logo"
          value={logoImage}
          error={errors["logo.url"] ?? errors.logo}
          tools={tools}
          onChange={chooseLogo}
        />
        {logo && (
          <s-number-field
            label="Logo height"
            value={String(logo.height)}
            min={LOGO_HEIGHT.min}
            max={LOGO_HEIGHT.max}
            step={1}
            details={`From ${LOGO_HEIGHT.min} to ${LOGO_HEIGHT.max}. The logo keeps its shape.`}
            error={errors["logo.height"]}
            onChange={(event) => {
              const number = Number(event.currentTarget.value);
              if (event.currentTarget.value === "" || !Number.isFinite(number))
                return;
              // Typed numbers can go past the limits; keep them inside so the design saves.
              const height = Math.min(
                LOGO_HEIGHT.max,
                Math.max(LOGO_HEIGHT.min, Math.round(number)),
              );
              onChange((current) =>
                current.logo
                  ? { ...current, logo: { ...current.logo, height } }
                  : current,
              );
            }}
          />
        )}
        <s-text color="subdued">
          Shows at the top of your app and in its side menu. Without one, your
          app shows your store&apos;s brand logo from Shopify, or its name.
        </s-text>
      </s-stack>

      <s-divider />

      <s-stack gap="small">
        <s-heading>Colours</s-heading>
        {COLOR_FIELDS.map((field) => (
          <ColorSetting
            key={field.key}
            label={field.label}
            details={field.details}
            value={theme.colors[field.key]}
            error={errors[`colors.${field.key}`]}
            onChange={(color) =>
              onChange((current) => ({
                ...current,
                colors: { ...current.colors, [field.key]: color },
              }))
            }
          />
        ))}
      </s-stack>

      <s-divider />

      <s-stack gap="small">
        <s-heading>Fonts</s-heading>
        <FontSelect
          label="Headings"
          details="Section and banner headings, and product names on product pages."
          value={theme.fonts.heading}
          error={errors["fonts.heading"]}
          onChange={(font) =>
            onChange((current) => ({
              ...current,
              fonts: { ...current.fonts, heading: font },
            }))
          }
        />
        <FontSelect
          label="Body text"
          details="Everything else, such as prices, descriptions and buttons."
          value={theme.fonts.body}
          error={errors["fonts.body"]}
          onChange={(font) =>
            onChange((current) => ({
              ...current,
              fonts: { ...current.fonts, body: font },
            }))
          }
        />
        <s-text color="subdued">
          Fonts from Google Fonts, free to use in your app. Every font is
          already in your app, so changing it needs no app update.
        </s-text>
      </s-stack>

      <s-divider />

      <s-stack gap="small">
        <s-heading>Buttons</s-heading>
        <s-select
          label="Shape"
          value={theme.buttons.shape}
          error={errors["buttons.shape"]}
          onChange={(event) => {
            const shape = event.currentTarget.value;
            if (isKey(SHAPES, shape))
              onChange((current) => ({
                ...current,
                buttons: { ...current.buttons, shape },
              }));
          }}
        >
          {Object.entries(SHAPES).map(([shape, label]) => (
            <s-option key={shape} value={shape}>
              {label}
            </s-option>
          ))}
        </s-select>
        <s-select
          label="Style"
          value={theme.buttons.style}
          details="Add to bag and your app's other main buttons."
          error={errors["buttons.style"]}
          onChange={(event) => {
            const style = event.currentTarget.value;
            if (isKey(STYLES, style))
              onChange((current) => ({
                ...current,
                buttons: { ...current.buttons, style },
              }));
          }}
        >
          {Object.entries(STYLES).map(([style, label]) => (
            <s-option key={style} value={style}>
              {label}
            </s-option>
          ))}
        </s-select>
      </s-stack>
    </s-stack>
  );
}

// A colour, typed or picked. Shopify's colour field gives #RRGGBB; anything else is
// pointed out and not used, so the design always has a colour the app can draw. The
// Publishing page uses it too (components/app-identity.tsx).
export function ColorSetting({
  label,
  details,
  value,
  error,
  onChange,
}: {
  label: string;
  details: string;
  value: string;
  error?: string;
  onChange: (color: string) => void;
}) {
  const [problem, setProblem] = useState<string>();
  return (
    <s-color-field
      label={label}
      details={details}
      value={value}
      error={problem ?? error}
      onChange={(event) => {
        const color = event.currentTarget.value;
        if (!HEX.test(color)) {
          setProblem("Use a colour like #42523D");
          return;
        }
        setProblem(undefined);
        onChange(color.toUpperCase());
      }}
    />
  );
}

function FontSelect({
  label,
  details,
  value,
  error,
  onChange,
}: {
  label: string;
  details: string;
  value: string;
  error?: string;
  onChange: (font: string) => void;
}) {
  return (
    <s-select
      label={label}
      details={details}
      value={value}
      error={error}
      onChange={(event) => onChange(event.currentTarget.value)}
    >
      {/* A font Appsy no longer offers: phones show their standard font instead. */}
      {!isKey(FONT_OPTIONS, value) && (
        <s-option value={value}>{value} (not available)</s-option>
      )}
      {Object.entries(FONT_OPTIONS).map(([font, fontLabel]) => (
        <s-option key={font} value={font}>
          {fontLabel}
        </s-option>
      ))}
    </s-select>
  );
}

// A style's colours as small circles. Decoration only: its name says which style it is.
function Swatches({ colors }: { colors: Colors }) {
  return (
    <div aria-hidden="true" style={{ display: "flex", gap: 4 }}>
      {[colors.brand, colors.accent, colors.text, colors.background].map(
        (color, index) => (
          <span
            key={index}
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              background: color,
              boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.2)",
            }}
          />
        ),
      )}
    </div>
  );
}

function matches(theme: Theme, preset: ThemePreset) {
  const sameColors = (Object.keys(preset.colors) as (keyof Colors)[]).every(
    (key) => theme.colors[key].toUpperCase() === preset.colors[key],
  );
  return (
    sameColors &&
    theme.fonts.heading === preset.fonts.heading &&
    theme.fonts.body === preset.fonts.body &&
    theme.buttons.shape === preset.buttons.shape &&
    theme.buttons.style === preset.buttons.style
  );
}

function isKey<T extends object>(
  record: T,
  key: string,
): key is Extract<keyof T, string> {
  return Object.hasOwn(record, key);
}
