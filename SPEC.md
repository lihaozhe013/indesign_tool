# InDesign Structured Publishing Toolkit

## 0. Document Status

Status: Initial product and architecture specification.

This document defines:

* product intent;
* domain model;
* architectural boundaries;
* InDesign integration philosophy;
* template model;
* automation model;
* CLI/plugin relationship;
* testing strategy;
* acceptance criteria.

It intentionally does **not** define a detailed implementation sequence.

Before implementation begins, the implementation agent must:

1. inspect the repository and development environment;
2. verify current official Adobe InDesign scripting/plugin capabilities;
3. inspect the installed InDesign version if available;
4. experimentally verify uncertain InDesign DOM behavior;
5. produce an implementation plan;
6. then begin implementation unless blocked by a genuinely external dependency.

Current Adobe APIs must be verified rather than assumed.

---

# 1. Product Summary

Build a structured publishing toolkit for Adobe InDesign.

The initial target is image-based WeChat/公众号 articles, but the architecture should support broader structured editorial publishing workflows.

Typical existing workflow:

```text
article content
→ open an InDesign design/template
→ paste and format text
→ select styles/layout variants
→ insert illustrations/images
→ adjust page breaks
→ fix overflow
→ manually duplicate/modify pages
→ export images/PDF
```

The visual result may be sophisticated while the underlying layout rules remain highly repetitive.

The product should automate those deterministic parts while preserving InDesign as the visual editing and typography environment.

---

# 2. Product Mental Model

The system should be considered:

```text
a structured publishing engine
+
Adobe InDesign as the authoritative composition/rendering host
```

not:

```text
a collection of unrelated InDesign scripts
```

and not:

```text
a replacement for InDesign
```

---

# 3. Core Architecture

Conceptually:

```text
Structured Article
       ↓
Semantic Document
       ↓
Template / Publishing Rules
       ↓
Publishing Planner
       ↓
Document IR / Operation IR
       ↓
InDesign Adapter
       ↓
InDesign DOM
       ↓
Editable .indd
       ↓
PDF / PNG / JPEG / other exports
```

The same core engine must support:

```text
CLI
Plugin / Panel
Tests
Automation
```

No business logic should be duplicated between those interfaces.

---

# 4. Key Architectural Principle

The core application must not depend directly on InDesign DOM objects.

Core logic must deal with domain concepts such as:

```text
Article
Section
Heading
Paragraph
Quote
Image
PageRole
Template
Story
FlowRegion
StyleRole
Asset
```

and not:

```text
TextFrame
ParagraphStyle
PageItem
Spread
Story DOM object
```

Those mappings belong in the InDesign adapter.

---

# 5. InDesign Is the Composition Engine

Do not unnecessarily reimplement InDesign typography.

The system should leverage InDesign wherever appropriate for:

```text
line breaking
glyph shaping
font metrics
paragraph composition
hyphenation
kerning
tracking
text frame composition
threaded text flow
overset detection
paragraph styles
character styles
object styles
anchored objects
text wrap
page geometry
```

The core engine should decide publishing intent.

InDesign should decide final typography.

Conceptually:

```text
Core:
"This paragraph belongs to Body and should flow through ArticleStory."

InDesign:
"Given this font, language, frame geometry and paragraph style,
these are the actual line breaks and composed bounds."
```

---

# 6. Article Source

Initially support a structured text representation such as Markdown.

Example:

```markdown
---
title: 为什么我们最后用了某个工具
author: Example
---

# 为什么我们最后用了某个工具

这里是开场正文。

## 背景

这里是正文。

> 一个重点引用。

![示意图](image.png)

## 结论

这里是结论。
```

The exact authoring format may evolve.

The source should remain independent from InDesign.

---

# 7. Article as Source of Truth

Where practical:

```text
article.md
+
template.indd
↓
generated.indd
```

rather than making the generated InDesign document the sole canonical copy of article content.

This enables future functionality such as:

```text
content synchronization
content diff
partial updates
template switching
regeneration
reflow
version comparison
```

Manual InDesign edits must still remain possible.

---

# 8. Semantic Document Model

Parsing produces a host-independent semantic document.

Example:

```text
Article
├── Metadata
├── Hero
│   ├── Title
│   └── Subtitle
│
├── Section
│   ├── Heading
│   ├── Paragraph
│   ├── Paragraph
│   └── Image
│
├── Section
│   ├── Heading
│   ├── Quote
│   └── Paragraph
│
└── Ending
```

Possible initial block types:

```text
Title
Subtitle
Heading
Paragraph
Quote
Image
Caption
Divider
```

Potential future blocks:

```text
List
Code
Callout
Statistic
Table
Footnote
Reference
Author
CustomComponent
```

---

# 9. Template Philosophy

Designers should design templates in InDesign.

They should not normally edit JSON/YAML configuration.

A template may contain:

```text
template.indd
├── parent pages
├── pages
├── paragraph styles
├── character styles
├── object styles
├── layers
├── text frames
├── image frames
├── decorative artwork
└── semantic metadata
```

The system should understand only the portions necessary for automation.

Everything else can remain opaque artwork.

---

# 10. Semantic Roles

Prefer semantic role mappings over direct formatting values.

Example:

```text
ArticleTitle
SectionHeading
Body
Quote
Caption
PageNumber
HeroImage
InlineImage
```

These semantic roles may map to InDesign constructs such as:

```text
Paragraph Styles
Character Styles
Object Styles
Template Frames
Parent Page Items
```

The semantic engine should not need to know:

```text
font-size = 29.5pt
leading = 42pt
tracking = 15
```

unless layout policy genuinely requires it.

The InDesign template should own most visual styling.

---

# 11. Prefer Styles Over Direct Formatting

The publishing system should strongly prefer applying named styles rather than directly assigning large collections of formatting properties.

Conceptually:

```text
Heading
↓
semantic role: SectionHeading
↓
InDesign paragraph style:
"Article / H2"
```

rather than:

```text
set font
set weight
set leading
set tracking
set color
set spacing
...
```

Direct formatting should be exceptional.

This reduces:

```text
template coupling
format duplication
style drift
regeneration complexity
```

---

# 12. Template Annotations

Designer-facing template annotations should remain lightweight.

Possible mechanisms include:

```text
script labels
object names
layer names
style naming conventions
plugin-managed metadata
```

The implementation agent must evaluate which InDesign mechanism is most reliable.

Example semantic annotations:

```text
@article-flow
@hero-title
@hero-image
@page-number
@quote
```

Do not encode complicated configuration syntax into object names.

---

# 13. Template Compilation

Introduce a template compiler.

Input:

```text
editorial-template.indd
```

Output conceptually:

```text
CompiledTemplate
```

The compiler should inspect the template and derive machine-readable information.

Potential information:

```text
template identity
supported page roles
semantic frame roles
available paragraph styles
available character styles
available object styles
required assets
parent-page mappings
flow regions
image regions
constraints
template version
```

Possible physical representation:

```text
template-package/
├── template.indd
├── manifest.json
├── preview.*
└── optional assets/
```

The exact packaging format is not fixed.

The manifest should normally be generated, not manually authored.

---

# 14. Template Validation

Templates must be automatically inspectable.

Example output:

```text
Template: Editorial Blue

Styles
✓ Article / H1
✓ Article / H2
✓ Article / Body
✓ Article / Quote
✓ Article / Caption

Page Roles

Cover
✓ @hero-title
✓ @hero-image

Article
✓ @article-flow
✓ @page-number

Image Feature
✓ @article-flow
✓ @hero-image
✓ @page-number

Ending
✓ @ending
```

Errors must be structured and available to:

```text
CLI
plugin UI
tests
CI
```

---

# 15. Page Roles Rather Than Page Implementations

The core should think in semantic page roles.

Examples:

```text
Cover
Article
ImageFeature
QuoteFeature
SectionOpening
Ending
```

The template determines how those roles are visually implemented.

This allows different templates to express the same article differently.

Example:

```text
Semantic:
ImageFeature

Template A:
large image top + text bottom

Template B:
image left + text right

Template C:
full bleed image + caption overlay
```

---

# 16. Stories and Text Flow

InDesign stories should be treated as an important host capability.

The core publishing model should be able to represent semantic flows such as:

```text
MainArticleStory
SidebarStory
CaptionStory
FootnoteStory
```

