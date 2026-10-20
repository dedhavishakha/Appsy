import { useEffect, useRef } from "react";
import { useRevalidator } from "react-router";

export const EDITOR_WINDOW_ID = "appsy-editor";

// The full-screen editor (routes/editor.tsx) in Shopify's App window. Shopify's guideline
// is to open it only when the merchant asks, so pages open it from a button:
// <s-button commandFor={EDITOR_WINDOW_ID} command="--show">.
export function EditorWindow() {
  const { revalidate } = useRevalidator();
  const refresh = useRef(revalidate);
  refresh.current = revalidate;

  useEffect(() => {
    const element = document.getElementById(EDITOR_WINDOW_ID);
    if (!element) return;
    // Saving and publishing in the window change what the page underneath shows.
    const onHide = () => void refresh.current();
    element.addEventListener("hide", onHide);
    return () => element.removeEventListener("hide", onHide);
  }, []);

  return <s-app-window id={EDITOR_WINDOW_ID} src="/editor" />;
}
