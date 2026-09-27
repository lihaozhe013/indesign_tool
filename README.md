# Folio Desktop

Folio turns structured Markdown into an editable InDesign document, a PDF, and page preview images. The desktop interface is built with Tauri 2, React, and TypeScript. Rust manages local files and starts InDesign 2026 UXP scripts through macOS Apple Events; InDesign remains responsible for typography, text flow, and export.

The first release targets local macOS use and templates whose roles are already labeled with `com.publisher.role`. It creates a new document from the source template and never saves changes back to that template.

## Requirements

- macOS with Adobe InDesign 2026 installed
- Node.js 22.13+ or 24+
- pnpm 12.5.1
- Rust stable and Xcode Command Line Tools

## Development

```bash
pnpm install
pnpm desktop:dev
```

The first InDesign action asks macOS for permission to control InDesign. Choose Allow in the system prompt. The app declares `NSAppleEventsUsageDescription` in its macOS bundle.

Build the desktop app with:

```bash
pnpm desktop:build
```

Run the full offline validation lane with:

```bash
pnpm validate
```

The offline CLI remains available through `pnpm dev`; use `pnpm dev --help` for its commands.

## Publishing workflow

1. Open or edit a Markdown article.
2. Choose an InDesign template. Folio scans role labels, page items, styles, linked assets, and fonts, then validates the roles required by the publishing engine.
3. Choose a new `.indd` output path.
4. Publish. InDesign composes the story and reports overset; Folio adds pages and asks InDesign to compose again until the story fits.
5. Folio verifies the saved document, exports a PDF, and renders one PNG preview per page. It moves the staged files to their final paths only after those checks pass.

The output is an editable `.indd`, a sibling `.pdf`, and a sibling `<name>-preview/` directory containing `page-001.png`, `page-002.png`, and so on.

Supported Markdown includes frontmatter title, subtitle, author, and language; headings, paragraphs, quotes, emphasis, links, code, standalone local images with optional captions, and dividers. Image paths are resolved relative to the saved Markdown file.

## Architecture

- `packages/contracts`: versioned data contracts and diagnostics.
- `packages/core`: Markdown parsing, planning, and overset-driven reflow.
- `packages/template`: role-label mapping and template compilation.
- `packages/indesign`: host adapter and UXP `.idjs` executor; direct InDesign DOM access stays here.
- `packages/desktop`: React interface and Tauri commands.
- `packages/cli`: offline developer commands.

For the job protocol, host acceptance matrix, and current limits, see [the implementation plan](docs/implementation-plan.md), [testing strategy](docs/testing.md), and [next steps](docs/next-steps.md). The original product specification is retained as historical design context in [SPEC.md](SPEC.md).
