// Version of the settings file format. Bump it only for changes that older phones can't
// read, and add a migration for saved designs (migrations.ts).
export const SCHEMA_VERSION = 1;

// Oldest phone runtime release that can read files of this SCHEMA_VERSION.
export const MIN_RUNTIME = "1.0.0";
