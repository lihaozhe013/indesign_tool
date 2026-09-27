# ADR 0001: Toolchain and package boundaries

## Status

Accepted

## Decision

Use strict TypeScript 7 in pnpm workspaces. The shared packages target ES2020 and remain host independent. `indesign` owns DOM interaction, `cli` owns offline developer commands, and `desktop` owns the Tauri WebView and native file/process bridge. Both interfaces consume the shared core. The legacy plugin source is excluded from the workspace build.

The newest `typescript-eslint` release still needs the TypeScript compiler API, which TypeScript 7.0 does not provide. Keep the official TypeScript 6 compatibility package under the `typescript` alias for lint parsing only; the `tsc` executable resolves to TypeScript 7.

## Rationale

This makes publishing policy testable without Adobe software and gives the CLI and desktop app the same semantic behavior. Rust and UXP-specific behavior remain behind the desktop/adapter boundary.

## Consequences

Import-boundary linting and an architecture test are required. UXP-specific behavior needs host contract tests before it is described as supported.
