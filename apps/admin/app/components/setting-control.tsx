import { useState } from "react";
import {
  imageValue,
  linkValue,
  type ImageValue,
  type LinkValue,
  type SettingField,
  type SettingsForm,
} from "@appsy/app-config";
import type { StoreMenu, StorePage } from "../models/design.server";

export type PickedResource = { id: string; handle: string; title: string };

// What the controls need from the editor: names to show, the store's pages and menus, and
// Shopify's resource and file pickers.
export type SettingTools = {
  titles: Record<string, string>;
  pages: StorePage[];
  menus: StoreMenu[];
  // Whether the store has granted Appsy access to its Shopify Files, and to its menus.
  filesAccess: boolean;
  menusAccess: boolean;
  pickCollections: (
    current: string[],
    multiple: boolean | number,
  ) => Promise<string[] | null>;
  pickResource: (
    type: "product" | "collection",
    current?: string,
  ) => Promise<PickedResource | null>;
  // Each null when the merchant closes the picker without choosing.
  pickProduct: (current?: string) => Promise<string | null>;
  pickImage: (current?: string) => Promise<ImageValue | null>;
};

// One setting's control in the editor, chosen by the input type in its package's manifest
// (packages/app-config/src/inputs.ts). Fields have no `name`, so they stay out of forms.
export function SettingControl({
  field,
  value,
  error,
  tools,
  onChange,
}: {
  field: SettingField;
  value: unknown;
  error?: string;
  tools: SettingTools;
  onChange: (value: unknown) => void;
}) {
  const label = field.title ?? "";
  const { titles } = tools;

  switch (field.input) {
    case "text":
      return (
        <s-text-field
          label={label}
          value={typeof value === "string" ? value : ""}
          maxLength={field.maxLength}
          details={field.info}
          error={error}
          onInput={(event) => onChange(event.currentTarget.value)}
        />
      );
    case "textarea":
      return (
        <s-text-area
          label={label}
          value={typeof value === "string" ? value : ""}
          maxLength={field.maxLength}
          rows={3}
          error={error}
          onInput={(event) => onChange(event.currentTarget.value)}
        />
      );
    case "checkbox":
      return (
        <s-checkbox
          label={label}
          checked={value === true}
          error={error}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
      );
    case "range":
      return (
        <s-number-field
          label={label}
          value={typeof value === "number" ? String(value) : ""}
          min={field.minimum}
          max={field.maximum}
          step={field.step}
          error={error}
          onChange={(event) => {
            const number = Number(event.currentTarget.value);
            if (event.currentTarget.value === "" || !Number.isFinite(number))
              return;
            // Typed numbers can go past the limits; keep them inside so the design saves.
            onChange(
              Math.min(
                field.maximum ?? number,
                Math.max(field.minimum ?? number, Math.round(number)),
              ),
            );
          }}
        />
      );
    case "select":
      return (
        <s-select
          label={label}
          value={typeof value === "string" ? value : ""}
          error={error}
          onChange={(event) => onChange(event.currentTarget.value)}
        >
          {Object.entries(field.labels ?? {}).map(([option, optionLabel]) => (
            <s-option key={option} value={option}>
              {optionLabel}
            </s-option>
          ))}
        </s-select>
      );
    case "color":
      return (
        <s-color-field
          label={label}
          value={typeof value === "string" ? value : ""}
          error={error}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      );
    case "collection": {
      const id = typeof value === "string" ? value : null;
      return (
        <s-stack gap="small">
          <s-text type="strong">{label}</s-text>
          <s-text color="subdued">
            {id
              ? (titles[id] ?? "Chosen collection")
              : "No collection chosen yet"}
          </s-text>
          {error && <s-text tone="critical">{error}</s-text>}
          <s-button
            onClick={async () => {
              const ids = await tools.pickCollections(id ? [id] : [], false);
              if (ids) onChange(ids[0] ?? null);
            }}
          >
            {id ? "Change collection" : "Choose collection"}
          </s-button>
        </s-stack>
      );
    }
    case "collection_list": {
      const ids = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
      return (
        <s-stack gap="small">
          <s-text type="strong">{label}</s-text>
          {ids.length === 0 ? (
            <s-text color="subdued">No collections chosen yet</s-text>
          ) : (
            <s-unordered-list>
              {ids.map((id) => (
                <s-list-item key={id}>{titles[id] ?? id}</s-list-item>
              ))}
            </s-unordered-list>
          )}
          {error && <s-text tone="critical">{error}</s-text>}
          <s-button
            onClick={async () => {
              const picked = await tools.pickCollections(
                ids,
                field.maxItems ?? true,
              );
              if (picked) onChange(picked);
            }}
          >
            {ids.length > 0 ? "Change collections" : "Choose collections"}
          </s-button>
        </s-stack>
      );
    }
    case "product": {
      const id = typeof value === "string" ? value : null;
      return (
        <s-stack gap="small">
          <s-text type="strong">{label}</s-text>
          <s-text color="subdued">
            {id ? (titles[id] ?? "Chosen product") : "No product chosen yet"}
          </s-text>
          {error && <s-text tone="critical">{error}</s-text>}
          <s-stack direction="inline" gap="small">
            <s-button
              onClick={async () => {
                const picked = await tools.pickProduct(id ?? undefined);
                if (picked) onChange(picked);
              }}
            >
              {id ? "Change product" : "Choose product"}
            </s-button>
          </s-stack>
        </s-stack>
      );
    }
    case "datetime":
      return (
        <DateTimeField
          label={label}
          value={value}
          error={error}
          onChange={onChange}
        />
      );
    case "image_picker":
      return (
        <ImagePicker
          label={label}
          value={value}
          error={error}
          tools={tools}
          onChange={onChange}
        />
      );
    case "url":
      return (
        <LinkPicker
          label={label}
          value={value}
          error={error}
          tools={tools}
          onChange={onChange}
        />
      );
    case "link_list":
      return (
        <MenuPicker
          label={label}
          value={value}
          error={error}
          tools={tools}
          onChange={onChange}
        />
      );
    case "phone":
      return (
        <s-text-field
          label={label}
          value={typeof value === "string" ? value : ""}
          placeholder="+91 98765 43210"
          details="With the country code."
          error={error}
          onInput={(event) => onChange(event.currentTarget.value)}
        />
      );
    case "email":
      return (
        <s-email-field
          label={label}
          value={typeof value === "string" ? value : ""}
          placeholder="help@yourstore.com"
          error={error}
          onInput={(event) => onChange(event.currentTarget.value.trim())}
        />
      );
    default:
      return null;
  }
}

