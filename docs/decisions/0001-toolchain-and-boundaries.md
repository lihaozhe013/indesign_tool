# ADR 0001: Toolchain and package boundaries

## Status

Accepted

## Decision

Use strict TypeScript in pnpm workspaces. `contracts`, `core`, and `template` remain host independent. The `indesign` package owns DOM interaction, `cli` owns Node process and file access, and `plugin` owns UXP UI and file access. Both interfaces consume the shared core.

## Rationale

This makes the publishing policy testable without Adobe software and gives the CLI and plugin the same semantic behavior. UXP bundles can include the pure TypeScript packages while leaving host modules at the adapter boundary.

## Consequences

Import-boundary linting and an architecture test are required. UXP-specific behavior needs host contract tests before it is described as supported.
