# InDesign probe procedure

## Current host status

The workstation has InDesign 2026 version `21.0.0.192` on macOS. The corrected host-version probe reported DOM `21.0`, UXP `uxp-9.0.3-local`, and one open document. These are measured values from this installation. The UXP Developer Tool is not installed. Do not treat host version or API documentation as proof that an unprobed DOM behavior works.

The designer's report package is copied to an ignored, disposable folder under `artifacts/host/indesign-21.0.0.192/`. The original `.indd` was not modified; its SHA-256 remained `abc750924fa0332061f7e6636c28d85b54ba9e42eb3573af414de498f1d0f1e4` after inspection. The DOM scan of the open disposable copy reports 20 pages, 9 spreads, 6 parent spreads, 261 stories, 893 page items (190 text, 10 graphic, 693 other), and 15/20/9 paragraph/character/object styles. It reports two missing link instances for the same JPG, seven out-of-date link instances, one substituted font face, and no overset stories. Seventy-one stories have no direct text-frame references in the scan; their use is not inferred. The packaged IDML independently describes 261 stories, 15 paragraph styles, 20 character styles, and 9 object styles, matching the DOM counts. The validated scan and host record are saved under the ignored `artifacts/host/indesign-21.0.0.192/probe-run/` directory.

The `Host Version Probe.idjs` and passive scanner `Structured Publisher Template Scan.idjs` are installed in this host's user Scripts Panel folder: `~/Library/Preferences/Adobe InDesign/Version 21.0-J/zh_CN/Scripts/Scripts Panel/`. InDesign 2026 on this workstation uses the `21.0-J` preferences directory, not `21.0`; discover the active location by right-clicking the User folder in the Scripts panel and choosing Reveal in Finder instead of assuming the directory name. The probe returned `uxp-9.0.3-local`. The scanner initially failed because `document.allPageItems` is indexed rather than exposing an `item()` method; the fallback is now in place. The scan completed without modifying the disposable document and its JSON passed `TemplateScan v1` validation. On this workstation, UXP logs are under `~/Library/Logs/Adobe/Adobe InDesign 2024/`, even though the installed application is InDesign 2026. Keep the report and host-version evidence in the ignored host-artifact folder; do not add designer source files, article text, images, or fonts to Git.

The paragraph style probe created and applied `Publisher Probe Body`, read the applied style back, and closed its scratch document without saving. Its result was `success: true`; the open-document count returned from 1 to 1. The record is saved under the ignored host-artifact folder. The character style probe later created and applied `Publisher Probe Emphasis` with the same pattern and also recorded `success: true` with an unchanged document count; it passed on two independent runs on 2026-09-24. Both records live in `artifacts/host/indesign-21.0.0.192/probe-run/`. Both probes verify in-memory behavior only; style persistence across save/reopen is a separate probe.

The script-label probes settled the annotation mechanism (ADR 0003). In-memory: `insertLabel`/`extractLabel` under the key `com.publisher.role` round-trip on document, page, text frame, and paragraph/character/object style objects; an unset key reads `""`; a second key on the same object is isolated; a display `label` property also round-trips; unique and duplicate label values are resolvable by scan. Persistence: a labeled scratch document saved by string path, closed, and reopened in separate runs — all labels, including style labels, read back correctly and lookups return the same results. `label-reopen-probe` attempt 1 failed only because it used the nonexistent `getByName` (correct UXP lookup is `itemByName`); attempt 2 was invalidated because a leaked still-open document satisfied reads from memory, so later versions refuse to read a target that is already open. `Page.id` (242) and `PageItem.id` (271/294/317) were stable across save/reopen while `Document.id` changed every session, confirming identity must come from labels/names. The scanner `template-scan.idjs` now reads the same final key. All records are in the probe-run artifact folder.