// One of the store's menus, made in Shopify under Online Store › Navigation, saved by its
// handle as Shopify themes save a menu.
function MenuPicker({
  label,
  value,
  error,
  tools,
  onChange,
}: {
  label: string;
  value: unknown;
  error?: string;
  tools: SettingTools;
  onChange: (value: string | null) => void;
}) {
  const handle = typeof value === "string" ? value : "";
  const known = tools.menus.some((menu) => menu.handle === handle);

  if (!tools.menusAccess) {
    return (
      <s-banner tone="warning" heading="Appsy can't see your menus yet">
        <s-paragraph>
          Close the editor and reload Appsy. If Shopify asks you to approve an
          update, approve it. Then open the editor again.
        </s-paragraph>
      </s-banner>
    );
  }

  return (
    <s-stack gap="small">
      {tools.menus.length > 0 ? (
        <s-select
          label={label}
          placeholder="Choose a menu"
          value={handle}
          error={error}
          onChange={(event) => onChange(event.currentTarget.value || null)}
        >
          {/* A menu deleted in Shopify since it was chosen: phones skip it. */}
          {handle && !known && (
            <s-option value={handle}>Menu not found ({handle})</s-option>
          )}
          {tools.menus.map((menu) => (
            <s-option key={menu.handle} value={menu.handle}>
              {menu.title}
            </s-option>
          ))}
        </s-select>
      ) : (
        <s-text color="subdued">Your store has no menus yet.</s-text>
      )}
      <s-text color="subdued">
        Menus come from Online Store › Navigation in your Shopify admin. Changes
        you make there show in your app without publishing again.
      </s-text>
    </s-stack>
  );
}

