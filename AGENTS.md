# Agent instructions

## Active product

The product is a standalone Tauri 2 desktop app with a React and TypeScript WebView. Rust handles
local files and launches InDesign UXP scripts through macOS Apple Events. InDesign 2026 performs
composition and export. The supported first-release target is local macOS use with templates already
labeled under `com.publisher.role`.

The legacy InDesign panel source remains in `packages/plugin` for reference, but it is outside the
pnpm workspace and product workflow. Do not restore it as the main interface unless the product
direction changes.

## Architecture constraints

- Keep InDesign DOM calls in `packages/indesign`; keep publishing policy in the shared `contracts`,
  `core`, and `template` packages.
- The desktop bridge uses one UUID-scoped HostJob directory per operation, serializes InDesign jobs,
  and validates result version, job ID, completion, and timeout. UXP file operations require
  top-level `await`.
- Keep versioned document and host contracts aligned with the schemas and tests. Read
  [ADR 0002](docs/decisions/0002-document-ir.md) before changing persisted representations.
- The app requires labeled Cover and Article pages, an Article `article-flow` frame, a Cover
  `hero-title` frame, and required style roles. A subtitle also requires a `hero-subtitle` frame.
  The selected template is never the output document.
- Stage all generated files and finalize them only after document, PDF, and page preview
  verification passes.
- User-facing interface text lives in the `packages/desktop/src/i18n` catalog. Do not put UI strings
  in the shared packages or add translations to diagnostics, Rust errors, or UXP host errors; read
  [ADR 0008](docs/decisions/0008-ui-localization.md) before changing that boundary.
- Rust owns the stored locale and the View menu language items; the WebView only renders. Add a
  locale to both `packages/desktop/src-tauri/src/locale.rs` and
  `packages/desktop/src/i18n/locale.ts`.

## Verification

- Run `pnpm validate` for TypeScript, lint, workspace tests, and Rust tests.
- Run `pnpm desktop:build` for desktop packaging changes. A successful build does not establish
  InDesign host acceptance.
- Follow [the host testing procedure](docs/testing.md) and
  [InDesign probe evidence](docs/indesign-probes/README.md) for host-backed work.
- The current ignored synthetic `.indd` and its scan result predate the latest generator revision.
  Regenerate with `packages/indesign/probes/synthetic-template-probe.idjs` and verify its recorded
  role inventory before using it. Keep host documents and acceptance outputs under ignored
  `artifacts/host/`; do not commit them.

## Documentation

Keep agent handoff, architecture, verification, and host-evidence documentation in English. Update
status claims when evidence changes, and remove stale or redundant material.

The maintained Chinese user manual at [docs/user-manual.zh-CN.md](docs/user-manual.zh-CN.md) is an
explicit product requirement. Keep its workflow and InDesign template instructions aligned with the
shipped app; the native Help menu links to its GitHub page.

Start with [the desktop implementation plan](docs/implementation-plan.md) for architecture,
[the next steps](docs/next-steps.md) for current acceptance status, and the linked testing and probe
documents for verification. Accepted design constraints are recorded in `docs/decisions/`.
