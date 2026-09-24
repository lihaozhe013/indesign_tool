# Testing strategy

## Offline lane

The default lane does not require Adobe software:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Unit tests cover parsing, schema validation, template compilation, style-role resolution, page planning, asset diagnostics, host-feedback handling, and queue result ordering. Fixtures include long articles, mixed-language text and punctuation, long titles, quotes, images/captions, missing images, and unsupported blocks. Property checks exercise Unicode text preservation and planner termination. Canonical JSON tests cover serialization round trips. Architecture checks prevent core modules from importing Node, UXP, or InDesign APIs.

Panel tests run in `happy-dom` without loading InDesign. They exercise validation, semantic outline rendering, diagnostics, tab state, edited/stale input, and safe text rendering using the actual panel markup. `pnpm ui:dev` provides a local browser preview for visual review. Browser appearance is not treated as proof of UXP compatibility.

The TypeScript source target is ESNext with ES2020 library APIs. The UXP panel bundle is lowered to ES2020 pending a runtime contract check against the minimum supported InDesign version. The plugin type-checks against Adobe's UXP type definitions without the browser `DOM` library.

The GitHub Actions offline lane installs from the frozen lockfile and runs `pnpm validate`. It does not install or require Adobe software.

Use `FakeHostAdapter` to test orchestration without a host. The core must react to the host's overset report rather than estimating fit. Keep snapshots deterministic and include expected diagnostic codes, not only rendered strings.

## Host contract lane

When InDesign and UXP Developer Tool are available, run probes against disposable documents, record host/UXP/DOM versions, and save the probe reports. Verify each capability independently: paragraph and character styles, object styles, labels, parent pages, page duplication, story creation and threading, overset, anchored objects, placed graphics, fitting, text wrap, save/reopen persistence, export, font substitution, and stable object identity. Add contract tests only after a behavior has been observed on the supported host.

`packages/indesign/probes/host-version-probe.idjs` reports host, UXP, and DOM versions. `packages/indesign/probes/template-scan.idjs` emits the versioned structural scan for an already-open disposable document. `contract-probe.idjs` is a basic count/label smoke probe. These probes do not mutate a template or certify style, threading, label persistence, export, or save/reopen behavior.

InDesign 2026 (21.0.0.192) is installed, but UXP Developer Tool and host probe results are not yet available. The current CI workflow does not run this lane. Add a separate host lane after disposable-template contracts are exercised and recorded.

## Canonical document dumps

Compare `DocumentDump v1` after sorting by document order and stable semantic references. Preserve paragraph text and qualified style names, semantic page roles, frame threading and rounded bounds, asset/font issues, and story overset. Exclude timestamps, generated host IDs, selection, and other volatile state unless a future invariant requires them.

## Golden and visual regression lane

Use a synthetic template first, then a designer-provided template. Compare both planned `DocumentIR` and the canonical host dump. Export with pinned InDesign version, fonts, template revision, and export settings. Rasterize exports at a fixed resolution and compare against reviewed image baselines with a documented tolerance for antialiasing. Store failing dumps, job files, and exports as CI artifacts for diagnosis. Do not accept visual baselines generated on an unknown host/font set.

InDesign 2026 and a real designer report template are present, but UXP Developer Tool is absent and no host probe has completed. A synthetic publishing template and approved visual baseline are also pending. Host contracts and visual regression remain separate from normal CI, which remains useful and required without them.
