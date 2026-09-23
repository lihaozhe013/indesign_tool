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

Use `FakeHostAdapter` to test orchestration without a host. The core must react to the host's overset report rather than estimating fit. Keep snapshots deterministic and include expected diagnostic codes, not only rendered strings.

## Host contract lane

When InDesign and UXP Developer Tool are available, run probes against disposable documents, record host/UXP/DOM versions, and save the probe reports. Verify each capability independently: paragraph and character styles, object styles, labels, parent pages, page duplication, story creation and threading, overset, anchored objects, placed graphics, fitting, text wrap, save/reopen persistence, export, font substitution, and stable object identity. Add contract tests only after a behavior has been observed on the supported host.

The initial probe at `packages/indesign/probes/contract-probe.idjs` is an inventory probe only. It reports host/DOM versions and counts/labels from an already-open document. It does not mutate a template or certify any listed capability.

## Canonical document dumps

Compare `DocumentDump v1` after sorting by document order and stable semantic references. Preserve paragraph text and qualified style names, semantic page roles, frame threading and rounded bounds, asset/font issues, and story overset. Exclude timestamps, generated host IDs, selection, and other volatile state unless a future invariant requires them.

## Golden and visual regression lane

Use a synthetic template first, then a designer-provided template. Compare both planned `DocumentIR` and the canonical host dump. Export with pinned InDesign version, fonts, template revision, and export settings. Rasterize exports at a fixed resolution and compare against reviewed image baselines with a documented tolerance for antialiasing. Store failing dumps, job files, and exports as CI artifacts for diagnosis. Do not accept visual baselines generated on an unknown host/font set.

No InDesign installation, real template, or approved visual baseline is present in the current environment, so host contracts and visual regression are pending. Normal CI remains useful and required without them.