// A picture from the store's own Shopify Files, chosen with Shopify's file picker; no
// pictures come from anywhere else. Removing it only clears the setting; the file stays
// in Shopify Files, where the merchant manages it.
export function ImagePicker({
  label,
  value,
  error,
  tools,
  onChange,
}: {
  label: string;
  value: unknown;
  error?: string;
  tools: SettingTools;
  onChange: (value: ImageValue | null) => void;
}) {
  const parsed = imageValue.safeParse(value);
  const image = parsed.success ? parsed.data : null;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const pick = async () => {
    setProblem(undefined);
    setBusy(true);
    try {
      const chosen = await tools.pickImage(image?.id);
      if (chosen) onChange(chosen);
    } catch (pickError) {
      setProblem(
        pickError instanceof Error
          ? pickError.message
          : "The picture didn't load. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <s-stack gap="small">
      <s-text type="strong">{label}</s-text>
      {image && (
        <s-image
          src={image.url}
          alt={image.alt || label}
          aspectRatio={`${image.width}/${image.height}`}
          objectFit="contain"
        />
      )}
      {!tools.filesAccess ? (
        <s-banner
          tone="warning"
          heading="Appsy can't use your Shopify Files yet"
        >
          <s-paragraph>
            Close the editor and reload Appsy. If Shopify asks you to approve an
            update, approve it. Then open the editor again.
          </s-paragraph>
        </s-banner>
      ) : busy ? (
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-spinner accessibilityLabel="Loading the picture" />
          <s-text color="subdued">Getting the picture…</s-text>
        </s-stack>
      ) : (
        <s-stack direction="inline" gap="small">
          <s-button onClick={pick}>
            {image ? "Change picture" : "Choose from Shopify Files"}
          </s-button>
          {image && (
            <s-button
              variant="tertiary"
              tone="critical"
              icon="delete"
              onClick={() => onChange(null)}
            >
              Remove
            </s-button>
          )}
        </s-stack>
      )}
      {(problem ?? error) && (
        <s-text tone="critical">{problem ?? error}</s-text>
      )}
      <s-text color="subdued">
        Pictures come from the Files page of your Shopify admin.
      </s-text>
    </s-stack>
  );
}

// Times of day in half hours, "00:00" to "23:30".
const TIMES = Array.from({ length: 48 }, (_, index) => {
  const hours = String(Math.floor(index / 2)).padStart(2, "0");
  return `${hours}:${index % 2 === 0 ? "00" : "30"}`;
});

const pad = (value: number) => String(value).padStart(2, "0");

// A moment as a date and a half-hour time in the merchant's own time zone (the browser's),
// saved in UTC. Polaris has a date field but no time field, so the time is a menu.
function DateTimeField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: unknown;
  error?: string;
  onChange: (value: string | null) => void;
}) {
  const moment = typeof value === "string" ? new Date(value) : null;
  const valid = moment && !Number.isNaN(moment.getTime()) ? moment : null;
  const date = valid
    ? `${valid.getFullYear()}-${pad(valid.getMonth() + 1)}-${pad(valid.getDate())}`
    : "";
  const time = valid
    ? `${pad(valid.getHours())}:${valid.getMinutes() < 30 ? "00" : "30"}`
    : "18:00";
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const save = (nextDate: string, nextTime: string) => {
    if (!nextDate) {
      onChange(null);
      return;
    }
    const [year, month, day] = nextDate.split("-").map(Number);
    const [hours, minutes] = nextTime.split(":").map(Number);
    if (!year || !month || !day) return;
    onChange(
      new Date(year, month - 1, day, hours ?? 0, minutes ?? 0).toISOString(),
    );
  };

  return (
    <s-stack gap="small">
      <s-date-field
        label={label}
        value={date}
        error={error}
        onChange={(event) => save(event.currentTarget.value, time)}
      />
      <s-select
        label="Time"
        value={time}
        disabled={!date || undefined}
        onChange={(event) => save(date, event.currentTarget.value)}
      >
        {TIMES.map((option) => (
          <s-option key={option} value={option}>
            {option}
          </s-option>
        ))}
      </s-select>
      <s-text color="subdued">In your time zone ({zone}).</s-text>
    </s-stack>
  );
}

const LINK_TYPES = {
  none: "No link",
  collection: "Collection",
  product: "Product",
  page: "Shopify page",
  url: "Web address",
} as const;

type LinkType = keyof typeof LINK_TYPES;

