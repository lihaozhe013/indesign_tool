# ADR 0009: Tolerant template resolution and best-effort publishing

## Status

Accepted; implemented 2026-09-27. Real editorial-template acceptance remains open.

## Decision

Folio infers template roles from existing role labels, normalized English and Chinese names, object
types, page relationships, and layout geometry. Existing `com.publisher.role` labels score highest,
but adding or running a script is not a prerequisite. The original template is never modified.

Role candidates use a common score: a valid role label scores 100; an exact normalized name or alias
scores 90; a fuzzy name match scores 65–89; and a layout or page-order fallback scores below 65.
Scores of 85 or higher are shown as high confidence, 65–84 as a possible match, and lower scores as
an automatic fallback. Candidate ties resolve by page fit, frame area, and stable document order.
The UI and Chinese report record the selected object and the top alternatives.

Template warnings do not disable publishing. Folio may create a title, subtitle, or article-flow
frame in the staged output document; choose compatible or default styles; flatten unsupported
Markdown structures into readable paragraphs; insert a visible inline notice for an unavailable
image; and continue when fonts, links, text checks, or composition need review. It keeps the
template source untouched.

An editable INDD and UTF-8 Chinese report are required deliverables. PDF and each page preview are
attempted independently and are optional. Rust finalizes the INDD and report, then retains any
nonempty PDF or page PNG that was actually produced. Publication is complete when no warnings were
raised and degraded when output exists with warnings. InDesign availability, template-open, HostJob
integrity, output-path, and nonempty-INDD failures remain hard errors.

Unmarked ordinary extra pages are omitted. A page explicitly identified as Ending by a role label or
recognized Ending name is retained. A one-page template provides both cover and article prototypes
by duplicating that page in the output copy.

## Rationale

Template files vary frequently, and designers may not use the full set of Folio roles or styles.
Requiring every role before export would turn harmless differences into hard failures and force
nontechnical designers to run scripts. Deterministic fuzzy matching with visible diagnostics lets
Folio use a useful template immediately while giving designers a report they can act on over time.

Keeping optional exports independent prevents a PDF or preview failure from discarding the editable
document. The staged-output boundary still ensures that an empty INDD is never presented as
successful output.

## Consequences

- `resolveTemplateRoles()` is the desktop default; `deriveRoleAssignments()` remains available as a
  compatibility entry point.
- Match results are runtime diagnostics and are not persisted in the template contract.
- Host DOM operations remain in `packages/indesign`; matching, planning, and fallback policy remain
  in shared TypeScript packages.
- UI text maps stable diagnostic codes through the desktop locale catalogs. Core messages and
  persisted HostJob diagnostics stay locale-independent.
- The Chinese manual describes recommendations and recovery steps, not a required annotation script.
- Host acceptance still needs representative real-world templates, including templates with sparse
  roles, fuzzy names, conflicts, one page, missing styles, missing assets, and partial exports.
