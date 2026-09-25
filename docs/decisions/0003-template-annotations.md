# ADR 0003: Designer-managed template annotations

## Status

Accepted; host-verified 2026-09-24

## Decision

Annotate semantic roles on existing pages, frames, and named styles with a
namespaced script label under the key `com.publisher.role`. The panel writes
labels inside InDesign; the template compiler reads them through the
structural scan and generates the manifest. A generated sidecar manifest
keyed by object name is rejected because label persistence and lookup pass
the host probes.

## Rationale

Probes on InDesign 21.0.0.192 (DOM 21.0, UXP 9.0.3) established:

- `insertLabel`/`extractLabel` work on document, page, text-frame, and
  paragraph/character/object-style objects in the same session; an unset key
  reads back as `""`.
- Labels survive save-by-string-path, close, and reopen in a separate run, on
  every object type including styles; label-value lookup returns correct
  counts and objects for both unique and duplicate values.
- Multiple keys on one object are isolated.

Designers maintain annotations in InDesign without touching configuration
files, satisfying the product constraint that manifests are generated.

## Consequences

- Adapter lookups must use `itemByName`; `getByName` does not exist on UXP
  collections. `Document.fullName` must not be used because it returns a
  Promise that never settles from a Scripts Panel execution.
- `Page.id` and `PageItem.id` were stable across save/reopen while
  `Document.id` changed, so cross-document identity uses labels and names,
  never session document ids.
- Duplicate label values are a diagnosable condition, not silent precedence:
  unique-role resolution must fail explicitly when a lookup returns more
  than one match.
- The label key was renamed from an early `com.openai.*` placeholder before
  the decision was recorded; probe evidence from 2026-09-24 uses the final
  key.
