import type { Diagnostic, SemanticDocument } from "@publisher/contracts";

export type AssetAvailability = (source: string) => boolean;

export function validateAssetReferences(
  document: SemanticDocument,
  isAvailable: AssetAvailability
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const block of document.blocks) {
    if (block.type !== "image") continue;
    if (/^[a-z][a-z\d+.-]*:/i.test(block.src)) {
      diagnostics.push({
        code: "Asset.UnsupportedScheme",
        message: "Only local relative image assets are supported in v1: " + block.src,
        severity: "error",
        path: "blocks." + block.id + ".src"
      });
    } else if (!isAvailable(block.src)) {
      diagnostics.push({
        code: "Asset.Missing",
        message: "Image asset was not found: " + block.src,
        severity: "error",
        path: "blocks." + block.id + ".src",
        context: { source: block.src }
      });
    }
  }
  return diagnostics;
}
