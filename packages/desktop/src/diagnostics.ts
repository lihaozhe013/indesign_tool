import type { TFunction } from "i18next";
import type { Diagnostic } from "@folio/contracts";

export type Translate = TFunction;

export function deduplicateDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((item) => {
    const key = `${item.code}\u0000${item.path ?? ""}\u0000${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function countDiagnostics(diagnostics: Diagnostic[]): { errors: number; warnings: number; info: number } {
  let errors = 0;
  let warnings = 0;
  let info = 0;
  for (const item of diagnostics) {
    if (item.severity === "error") errors += 1;
    else if (item.severity === "warning") warnings += 1;
    else info += 1;
  }
  return { errors, warnings, info };
}

const diagnosticTranslationKeys: Record<string, string> = {
  "Template.RoleMatched": "roleMatched",
  "Template.RoleFallback": "roleFallback",
  "Template.RoleAmbiguous": "roleAmbiguous",
  "Template.PageRoleFallback": "pageFallback",
  "Template.PageRoleAmbiguous": "pageAmbiguous",
  "Template.ArticleFlowMissing": "articleFlowMissing",
  "Template.StyleFallback": "styleFallback",
  "Template.StyleMissing": "styleMissing",
  "Template.StyleMissingForContent": "styleMissingForContent",
  "Template.StyleKindMismatch": "styleKindMismatch",
  "Template.StyleRoleConflict": "styleRoleConflict",
  "Template.FrameKindMismatch": "frameKindMismatch",
  "Template.FallbackFrameCreated": "fallbackFrameCreated",
  "Template.CoverImageFrameMissing": "coverImageFrameMissing",
  "Template.StyleApplyFailed": "styleApplyFailed",
  "Template.AnnotationTargetMissing": "annotationTargetMissing",
  "Template.IdentityMissing": "templateIdentityMissing",
  "Template.InspectionFailed": "templateInspectionFailed",
  "Template.PageOrderChanged": "pageOrderChanged",
  "Article.InvalidFrontmatter": "invalidFrontmatter",
  "Article.TitleMismatch": "titleMismatch",
  "Article.TitleMissing": "titleMissing",
  "Article.ParseFailed": "parseFailed",
  "Article.BlockSkipped": "blockSkipped",
  "Article.QuoteShapeUnsupported": "quoteShapeUnsupported",
  "Article.UnknownMetadata": "unknownMetadata",
  "Article.ListFlattened": "listFlattened",
  "Article.TableFlattened": "tableFlattened",
  "Article.CodeBlockFlattened": "codeBlockFlattened",
  "Article.BlockFlattened": "blockFlattened",
  "Article.InlineImageFlattened": "inlineImageFlattened",
  "Asset.Missing": "assetMissing",
  "Asset.UnsupportedScheme": "assetUnsupported",
  "Asset.ScanFailed": "assetScanFailed",
  "Asset.PlaceholderFailed": "placeholderFailed",
  "Font.Missing": "fontMissing",
  "Story.UnexpectedOverset": "overset",
  "Story.PageLimitReached": "pageLimit",
  "Document.TextChanged": "textChanged",
  "Document.CoverTitleMissing": "titleChanged",
  "Document.CoverSubtitleChanged": "subtitleChanged",
  "Document.MainStoryMissing": "mainStoryMissing",
  "Document.PagesUnverified": "pagesUnverified",
  "DocumentDump.SchemaInvalid": "dumpInvalid",
  "DocumentDump.Unavailable": "dumpUnavailable",
  "HostJob.ExecutionFailed": "hostJobFailed",
  "Output.StageCleanupFailed": "stageCleanupFailed",
  "Publish.Failed": "publishFailed",
  "Publish.PdfExportFailed": "pdfFailed",
  "Publish.HostOperationFailed": "hostOperationFailed",
  "Publish.PreviewExportFailed": "previewFailed",
  "Publish.PreviewPartial": "previewPartial",
  "Publish.OptionalOutputMissing": "optionalOutputMissing",
  "Publish.RecoveredAfterIssue": "recoveredAfterIssue"
};

export function translateDiagnostic(t: Translate, diagnostic: Diagnostic): string {
  const key = diagnosticTranslationKeys[diagnostic.code];
  if (!key) return diagnostic.message;
  const role = diagnostic.context?.role ?? diagnostic.path?.split(".").pop() ?? "";
  const details = diagnostic.context?.details ?? diagnostic.message;
  const translated = t(`app.diagnostics.${key}`, { ...(diagnostic.context ?? {}), role, details, defaultValue: "" });
  return translated || diagnostic.message;
}