// Where a tap goes: a collection or product (Shopify's resource picker), one of the
// store's pages, or a web address.
function LinkPicker({
  label,
  value,
  error,
  tools,
  onChange,
}: {
  label: string;
  value: unknown;
  error?: string;
  tools: SettingTools;
  onChange: (value: LinkValue | null) => void;
}) {
  const parsed = linkValue.safeParse(value);
  const link = parsed.success ? parsed.data : null;
  const [type, setType] = useState<LinkType>(link?.type ?? "none");
  const [address, setAddress] = useState(link?.type === "url" ? link.url : "");
  const [problem, setProblem] = useState<string>();

  const pick = async (kind: "collection" | "product") => {
    const picked = await tools.pickResource(
      kind,
      link?.type === kind ? link.id : undefined,
    );
    if (picked) onChange({ type: kind, ...picked });
  };

  // Accepts "example.com" as https://example.com; anything that isn't https is refused.
  const saveAddress = (text: string) => {
    const trimmed = text.trim();
    setProblem(undefined);
    if (!trimmed) {
      onChange(null);
      return;
    }
    let url: URL | null = null;
    try {
      url = new URL(
        /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`,
      );
    } catch {
      url = null;
    }
    if (!url || url.protocol !== "https:") {
      setProblem("Use a web address that starts with https://");
      return;
    }
    setAddress(url.href);
    onChange({ type: "url", url: url.href });
  };

  return (
    <s-stack gap="small">
      <s-select
        label={label}
        value={type}
        error={type === "url" ? undefined : error}
        onChange={(event) => {
          const next = event.currentTarget.value as LinkType;
          setType(next);
          setProblem(undefined);
          if (next !== link?.type) onChange(null);
        }}
      >
        {Object.entries(LINK_TYPES).map(([option, optionLabel]) => (
          <s-option key={option} value={option}>
            {optionLabel}
          </s-option>
        ))}
      </s-select>

      {(type === "collection" || type === "product") && (
        <s-grid gridTemplateColumns="1fr auto" gap="small" alignItems="center">
          <s-text color="subdued">
            {link?.type === type ? link.title : `No ${type} chosen yet`}
          </s-text>
          <s-button onClick={() => pick(type)}>
            {link?.type === type ? "Change" : `Choose ${type}`}
          </s-button>
        </s-grid>
      )}

      {type === "page" &&
        (tools.pages.length > 0 ? (
          <s-select
            label="Page"
            placeholder="Choose a page"
            value={link?.type === "page" ? link.id : ""}
            onChange={(event) => {
              const page = tools.pages.find(
                (candidate) => candidate.id === event.currentTarget.value,
              );
              if (page)
                onChange({
                  type: "page",
                  id: page.id,
                  title: page.title,
                  url: page.url,
                });
            }}
          >
            {tools.pages.map((page) => (
              <s-option key={page.id} value={page.id}>
                {page.title}
              </s-option>
            ))}
          </s-select>
        ) : (
          <s-text color="subdued">
            Your store has no pages on its online store yet.
          </s-text>
        ))}

      {type === "url" && (
        <s-url-field
          label="Web address"
          placeholder="https://"
          value={address}
          error={problem ?? error}
          onInput={(event) => setAddress(event.currentTarget.value)}
          onChange={(event) => saveAddress(event.currentTarget.value)}
        />
      )}
    </s-stack>
  );
}

// A one-line hint under a section or block's name in the editor's list: its first text
// setting, else the menu, collections or picture it shows. Null when there's nothing useful.
export function summarize(
  form: SettingsForm | undefined,
  settings: Record<string, unknown>,
  titles: Record<string, string>,
  menus: StoreMenu[] = [],
): string | null {
  const fields = Object.entries(form?.properties ?? {});
  for (const [key, field] of fields) {
    const value = settings[key];
    if (
      (field.input === "text" || field.input === "textarea") &&
      typeof value === "string" &&
      value
    ) {
      return value;
    }
  }
  for (const [key, field] of fields) {
    const value = settings[key];
    if (field.input === "collection") {
      return typeof value === "string"
        ? (titles[value] ?? "Collection chosen")
        : "No collection chosen";
    }
    if (field.input === "product") {
      return typeof value === "string"
        ? (titles[value] ?? "Product chosen")
        : "No product chosen";
    }
    // The UTC date, so the server and the browser show the same text.
    if (field.input === "datetime") {
      return typeof value === "string"
        ? `Ends ${value.slice(0, 10)}`
        : "No end date yet";
    }
    if (field.input === "collection_list" && Array.isArray(value)) {
      return value.length > 0
        ? `${value.length} collection${value.length === 1 ? "" : "s"}`
        : "No collections chosen";
    }
    if (field.input === "image_picker")
      return value ? "Picture added" : "No picture yet";
    if (field.input === "link_list") {
      return typeof value === "string"
        ? (menus.find((menu) => menu.handle === value)?.title ?? value)
        : "No menu chosen";
    }
    if (field.input === "phone" || field.input === "email") {
      return typeof value === "string" && value
        ? value
        : `No ${field.input === "phone" ? "number" : "email address"} yet`;
    }
  }
  return null;
}
