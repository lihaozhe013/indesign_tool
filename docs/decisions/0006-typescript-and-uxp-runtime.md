# ADR 0006: TypeScript 7, ESNext source, and the UXP runtime baseline

## Status

Accepted

## Decision

Use TypeScript 7.0 for project-reference builds and type checks. Compile TypeScript source to ESNext while limiting standard-library APIs to ES2020. Lower the UXP bundle to ES2020 until the minimum supported InDesign runtime is exercised in contract tests. Type the plugin against `@adobe/cc-ext-uxp-types` without including the browser `DOM` library.

Keep the TypeScript 6 compatibility package under the `typescript` alias only while the current typescript-eslint parser requires the TypeScript compiler API. The `@typescript/native` alias provides the TypeScript 7 compiler executable.

## Rationale

The core is bundled into both the CLI and the UXP panel. UXP runtime capabilities depend on the installed Adobe host. ESNext is the source output target for this new project; the ES2020 library baseline keeps newer built-in APIs out of shared code, and the ES2020 UXP bundle target preserves syntax compatibility until host tests justify raising it.

## Consequences

- Shared publishing code must avoid JavaScript built-in APIs newer than ES2020 unless a tested polyfill is added.
- The UXP bundle target must be revisited when a real panel load has been tested on the declared minimum InDesign version.
- Browser-based UI previews and happy-dom tests verify panel behavior but do not establish UXP compatibility.
- Revisit the TypeScript 6 compatibility alias when TypeScript 7's compiler API is supported by the lint ecosystem.

## References

- [Adobe TypeScript and IntelliSense for UXP](https://developer.adobe.com/uxp/guides/how-to/typescript/)
- [TypeScript 7 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
