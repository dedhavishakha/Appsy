// Changes to the phone app's code that merchants get only by building their app again, oldest
// first. Add one whenever a change in apps/mobile matters to merchants (a new feature, a fix
// they'd notice, a new Apple or Google requirement): Appsy then tells each merchant whose last
// build is older that their app needs a new build, and why (admin models/build-contents.server.ts;
// decided 2026-11-02).

export type AppPlatform = "android" | "ios";

export type AppRelease = {
  release: number;
  // When the change was pushed to Appsy's code, for releases from before builds recorded
  // their release (2026-11-02): older builds are judged by when they started. Later releases
  // need none, because every build since records its release.
  at?: string;
  // What merchants get, completing "Appsy's app was updated: …".
  change: string;
  // Only these platforms' apps get it; every platform when left out.
  platforms?: AppPlatform[];
};

export const APP_RELEASES: readonly AppRelease[] = [
  {
    release: 1,
    at: "2026-10-30T12:33:33Z",
    change: "push notifications and bag reminders",
  },
  {
    release: 2,
    change:
      "automatic notifications about the bag and the wishlist, with the product's name and picture",
  },
  {
    release: 3,
    change:
      "shopper sign-in with your store's Shopify customer accounts, and an Account tab with orders, addresses and profile",
  },
];

// The release a build started now gets.
export const APP_RELEASE = APP_RELEASES[APP_RELEASES.length - 1]?.release ?? 0;

// The release a build that started at `time` got, for builds that didn't record it. Such
// builds come from before release 2, so only releases with a time count.
export function releaseAt(time: Date): number {
  return APP_RELEASES.filter((entry) => entry.at && new Date(entry.at) <= time).reduce(
    (latest, entry) => Math.max(latest, entry.release),
    0,
  );
}

// What a platform's app built with `release` doesn't have yet.
export function releasesSince(release: number, platform: AppPlatform): AppRelease[] {
  return APP_RELEASES.filter(
    (entry) =>
      entry.release > release && (!entry.platforms || entry.platforms.includes(platform)),
  );
}
