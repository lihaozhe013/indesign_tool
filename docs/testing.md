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

Run `.idjs` probes from the InDesign Scripts panel or non-interactively with `scripts/run-indesign-probe.mjs`, which executes them through the macOS AppleScript `do script ... language uxpscript` channel and harvests the tagged record from the newest UXP log; UXP Developer Tool is needed to load/debug the designer plugin, not to execute these probes. Use disposable documents, record host/UXP/DOM versions, and save the probe reports. Verify each capability independently: paragraph and character styles, object styles, labels, parent pages, page duplication, story creation and threading, overset, anchored objects, placed graphics, fitting, text wrap, save/reopen persistence, export, font substitution, and stable object identity. Add contract tests only after a behavior has been observed on the supported host.

`packages/indesign/probes/host-version-probe.idjs` reports host, UXP, and DOM versions. `packages/indesign/probes/template-scan.idjs` emits the versioned structural scan for an already-open disposable document. `contract-probe.idjs` is a basic count/label smoke probe. The host scans confirmed host `21.0.0.192`, DOM `21.0`, UXP `uxp-9.0.3-local`, 20 pages, 6 parent spreads, 261 stories, and enumeration of 893 page items. A scratch-document probe confirmed paragraph style creation, application, and readback, then closed the scratch document without saving; a second scratch-document probe confirmed the same for a character style. Object styles, threading, label persistence, export, and save/reopen behavior remain unverified.

The initial host scan is saved under the ignored `artifacts/host/indesign-21.0.0.192/probe-run/` directory. It reports 15 paragraph styles, 20 character styles, 9 object styles, two missing link instances for one JPG, seven out-of-date links, one substituted font face, and no overset stories. The scan has passed `TemplateScan v1` validation. The current CI workflow does not run this lane; add a separate host lane after the remaining disposable-document contracts are exercised and recorded.

## Canonical document dumps

Compare `DocumentDump v1` after sorting by document order and stable semantic references. Preserve paragraph text and qualified style names, semantic page roles, frame threading and rounded bounds, asset/font issues, and story overset. Exclude timestamps, generated host IDs, selection, and other volatile state unless a future invariant requires them.

## Golden and visual regression lane

Use a synthetic template first, then a designer-provided template. Compare both planned `DocumentIR` and the canonical host dump. Export with pinned InDesign version, fonts, template revision, and export settings. Rasterize exports at a fixed resolution and compare against reviewed image baselines with a documented tolerance for antialiasing. Store failing dumps, job files, and exports as CI artifacts for diagnosis. Do not accept visual baselines generated on an unknown host/font set.

InDesign 2026 and a real designer report template are present. The initial read-only host probe completed, but the remaining adapter contracts are pending. A synthetic publishing template and approved visual baseline are also pending. Host contracts and visual regression remain separate from normal CI, which remains useful and required without them.
