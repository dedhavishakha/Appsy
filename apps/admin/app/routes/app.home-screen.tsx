import { useEffect, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type {
  AppDesign,
  DesignIssue,
  SectionInstance,
  SettingField,
} from "@appsy/app-config";
import { authenticate } from "../shopify.server";
import { ensureShopSetup } from "../models/shop.server";
import {
  listVersions,
  liveKey,
  loadCollectionTitles,
  loadDesign,
  publishDraft,
  saveDraft,
  SECTION_TYPES,
  type SectionType,
} from "../models/design.server";
import { publicUrl } from "../models/storage.server";

// Home editor v0 (docs/01, Phase 1): the section list, settings forms drawn from each
// section's manifest, Save draft and Publish. The phone preview arrives in Phase 2.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const appProjectId = shop.appProject.id;
  const design = await loadDesign(appProjectId);
  const [versions, collectionTitles] = await Promise.all([
    listVersions(appProjectId),
    loadCollectionTitles(admin, design),
  ]);
  // eslint-disable-next-line no-undef
  const appUrl = process.env.SHOPIFY_APP_URL ?? "";

  return {
    design,
    sectionTypes: SECTION_TYPES,
    collectionTitles,
    versions,
    liveUrl: versions.some((version) => version.status === "published")
      ? publicUrl(appUrl, liveKey(appProjectId))
      : null,
  };
};

type ActionResult = {
  intent: string;
  issues: DesignIssue[];
  number?: number;
  liveUrl?: string;
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin, session, sessionToken } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  let design: unknown;
  try {
    design = JSON.parse(String(form.get("design")));
  } catch {
    return { intent, issues: [{ path: [], message: "Appsy couldn't read the design. Reload and try again." }] };
  }

  const saved = await saveDraft(shop.appProject.id, design, sessionToken?.sub ?? null);
  if (saved.issues.length > 0 || intent !== "publish") return { intent, ...saved };
  // eslint-disable-next-line no-undef
  return { intent, ...(await publishDraft(shop, process.env.SHOPIFY_APP_URL ?? "")) };
};

