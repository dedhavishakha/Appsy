import * as Font from "expo-font";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { FontName } from "@appsy/app-config";
import { CormorantGaramond_400Regular } from "@expo-google-fonts/cormorant-garamond/400Regular";
import { CormorantGaramond_600SemiBold } from "@expo-google-fonts/cormorant-garamond/600SemiBold";
import { DMSerifDisplay_400Regular } from "@expo-google-fonts/dm-serif-display/400Regular";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Jost_400Regular } from "@expo-google-fonts/jost/400Regular";
import { Jost_600SemiBold } from "@expo-google-fonts/jost/600SemiBold";
import { Lato_400Regular } from "@expo-google-fonts/lato/400Regular";
import { Lato_700Bold } from "@expo-google-fonts/lato/700Bold";
import { Montserrat_400Regular } from "@expo-google-fonts/montserrat/400Regular";
import { Montserrat_600SemiBold } from "@expo-google-fonts/montserrat/600SemiBold";
import { Nunito_400Regular } from "@expo-google-fonts/nunito/400Regular";
import { Nunito_600SemiBold } from "@expo-google-fonts/nunito/600SemiBold";
import { PlayfairDisplay_400Regular } from "@expo-google-fonts/playfair-display/400Regular";
import { PlayfairDisplay_600SemiBold } from "@expo-google-fonts/playfair-display/600SemiBold";
import { Poppins_400Regular } from "@expo-google-fonts/poppins/400Regular";
import { Poppins_600SemiBold } from "@expo-google-fonts/poppins/600SemiBold";
import { Raleway_400Regular } from "@expo-google-fonts/raleway/400Regular";
import { Raleway_600SemiBold } from "@expo-google-fonts/raleway/600SemiBold";

type BundledFont = Exclude<FontName, "System">;

// Every font the editor offers (FONT_OPTIONS in @appsy/app-config): its regular file, and
// its bold one for text of weight 600 and up. All are in every app, so a merchant's new
// choice needs no app update. Google Fonts under the SIL Open Font License, whose text goes
// with each app (docs/06). DM Serif Display comes in one weight.
const FONT_FILES: Record<BundledFont, { regular: number; bold: number }> = {
  Jost: { regular: Jost_400Regular, bold: Jost_600SemiBold },
  Montserrat: { regular: Montserrat_400Regular, bold: Montserrat_600SemiBold },
  Inter: { regular: Inter_400Regular, bold: Inter_600SemiBold },
  Poppins: { regular: Poppins_400Regular, bold: Poppins_600SemiBold },
  Lato: { regular: Lato_400Regular, bold: Lato_700Bold },
  Raleway: { regular: Raleway_400Regular, bold: Raleway_600SemiBold },
  Nunito: { regular: Nunito_400Regular, bold: Nunito_600SemiBold },
  "Playfair Display": { regular: PlayfairDisplay_400Regular, bold: PlayfairDisplay_600SemiBold },
  "Cormorant Garamond": {
    regular: CormorantGaramond_400Regular,
    bold: CormorantGaramond_600SemiBold,
  },
  "DM Serif Display": { regular: DMSerifDisplay_400Regular, bold: DMSerifDisplay_400Regular },
};

// The names a loaded font is drawn with, or null for the phone's standard font.
export type Families = { regular: string; bold: string } | null;
export type Typography = { heading: Families; body: Families };

export const TypographyContext = createContext<Typography>({ heading: null, body: null });

// The fonts for components/text.tsx; the phone's standard ones outside the design.
export function useTypography(): Typography {
  return useContext(TypographyContext);
}

function isBundled(font: string): font is BundledFont {
  return Object.hasOwn(FONT_FILES, font);
}

function familiesOf(font: BundledFont) {
  const name = `Appsy-${font.replace(/\s+/g, "")}`;
  return { regular: `${name}-Regular`, bold: `${name}-Bold` };
}

// Whether a font is ready, including one loaded before this screen (the editor's preview
// switches fonts back and forth).
function isLoaded(font: BundledFont) {
  const names = familiesOf(font);
  return Font.isLoaded(names.regular) && Font.isLoaded(names.bold);
}

// Loads the design's heading and body fonts from the app's own files. Text shows in the
// phone's standard font for the moment they take, and for "System" or a font this version
// of the app doesn't have.
export function useDesignTypography(fonts: { heading: string; body: string } | null): Typography {
  const heading = fonts?.heading ?? "System";
  const body = fonts?.body ?? "System";
  // Fonts that finished loading here, so text redraws in them.
  const [loaded, setLoaded] = useState<readonly string[]>([]);

  useEffect(() => {
    let current = true;
    for (const font of new Set([heading, body])) {
      if (!isBundled(font) || isLoaded(font)) continue;
      const names = familiesOf(font);
      const files = FONT_FILES[font];
      Font.loadAsync({ [names.regular]: files.regular, [names.bold]: files.bold })
        .then(() => current && setLoaded((list) => [...list, font]))
        .catch((error: unknown) => console.warn(`The ${font} font didn't load:`, error));
    }
    return () => {
      current = false;
    };
  }, [heading, body]);

  return useMemo(() => {
    const ready = (font: string): Families =>
      isBundled(font) && (loaded.includes(font) || isLoaded(font)) ? familiesOf(font) : null;
    return { heading: ready(heading), body: ready(body) };
  }, [heading, body, loaded]);
}
