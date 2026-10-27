import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import {
  buildPublishedSettings,
  MAX_BLOCKS_PER_SECTION,
  MAX_SECTIONS_PER_PAGE,
  type AppDesign,
  type BlockInstance,
  type DesignIssue,
  type PageName,
  type PublishedSettings,
  type SectionInstance,
  type ThemePreset,
} from "@appsy/app-config";
import {
  SettingControl,
  summarize,
  type SettingTools,
} from "../components/setting-control";
import { Sortable } from "../components/sortable";
import { ThemeSettings } from "../components/theme-settings";
import { usePickImage } from "../components/use-pick-image";
import { authenticate } from "../shopify.server";
import { ensureShopSetup } from "../models/shop.server";
import { ensureStorefrontToken } from "../models/storefront-token.server";
import {
  BLOCK_TYPES,
  loadResourceTitles,
  loadDesign,
  loadMenus,
  loadPages,
  loadPreview,
  loadStatus,
  publishDraft,
  saveDraft,
  SECTION_TYPES,
  type BlockType,
  type PreviewItem,
  type SectionType,
} from "../models/design.server";
import { previewBuilt } from "../models/preview.server";

// The full-screen editor, opened in Shopify's App window from Home and App design
// (components/editor-window.tsx). Like Shopify's theme editor: pick a page, arrange its
// sections and blocks on the left, change their settings, and watch the phone on the right.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, scopes } = await authenticate.admin(request);
  const setup = await ensureShopSetup(admin, session.shop);
  const shop = await ensureStorefrontToken(admin, setup).catch((error) => {
    console.error(`Storefront token for ${session.shop}:`, error);
    return setup;
  });
  const appProjectId = shop.appProject.id;
  // Pictures and menus need permissions added in later app versions, which a store has
  // only once it approves the update; Shopify says what's granted. If it can't say, try.
  const granted = await scopes
    .query()
    .then((result) => result.granted)
    .catch((error) => {
      console.error(`Scopes for ${session.shop}:`, error);
      return null;
    });
  const has = (...names: string[]) =>
    granted === null || names.some((name) => granted.includes(name));
  // Reading files is all Appsy does; an older grant of write_files includes it.
  const filesAccess = has("read_files", "write_files");
  const menusAccess = has("read_online_store_navigation");

  const design = await loadDesign(appProjectId);
  const [collectionTitles, status, preview, pages, menus] = await Promise.all([
    loadResourceTitles(admin, design),
    loadStatus(appProjectId),
    // The editor still works without these, so a Storefront hiccup doesn't block it.
    loadPreview(shop).catch((error) => {
      console.error(`Preview details for ${session.shop}:`, error);
      return null;
    }),
    loadPages(shop).catch((error) => {
      console.error(`Pages for ${session.shop}:`, error);
      return [];
    }),
    menusAccess
      ? loadMenus(admin).catch((error) => {
          console.error(`Menus for ${session.shop}:`, error);
          return [];
        })
      : [],
  ]);

  return {
    // eslint-disable-next-line no-undef
    apiKey: process.env.SHOPIFY_API_KEY || "",
    design,
    sectionTypes: SECTION_TYPES,
    blockTypes: BLOCK_TYPES,
    collectionTitles,
    status,
    preview,
    pages,
    menus,
    filesAccess,
    menusAccess,
    previewBuilt: previewBuilt(),
  };
};

type ActionResult = {
  intent: "save" | "publish";
  // Whether the design was saved as the draft (Publish saves first).
  saved: boolean;
  issues: DesignIssue[];
  number?: number;
};

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin, session, sessionToken } = await authenticate.admin(request);
  const shop = await ensureShopSetup(admin, session.shop);
  const form = await request.formData();
  const intent = form.get("intent") === "publish" ? "publish" : "save";

  let design: unknown;
  try {
    design = JSON.parse(String(form.get("design")));
  } catch {
    return {
      intent,
      saved: false,
      issues: [
        {
          path: [],
          message: "Appsy couldn't read the design. Reload and try again.",
        },
      ],
    };
  }
  const { issues } = await saveDraft(
    shop.appProject.id,
    design,
    sessionToken?.sub ?? null,
  );
  if (issues.length > 0) return { intent, saved: false, issues };
  if (intent === "save") return { intent, saved: true, issues };

  // eslint-disable-next-line no-undef
  const published = await publishDraft(
    admin,
    shop,
    process.env.SHOPIFY_APP_URL ?? "",
  );
  return {
    intent,
    saved: true,
    issues: published.issues,
    number: published.number,
  };
};

// App Bridge and Polaris for this page: the window loads it as its own document.
export default function EditorRoute() {
  const { apiKey } = useLoaderData<typeof loader>();
  return (
    <AppProvider apiKey={apiKey}>
      <Editor />
    </AppProvider>
  );
}