export default function HomeScreen() {
  const loaderData = useLoaderData<typeof loader>();
  const { sectionTypes, versions, liveUrl } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [design, setDesign] = useState<AppDesign>(loaderData.design);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(loaderData.design));
  const [selectedId, setSelectedId] = useState<string | null>(
    loaderData.design.pages.home.sections[0]?.id ?? null,
  );
  const [titles, setTitles] = useState<Record<string, string>>(loaderData.collectionTitles);
  const submittedJson = useRef<string | null>(null);

  const sections = design.pages.home.sections;
  const designJson = JSON.stringify(design);
  const dirty = designJson !== savedJson;
  const pendingIntent = fetcher.state === "idle" ? null : fetcher.formData?.get("intent");
  const result = fetcher.state === "idle" ? fetcher.data : undefined;
  const issues = result?.issues ?? [];

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || submittedJson.current === null) return;
    if (fetcher.data.issues.length === 0) {
      setSavedJson(submittedJson.current);
      shopify.toast.show(
        fetcher.data.intent === "publish"
          ? `Version ${fetcher.data.number} published`
          : "Draft saved",
      );
    }
    submittedJson.current = null;
  }, [fetcher.state, fetcher.data, shopify]);

  const submit = (intent: "save" | "publish") => {
    submittedJson.current = designJson;
    fetcher.submit({ intent, design: designJson }, { method: "POST" });
  };

  const setSections = (update: (current: SectionInstance[]) => SectionInstance[]) =>
    setDesign((current) => ({
      ...current,
      pages: { ...current.pages, home: { sections: update(current.pages.home.sections) } },
    }));

  const addSection = (type: SectionType) => {
    const section: SectionInstance = {
      id: crypto.randomUUID(),
      type: type.id,
      settings: structuredClone(type.defaults),
      blocks: [],
    };
    setSections((current) => [...current, section]);
    setSelectedId(section.id);
  };

  const moveSection = (index: number, offset: -1 | 1) =>
    setSections((current) => {
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(index + offset, 0, moved);
      return next;
    });

  const toggleHidden = (id: string) =>
    setSections((current) =>
      current.map((section) =>
        section.id === id ? { ...section, hidden: !section.hidden } : section,
      ),
    );

  const duplicateSection = (id: string) => {
    const copyId = crypto.randomUUID();
    setSections((current) =>
      current.flatMap((section) =>
        section.id === id ? [section, { ...structuredClone(section), id: copyId }] : [section],
      ),
    );
    setSelectedId(copyId);
  };

  const deleteSection = (id: string) => {
    setSections((current) => current.filter((section) => section.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const updateSetting = (id: string, key: string, value: unknown) =>
    setSections((current) =>
      current.map((section) =>
        section.id === id
          ? { ...section, settings: { ...section.settings, [key]: value } }
          : section,
      ),
    );

  // App Bridge's resource picker; returns the chosen collection IDs, or null if cancelled.
  const pickCollections = async (current: string[], multiple: boolean | number) => {
    const picked = await shopify.resourcePicker({
      type: "collection",
      action: "select",
      multiple,
      selectionIds: current.map((id) => ({ id })),
    });
    if (!picked) return null;
    setTitles((known) => ({
      ...known,
      ...Object.fromEntries(picked.map((collection) => [collection.id, collection.title])),
    }));
    return picked.map((collection) => collection.id);
  };

  const selectedIndex = sections.findIndex((section) => section.id === selectedId);
  const selected = sections[selectedIndex];
  const selectedType = sectionTypes.find((type) => type.id === selected?.type);
  const fieldErrors: Record<string, string> = Object.fromEntries(
    issues
      .filter(
        (issue) =>
          issue.path[0] === "pages" &&
          issue.path[3] === selectedIndex &&
          issue.path[4] === "settings",
      )
      .map((issue) => [String(issue.path[5]), issue.message]),
  );

  return (
    <s-page heading="Home screen">
      <s-button
        slot="primary-action"
        variant="primary"
        loading={pendingIntent === "publish"}
        onClick={() => submit("publish")}
      >
        Publish
      </s-button>
      <s-button
        slot="secondary-actions"
        disabled={!dirty}
        loading={pendingIntent === "save"}
        onClick={() => submit("save")}
      >
        Save draft
      </s-button>

      {issues.length > 0 && (
        <s-banner tone="critical" heading="Please fix these first">
          <s-unordered-list>
            {issues.map((issue, index) => (
              <s-list-item key={index}>{issue.message}</s-list-item>
            ))}
          </s-unordered-list>
        </s-banner>
      )}
      {result?.intent === "publish" && result.issues.length === 0 && result.liveUrl && (
        <s-banner tone="success" heading={`Version ${result.number} is live`}>
          <s-paragraph>
            Phone apps download your design from{" "}
            <s-link href={result.liveUrl} target="_blank">
              this settings file
            </s-link>
            .
          </s-paragraph>
        </s-banner>
      )}

      <s-query-container>
        <s-grid
          gridTemplateColumns="@container (inline-size > 760px) 1fr 2fr, 1fr"
          gap="base"
        >
          <s-grid-item>
            <s-section heading="Sections">
              <s-stack gap="small">
                {sections.length === 0 && (
                  <s-paragraph color="subdued">
                    Your home screen is empty. Add your first section.
                  </s-paragraph>
                )}
                {sections.map((section, index) => {
                  const type = sectionTypes.find((candidate) => candidate.id === section.type);
                  return (
                    <s-box
                      key={section.id}
                      padding="small"
                      border="base"
                      borderRadius="base"
                      background={section.id === selectedId ? "subdued" : "base"}
                    >
                      <s-grid gridTemplateColumns="1fr auto" gap="small" alignItems="center">
                        <s-clickable
                          onClick={() => setSelectedId(section.id)}
                          accessibilityLabel={`Edit ${type?.title ?? section.type}`}
                        >
                          <s-stack gap="none">
                            <s-text type="strong">{type?.title ?? section.type}</s-text>
                            <s-text color="subdued">{summarize(section, titles)}</s-text>
                          </s-stack>
                        </s-clickable>
                        <s-stack direction="inline" gap="small" alignItems="center">
                          {section.hidden && <s-badge>Hidden</s-badge>}
                          <s-button
                            variant="tertiary"
                            icon="arrow-up"
                            accessibilityLabel="Move up"
                            disabled={index === 0}
                            onClick={() => moveSection(index, -1)}
                          />
                          <s-button
                            variant="tertiary"
                            icon="arrow-down"
                            accessibilityLabel="Move down"
                            disabled={index === sections.length - 1}
                            onClick={() => moveSection(index, 1)}
                          />
                          <s-button
                            variant="tertiary"
                            icon="menu-horizontal"
                            accessibilityLabel="More actions"
                            commandFor={`actions-${section.id}`}
                          />
                        </s-stack>
                      </s-grid>
                      <s-menu id={`actions-${section.id}`} accessibilityLabel="Section actions">
                        <s-button
                          icon={section.hidden ? "view" : "hide"}
                          onClick={() => toggleHidden(section.id)}
                        >
                          {section.hidden ? "Show" : "Hide"}
                        </s-button>
                        <s-button icon="duplicate" onClick={() => duplicateSection(section.id)}>
                          Duplicate
                        </s-button>
                        <s-button
                          icon="delete"
                          tone="critical"
                          onClick={() => deleteSection(section.id)}
                        >
                          Delete
                        </s-button>
                      </s-menu>
                    </s-box>
                  );
                })}
                <s-button icon="plus" commandFor="add-section">
                  Add section
                </s-button>
                <s-menu id="add-section" accessibilityLabel="Section types">
                  {sectionTypes.map((type) => (
                    <s-button key={type.id} onClick={() => addSection(type)}>
                      {type.title}
                    </s-button>
                  ))}
                </s-menu>
              </s-stack>
            </s-section>
          </s-grid-item>

          <s-grid-item>
            <s-stack gap="base">
              <s-section heading={selectedType?.title ?? "Settings"}>
                {selected && selectedType ? (
                  <s-stack gap="base">
                    {Object.entries(selectedType.form.properties).map(([key, field]) => (
                      <SettingControl
                        key={`${selected.id}-${key}`}
                        field={field}
                        value={selected.settings[key]}
                        error={fieldErrors[key]}
                        titles={titles}
                        onChange={(value) => updateSetting(selected.id, key, value)}
                        onPickCollections={pickCollections}
                      />
                    ))}
                  </s-stack>
                ) : (
                  <s-paragraph color="subdued">
                    Select a section to change its settings.
                  </s-paragraph>
                )}
              </s-section>

              <s-section heading="Versions">
                <s-stack gap="small">
                  {versions.map((version) => (
                    <s-stack
                      key={version.number}
                      direction="inline"
                      gap="small"
                      alignItems="center"
                    >
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
            </s-stack>
          </s-grid-item>
        </s-grid>
      </s-query-container>
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

// A one-line hint under each section's name in the list.
function summarize(section: SectionInstance, titles: Record<string, string>) {
  const { heading, text, collection, collections } = section.settings;
  if (typeof heading === "string" && heading) return heading;
  if (typeof text === "string" && text) return text;
  if (typeof collection === "string") return titles[collection] ?? "Collection chosen";
  if (Array.isArray(collections) && collections.length > 0) {
    return `${collections.length} collection${collections.length === 1 ? "" : "s"}`;
  }
  return "Not set up yet";
}

// One setting's control, chosen by the input type in the section's manifest.
function SettingControl({
  field,
  value,
  error,
  titles,
  onChange,
  onPickCollections,
}: {
  field: SettingField;
  value: unknown;
  error?: string;
  titles: Record<string, string>;
  onChange: (value: unknown) => void;
  onPickCollections: (current: string[], multiple: boolean | number) => Promise<string[] | null>;
}) {
  const label = field.title ?? "";

  switch (field.input) {
    case "text":
      return (
        <s-text-field
          label={label}
          value={typeof value === "string" ? value : ""}
          maxLength={field.maxLength}
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
            if (event.currentTarget.value !== "" && Number.isFinite(number)) onChange(number);
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
            {id ? (titles[id] ?? "Chosen collection") : "No collection chosen yet"}
          </s-text>
          {error && <s-text tone="critical">{error}</s-text>}
          <s-button
            onClick={async () => {
              const ids = await onPickCollections(id ? [id] : [], false);
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
              const picked = await onPickCollections(ids, field.maxItems ?? true);
              if (picked) onChange(picked);
            }}
          >
            {ids.length > 0 ? "Change collections" : "Choose collections"}
          </s-button>
        </s-stack>
      );
    }
    default:
      return null;
  }
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
