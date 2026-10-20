import { createContext, useContext } from "react";

// The side menu that the ☰ button opens (components/menu-drawer.tsx). Its rows close it
// before they go anywhere.
export type MenuDrawerControls = {
  visible: boolean;
  open: () => void;
  // Slides it shut, then runs `after` (opening the row's page, say).
  close: (after?: () => void) => void;
  // Shut at once, for the editor's preview switching pages.
  hide: () => void;
};

export const MenuDrawerContext = createContext<MenuDrawerControls | null>(null);

// Lines and pressed rows in the menu: a light tint that suits the merchant's background.
export const BORDER = "rgba(0, 0, 0, 0.1)";
export const PRESSED = "rgba(0, 0, 0, 0.05)";

export function useMenuDrawer(): MenuDrawerControls {
  const controls = useContext(MenuDrawerContext);
  if (!controls) throw new Error("useMenuDrawer needs MenuDrawerProvider from components/menu-drawer.tsx");
  return controls;
}
