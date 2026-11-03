import { useEffect, useRef } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

// Shopify's contextual save bar (App Bridge <ui-save-bar>, Save Bar API), shown while there are
// unsaved changes. App Bridge presses the bar's Save and Discard by clicking these buttons
// (button.click() in its own code, checked 2026-11-02), so each gets a plain click listener on
// the button itself, which hears that click whatever React does with events. Discard asks
// first. Pages also keep their own Save button, so saving never depends on the bar alone.
export function SaveBar({
  id,
  dirty,
  busy,
  onSave,
  onDiscard,
}: {
  id: string;
  dirty: boolean;
  busy: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const shopify = useAppBridge();
  const saveButton = useRef<HTMLButtonElement>(null);
  const discardButton = useRef<HTMLButtonElement>(null);
  // The page's latest handlers, for the listeners added once below.
  const handlers = useRef({ onSave, onDiscard });
  useEffect(() => {
    handlers.current = { onSave, onDiscard };
  });

  useEffect(() => {
    const save = saveButton.current;
    const discard = discardButton.current;
    const saveClicked = () => handlers.current.onSave();
    const discardClicked = () => handlers.current.onDiscard();
    save?.addEventListener("click", saveClicked);
    discard?.addEventListener("click", discardClicked);
    return () => {
      save?.removeEventListener("click", saveClicked);
      discard?.removeEventListener("click", discardClicked);
    };
  }, []);

  useEffect(() => {
    (dirty ? shopify.saveBar.show(id) : shopify.saveBar.hide(id)).catch(
      (error: unknown) => console.error("Save bar:", error),
    );
  }, [dirty, id, shopify]);

  return (
    <ui-save-bar id={id} discardConfirmation>
      <button variant="primary" disabled={busy} ref={saveButton}>
        Save
      </button>
      <button disabled={busy} ref={discardButton}>
        Discard
      </button>
    </ui-save-bar>
  );
}
