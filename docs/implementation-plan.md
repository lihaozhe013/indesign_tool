# Implementation plan

## Product boundary

The publishing application owns semantic content, stable identifiers, style and page roles, template validation, asset policy, diagnostics, deterministic planning, and the decision to add pages after host feedback. InDesign owns font shaping, glyph metrics, line breaking, paragraph composition, frame flow, and final rendering. The application consumes InDesign observations such as overset and missing fonts; it does not predict line breaks.

The plugin is a designer-facing adapter and the CLI is a developer/automation adapter. Both call the same publishing core. All InDesign DOM calls stay in `packages/indesign`. Content and template data are treated as data and never evaluated as scripts. `.indd` files are manipulated through InDesign, not binary editing.

## Package architecture

| Package | Responsibility | Runtime boundary |
| --- | --- | --- |
| `contracts` | Versioned JSON-shaped schemas, diagnostics, deterministic serialization | TypeScript only |
| `core` | Markdown parsing, asset policy callback, semantic planning, host-feedback loop | No Node, UXP, or InDesign imports |
| `template` | Template inventory validation and semantic-role compilation | Pure TypeScript |
| `indesign` | DOM adapter port, host operation error boundary, canonical document dumps, host job processing | Only package permitted to access the InDesign DOM |
| `cli` | Offline commands and Node filesystem/process access | Calls shared core; no publishing rules |
| `plugin` | Designer panel and UXP-facing entry point | Calls shared core; host access through adapter |
| `test-support` | Fake host, reusable inventories, architecture checks | Test-only |

Use TypeScript 7, pnpm workspaces, project-reference type checking, ESLint boundary rules, Vitest, and fast-check. TypeScript emits ESNext syntax while the declared standard-library APIs remain at ES2020. The UXP bundle is separately lowered to ES2020 until the minimum supported InDesign/UXP runtime is exercised in host contract tests. The CLI runs on the current Node line without forcing the shared packages to adopt Node APIs. The plugin type-checks against Adobe's UXP definitions without the browser `DOM` library. TypeScript 6's compatibility package is installed under the `typescript` alias only for the current typescript-eslint parser; `tsc` resolves to TypeScript 7.

## Data model

- `SemanticDocument v1` stores article metadata and ordered blocks with stable IDs. Initial blocks are headings, paragraphs, quotes, images with optional captions, and dividers. Inline runs retain source text and represent emphasis, links, and code as semantic marks. Preserve Chinese punctuation and source text; normalize line endings only.
- `TemplateInventory v1` is an inspected or designer-annotated view of pages, parent pages, frames, styles, and required assets. `CompiledTemplate v1` resolves explicit semantic roles to host object references. Page roles Cover and Article and paragraph style roles ArticleTitle, SectionHeading, and Body are required in v1. Ending and ImageFeature are optional.
- Designers annotate an existing template through the panel. Host probes on 2026-09-24 established that namespaced keyed script labels (`com.publisher.role`) persist across save/close/reopen and resolve by value, so they are the annotation mechanism (ADR 0003); the object-name sidecar fallback is rejected. Do not ask designers to edit JSON or YAML.
- `DocumentIR v1` contains deterministic page instances, style role references, a continuous ordered main story, and asset placements. Initial planning does not estimate text fit. The core adds Article pages only after the host reports overset, then asks the host to compose again. V1 does not persist an operation IR; the adapter may emit a canonical trace for diagnosis.
- `DocumentDump v1` sorts pages in document order and stories/frames deterministically. It records semantic IDs, paragraph text and qualified styles, page roles, frame links and rounded bounds, asset/font status, and overset. Exclude volatile host metadata.
- `HostJob v1` and `HostJobResult v1` provide serializable queued host work. A queue acknowledges a job only after its result is persisted.

## Host integration

The adapter port covers template inspection, rendering, document dump, export, and queued job processing. Its eventual UXP implementation should use template-provided prototype pages/parent-page items, threaded text frames, native paragraph keep options, anchored graphics, object styles, and native text composition where appropriate. Avoid selection, dialogs, active-window state, and clipboard dependencies so a later Server adapter remains possible.