Story-flow and page probes established the composition contract. Text separators are decisive: `\r` (code 13) creates a paragraph and `\n` (code 10) is a soft line break, and `paragraph.contents` includes the trailing `\r` for every paragraph except the last. A text frame creates its own story; setting `frameA.nextTextFrame = frameB` produces a two-way link (`previousTextFrame`), a shared `parentStory`, and `story.textContainers.length === 2`, with the story text preserved exactly across Chinese/mixed content. A 44 pt frame overflows (40 paragraphs, 1590 characters, `story.overflows === true`) without losing text, and threading a second frame clears overset (`overflows === false`) with the same character count. Page operations: a new document has one two-page parent spread; `page.appliedMaster` assigns and reads back by id, `pages.add()` and `page.duplicate()` keep the master, and `pageItem.override(page)` adopts a labeled parent frame onto a document page, preserving label and contents. Parent items are not listed on the applied page's own `pageItems`/`textFrames`; they are discoverable through document/master page-item enumeration, and frame ownership follows geometric bounds rather than the collection the frame was added to (the default blank document is A4, 297 × 210 mm in this host, so raw page-relative coordinates can land on the pasteboard). The structure save/reopen pair persists all of it: page ids `[242, 351]`, applied master `244`, adopted flow frame `277`, story `301`, threaded containers `[319, 342]` on page `242`, paragraph style `275` applied to every paragraph, character style `276` applied on the second paragraph, no overset, and no open-document residue. `Page`, `PageItem`, `Story`, and style ids were stable across the reopen.

## Host API hazards observed

- `Document.fullName` returns a Promise that never settles from a Scripts Panel/`do script` execution. Reading it without awaiting produced `"[object Promise]"`; awaiting it hung the script with no record and a leaked open document. Probes and the adapter must use synchronous `Document.name` or verify files from the shell side.
- Collection lookup is `itemByName`; `getByName` does not exist and surfaced as silently empty label reads.
- A hung async probe leaks its scratch document and corrupts later runs' document-count guards and reopen evidence. `cleanup-scratch-probe.idjs` closes allowlisted scratch documents, and `run-indesign-probe.mjs --cleanup <path>` removes stale targets before reruns; the reopen probe refuses an already-open target.
- In one save run with a leaked zombie document present, `openDocumentCountAfter` read 2 immediately after a successful save+close; with a clean environment the count guard held. Treat cross-run environment checks (no stray documents, no stale target file) as part of probe hygiene.
- `setTimeout` promises never settle inside a Scripts Panel execution (there is no timer pump), so in-script delays hang the probe exactly like the `fullName` Promise. Do not wait inside probes; settle externally between runs.
- Immediately after `save()` + `close()`, `app.documents.length` can transiently include the save-as copy that InDesign finalizes on its own; the count usually returns to baseline within a second. Save probes record the immediate count and tolerate one extra document, then confirm the environment with `open-documents-probe.idjs`.
- Frame ownership follows geometric bounds, not the collection targeted: on a two-page parent spread, positive-x bounds land on the right page, and out-of-page bounds place a frame on the pasteboard with a null `parentPage`. Derive frame geometry from the target page's `bounds`.

## Automated probe execution

On macOS, InDesign's AppleScript dictionary exposes `do script ... language uxpscript`, which runs a UXP `.idjs` file from any POSIX path without the Scripts panel, UXP Developer Tool, or user interaction. The return value is not propagated to AppleScript; scripts run asynchronously, and `console.log` evidence still lands in the newest `~/Library/Logs/Adobe/Adobe InDesign 2024/UXPLogs_*.log` under the probe's `PUBLISHER_*_V*` tag.

`scripts/run-indesign-probe.mjs` (development tooling only; not part of the product adapter) executes that channel and harvests the record:

```bash
node scripts/run-indesign-probe.mjs packages/indesign/probes/<probe>.idjs \
  --tag PUBLISHER_<NAME>_PROBE_V1 \
  --out artifacts/host/indesign-21.0.0.192/probe-run/<name>.json
```

This channel is for probe execution and evidence capture only. Product code must never shell out to AppleScript; persistent-panel work still requires the UXP Developer Tool, and adapter DOM access stays in `packages/indesign`.


## Procedure

