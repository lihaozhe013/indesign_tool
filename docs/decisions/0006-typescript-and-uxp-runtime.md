# ADR 0006: TypeScript 7, ESNext source, and the UXP runtime baseline

## Status

Superseded for the product UI by ADR 0007; shared TypeScript policy remains accepted

## Decision

Use TypeScript 7.0 for project-reference builds and type checks. Compile TypeScript source to ESNext while limiting standard-library APIs to ES2020. The desktop WebView uses the browser DOM library. UXP `.idjs` host scripts are JavaScript files and remain separate from the TypeScript UI build.

Keep the TypeScript 6 compatibility package under the `typescript` alias only while the current typescript-eslint parser requires the TypeScript compiler API. The `@typescript/native` alias provides the TypeScript 7 compiler executable.

## Rationale

The core is shared by the CLI and the desktop app. UXP runtime capabilities depend on the installed Adobe host. ESNext is the source output target; the ES2020 library baseline keeps newer built-in APIs out of shared code.

## Consequences

- Shared publishing code must avoid JavaScript built-in APIs newer than ES2020 unless a tested polyfill is added.
- Host scripts still require execution tests on the declared InDesign version.
- Desktop WebView builds do not establish host-script compatibility.
- Revisit the TypeScript 6 compatibility alias when TypeScript 7's compiler API is supported by the lint ecosystem.

## References

- [Adobe TypeScript and IntelliSense for UXP](https://developer.adobe.com/uxp/guides/how-to/typescript/)
- [TypeScript 7 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
