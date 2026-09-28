# ADR 0003: Designer-managed template annotations

## Status

Superseded by [ADR 0009](0009-tolerant-template-resolution.md). The InDesign label persistence probes remain valid evidence for compatibility support.

## Decision

The initial decision required designers to annotate semantic roles on pages,
frames, and styles before Folio could use a template. This workflow has been
replaced by automatic template role inference. Existing `com.publisher.role`
labels remain a supported high-confidence compatibility signal, but designers
do not need to add or maintain them.

## Rationale

Probes on InDesign 21.0.0.192 (DOM 21.0, UXP 9.0.3) established:

- `insertLabel`/`extractLabel` work on document, page, text-frame, and
  paragraph/character/object-style objects in the same session; an unset key
  reads back as `""`.
- Labels survive save-by-string-path, close, and reopen in a separate run, on
  every object type including styles; label-value lookup returns correct
  counts and objects for both unique and duplicate values.
- Multiple keys on one object are isolated.

These host probes continue to support reading labels in templates that already
contain them. They do not require new templates or establish a prerequisite for
publication.

## Consequences

- Adapter lookups must use `itemByName`; `getByName` does not exist on UXP
  collections. `Document.fullName` must not be used because it returns a
  Promise that never settles from a Scripts Panel execution.
- `Page.id` and `PageItem.id` were stable across save/reopen while
  `Document.id` changed, so cross-document identity uses labels and names,
  never session document ids.
- Duplicate label values are reported as candidate conflicts; Folio selects a
  candidate deterministically and still allows publication.
- The label key was renamed from an early `com.openai.*` placeholder before
  the decision was recorded; probe evidence from 2026-09-24 uses the final
  key.
