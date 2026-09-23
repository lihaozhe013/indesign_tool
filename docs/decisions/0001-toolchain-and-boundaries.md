# ADR 0001: Toolchain and package boundaries

## Status

Accepted

## Decision

Use strict TypeScript 7 in pnpm workspaces. The shared packages target ES2020 and remain host independent. The plugin uses Adobe's UXP type definitions and ES2020 output. `indesign` owns DOM interaction, `cli` owns Node process and file access, and `plugin` owns UXP UI and file access. Both interfaces consume the shared core.

The newest `typescript-eslint` release still needs the TypeScript compiler API, which TypeScript 7.0 does not provide. Keep the official TypeScript 6 compatibility package under the `typescript` alias for lint parsing only; the `tsc` executable resolves to TypeScript 7.

## Rationale

This makes the publishing policy testable without Adobe software and gives the CLI and plugin the same semantic behavior. UXP bundles can include the pure TypeScript packages while leaving host modules at the adapter boundary.

## Consequences

Import-boundary linting and an architecture test are required. UXP-specific behavior needs host contract tests before it is described as supported.