A typical article may initially require only:

```text
MainArticleStory
```

The adapter may map this onto threaded InDesign text frames.

The architecture should permit multiple independent stories later.

---

# 17. Text Flow Strategy

Avoid manually positioning each paragraph if InDesign can compose a continuous story.

Prefer:

```text
semantic article blocks
↓
structured story content
↓
paragraph styles
↓
threaded text frames
↓
InDesign composition
```

over:

```text
paragraph 1 → manually positioned text frame
paragraph 2 → manually positioned text frame
paragraph 3 → manually positioned text frame
```

unless a specific layout requires isolated frames.

---

# 18. Pagination Responsibility

Pagination should be shared intelligently between:

```text
Publishing Planner
and
InDesign composition engine
```

The application determines things such as:

```text
which page role should exist
where section boundaries matter
where feature pages are inserted
which images need dedicated layouts
what content may remain together
```

InDesign determines:

```text
actual text composition
line wrapping
frame overflow
thread flow
```

Do not build a complete typography engine outside InDesign.

---

# 19. Reflow

Reflow remains a first-class feature.

But in InDesign, reflow should exploit native stories and threading where possible.

Conceptually:

```text
source content changes
↓
semantic document updates
↓
story structure updates
↓
InDesign recomposes
↓
overset/page-role conditions evaluated
↓
pages adjusted if required
```

Potential operations:

```text
Reflow entire document
Reflow selected story
Reflow section
Update changed content only
```

---

# 20. Overset Text

Overset text must be treated as a structured publishing condition.

The system should be able to detect:

```text
story overset
frame overset
unexpected page count
unexpected empty flow region
```

Overset is not merely a visual warning.

It should be represented in diagnostic state.

Example:

```text
TextOverflow {
    story: "MainArticleStory",
    page: 12,
    frame: "@article-flow"
}
```

---

# 21. Flow Policies

The publishing planner may support rules such as:

```text
avoid section heading as final line of page
keep quote together
keep image and caption together
prefer section opening on fresh page
insert feature page for designated image
do not leave extremely short final page
```

Do not assume all these must be implemented initially.

The architecture should permit them.

---

# 22. Document IR

Maintain a host-independent intermediate representation.

Example:

```json
{
  "schemaVersion": 1,
  "pages": [
    {
      "id": "page-001",
      "role": "Cover",
      "content": [...]
    },
    {
      "id": "page-002",
      "role": "Article",
      "stories": ["main"]
    }
  ],
  "stories": {
    "main": {
      "blocks": [
        "section-1-heading",
        "paragraph-1",
        "paragraph-2"
      ]
    }
  }
}
```

The exact schema is implementation-defined.

Requirements:

```text
serializable
deterministic
versionable
inspectable
snapshot-testable
host-independent
```

---

# 23. Operation IR

Consider maintaining a lower-level host-operation representation.

Example:

```json
[
  {
    "op": "create-page",
    "role": "Article"
  },
  {
    "op": "append-story-block",
    "story": "main",
    "blockId": "paragraph-17"
  },
  {
    "op": "apply-paragraph-style",
    "blockId": "paragraph-17",
    "styleRole": "Body"
  }
]
```

The implementation may combine Document IR and Operation IR if evidence shows that a single representation is cleaner.

The important architectural constraint is:

> core publishing logic must not issue InDesign DOM calls directly.

---

# 24. InDesign Adapter

All InDesign-specific code belongs behind a dedicated host adapter.

Conceptual capabilities:

```text
open document
save document
save copy
create document
create page
apply parent page
create text frame
thread frames
set story contents
insert content
apply paragraph style
apply character style
apply object style
place image
read overset state
read page geometry
read frame geometry
inspect labels
inspect styles
export PDF
export image
dump document state
```

This is the primary boundary between deterministic application logic and Adobe-specific behavior.

---

# 25. Host Measurement

Typography-dependent layout information should come from InDesign when correctness depends on actual composition.

Possible host measurements include:

```text
story overflow
line count
frame occupancy
composed paragraph geometry
page count
image frame bounds
```

Core tests should use deterministic mock/fake measurements.

Integration tests should validate assumptions using real InDesign.

