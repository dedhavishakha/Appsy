// Appsy's web pages are kept out of search engines (decided 2026-10-21): merchants find Appsy
// in the Shopify App Store and open it in their Shopify admin. Sent as a robots meta tag on
// every page (root.tsx) and as an X-Robots-Tag header on pages (entry.server.tsx) and on the
// files Appsy serves (routes/cdn.$.tsx, routes/preview.$.tsx). There's deliberately no
// robots.txt "Disallow": a crawler that may not fetch a page never sees its noindex.
export const ROBOTS = "noindex, nofollow, noarchive, nosnippet";
