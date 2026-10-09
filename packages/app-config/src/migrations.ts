import { SCHEMA_VERSION } from "./version";

type Migration = (design: Record<string, unknown>) => Record<string, unknown>;

// Upgrades a saved design by one schemaVersion: the entry for 1 turns a version 1 design
// into version 2. Add one each time SCHEMA_VERSION goes up.
const migrations: Partial<Record<number, Migration>> = {};

// Brings a saved draft up to the current SCHEMA_VERSION before the editor opens it.
export function migrateDesign(design: unknown, fromVersion: number): unknown {
  if (!Number.isInteger(fromVersion) || fromVersion < 1 || fromVersion > SCHEMA_VERSION) {
    throw new Error(`Can't migrate a design from schemaVersion ${fromVersion}`);
  }
  let current = design;
  for (let version = fromVersion; version < SCHEMA_VERSION; version++) {
    const migrate = migrations[version];
    if (!migrate) throw new Error(`No migration from schemaVersion ${version}`);
    current = migrate(current as Record<string, unknown>);
  }
  return current;
}