---

# 26. CLI

Provide a first-class developer-oriented CLI.

Potential conceptual commands:

```text
publisher article parse article.md

publisher template inspect template.indd

publisher template validate template.indd

publisher template compile template.indd

publisher plan article.md --template editorial

publisher render article.md --template editorial

publisher inspect output.indd

publisher dump output.indd

publisher export output.indd
```

Exact syntax is not prescribed.

The CLI serves as:

```text
developer interface
automation API
debugging tool
test harness
CI entry point
```

The primary designer experience remains the plugin.

---

# 27. Plugin

Provide an InDesign panel/plugin for designers.

Potential areas:

```text
Content
Template
Document
Pages
Warnings
Assets
Update
Reflow
Export
```

Example conceptual UI:

```text
┌─────────────────────────────┐
│ Article Publisher           │
├─────────────────────────────┤
│ Content                     │
│ article.md                  │
│ ✓ synchronized              │
│                             │
│ Template                    │
│ Editorial Blue              │
│                             │
│ Document                    │
│ 14 pages                    │
│ 1 warning                   │
│                             │
│ 01 Cover               ✓    │
│ 02 Intro               ✓    │
│ 03 Background          ✓    │
│ 04 Feature             ✓    │
│ 05 Analysis            !    │
│                             │
│ [Update] [Reflow]           │
│                             │
│ [Export]                    │
└─────────────────────────────┘
```

The UI must not contain publishing business logic.

---

# 28. UXP Boundary

The implementation plan must evaluate current InDesign UXP scripts and plugins.

Do not assume UXP behaves like a full browser.

UI architecture must acknowledge host limitations.

Where appropriate, isolate:

```text
normal TypeScript/core code
UXP UI code
InDesign DOM adapter
```

so that development and tests remain independent from the UXP runtime wherever possible.

---

# 29. Designer Experience

The designer should ideally interact with:

```text
InDesign document
styles
parent pages
frames
visual layout
plugin UI
```

rather than:

```text
JSON
YAML
CLI commands
schema files
code
```

Developer-facing configuration may remain available internally.

---

# 30. Existing Templates

Do not require designers to rebuild existing InDesign documents into a new component framework.

Initial onboarding should accept:

```text
existing template.indd
↓
inspect
↓
annotate minimally
↓
compile
↓
validate
```

Only normalize parts that need semantic control.

---

# 31. Assets

Templates and assets should initially remain loosely coupled.

Possible assets:

```text
illustrations
icons
background art
logos
decorations
photography
textures
```

Do not require decomposition or centralization prematurely.

Reusable assets may later become a managed library when real duplication patterns justify it.

---

# 32. Testing Philosophy

Testability is a first-class architectural requirement.

Most behavior must be testable without running InDesign.

Target model:

```text
                    production

Plugin ──────────────┐
CLI ─────────────────┤
                     ▼
                    Core
                     │
                     ▼
               InDesign Adapter
                     │
                     ▼
                  InDesign


                      tests

Fixtures ───────────▶ Core
                      │
                      ▼
                   Mock Host
                      │
                      ▼
                   Snapshot


Fixtures ───────────▶ Core
                      │
                      ▼
               InDesign Adapter
                      │
                      ▼
                   InDesign
                   /      \
                  /        \
          Document Dump    Export
               │              │
            Snapshot       Visual Diff
```

---

# 33. Pure Tests

The majority of tests must run outside InDesign.

Examples:

```text
article parsing
semantic model
template metadata
template validation
page-role planning
story planning
style-role mapping
content synchronization
Document IR
Operation IR
error handling
serialization
schema migration
```

These should be fast and deterministic.

---

# 34. Fixture Corpus

Maintain a large realistic fixture corpus.

Examples:

```text
simple-article
very-long-article
very-long-title
single-section
many-sections
empty-section
quote-heavy
image-heavy
image-caption
missing-image
mixed-chinese-english
chinese-punctuation
english-heavy
missing-style
missing-frame
missing-parent-page
malformed-template
overset-story
hundreds-of-paragraphs
```

Agent-generated edge cases are encouraged.

---

# 35. Property / Invariant Tests

Potential invariants:

