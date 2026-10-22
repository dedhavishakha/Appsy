import sharp from "sharp";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import {
  ANDROID_SAFE_RATIO,
  APP_NAME_MAX,
  DEFAULT_IDENTITY,
  ICON_SIZE,
  identitySchema,
  type IdentityField,
  type IdentityIssue,
  type IdentitySettings,
} from "./identity";
import {
  downloadPicture,
  named,
  PictureError,
  readPicture,
  shopifyPicture,
  type Picture,
} from "./pictures.server";
import { putPublicFile } from "./storage.server";

// The app's name, icon and splash screen: how a build of the merchant's app looks on the
// phone's home screen and while it opens (the Publishing page, routes/app.publishing.tsx).
// Unlike the design, they reach the app only with its next build. Saving makes the
// pictures each platform needs and writes identity.json beside the design files; builds
// download both first (apps/mobile/scripts/fetch-build-identity.mjs).

const ANDROID_SAFE = Math.round(ICON_SIZE * ANDROID_SAFE_RATIO);
// The splash picture is drawn 200 dp wide (apps/mobile/app.config.js); 1024 px stays sharp.
const SPLASH_MAX = 1024;

export async function loadIdentity(appProjectId: string) {
  const project = await db.appProject.findUniqueOrThrow({
    where: { id: appProjectId },
    select: { appName: true, identity: true },
  });
  const parsed = identitySchema.safeParse(project.identity);
  return {
    appName: project.appName,
    settings: parsed.success ? parsed.data : DEFAULT_IDENTITY,
  };
}

export async function saveIdentity(
  admin: AdminApiContext,
  appProjectId: string,
  input: { appName: unknown; settings: unknown },
): Promise<IdentityIssue[]> {
  const issues: IdentityIssue[] = [];
  const name = typeof input.appName === "string" ? input.appName.trim() : "";
  if (!name)
    issues.push({ field: "appName", message: "Enter your app's name." });
  else if (name.length > APP_NAME_MAX) {
    issues.push({
      field: "appName",
      message: `Use ${APP_NAME_MAX} characters or fewer.`,
    });
  }
  const parsed = identitySchema.safeParse(input.settings);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      issues.push({
        field: typeof field === "string" ? (field as IdentityField) : null,
        message: issue.message,
      });
    }
  }
  if (issues.length > 0 || !parsed.success) return issues;

  try {
    const settings: IdentitySettings = {
      ...parsed.data,
      icon:
        parsed.data.icon &&
        (await shopifyPicture(admin, parsed.data.icon, "icon")),
      splashImage:
        parsed.data.splashImage &&
        (await shopifyPicture(admin, parsed.data.splashImage, "splashImage")),
    };
    const files = await renderPictures(settings);
    for (const file of Object.values(files)) {
      if (file)
        await putPublicFile(
          `a/${appProjectId}/identity/${file.name}`,
          file.png,
        );
    }
    const manifest = {
      schemaVersion: 1,
      name,
      icon: files.icon ? `identity/${files.icon.name}` : null,
      android: files.android
        ? {
            foreground: `identity/${files.android.name}`,
            background: settings.iconBackground,
          }
        : null,
      splash: {
        image: files.splash ? `identity/${files.splash.name}` : null,
        background: settings.splashBackground,
      },
      updatedAt: new Date().toISOString(),
    };
    await putPublicFile(
      `a/${appProjectId}/identity.json`,
      JSON.stringify(manifest),
    );
    await db.appProject.update({
      where: { id: appProjectId },
      data: { appName: name, identity: settings },
    });
    return [];
  } catch (error) {
    if (error instanceof PictureError) {
      return [{ field: error.field as IdentityField, message: error.message }];
    }
    throw error;
  }
}

// The icon for both stores (square, 1024 px, no transparency), Android's icon layer (the
// icon inside the safe zone, the rest transparent), and the splash picture (transparency
// kept, so a logo sits on the splash colour). With no splash picture, the icon is used.
async function renderPictures(settings: IdentitySettings) {
  let icon: Picture | null = null;
  let android: Picture | null = null;
  const iconSource = settings.icon
    ? await downloadPicture(settings.icon, "icon")
    : null;
  if (iconSource) {
    const square = await readPicture("icon", async () => {
      const image = sharp(iconSource).rotate();
      const { width = 0, height = 0 } = await image.metadata();
      if (Math.min(width, height) < ICON_SIZE) {
        throw new PictureError(
          "icon",
          `Choose an icon at least ${ICON_SIZE} × ${ICON_SIZE} pixels. This one is ${width} × ${height}.`,
        );
      }
      return image
        .resize(ICON_SIZE, ICON_SIZE, { fit: "cover", position: "centre" })
        .flatten({ background: settings.iconBackground })
        .png()
        .toBuffer();
    });
    icon = named("icon", square);
    const inset = Math.floor((ICON_SIZE - ANDROID_SAFE) / 2);
    android = named(
      "android-icon",
      await sharp(square)
        .resize(ANDROID_SAFE, ANDROID_SAFE)
        .extend({
          top: inset,
          left: inset,
          bottom: ICON_SIZE - ANDROID_SAFE - inset,
          right: ICON_SIZE - ANDROID_SAFE - inset,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer(),
    );
  }

  const splashSource = settings.splashImage
    ? await downloadPicture(settings.splashImage, "splashImage")
    : iconSource;
  const splash = splashSource
    ? named(
        "splash",
        await readPicture(settings.splashImage ? "splashImage" : "icon", () =>
          sharp(splashSource)
            .rotate()
            .resize(SPLASH_MAX, SPLASH_MAX, {
              fit: "inside",
              withoutEnlargement: true,
            })
            .png()
            .toBuffer(),
        ),
      )
    : null;

  return { icon, android, splash };
}
