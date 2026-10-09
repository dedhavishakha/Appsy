import { createContext, useContext } from "react";
import type { PublishedSettings } from "@appsy/app-config";

// The published settings file, loaded once in app/_layout.tsx.
export const SettingsContext = createContext<PublishedSettings | null>(null);

export function useSettings(): PublishedSettings {
  const settings = useContext(SettingsContext);
  if (!settings) throw new Error("useSettings needs SettingsContext from app/_layout.tsx");
  return settings;
}

// The merchant's colours from the design (theme editor in Phase 3).
export function useColors() {
  return useSettings().theme.colors;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

// Horizontal page gutter used by every screen.
export const gutter = space.lg;