```text
semantic block IDs are unique

source block order is preserved unless explicitly transformed

no article blocks disappear during reflow

every page references a valid page role

every style role resolves or produces a structured diagnostic

serialization round trips

planning terminates

content synchronization is idempotent

unknown optional metadata does not corrupt the document

missing required template features fail explicitly
```

---

# 36. InDesign Contract Tests

Maintain a smaller suite against real InDesign.

Examples:

```text
create document
create page
apply parent page
create frame
create story
thread frames
insert text
apply paragraph style
apply character style
detect overset
place image
apply object style
save
close
reopen
export PDF
export image
```

These tests verify assumptions about Adobe APIs.

They should not duplicate the entire core test suite.

---

# 37. Canonical InDesign Document Dump

Implement a deterministic document inspection mechanism.

Example:

```json
{
  "pages": [
    {
      "id": "page-001",
      "role": "Cover"
    }
  ],
  "stories": [
    {
      "id": "main",
      "overset": false,
      "paragraphs": [
        {
          "semanticId": "p-1",
          "style": "Article / Body",
          "text": "..."
        }
      ]
    }
  ],
  "frames": [
    {
      "semanticRole": "article-flow",
      "page": 2,
      "bounds": [72, 90, 520, 740]
    }
  ]
}
```

Exclude unstable irrelevant host metadata.

Use this representation for snapshots.

Do not compare raw `.indd` bytes.

---

# 38. Golden E2E Tests

Maintain a small suite of representative end-to-end fixtures.

Example:

```text
golden/editorial-basic/
├── article.md
├── template.indd
├── expected-document.json
├── expected.pdf
├── expected-page-001.png
└── expected-page-002.png
```

Pipeline:

```text
article
+
template
↓
publishing core
↓
InDesign adapter
↓
InDesign
↓
INDD
+
canonical dump
+
exports
```

---

# 39. Visual Regression

Export representative outputs to a deterministic visual format.

Compare against golden outputs.

Visual regression should detect:

```text
font substitution
wrong styles
line-break changes
missing artwork
incorrect page role
incorrect image placement
unexpected overflow
incorrect parent page
broken text threading
```

Use appropriate tolerance where exact pixels are not sufficiently stable.

---

# 40. InDesign Server Compatibility

The architecture should not require InDesign Server, but should avoid unnecessarily preventing future compatibility.

Where reasonable:

```text
Publishing Core
       ↓
Host Adapter Interface
       ├── Desktop InDesign Adapter
       └── future InDesign Server Adapter
```

Do not implement Server support solely for architectural purity.

However, host-independent logic should not assume:

```text
visible UI
active user selection
open panel
interactive dialogs
```

unless explicitly running through the designer plugin.

---

# 41. Automation Architecture

A long-term automated publishing flow may therefore become:

```text
CLI / service
↓
Publishing Core
↓
InDesign Server
↓
INDD / PDF / images
```

while designer workflows remain:

```text
InDesign Plugin
↓
Publishing Core
↓
Desktop InDesign
```

Both should share semantic/template logic.

---

# 42. CI Strategy

Normal CI:

```text
type checks
lint
unit tests
fixture tests
property tests
snapshot tests
schema tests
UI tests
```

Host CI:

```text
InDesign contract tests
InDesign integration tests
golden export tests
visual regression
```

Potential future Server CI:

```text
headless InDesign Server E2E
```

Do not make local development depend on Adobe host startup for ordinary changes.

---

# 43. Structured Errors

Errors should be typed.

Examples:

```text
TemplateStyleMissing
TemplateFrameMissing
TemplatePageRoleMissing
ArticleInvalid
AssetMissing
FontMissing
FontSubstituted
StoryOverset
HostUnavailable
HostOperationFailed
ExportFailed
UnsupportedBlock
SynchronizationConflict
```

Errors should carry sufficient context for:

```text
CLI output
plugin warnings
logs
tests
debug artifacts
```

---

# 44. Debug Artifacts

Make failures inspectable.

Useful debug representations:

```text
parsed article
Semantic Document
Compiled Template
Document IR
Operation IR
canonical InDesign dump
host operation trace
overset diagnostics
exported pages
```

An agent should usually be able to diagnose a failing test without opening InDesign manually.

---