const PAGES: { name: PageName; label: string }[] = [
  { name: "home", label: "Home" },
  { name: "product", label: "Product" },
  { name: "collection", label: "Collection" },
  { name: "menu", label: "Menu" },
];

type Selection = { sectionId: string; blockId?: string } | null;

const SAVE_BAR_ID = "design-save-bar";

// The product and collection that the Product and Collection pages show in the preview.
type Samples = Record<"product" | "collection", PreviewItem | null>;

function Editor() {
  const data = useLoaderData<typeof loader>();
  const { sectionTypes, blockTypes, status, preview } = data;
  const shopify = useAppBridge();
  const pickImage = usePickImage();
  const fetcher = useFetcher<typeof action>();

  const [design, setDesign] = useState<AppDesign>(data.design);
  const [initialJson] = useState(() => JSON.stringify(data.design));
  const [savedJson, setSavedJson] = useState(initialJson);
  const [page, setPage] = useState<PageName>("home");
  // The left column shows the page's sections, or Theme settings.
  const [view, setView] = useState<"page" | "theme">("page");
  const [selection, setSelection] = useState<Selection>(null);
  const [titles, setTitles] = useState<Record<string, string>>(
    data.collectionTitles,
  );
  const [samples, setSamples] = useState<Samples>({
    product: preview?.product ?? null,
    collection: preview?.collection ?? null,
  });
  const pendingJson = useRef<string | null>(null);

  const designJson = useMemo(() => JSON.stringify(design), [design]);
  const dirty = designJson !== savedJson;
  const busy = fetcher.state !== "idle";
  const pendingIntent = busy ? fetcher.formData?.get("intent") : null;
  const result = busy ? undefined : fetcher.data;
  const issues = result?.issues ?? [];

  // Shopify's save bar shows while the design differs from the saved one (Save Bar API,
  // programmatic). A form's data-save-bar can't see changes in a hidden field, which is
  // why it stayed away until the first save (found 2026-10-26).
  useEffect(() => {
    void (dirty
      ? shopify.saveBar.show(SAVE_BAR_ID)
      : shopify.saveBar.hide(SAVE_BAR_ID));
  }, [dirty, shopify]);

  useEffect(() => {
    shopify.loading(busy);
  }, [busy, shopify]);

  useEffect(() => {
    if (
      fetcher.state !== "idle" ||
      !fetcher.data ||
      pendingJson.current === null
    )
      return;
    const { intent, saved, issues, number } = fetcher.data;
    if (saved) setSavedJson(pendingJson.current);
    if (issues.length === 0) {
      shopify.toast.show(
        intent === "publish" ? `Version ${number} is live` : "Saved",
      );
    }
    pendingJson.current = null;
  }, [fetcher.state, fetcher.data, shopify]);

  // Publish saves first, then publishes.
  const send = (intent: "save" | "publish") => {
    pendingJson.current = designJson;
    fetcher.submit({ intent, design: designJson }, { method: "POST" });
  };
  const save = () => send("save");
  const publish = () => send("publish");

  const discard = () => {
    setDesign(JSON.parse(savedJson) as AppDesign);
    setSelection(null);
  };

  const sections = design.pages[page].sections;

  const updateSections = (
    update: (current: SectionInstance[]) => SectionInstance[],
  ) =>
    setDesign((current) => ({
      ...current,
      pages: {
        ...current.pages,
        [page]: { sections: update(current.pages[page].sections) },
      },
    }));

  const updateSection = (
    id: string,
    update: (section: SectionInstance) => SectionInstance,
  ) =>
    updateSections((current) =>
      current.map((section) => (section.id === id ? update(section) : section)),
    );

  const updateBlocks = (
    sectionId: string,
    update: (blocks: BlockInstance[]) => BlockInstance[],
  ) =>
    updateSection(sectionId, (section) => ({
      ...section,
      blocks: update(section.blocks),
    }));

  const updateBlock = (
    sectionId: string,
    blockId: string,
    update: (block: BlockInstance) => BlockInstance,
  ) =>
    updateBlocks(sectionId, (blocks) =>
      blocks.map((block) => (block.id === blockId ? update(block) : block)),
    );

  const addSection = (type: SectionType) => {
    const section: SectionInstance = {
      id: crypto.randomUUID(),
      type: type.id,
      settings: structuredClone(type.defaults),
      // Starts with its manifest's blocks and their sample settings, like a Shopify preset.
      blocks: type.defaultBlocks.flatMap(({ type: blockId, settings }) => {
        const blockType = blockTypes.find(
          (candidate) => candidate.id === blockId,
        );
        return blockType
          ? [
              {
                id: crypto.randomUUID(),
                type: blockId,
                settings: structuredClone({
                  ...blockType.defaults,
                  ...settings,
                }),
              },
            ]
          : [];
      }),
    };
    updateSections((current) => [...current, section]);
    setSelection({ sectionId: section.id });
  };

  const addBlock = (sectionId: string, type: BlockType) => {
    const block: BlockInstance = {
      id: crypto.randomUUID(),
      type: type.id,
      settings: structuredClone(type.defaults),
    };
    updateBlocks(sectionId, (blocks) => [...blocks, block]);
    setSelection({ sectionId, blockId: block.id });
  };

  const removeSection = (id: string) => {
    updateSections((current) => current.filter((section) => section.id !== id));
    if (selection?.sectionId === id) setSelection(null);
  };

  const removeBlock = (sectionId: string, blockId: string) => {
    updateBlocks(sectionId, (blocks) =>
      blocks.filter((block) => block.id !== blockId),
    );
    if (selection?.blockId === blockId) setSelection(null);
  };

  // App Bridge's resource picker; returns the chosen collection IDs, or null if cancelled.
  const pickCollections = async (
    current: string[],
    multiple: boolean | number,
  ) => {
    const picked = await shopify.resourcePicker({
      type: "collection",
      action: "select",
      multiple,
      selectionIds: current.map((id) => ({ id })),
    });
    if (!picked) return null;
    setTitles((known) => ({
      ...known,
      ...Object.fromEntries(
        picked.map((collection) => [collection.id, collection.title]),
      ),
    }));
    return picked.map((collection) => collection.id);
  };

  // One product or collection from Shopify's resource picker. Products the app can't show
  // (drafts, archived, or on no sales channel) aren't offered.
  const pickResource = async (
    type: "product" | "collection",
    current?: string,
  ) => {
    const selectionIds = current ? [{ id: current }] : [];
    const picked =
      type === "product"
        ? await shopify.resourcePicker({
            type: "product",
            action: "select",
            selectionIds,
            filter: {
              variants: false,
              draft: false,
              archived: false,
              hidden: false,
            },
          })
        : await shopify.resourcePicker({
            type: "collection",
            action: "select",
            selectionIds,
          });
    const item = picked?.[0];
    return item
      ? { id: item.id, handle: item.handle, title: item.title }
      : null;
  };

  // Chooses which product or collection the preview shows, like Shopify's theme editor.
  const pickSample = async (kind: "product" | "collection") => {
    const item = await pickResource(kind);
    if (item) setSamples((current) => ({ ...current, [kind]: item }));
  };

  // A product for a product setting: its id, with its name remembered for the editor.
  const pickProduct = async (current?: string) => {
    const item = await pickResource("product", current);
    if (!item) return null;
    setTitles((known) => ({ ...known, [item.id]: item.title }));
    return item.id;
  };

  const tools: SettingTools = {
    titles,
    pages: data.pages,
    menus: data.menus,
    filesAccess: data.filesAccess,
    menusAccess: data.menusAccess,
    pickCollections,
    pickResource,
    pickProduct,
    pickImage,
  };

  const switchPage = (next: PageName) => {
    setPage(next);
    setView("page");
    setSelection(null);
  };

  const updateTheme = (
    update: (theme: AppDesign["theme"]) => AppDesign["theme"],
  ) => setDesign((current) => ({ ...current, theme: update(current.theme) }));

  // A style replaces the colours, fonts and buttons, so Shopify's toast offers Undo.
  const presetApplied = (preset: ThemePreset, previous: AppDesign["theme"]) =>
    shopify.toast.show(`${preset.title} style applied`, {
      action: "Undo",
      onAction: () => updateTheme(() => previous),
    });

  // The merchant tapped around in the preview: show that page's sections.
  const followPreview = (path: string) => {
    if (path === "/" || path === MENU_PATH) {
      const next = path === "/" ? "home" : "menu";
      if (page !== next) switchPage(next);
      return;
    }
    const match = /^\/(products|collections)\/([^/?#]+)$/.exec(path);
    if (!match) return; // The bag, which the editor doesn't design yet.
    const kind = match[1] === "products" ? "product" : "collection";
    const handle = decodePath(match[2] ?? "");
    setSamples((current) =>
      current[kind]?.handle === handle
        ? current
        : { ...current, [kind]: { handle, title: handle } },
    );
    if (page !== kind) switchPage(kind);
  };

  const previewSettings = useMemo(() => {
    if (!preview) return null;
    try {
      return buildPublishedSettings({
        design,
        version: 1,
        publishedAt: new Date(),
        shop: preview.shop,
        links: preview.links,
        app: preview.app,
      });
    } catch (error) {
      // The phone keeps the last design it could draw; saving shows what to fix.
      console.error("Phone preview:", error);
      return null;
    }
  }, [design, preview]);

  const pageInfo =
    PAGES.find((candidate) => candidate.name === page) ?? PAGES[0];
  const allowedSections = sectionTypes.filter((type) =>
    type.pages.includes(page),
  );
  // The product or collection the preview shows on those pages.
  const samplePage = page === "product" || page === "collection" ? page : null;

  const sectionIndex = selection
    ? sections.findIndex((section) => section.id === selection.sectionId)
    : -1;
  const selectedSection = sections[sectionIndex];
  const blockIndex =
    selection?.blockId && selectedSection
      ? selectedSection.blocks.findIndex(
          (block) => block.id === selection.blockId,
        )
      : -1;
  const selectedBlock = selectedSection?.blocks[blockIndex];
  const editing =
    selectedSection && (!selection?.blockId || selectedBlock)
      ? selectedSection
      : null;

  const fieldErrors: Record<string, string> = Object.fromEntries(
    issues.flatMap((issue) => {
      const [root, pageName, , index, part, partIndex, blockPart, blockKey] =
        issue.path;
      if (root !== "pages" || pageName !== page || index !== sectionIndex)
        return [];
      if (selectedBlock) {
        return part === "blocks" &&
          partIndex === blockIndex &&
          blockPart === "settings"
          ? [[String(blockKey), issue.message]]
          : [];
      }
      return part === "settings" ? [[String(partIndex), issue.message]] : [];
    }),
  );
  // Theme problems by their path inside the theme, e.g. "colors.brand".
  const themeErrors: Record<string, string> = Object.fromEntries(
    issues.flatMap((issue) =>
      issue.path[0] === "theme"
        ? [[issue.path.slice(1).join("."), issue.message]]
        : [],
    ),
  );

  return (
    <s-page heading="App design" inlineSize="large">
      {/* `|| undefined` leaves the attribute off: React 18 would write disabled="false". */}
      <s-button
        slot="primary-action"
        variant="primary"
        disabled={(!dirty && !status.hasDraft) || busy || undefined}
        loading={pendingIntent === "publish" || undefined}
        onClick={publish}
      >
        Publish
      </s-button>
      <s-button
        slot="secondary-actions"
        disabled={!dirty || busy || undefined}
        loading={pendingIntent === "save" || undefined}
        onClick={save}
      >
        Save
      </s-button>
      <s-badge slot="accessory" tone={status.hasDraft ? "info" : "success"}>
        {status.hasDraft
          ? status.liveVersion
            ? "Unpublished changes"
            : "Not published yet"
          : "Live"}
      </s-badge>

      {/* Shopify's save bar: Save and Discard while there are unsaved changes. Discard
          asks first. */}
      <ui-save-bar id={SAVE_BAR_ID} discardConfirmation>
        <button variant="primary" disabled={busy} onClick={save}>
          Save
        </button>
        <button disabled={busy} onClick={discard}>
          Discard
        </button>
      </ui-save-bar>

      <s-stack gap="base">
        {issues.length > 0 && (
          <s-banner
            tone="critical"
            heading={
              result?.saved
                ? "Saved, but your app wasn't published"
                : "Your changes weren't saved"
            }
          >
            <s-unordered-list>
              {issues.map((issue, index) => (
                <s-list-item key={index}>
                  {describeIssue(issue, design, sectionTypes, blockTypes)}
                </s-list-item>
              ))}
            </s-unordered-list>
          </s-banner>
        )}
        {result?.intent === "publish" && issues.length === 0 && (
          <s-banner tone="success" heading={`Version ${result.number} is live`}>
            <s-paragraph>
              Your app shows it the next time a customer opens it.
            </s-paragraph>
          </s-banner>
        )}

        <style>{LAYOUT_CSS}</style>
        <div className="appsy-editor">
          <div>
            <s-stack gap="base">
              <s-section padding="base">
                <s-stack gap="small">
                  <s-select
                    label="Page"
                    value={page}
                    onChange={(event) =>
                      switchPage(event.currentTarget.value as PageName)
                    }
                  >
                    {PAGES.map((candidate) => (
                      <s-option key={candidate.name} value={candidate.name}>
                        {candidate.label}
                      </s-option>
                    ))}
                  </s-select>
                  {/* While there are unsaved changes, Shopify's save bar covers the title bar. */}
                  <s-text color="subdued">
                    {dirty
                      ? "Unsaved changes. Press Save at the top, then Publish to send them to your app."
                      : status.hasDraft
                        ? "Saved. Press Publish to send these changes to your app."
                        : "Your app shows this design."}
                  </s-text>
                  {view === "page" && (
                    <s-stack direction="inline">
                      <s-button
                        icon="paint-brush-flat"
                        onClick={() => {
                          setSelection(null);
                          setView("theme");
                        }}
                      >
                        Theme settings
                      </s-button>
                    </s-stack>
                  )}
                </s-stack>
              </s-section>

              <s-section>
                {view === "theme" ? (
                  <ThemeSettings
                    theme={design.theme}
                    errors={themeErrors}
                    tools={tools}
                    backLabel={`Back to the ${pageInfo.label} page`}
                    onBack={() => setView("page")}
                    onChange={updateTheme}
                    onPresetApplied={presetApplied}
                  />
                ) : editing ? (
                  (() => {
                    const sectionType = sectionTypes.find(
                      (type) => type.id === editing.type,
                    );
                    const blockType = selectedBlock
                      ? blockTypes.find(
                          (type) => type.id === selectedBlock.type,
                        )
                      : undefined;
                    const item = selectedBlock ?? editing;
                    const form = selectedBlock
                      ? blockType?.form
                      : sectionType?.form;
                    const kind = selectedBlock ? "block" : "section";
                    const fields = Object.entries(form?.properties ?? {});
                    const setSetting = (key: string, value: unknown) =>
                      selectedBlock
                        ? updateBlock(
                            editing.id,
                            selectedBlock.id,
                            (block) => ({
                              ...block,
                              settings: { ...block.settings, [key]: value },
                            }),
                          )
                        : updateSection(editing.id, (section) => ({
                            ...section,
                            settings: { ...section.settings, [key]: value },
                          }));
                    const toggleHidden = () =>
                      selectedBlock
                        ? updateBlock(
                            editing.id,
                            selectedBlock.id,
                            (block) => ({
                              ...block,
                              hidden: !block.hidden,
                            }),
                          )
                        : updateSection(editing.id, (section) => ({
                            ...section,
                            hidden: !section.hidden,
                          }));
                    return (
                      <s-stack gap="base">
                        <s-grid
                          gridTemplateColumns="auto 1fr"
                          gap="small"
                          alignItems="center"
                        >
                          <s-button
                            variant="tertiary"
                            icon="arrow-left"
                            accessibilityLabel={`Back to the ${pageInfo.label} page`}
                            onClick={() => setSelection(null)}
                          />
                          <s-stack gap="none">
                            <s-heading>
                              {(selectedBlock
                                ? blockType?.title
                                : sectionType?.title) ?? item.type}
                            </s-heading>
                            {selectedBlock && (
                              <s-text color="subdued">
                                In {sectionType?.title ?? editing.type}
                              </s-text>
                            )}
                          </s-stack>
                        </s-grid>
                        {item.hidden && (
                          <s-banner tone="info">
                            Hidden: customers don&apos;t see this {kind}.
                          </s-banner>
                        )}
                        {fields.length === 0 && (
                          <s-paragraph color="subdued">
                            This {kind} has no settings.
                          </s-paragraph>
                        )}
                        {fields.map(([key, field]) => (
                          <SettingControl
                            key={`${item.id}-${key}`}
                            field={field}
                            value={item.settings[key]}
                            error={fieldErrors[key]}
                            tools={tools}
                            onChange={(value) => setSetting(key, value)}
                          />
                        ))}
                        <s-divider />
                        <s-stack direction="inline" gap="small">
                          <s-button
                            icon={item.hidden ? "view" : "hide"}
                            onClick={toggleHidden}
                          >
                            {item.hidden ? `Show ${kind}` : `Hide ${kind}`}
                          </s-button>
                          <s-button
                            icon="delete"
                            tone="critical"
                            onClick={() =>
                              selectedBlock
                                ? removeBlock(editing.id, selectedBlock.id)
                                : removeSection(editing.id)
                            }
                          >
                            {`Remove ${kind}`}
                          </s-button>
                        </s-stack>
                      </s-stack>
                    );
                  })()
                ) : (
                  <s-stack gap="small">
                    <s-heading>{pageInfo.label} page</s-heading>
                    {page === "home" && sections.length === 0 && (
                      <s-paragraph color="subdued">
                        This page is empty. Add a section to start.
                      </s-paragraph>
                    )}
                    {page === "menu" && (
                      <s-paragraph color="subdued">
                        The side menu opens from the ☰ button on your
                        app&apos;s home screen. It always ends with Privacy
                        choices, where shoppers change their usage-data answer.
                      </s-paragraph>
                    )}
                    {/* Phones draw an empty Product or Collection page from its template. */}
                    {samplePage &&
                      sections.every((section) => section.hidden) && (
                        <s-paragraph color="subdued">
                          With nothing showing on this page, your app uses the
                          standard {pageInfo.label} page.
                        </s-paragraph>
                      )}
                    <Sortable
                      items={sections}
                      keyOf={(item) => item.id}
                      label={(item) =>
                        `Drag to move ${sectionTypes.find((candidate) => candidate.id === item.type)?.title ?? item.type}`
                      }
                      onMove={(from, to) =>
                        updateSections((current) => moveTo(current, from, to))
                      }
                    >
                      {(section, handle) => {
                        const type = sectionTypes.find(
                          (candidate) => candidate.id === section.type,
                        );
                        const title = type?.title ?? section.type;
                        const accepted = blockTypes.filter((blockType) =>
                          type?.acceptsBlocks.includes(blockType.id),
                        );
                        return (
                          <s-stack key={section.id} gap="small-200">
                            <TreeRow
                              id={`section-${section.id}`}
                              handle={handle}
                              title={title}
                              subtitle={summarize(
                                type?.form,
                                section.settings,
                                titles,
                                data.menus,
                              )}
                              hidden={section.hidden === true}
                              onEdit={() =>
                                setSelection({ sectionId: section.id })
                              }
                              onToggleHidden={() =>
                                updateSection(section.id, (current) => ({
                                  ...current,
                                  hidden: !current.hidden,
                                }))
                              }
                              onDuplicate={
                                sections.length < MAX_SECTIONS_PER_PAGE
                                  ? () =>
                                      updateSections((current) =>
                                        current.flatMap((candidate) =>
                                          candidate.id === section.id
                                            ? [
                                                candidate,
                                                copySection(candidate),
                                              ]
                                            : [candidate],
                                        ),
                                      )
                                  : undefined
                              }
                              onRemove={() => removeSection(section.id)}
                            />
                            {(section.blocks.length > 0 ||
                              accepted.length > 0) && (
                              <s-box paddingInlineStart="large">
                                <s-stack gap="small-200">
                                  <Sortable
                                    items={section.blocks}
                                    keyOf={(item) => item.id}
                                    label={(item) =>
                                      `Drag to move ${blockTypes.find((candidate) => candidate.id === item.type)?.title ?? item.type}`
                                    }
                                    onMove={(from, to) =>
                                      updateBlocks(section.id, (current) =>
                                        moveTo(current, from, to),
                                      )
                                    }
                                  >
                                    {(block, blockHandle) => {
                                      const blockType = blockTypes.find(
                                        (candidate) =>
                                          candidate.id === block.type,
                                      );
                                      const blockTitle =
                                        blockType?.title ?? block.type;
                                      const full =
                                        section.blocks.length >=
                                        MAX_BLOCKS_PER_SECTION;
                                      return (
                                        <TreeRow
                                          id={`block-${block.id}`}
                                          handle={blockHandle}
                                          title={blockTitle}
                                          subtitle={summarize(
                                            blockType?.form,
                                            block.settings,
                                            titles,
                                            data.menus,
                                          )}
                                          hidden={block.hidden === true}
                                          onEdit={() =>
                                            setSelection({
                                              sectionId: section.id,
                                              blockId: block.id,
                                            })
                                          }
                                          onToggleHidden={() =>
                                            updateBlock(
                                              section.id,
                                              block.id,
                                              (current) => ({
                                                ...current,
                                                hidden: !current.hidden,
                                              }),
                                            )
                                          }
                                          onDuplicate={
                                            full
                                              ? undefined
                                              : () =>
                                                  updateBlocks(
                                                    section.id,
                                                    (current) =>
                                                      current.flatMap(
                                                        (candidate) =>
                                                          candidate.id ===
                                                          block.id
                                                            ? [
                                                                candidate,
                                                                copyBlock(
                                                                  candidate,
                                                                ),
                                                              ]
                                                            : [candidate],
                                                      ),
                                                  )
                                          }
                                          onRemove={() =>
                                            removeBlock(section.id, block.id)
                                          }
                                        />
                                      );
                                    }}
                                  </Sortable>
                                  {accepted.length > 0 && (
                                    <>
                                      <s-button
                                        variant="tertiary"
                                        icon="plus"
                                        commandFor={`add-block-${section.id}`}
                                        disabled={
                                          section.blocks.length >=
                                          MAX_BLOCKS_PER_SECTION
                                        }
                                      >
                                        Add block
                                      </s-button>
                                      <s-menu
                                        id={`add-block-${section.id}`}
                                        accessibilityLabel={`Blocks for ${title}`}
                                      >
                                        {accepted.map((blockType) => (
                                          <s-button
                                            key={blockType.id}
                                            onClick={() =>
                                              addBlock(section.id, blockType)
                                            }
                                          >
                                            {blockType.title}
                                          </s-button>
                                        ))}
                                      </s-menu>
                                    </>
                                  )}
                                </s-stack>
                              </s-box>
                            )}
                          </s-stack>
                        );
                      }}
                    </Sortable>
                    <s-button
                      icon="plus"
                      commandFor="add-section"
                      disabled={sections.length >= MAX_SECTIONS_PER_PAGE}
                    >
                      Add section
                    </s-button>
                    <s-menu id="add-section" accessibilityLabel="Sections">
                      {allowedSections.map((type) => (
                        <s-button
                          key={type.id}
                          onClick={() => addSection(type)}
                        >
                          {type.title}
                        </s-button>
                      ))}
                    </s-menu>
                  </s-stack>
                )}
              </s-section>
            </s-stack>
          </div>

          <div className="appsy-editor__preview">
            {!data.previewBuilt ? (
              <s-banner
                tone="warning"
                heading="The phone preview isn't built yet"
              >
                <s-paragraph>
                  In the Appsy folder, run npm run preview:build, then open the
                  editor again.
                </s-paragraph>
              </s-banner>
            ) : !preview ? (
              <s-banner
                tone="warning"
                heading="The preview can't reach your store right now"
              >
                <s-paragraph>
                  You can keep designing. Close the editor and open it again to
                  retry.
                </s-paragraph>
              </s-banner>
            ) : null}
            {preview && !previewSettings && (
              <s-banner
                tone="warning"
                heading="The preview can't show this design"
              >
                <s-paragraph>
                  Save your changes to see what needs fixing.
                </s-paragraph>
              </s-banner>
            )}
            {preview && samplePage && (
              <s-stack direction="inline" gap="small" alignItems="center">
                <s-text color="subdued">
                  {samples[samplePage]
                    ? `Previewing ${samples[samplePage].title}`
                    : `No ${samplePage} to preview yet`}
                </s-text>
                <s-button
                  variant="tertiary"
                  onClick={() => pickSample(samplePage)}
                >
                  {samples[samplePage] ? "Change" : `Choose a ${samplePage}`}
                </s-button>
              </s-stack>
            )}
            {preview && samplePage && !samples[samplePage] && (
              <s-paragraph color="subdued">
                Only products and collections available to the Appsy sales
                channel show in your app.
              </s-paragraph>
            )}
            {data.previewBuilt && (
              <PhonePreview
                settings={previewSettings}
                path={pagePath(page, samples)}
                background={design.theme.colors.background}
                onLocation={followPreview}
              />
            )}
          </div>
        </div>
      </s-stack>
    </s-page>
  );
}

// One section or block in the page's list: drag it by its handle, open its settings, hide
// it, or use the menu.
function TreeRow({
  id,
  handle,
  title,
  subtitle,
  hidden,
  onEdit,
  onToggleHidden,
  onDuplicate,
  onRemove,
}: {
  id: string;
  handle: ReactNode;
  title: string;
  subtitle: string | null;
  hidden: boolean;
  onEdit: () => void;
  onToggleHidden: () => void;
  onDuplicate?: () => void;
  onRemove: () => void;
}) {
  const menuId = `${id}-actions`;
  return (
    <s-box padding="small" border="base" borderRadius="base">
      <s-grid
        gridTemplateColumns="auto 1fr auto auto"
        gap="small-200"
        alignItems="center"
      >
        {handle}
        <s-clickable onClick={onEdit} accessibilityLabel={`Edit ${title}`}>
          <s-stack gap="none">
            <s-text type="strong" color={hidden ? "subdued" : "base"}>
              {title}
            </s-text>
            {subtitle && <s-text color="subdued">{subtitle}</s-text>}
          </s-stack>
        </s-clickable>
        <s-button
          variant="tertiary"
          icon={hidden ? "hide" : "view"}
          accessibilityLabel={hidden ? `Show ${title}` : `Hide ${title}`}
          onClick={onToggleHidden}
        />
        <s-button
          variant="tertiary"
          icon="menu-horizontal"
          accessibilityLabel={`More actions for ${title}`}
          commandFor={menuId}
        />
      </s-grid>
      <s-menu id={menuId} accessibilityLabel={`${title} actions`}>
        <s-button
          icon="duplicate"
          disabled={!onDuplicate}
          onClick={onDuplicate}
        >
          Duplicate
        </s-button>
        <s-button icon="delete" tone="critical" onClick={onRemove}>
          Remove
        </s-button>
      </s-menu>
    </s-box>
  );
}

// Two columns on wide windows: the settings scroll with the page while the phone stays in
// view (sticky). One column on narrow ones.
const STICKY_TOP = 16;
const LAYOUT_CSS = `
  .appsy-editor { display: grid; gap: 16px; align-items: start; }
  .appsy-editor__preview { display: flex; flex-direction: column; align-items: center; gap: 12px; }
  @media (min-width: 880px) {
    .appsy-editor { grid-template-columns: minmax(320px, 380px) minmax(0, 1fr); }
    .appsy-editor__preview { position: sticky; top: ${STICKY_TOP}px; }
  }
`;

// A real phone's screen in CSS pixels (iPhone 15), drawn inside a bezel and scaled to the
// window's height, so the app lays out exactly as it does on a phone.
const SCREEN = { width: 390, height: 844 };
const BEZEL = 12;
const FRAME = {
  width: SCREEN.width + BEZEL * 2,
  height: SCREEN.height + BEZEL * 2,
};
const BOTTOM_GAP = 16;

// The phone frame: the phone app's web build in preview mode (routes/preview.$.tsx), sent
// the unsaved design as it changes (apps/mobile/src/app/_layout.tsx). Same origin only.
function PhonePreview({
  settings,
  path,
  background,
  onLocation,
}: {
  settings: PublishedSettings | null;
  path: string | null;
  background: string;
  onLocation: (path: string) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  // The page the phone shows, and the one it was last asked to open.
  const location = useRef<string | null>(null);
  const requested = useRef<string | null>(null);
  const follow = useRef(onLocation);
  follow.current = onLocation;
  // Goes up each time the phone app (re)loads and says it's ready.
  const [connection, setConnection] = useState(0);
  // The phone is added only once the listener below is on. Otherwise the server-rendered
  // page starts loading it before this code runs, and its "ready" is missed.
  const [listening, setListening] = useState(false);
  const [scale, setScale] = useState(0.7);

  useEffect(() => {
    const element = holder.current;
    const column = element?.parentElement;
    if (!element || !column) return;
    const fit = () => {
      // As tall as the window allows below the notes above the phone, so the whole phone
      // stays in view while it's sticky.
      const above =
        element.getBoundingClientRect().top -
        column.getBoundingClientRect().top;
      const byHeight =
        (window.innerHeight - STICKY_TOP - above - BOTTOM_GAP) / FRAME.height;
      const byWidth = column.clientWidth / FRAME.width;
      setScale(Math.max(0.5, Math.min(1, byHeight, byWidth)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(column);
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== frame.current?.contentWindow) return;
      const message = event.data as {
        source?: unknown;
        type?: unknown;
        path?: unknown;
      } | null;
      if (message?.source !== "appsy-preview") return;
      if (message.type === "ready") {
        location.current = null;
        requested.current = null;
        setConnection((count) => count + 1);
      } else if (
        message.type === "location" &&
        typeof message.path === "string"
      ) {
        location.current = message.path;
        // Pages passed on the way to the one the editor asked for don't count.
        if (requested.current !== null) {
          if (samePath(message.path, requested.current))
            requested.current = null;
          return;
        }
        follow.current(message.path);
      }
    };
    window.addEventListener("message", onMessage);
    setListening(true);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (connection > 0 && settings)
      send(frame.current, { type: "design", settings });
  }, [connection, settings]);

  useEffect(() => {
    if (connection === 0 || !path) return;
    if (location.current !== null && samePath(location.current, path)) return;
    requested.current = path;
    send(frame.current, { type: "navigate", path });
  }, [connection, path]);

  return (
    <div
      ref={holder}
      style={{ width: FRAME.width * scale, height: FRAME.height * scale }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
          width: FRAME.width,
          height: FRAME.height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          border: `${BEZEL}px solid #1f2124`,
          borderRadius: 60,
          overflow: "hidden",
          background,
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.18)",
        }}
      >
        {/* The status bar's place, with the camera cut-out, as on a real phone. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 44,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 110,
              height: 30,
              borderRadius: 15,
              background: "#1f2124",
            }}
          />
        </div>
        {listening && (
          <iframe
            ref={frame}
            title="Phone preview"
            src="/preview/?preview=1"
            style={{ flex: 1, width: "100%", border: 0, display: "block" }}
          />
        )}
      </div>
    </div>
  );
}

function send(
  frame: HTMLIFrameElement | null,
  message: Record<string, unknown>,
) {
  frame?.contentWindow?.postMessage(
    { source: "appsy-editor", ...message },
    window.location.origin,
  );
}

// Not a real screen: the phone shows Home with its side menu open (apps/mobile/src/app/_layout.tsx).
const MENU_PATH = "/menu";

// The phone app's address for a page in the editor, or null when there's nothing to show.
function pagePath(page: PageName, samples: Samples): string | null {
  if (page === "home") return "/";
  if (page === "menu") return MENU_PATH;
  const item = samples[page];
  if (!item) return null;
  return `/${page === "product" ? "products" : "collections"}/${encodeURIComponent(item.handle)}`;
}

function samePath(a: string, b: string) {
  return decodePath(a) === decodePath(b);
}

function decodePath(path: string) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function moveTo<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

function copyBlock(block: BlockInstance): BlockInstance {
  return { ...structuredClone(block), id: crypto.randomUUID() };
}

function copySection(section: SectionInstance): SectionInstance {
  return {
    ...structuredClone(section),
    id: crypto.randomUUID(),
    blocks: section.blocks.map(copyBlock),
  };
}

// Says where a problem is, e.g. "Home › Product row: …", using the design's current order.
function describeIssue(
  issue: DesignIssue,
  design: AppDesign,
  sectionTypes: SectionType[],
  blockTypes: BlockType[],
) {
  const [root, pageName, , index, part, blockIndex] = issue.path;
  if (root === "theme") return `Theme settings: ${issue.message}`;
  const page = PAGES.find((candidate) => candidate.name === pageName);
  if (root !== "pages" || !page || typeof index !== "number")
    return issue.message;
  const section = design.pages[page.name].sections[index];
  const where = [
    page.label,
    sectionTypes.find((type) => type.id === section?.type)?.title ?? "Section",
  ];
  if (part === "blocks" && typeof blockIndex === "number") {
    const block = section?.blocks[blockIndex];
    where.push(
      blockTypes.find((type) => type.id === block?.type)?.title ?? "Block",
    );
  }
  return `${where.join(" › ")}: ${issue.message}`;
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
