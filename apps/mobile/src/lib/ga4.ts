import type { Ga4Event } from "@appsy/app-config";

// Google Analytics through Firebase (doc 03, section J2) exists only in phone builds that
// include the merchant's Firebase file: ga4.native.ts. The editor's preview (web) has no
// Firebase, so here both do nothing.

export async function setGa4Collection(_on: boolean): Promise<void> {}

export async function sendGa4(_event: Ga4Event): Promise<void> {}
