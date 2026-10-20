import type { z } from "zod";
import type { BlockInstance, PackageManifest } from "@appsy/app-config";

// A section's blocks of one type, in order, with settings read by that block's manifest.
// Hidden blocks, and any this release can't read, are skipped.
export function readBlocks<Settings extends z.ZodType>(
  blocks: BlockInstance[],
  manifest: PackageManifest<Settings>,
): { id: string; settings: z.output<Settings> }[] {
  return blocks.flatMap((block) => {
    if (block.hidden || block.type !== manifest.id) return [];
    const parsed = manifest.settings.safeParse(block.settings);
    return parsed.success ? [{ id: block.id, settings: parsed.data }] : [];
  });
}

