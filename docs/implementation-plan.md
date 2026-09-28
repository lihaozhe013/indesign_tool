# Desktop implementation

## Product boundary

Folio is a local macOS app built with Tauri 2, React, TypeScript, and Rust. The user works in a WebView. Rust owns local file dialogs, Markdown writes, asset checks, staged output, and the InDesign process bridge. The UXP `.idjs` script owns all InDesign DOM calls. The existing CLI remains an offline developer interface.

The product supports InDesign 2026 and uses automatic fuzzy role inference for local `.indd` templates. Existing semantic labels under `com.publisher.role` are a high-confidence compatibility signal, not a prerequisite. A generated document is saved as a new output; the selected template is never used as the output path. Local Apple Silicon builds produce an ad-hoc signed `.app` and a Tauri DMG installer. Developer ID signing and notarization for external distribution remain deferred. See [ADR 0009](decisions/0009-tolerant-template-resolution.md).

## Package boundaries

| Package | Responsibility |
| --- | --- |
| `contracts` | Versioned JSON-shaped schemas, diagnostics, deterministic serialization |
| `core` | Markdown parsing, semantic planning, host-feedback loop |
| `template` | Fuzzy role resolution, inventory creation, tolerant template compilation |
| `indesign` | Host adapter, deterministic host operations, UXP executor, document dumps |
| `desktop` | React WebView, Tauri commands, local file and process bridge |
| `cli` | Offline developer commands |
| `test-support` | Fake host and architecture checks |

The core, contracts, and template compiler do not import Node, Tauri, UXP, or InDesign APIs. Direct InDesign DOM access stays in `packages/indesign`.

## UI localization

The WebView interface is localized for `en` and `zh-Hans` with `i18next` and `react-i18next`. `packages/desktop/src/i18n/locales/en.json` is the source of truth and `zh-Hans.json` must carry the same key set; `packages/desktop/src/i18n/catalog.test.ts` fails the build otherwise. Progress status is held as a key plus interpolation values rather than a rendered string so a language switch repaints in-flight status.

Rust owns the stored preference and the native View menu, which is where the language check items live; the WebView owns only the rendered language and receives a `locale-changed` event. The locale comes from a stored preference in `settings.json`, then the browser language list, then English, and a first run writes the resolved value back so the menu checkmark matches. `packages/desktop/src-tauri/src/locale.rs` extends the default menu rather than replacing it, which keeps the Edit accelerators the Markdown editor depends on.

The Folio product name, InDesign, the Markdown format name, the native window title, and the bundle name are never translated. Persisted diagnostic messages remain English and locale-independent; the desktop maps recognized diagnostic codes to the active UI catalog, with the source message as a fallback. Rust command and raw UXP host failures may still include English details. See [ADR 0008](decisions/0008-ui-localization.md).

## HostJob v1 transport

Rust creates a unique job folder containing `job.json`, a generated `.idjs` runner, `result.json`, and `done.txt`. The job includes a UUID, schema version, action, and JSON payload. The generated script embeds only the job paths and expected UUID as JSON string literals.

Rust asks macOS to run the script with InDesign's AppleScript `do script … language uxpscript` command. The script uses top-level `await` to read the job, execute one action, write a `HostJobResult v1`, and create the completion marker. Rust serializes access to InDesign, enforces a 180-second timeout, and rejects malformed results, unsupported versions, and mismatched IDs.

Apple's UXP file API is available to Scripts Panel scripts. Earlier probe code used an unawaited async function, which did not keep the script execution alive for its file operations. A corrected top-level-await probe verified temporary-file write, read, and deletion on the target InDesign installation.

## Publishing operations

- **Inspect template:** scan document and parent pages, frame names and types, styles, linked assets, fonts, and host version. Resolve roles from optional labels, normalized English and Chinese names, page relationships, and layout geometry. Show the selected object and top alternatives.
- **Create document:** open the template, save a new staged INDD first, choose Cover and Article prototypes, duplicate one-page templates when needed, create fallback text frames in the output copy, populate content, and save.
- **Reflow:** use the InDesign overset observation to add Article pages, reuse the body-frame position and parent page, thread the story, and recompose. Overflow after the page limit becomes a warning.
- **Verify:** reopen the staged INDD and produce a canonical structure dump. Differences, missing assets/fonts, and overset are warnings that explain what needs review.
- **Export:** attempt a PDF and each page PNG independently. A failure on one optional export does not stop later exports.
- **Finalize:** Rust requires a nonempty staged INDD and a Chinese report. It moves any nonempty PDF and preview pages that exist, records the actual outputs, and keeps the INDD when optional exports are missing.

## Current scope and limits

- macOS only, local use only, InDesign 2026 only.
- Templates do not need role labels or a complete set of pages, frames, and styles. Matching names and geometry improve confidence. Missing title, subtitle, or article-flow frames receive output-copy fallbacks; a missing cover-image frame is skipped. Missing styles use compatible styles or InDesign defaults. Explicitly named or labeled Ending pages are retained; ordinary extra pages are omitted.
- Lists, tables, code blocks, multi-paragraph quotes, inline images, and unknown Markdown nodes are preserved as readable content when practical, with formatting reduced as needed. Unavailable images receive visible inline notices with filename and alt text.
- An editable nonempty INDD and UTF-8 Chinese report are required. PDF and each PNG are optional deliverables. A successful INDD with warnings is `degraded`; a clean output is `complete`; hard host, file, protocol, or empty-document failures are `failed`.
- Local relative image paths are resolved from the saved Markdown file.
- Host typography and fit remain InDesign decisions. The core does not estimate line breaks.
- The old plugin source remains in the repository for historical comparison but is excluded from the workspace build and product workflow.
- Signing, notarized public distribution, and representative real-template host acceptance are future work.

## Acceptance

The ignored synthetic template and scan result must be regenerated before using them as evidence. Acceptance still needs five representative template shapes: a conventional labeled template, clear English names without labels, Chinese or fuzzy names, conflicting candidates, and a one-page template with missing frames/styles. Test missing images/fonts, long text, overset, and partial PDF/PNG failures. A packaged macOS app must also exercise InDesign unavailable, Apple Events authorization, timeout, inaccessible output, damaged template, and damaged HostJob cases. See [testing strategy](testing.md) for the host and packaging lanes.