# 45. Determinism

All host-independent stages should be deterministic where practical.

Given identical:

```text
article
compiled template
settings
engine version
```

the publishing planner should produce identical output IR.

Avoid unstable ordering and ambient state.

---

# 46. Schema Versioning

Persisted schemas should explicitly identify their versions.

Potential schemas:

```text
SemanticDocument
CompiledTemplate
DocumentIR
OperationIR
DocumentDump
```

Migration infrastructure may remain minimal initially but formats should not be implicitly unversioned.

---

# 47. Security Boundary

Templates should describe:

```text
layout
styles
roles
content slots
```

and should not normally contain arbitrary executable application logic.

Prefer constrained operations over arbitrary generated scripts.

Do not make arbitrary script execution part of ordinary article content.

---

# 48. Non-Goals

The initial system is not:

```text
a replacement for InDesign

a full CSS/browser layout engine

a replacement for InDesign's composition engine

a general-purpose document editor

a generic Adobe automation platform

a generative-design system

an AI agent inside InDesign

a universal template marketplace

a complete DAM system
```

---

# 49. AI Features

Runtime generative AI is not required.

Coding agents may be heavily used for development.

Deterministic publishing problems should use deterministic solutions.

Do not introduce runtime LLM dependencies unless later requirements justify them.

---

# 50. Initial Useful Product

A meaningful first product should eventually demonstrate:

```text
structured article
+
one real designer-created InDesign template
↓
template inspection
↓
template validation
↓
content/style mapping
↓
text flow
↓
automatic page generation/reflow where appropriate
↓
editable InDesign document
↓
export
```

Developer tooling must additionally support:

```text
CLI
fixtures
snapshots
document dump
host contract tests
```

---

# 51. Architectural Acceptance Criteria

The architecture is acceptable only when:

1. Article parsing works without InDesign.
2. Semantic document construction works without InDesign.
3. Template metadata validation can largely run without InDesign after compilation.
4. Publishing planning works without InDesign.
5. Document IR is snapshot-testable.
6. InDesign DOM APIs are isolated behind an adapter.
7. Plugin and CLI share the core.
8. Most UI behavior can use a mock host.
9. Real InDesign can produce a canonical document dump.
10. Real InDesign output can participate in golden tests.
11. Designers need not manually maintain configuration files.
12. Existing InDesign templates can be incrementally adapted.
13. Generated `.indd` files remain normally editable.
14. InDesign remains authoritative for final typography.
15. Runtime generative AI is unnecessary.

---

# 52. Important Experimental Questions

Before major architectural commitments, experimentally verify:

```text
UXP plugin DOM coverage

UXP versus ExtendScript limitations

persistent object identification

script labels and metadata behavior

paragraph/character/object style APIs

parent-page manipulation

story creation

threaded text frame manipulation

overset detection

anchored object behavior

image fitting APIs

text wrap behavior

font substitution detection

page insertion behavior

export behavior

save/reopen stability

Desktop versus InDesign Server DOM differences
```

Write small host probes first.

Convert reliable findings into contract tests.

---

# 53. ADRs

Likely ADRs:

```text
ADR: core language and toolchain

ADR: UXP plugin strategy

ADR: host scripting strategy

ADR: template annotation mechanism

ADR: semantic style mapping

ADR: Document IR

ADR: story model

ADR: desktop automation strategy

ADR: InDesign Server compatibility strategy

ADR: visual regression strategy
```

Document only meaningful decisions.

---

# 54. Development Philosophy

Prefer:

```text
thick testable core
thin host adapter
semantic roles
InDesign styles
native story/thread composition
fixtures
snapshots
contract tests
golden tests
```

Avoid:

```text
manual paragraph positioning everywhere

scattered DOM calls

duplicated plugin/CLI logic

direct-formatting every text element

reimplementing InDesign typography

manual-only QA

requiring designers to edit config files

premature asset normalization
```

---

# 55. Guiding Principle

When the application must choose between:

```text
implementing a publishing policy itself
```

and:

```text
reimplementing a mature InDesign composition feature
```

prefer:

```text
the application defines intent and constraints;
InDesign performs composition.
```

The product should own the publishing model.

InDesign should own typography and rendering.
