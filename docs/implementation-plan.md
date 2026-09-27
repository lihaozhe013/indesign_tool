# Desktop implementation

## Product boundary

Folio Desktop is a local macOS app built with Tauri 2, React, TypeScript, and Rust. The user works in a WebView. Rust owns local file dialogs, Markdown writes, asset checks, staged output, and the InDesign process bridge. The UXP `.idjs` script owns all InDesign DOM calls. The existing CLI remains an offline developer interface.

The product supports InDesign 2026 and templates that already carry semantic labels under `com.publisher.role`. The first release does not include template annotation or role editing. A generated document is saved as a new output; the selected template is never used as the output path. Local builds produce an ad-hoc signed macOS `.app`; DMG packaging and Apple Developer ID distribution are deferred.

## Package boundaries

| Package | Responsibility |
| --- | --- |
| `contracts` | Versioned JSON-shaped schemas, diagnostics, deterministic serialization |
| `core` | Markdown parsing, semantic planning, host-feedback loop |
| `template` | Label-to-role mapping, inventory creation, template compilation |
| `indesign` | Host adapter, deterministic host operations, UXP executor, document dumps |
| `desktop` | React WebView, Tauri commands, local file and process bridge |
| `cli` | Offline developer commands |
| `test-support` | Fake host and architecture checks |

The core, contracts, and template compiler do not import Node, Tauri, UXP, or InDesign APIs. Direct InDesign DOM access stays in `packages/indesign`.

## UI localization

The WebView interface is localized for `en` and `zh-Hans` with `i18next` and `react-i18next`. `packages/desktop/src/i18n/locales/en.json` is the source of truth and `zh-Hans.json` must carry the same key set; `packages/desktop/src/i18n/catalog.test.ts` fails the build otherwise. Progress status is held as a key plus interpolation values rather than a rendered string so a language switch repaints in-flight status.

Rust owns the stored preference and the native View menu, which is where the language check items live; the WebView owns only the rendered language and receives a `locale-changed` event. The locale comes from a stored preference in `settings.json`, then the browser language list, then English, and a first run writes the resolved value back so the menu checkmark matches. `packages/desktop/src-tauri/src/locale.rs` extends the default menu rather than replacing it, which keeps the Edit accelerators the Markdown editor depends on.

The Folio product name, InDesign, the Markdown format name, the native window title, and the bundle name are never translated. Diagnostic messages, Rust command errors, and UXP host errors stay English, which leaves a Chinese interface mixed-language. See [ADR 0008](decisions/0008-ui-localization.md) for the boundary and the route to follow if that changes.

## HostJob v1 transport

Rust creates a unique job folder containing `job.json`, a generated `.idjs` runner, `result.json`, and `done.txt`. The job includes a UUID, schema version, action, and JSON payload. The generated script embeds only the job paths and expected UUID as JSON string literals.

Rust asks macOS to run the script with InDesign's AppleScript `do script … language uxpscript` command. The script uses top-level `await` to read the job, execute one action, write a `HostJobResult v1`, and create the completion marker. Rust serializes access to InDesign, enforces a 180-second timeout, and rejects malformed results, unsupported versions, and mismatched IDs.

Apple's UXP file API is available to Scripts Panel scripts. Earlier probe code used an unawaited async function, which did not keep the script execution alive for its file operations. A corrected top-level-await probe verified temporary-file write, read, and deletion on the target InDesign installation.

## Publishing operations

- **Inspect template:** scan document and parent pages, labeled frames, styles, linked assets, fonts, and host version. Derive role assignments from labels and compile through the shared template compiler.
- **Create document:** open the template, save a new staged INDD first, retain required role pages, write the cover title, populate and style the main story, anchor article images, and save.
- **Reflow:** use the InDesign overset observation to add Article pages, adopt or copy the labeled flow frame, thread the story, and recompose.
- **Verify:** reopen the staged INDD, produce a canonical structure dump, confirm block text and cover title, check overset and asset status, and retain font warnings.
- **Export:** create a PDF and one PNG for each page.
- **Finalize:** Rust checks the staged INDD/PDF and preview count, then moves the completed set beside the chosen output path. Failed jobs discard the staged directory.

## Current scope and limits

- macOS only, local use only, InDesign 2026 only.
- Only pre-labeled templates with Cover and Article pages, an Article `article-flow` frame, a Cover `hero-title` frame, and the required `ArticleTitle`, `SectionHeading`, and `Body` styles are accepted. Articles with subtitles also require a `hero-subtitle` frame; content that uses quotes, captions, emphasis, links, or code needs the matching style roles.
- Local relative image paths are resolved from the saved Markdown file.
- Host typography and fit remain InDesign decisions. The core does not estimate line breaks.
- The old plugin source remains in the repository for historical comparison but is excluded from the workspace build and product workflow.
- Signing, notarized public distribution, template-role editing, and designer-template acceptance are future work.

## Acceptance

Regenerate the ignored synthetic template from `packages/indesign/probes/synthetic-template-probe.idjs` before host acceptance. The existing `.indd` and scan result predate the latest probe revision: the document is no longer empty, but its recorded role inventory omits `hero-subtitle`, `Subtitle`, `Link`, and `InlineImage`. Acceptance uses basic text, long Chinese and mixed-language copy, captions and images, forced overset, and missing assets. A packaged macOS app must also exercise InDesign unavailable, Apple Events authorization, timeout, and damaged result cases. See [testing strategy](testing.md) for the host and packaging lanes.