InDesign 2026 (21.0.0.192, DOM 21.0, UXP 9.0.3) is installed. A read-only scan completed against a disposable report copy and passed `TemplateScan v1` validation. Scratch-document probes confirmed paragraph and character style creation, application, readback, and no-save cleanup in memory, and keyed script labels round-tripped in memory and across a separate save/close/reopen run on documents, pages, frames, and styles. Object-style mutation, threading, export, and publishing remain unverified. UXP Developer Tool is not installed. Probes run non-interactively through `scripts/run-indesign-probe.mjs` (AppleScript `do script ... language uxpscript`) or from the Scripts panel. Run disposable-document probes one capability at a time before implementing that capability. Record InDesign, UXP, and DOM versions and the result; turn confirmed behavior into adapter contract tests. Probe save/reopen as a separate operation from in-memory behavior.

Desktop UXP scripts are documented for InDesign 18.0 onward and InDesign Server; persistent-panel plugins are documented for desktop InDesign 18.5 onward. UXP mounts the InDesign DOM through `require("indesign")` from 18.4 onward, and DOM/UXP API availability varies by release. Treat these as compatibility floors from Adobe documentation, not as product support claims. Review the per-version API reference and changelog before relying on a call.

Investigate Server after desktop contracts pass. Server is a headless layout/composition host and may materially improve unattended golden tests and batch rendering. Its missing UI state is a reason to keep host operations document/object based. Server is not an initial dependency; licensing, installation, provisioning, and production demand must justify a separate lane.

Use UXP for host integration. Retain an ExtendScript shim only if a required DOM operation fails a UXP probe and the shim itself can be tested. Do not add it preemptively.

## CLI and plugin

Offline CLI commands parse Markdown, validate inventories, compile `TemplateScan` plus generated role assignments, and produce plans. Host commands submit versioned jobs and return `HostUnavailable` when no runner is connected. The panel validates Markdown, shows a semantic outline and diagnostics, and uses the same core as the CLI. A Vite preview and happy-dom tests cover UI behavior without InDesign. The panel's host actions, annotation, and queue processing still require UXP implementation and host verification. UXP file selection and persistent permission behavior must be host-probed before relying on the queue transport; the queue contract itself is host-independent.

Publishing in v1 writes a new output document so earlier `.indd` files and manual edits remain intact. Partial in-place synchronization is deferred; generated-document reflow is in scope.

## Milestones

1. **Offline foundation:** workspace, versioned contracts, parser, template compiler, planner, fake host, CLI, designer-facing article validation panel, ADRs, boundary enforcement, and host-free CI. Complete while Adobe software is unavailable.
2. **Adversarial corpus:** long Chinese and mixed-language articles, punctuation, long headings, section changes, quotes, images/captions, missing assets/styles, malformed templates, overset, font substitution, reflow, large documents, and serialization round trips. Add deterministic snapshots, invariants, and seeded property tests.
3. **Host contracts:** individual UXP probes for style operations, keyed labels and save/reopen, parent pages/page duplication, story creation/threading/overset, anchors, graphics/fitting/wrap, export, font substitution, and stable identity. Add confirmed behavior to contract tests.
4. **Golden publishing:** synthetic then designer templates, compare IR and canonical dumps, render with pinned InDesign/font/template versions, and maintain reviewed image-diff baselines in a separate host lane.

At each milestone run applicable tests, type checks, lint, builds, boundary checks, and generated-artifact review. Host milestones remain explicitly pending until an actual supported InDesign installation and template are available.

## Verified Adobe references

- [UXP scripts and plugins](https://developer.adobe.com/indesign/uxp/introduction/next-steps/script-and-plugin/)
- [InDesign DOM versioning](https://developer.adobe.com/indesign/uxp/resources/fundamentals/dom-versioning/)
- [UXP API release compatibility](https://developer.adobe.com/indesign/uxp/resources/fundamentals/apis/)
- [Document changes: styles, parent pages, graphics, and text wrap](https://developer.adobe.com/indesign/uxp/resources/recipes/document-changes/)
- [InDesign Server object-model differences](https://developer.adobe.com/indesign/uxp/scripts/tutorials/ids-object-model/)
- [ExtendScript to UXP migration](https://developer.adobe.com/indesign/uxp/resources/migration-guides/extendscript/)
- [UXP file operations and permission model](https://developer.adobe.com/indesign/uxp/resources/recipes/file-operation/)

The references document available APIs and platform distinctions. They do not verify behavior in this repository's target InDesign version or against a real template.