1. Open the disposable template, never the designer's source document.
2. Run `host-version-probe.idjs` and `template-scan.idjs`. Record the application version, UXP version, DOM version, operating system, input document hash, and scan output.
3. Run one capability probe at a time, via `scripts/run-indesign-probe.mjs` or the Scripts panel. Save each probe's input, result, and disposable output with the host-version identifier.
4. For persistence claims, save, close, reopen, and query the same objects in a separate run. In-memory success does not establish persistence.
5. Add a host contract test only for behavior confirmed by the recorded output. A failing or unavailable API remains unsupported until an alternative is probed.

## Probe matrix

| Capability | Probe question | Required evidence | Status |
| --- | --- | --- | --- |
| Paragraph styles | Can a named style be created, applied, and read back in a scratch document? | Created/applied style names and scratch-document cleanup | Pass in memory; persistence not run |
| Character styles | Can a named style be created, applied, and read back in a scratch document? | Created/applied style names and scratch-document cleanup | Pass in memory; persistence not run |
| Object styles | Can a style be applied to a placed graphic frame and read back? | Style identity and frame properties | Not run |
| Script labels | Do namespaced keyed labels survive save/reopen and locate uniquely? | Key/value report before and after reopen | Pass in memory and across save/reopen |
| Parent pages and page operations | Can a template parent be assigned and an appropriate page duplicated? | Page count, parent identity, and item placement | Pass: assign, add, duplicate, adopt parent frame |
| Stories and threading | Can the adapter populate one story and link template frames in order? | Story text and previous/next frame chain | Pass: separators, contents readback, two-frame thread |
| Overset | Does the host report the expected overset state before and after adding flow capacity? | `overflows` and page/frame counts | Pass: overset clears after threading with no text loss |
| Anchored objects | Can an image frame be anchored at the semantic block location? | Story position and anchored frame identity | Not run |
| Graphics and fitting | Can a graphic be placed, its parent frame styled, and fitting applied? | Link status, frame bounds, and fit state | Not run |
| Text wrap | Can wrap mode and offsets be applied and read back? | Wrap properties and exported page | Not run |
| Export | Can configured exports run without dialogs? | File existence, page count, and export settings | Not run |
| Font substitution | Can missing/substituted fonts be detected reliably? | Host-reported font state and diagnostic mapping | Not run |
| Stable identity | Which IDs remain stable across save/reopen and duplicate operations? | Identity comparison across operations | Pass for page, page item, story, and style ids; `Document.id` is session-local |
| UXP file access | Can the plugin request a workspace folder and exchange job/result files? | Permission flow, read/write, polling, and restart behavior | Not run |

## Official Adobe references

- [Run and debug UXP scripts](https://developer.adobe.com/indesign/uxp/scripts/tutorials/tips-tricks/)
- [Start an InDesign UXP script](https://developer.adobe.com/indesign/uxp/scripts/getting-started/)
- [Create and apply paragraph styles](https://developer.adobe.com/indesign/uxp/resources/recipes/document-changes/)
- [Character style collection](https://developer.adobe.com/indesign/uxp/dom/api/c/character-styles/)
- [Text style application methods](https://developer.adobe.com/indesign/uxp/omv/p/Paragraph/)
- [SaveOptions](https://developer.adobe.com/indesign/uxp/dom/api/s/save-options/)
- [InDesign DOM versioning](https://developer.adobe.com/indesign/uxp/resources/fundamentals/dom-versioning/)
- [UXP runtime versions by host release](https://developer.adobe.com/uxp/uxp-api/versions)
- [UXP Developer Tool setup and privileges](https://developer.adobe.com/indesign/uxp/introduction/essentials/dev-tools/)
- [UXP file operations and permission model](https://developer.adobe.com/indesign/uxp/resources/recipes/file-operation/)
- [InDesign Server object-model differences](https://developer.adobe.com/indesign/uxp/scripts/tutorials/ids-object-model/)

Keep each probe minimal. Do not promote an undocumented assumption into an adapter abstraction before recording a result and adding a contract test.
