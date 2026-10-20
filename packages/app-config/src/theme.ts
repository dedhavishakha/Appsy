// The app's look: the fonts merchants can choose and the starter presets (doc 03, section D).

// Google Fonts under the SIL Open Font License, which allows bundling them in apps as long
// as the licence goes with them. Every Appsy app carries all of them, so a new choice needs
// no new build. "System" is the phone's own font; phones show it for names they don't know.
export const FONT_OPTIONS = {
  System: "Phone's standard font",
  Jost: "Jost",
  Montserrat: "Montserrat",
  Inter: "Inter",
  Poppins: "Poppins",
  Lato: "Lato",
  Raleway: "Raleway",
  Nunito: "Nunito",
  "Playfair Display": "Playfair Display",
  "Cormorant Garamond": "Cormorant Garamond",
  "DM Serif Display": "DM Serif Display",
} as const;

export type FontName = keyof typeof FONT_OPTIONS;

export type ThemePreset = {
  id: string;
  title: string;
  colors: { brand: string; background: string; text: string; accent: string };
  fonts: { heading: FontName; body: FontName };
  buttons: { shape: "square" | "rounded" | "pill"; style: "filled" | "outline" };
};

// One tap sets colours, fonts and buttons together; merchants can change each afterwards.
// Shopify asks app builders for a theme builder or presets (App Store requirement 5.9.3).
// The first is every new design's starting look.
export const THEME_PRESETS: readonly [ThemePreset, ...ThemePreset[]] = [
  {
    id: "classic",
    title: "Classic",
    colors: { brand: "#42523D", background: "#FFFFFF", text: "#1F2937", accent: "#C2410C" },
    fonts: { heading: "Jost", body: "Montserrat" },
    buttons: { shape: "rounded", style: "filled" },
  },
  {
    id: "bold",
    title: "Bold",
    colors: { brand: "#111111", background: "#FFFFFF", text: "#111111", accent: "#E11D48" },
    fonts: { heading: "Poppins", body: "Inter" },
    buttons: { shape: "square", style: "filled" },
  },
  {
    id: "minimal",
    title: "Minimal",
    colors: { brand: "#1C1917", background: "#FAFAF9", text: "#1C1917", accent: "#B45309" },
    fonts: { heading: "Playfair Display", body: "Lato" },
    buttons: { shape: "pill", style: "outline" },
  },
];
