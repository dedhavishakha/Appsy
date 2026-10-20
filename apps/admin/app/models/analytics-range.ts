// The Analytics page's date ranges, in days. Its own code uses them as well as its loader,
// and a page can't import from a .server file, so they live here (like image-result.ts).
export const RANGE_DAYS = [7, 30, 60] as const;
export type RangeDays = (typeof RANGE_DAYS)[number];
