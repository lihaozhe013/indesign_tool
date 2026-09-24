# Structured Publishing Toolkit

A host-independent publishing engine that uses InDesign as its authoritative typography and composition renderer.

## Development

Requirements: Node.js 22.13 or later in the 22.x line, or Node.js 24 or later; pnpm 12.5.1.

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm validate
```

Run `pnpm ui:dev` to open a browser preview of the designer panel. This preview verifies the panel UI and shared article parser; it does not emulate InDesign's document APIs.

The core, contracts, template compiler, and CLI operate without InDesign. A read-only scan has run in InDesign 2026 (21.0.0.192, DOM 21.0, UXP 9.0.3) against the designer's report copy. A scratch-document probe also confirmed paragraph style creation and application in memory. Story threading, save/reopen persistence, export, and publishing remain unverified. UXP Developer Tool is absent; article publishing acceptance still needs a synthetic template.

See [the implementation plan](docs/implementation-plan.md), [testing strategy](docs/testing.md), and [InDesign probe procedure](docs/indesign-probes/README.md) for architecture boundaries, current host limitations, and the path to host-backed verification.

## Initial commands

```bash
publisher article parse fixtures/articles/basic.md
publisher template validate fixtures/templates/editorial-blue.json
pnpm dev template compile <scan.json> <roles.json>
publisher plan fixtures/articles/basic.md --template fixtures/templates/editorial-blue.json
```

`template compile` is an offline developer command for checking a versioned `TemplateScan` and generated role assignments. The designer-facing panel will create those assignments without requiring designers to edit JSON.

Use `publisher --help` for the current command list.
