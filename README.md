# Structured Publishing Toolkit

A host-independent publishing engine that uses InDesign as its authoritative typography and composition renderer.

## Development

Requirements: Node.js 22 or later and pnpm 12.

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The core, contracts, template compiler, and CLI operate without InDesign. Host rendering requires the UXP plugin runner and a supported InDesign installation. InDesign-specific behavior has not yet been contract-tested on this machine.

See [the implementation plan](docs/implementation-plan.md), [testing strategy](docs/testing.md), and [InDesign probe procedure](docs/indesign-probes/README.md) for architecture boundaries, current host limitations, and the path to host-backed verification.

## Initial commands

```bash
publisher article parse fixtures/articles/basic.md
publisher template validate fixtures/templates/editorial-blue.json
publisher plan fixtures/articles/basic.md --template fixtures/templates/editorial-blue.json
```

Use `publisher --help` for the current command list.
