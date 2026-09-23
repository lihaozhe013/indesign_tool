# ADR 0006: TypeScript 7 and the UXP runtime baseline

## Status

Accepted

## Decision

Use TypeScript 7.0 for project-reference builds and type checks. Keep the shared runtime packages and UXP bundle on an ES2020 syntax and library baseline. Type the plugin against `@adobe/cc-ext-uxp-types` without including the browser `DOM` library.

Keep the TypeScript 6 compatibility package under the `typescript` alias only while the current typescript-eslint parser requires the TypeScript compiler API. The `@typescript/native` alias provides the TypeScript 7 compiler executable.

## Rationale

The core is bundled into both the CLI and the UXP panel. UXP runtime capabilities depend on the installed Adobe host, and Adobe's TypeScript guide recommends ES2020 and its own UXP DOM definitions. A common ES2020 API baseline makes unsupported standard-library methods visible during type checking instead of relying on syntax downleveling to transform built-in APIs.

## Consequences

- Shared publishing code must avoid JavaScript built-in APIs newer than ES2020 unless a tested polyfill is added.
- Browser-based UI previews and happy-dom tests verify panel behavior but do not establish UXP compatibility.
- Revisit the TypeScript 6 compatibility alias when TypeScript 7's compiler API is supported by the lint ecosystem.

## References

- [Adobe TypeScript and IntelliSense for UXP](https://developer.adobe.com/uxp/guides/how-to/typescript/)
- [TypeScript 7 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
