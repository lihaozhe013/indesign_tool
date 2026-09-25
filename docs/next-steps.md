# Next Steps

This document is the working handoff plan from the offline publishing foundation to a verified InDesign publishing path. It records the current evidence and the order of work; it does not treat Adobe documentation as proof that an unprobed behavior works.

## Current Snapshot

Status checked on 2026-09-24:

- The repository is on `main`, continuing from commit `a738b30`.
- `pnpm validate` passes: type checking, lint, builds, and 47 tests.
- InDesign 2026 is installed at `21.0.0.192`; the measured DOM version is `21.0` and UXP reports `uxp-9.0.3-local`.
- The UXP Developer Tool is not installed. `.idjs` probes run either from the InDesign Scripts panel or non-interactively through `scripts/run-indesign-probe.mjs`, which uses the AppleScript `do script ... language uxpscript` channel and harvests the tagged record from the newest UXP log.
- The read-only scan of the disposable Zijiang report copy passed `TemplateScan v1` validation. It found 20 pages, 261 stories, 893 page items, 15 paragraph styles, 20 character styles, and 9 object styles. It reported two missing-link instances for the same JPG, seven out-of-date links, one substituted font face, and no overset stories.
- The paragraph-style scratch-document probe passed: it created and applied `Publisher Probe Body`, read it back, closed without saving, and restored the open-document count from 1 to 1.
- The character-style scratch-document probe passed: it created and applied `Publisher Probe Emphasis`, read the applied style back, closed without saving, and restored the open-document count from 1 to 1. Two independent runs on 2026-09-24 produced the same passing record. In-memory only; save/reopen persistence is a separate probe.
- The script-label probes passed in memory and across a separate save/close/reopen run: namespaced labels on document, page, text-frame, and style objects persist, and label-value lookup is reliable for both unique and duplicate matches. ADR 0003 is decided: `com.publisher.role` labels are the annotation mechanism; the sidecar fallback is rejected. Host hazards (`fullName` never settles, `getByName` does not exist, leaked hung probes corrupt counts) are recorded in the probe guide.
- The report is an inspection sample, not the initial publishing template. Do not force its 261 independent stories into the single main-article-story model.

Host probe evidence and procedures are in [the InDesign probe guide](indesign-probes/README.md). Local host artifacts live under the ignored `artifacts/host/indesign-21.0.0.192/` directory. Do not commit the designer's `.indd`, IDML, PDF, fonts, or linked assets.

## Ordered Work Plan

### 1. Finish the character-style probe (done 2026-09-24)

The probe recorded `success: true` with matching created/applied names (`Publisher Probe Emphasis`), a scratch document closed without saving, and the open-document count restored from 1 to 1, on two independent runs. The passing record is saved in the ignored host-artifact directory and the probe matrix is updated. This verifies in-memory behavior only; it does not establish save/reopen persistence.

Probe execution is now automated: `scripts/run-indesign-probe.mjs` runs a `.idjs` probe via AppleScript `do script ... language uxpscript` (any POSIX path; no Scripts panel click and no UXP Developer Tool needed) and extracts the tagged JSON record from the newest UXP log.

### 2. Resolve the template-annotation mechanism (done 2026-09-24)

Labels round-trip in memory on document, page, text-frame, and paragraph/character/object-style objects with the key `com.publisher.role`; unset keys read `""`; a second key is isolated. A labeled scratch document saved by string path, closed, and reopened in a separate run preserved every label, and label-value lookup returned correct unique and duplicate matches. `Page.id`/`PageItem.id` were stable across reopen while `Document.id` was session-local. ADR 0003 now selects keyed script labels; the object-name sidecar fallback is rejected. See the probe guide for the failed attempt 1 (`getByName`), the invalidated attempt 2 (leaked open document), and the resulting probe-hygiene rules. Do not change the real report source.

### 3. Verify native story flow and page operations

Use minimal scratch documents and separate probes for each capability:

1. Create one story, populate it with Chinese and mixed-language text, and verify contents.
2. Thread two text frames and read back the previous/next frame chain.
3. Force overset with a deliberately small frame, then add flow capacity and confirm InDesign recomposes the story without losing source text.
4. Assign a parent page and duplicate/add an article page; record page counts and parent identity.
5. Save, close, reopen, and verify the resulting structure in a separate persistence probe.

Prefer native stories, threaded frames, paragraph styles, parent pages, and overset reporting. Do not estimate line breaks in the publishing core.

### 4. Verify image, object-style, and export behavior

Probe object-style application, graphic placement, fitting, anchored placement, text wrap, font-substitution reporting, and non-interactive PDF/image export independently. Use generated or disposable assets only. Record host version, settings, output paths, link status, and relevant frame/story observations. Do not implement an adapter operation until its needed DOM behavior has a passing probe or an explicitly documented fallback.

### 5. Establish a synthetic publishing template

After the needed page, style, story, and threading contracts pass, create a small Cover/Article template in InDesign with named styles and one continuous article flow. Keep this as a host test fixture outside the designer report. Generate an editable output copy; preserve the source template and any existing published `.indd` files.

The first end-to-end article set should include the basic article, long Chinese content, mixed Chinese/English, a long heading, quote blocks, an image with caption, a missing asset, and forced overset/reflow.

### 6. Implement the real InDesign adapter and runner

Keep all direct InDesign DOM access in `packages/indesign`. Build the UXP driver only around confirmed contracts. It should materialize `DocumentIR`, use native text composition, report host observations, add Article pages after overset feedback, create canonical document dumps, and export without selection or dialogs.

Then load the designer panel in InDesign using UXP Developer Tool, verify its file permissions, and implement the versioned job/result transport. Until the runner is connected, CLI host commands should continue to return `HostUnavailable`. CLI and panel must continue to call the same publishing core; neither may own publishing rules.

### 7. Add host-backed golden and visual tests

Create a separate host test lane; keep ordinary type checks, lint, unit tests, and UI tests independent of InDesign. The host lane should save:

- the input job and host/UXP/DOM versions;
- the generated editable `.indd`;
- a deterministic `DocumentDump v1`;
- export settings and PDF/image output;
- failure traces and artifacts.

Pin the InDesign version, template revision, fonts, and export settings for golden runs. Start reviewed visual baselines with the synthetic template. Establish a baseline for the Zijiang report only after the missing JPG, out-of-date links, and substituted font have been resolved. Keep Server compatibility as a later evaluation; do not require InDesign Server for the initial product.

## Completion Gates

The first meaningful product milestone is complete only when a structured article and synthetic designer-created template produce a normally editable `.indd`, the host reports composition and overset state, reflow adds pages without losing blocks, a canonical dump is deterministic, and an export can be compared in a host-backed test. A successful scan or isolated style probe alone does not satisfy this gate.

At each milestone, run `pnpm validate`, inspect architecture boundaries, check `git diff --check`, review generated artifacts, update probe evidence, and commit the completed work using a concise Conventional Commit. Keep repository-authored documentation and commit messages in English.
