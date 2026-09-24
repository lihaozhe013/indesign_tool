# InDesign probe procedure

## Current host status

The workstation has InDesign 2026 version `21.0.0.192` on macOS. The corrected host-version probe reported DOM `21.0`, UXP `uxp-9.0.3-local`, and one open document. These are measured values from this installation. The UXP Developer Tool is not installed. Do not treat host version or API documentation as proof that an unprobed DOM behavior works.

The designer's report package is copied to an ignored, disposable folder under `artifacts/host/indesign-21.0.0.192/`. The original `.indd` was not modified; its SHA-256 remained `abc750924fa0332061f7e6636c28d85b54ba9e42eb3573af414de498f1d0f1e4` after inspection. The DOM scan of the open disposable copy reports 20 pages, 9 spreads, 6 parent spreads, 261 stories, 893 page items (190 text, 10 graphic, 693 other), and 15/20/9 paragraph/character/object styles. It reports two missing link instances for the same JPG, seven out-of-date link instances, one substituted font face, and no overset stories. Seventy-one stories have no direct text-frame references in the scan; their use is not inferred. The packaged IDML independently describes 261 stories, 15 paragraph styles, 20 character styles, and 9 object styles, matching the DOM counts. The validated scan and host record are saved under the ignored `artifacts/host/indesign-21.0.0.192/probe-run/` directory.

The `Host Version Probe.idjs` and passive scanner `Structured Publisher Template Scan.idjs` are installed in this host's user Scripts Panel folder: `~/Library/Preferences/Adobe InDesign/Version 21.0-J/zh_CN/Scripts/Scripts Panel/`. InDesign 2026 on this workstation uses the `21.0-J` preferences directory, not `21.0`; discover the active location by right-clicking the User folder in the Scripts panel and choosing Reveal in Finder instead of assuming the directory name. The probe returned `uxp-9.0.3-local`. The scanner initially failed because `document.allPageItems` is indexed rather than exposing an `item()` method; the fallback is now in place. The scan completed without modifying the disposable document and its JSON passed `TemplateScan v1` validation. On this workstation, UXP logs are under `~/Library/Logs/Adobe/Adobe InDesign 2024/`, even though the installed application is InDesign 2026. Keep the report and host-version evidence in the ignored host-artifact folder; do not add designer source files, article text, images, or fonts to Git.

The paragraph style probe created and applied `Publisher Probe Body`, read the applied style back, and closed its scratch document without saving. Its result was `success: true`; the open-document count returned from 1 to 1. The record is saved under the ignored host-artifact folder. The next probe creates and applies one character style in another scratch document. UXP script `console.log` records can be found in the newest `~/Library/Logs/Adobe/Adobe InDesign 2024/UXPLogs_*.log`; search for the probe's `PUBLISHER_*_V1` tag.

## Procedure

1. Open the disposable template, never the designer's source document.
2. Run `host-version-probe.idjs` and `template-scan.idjs`. Record the application version, UXP version, DOM version, operating system, input document hash, and scan output.
3. Run one capability probe at a time. Save each probe's input, result, and disposable output with the host-version identifier.
4. For persistence claims, save, close, reopen, and query the same objects in a separate run. In-memory success does not establish persistence.
5. Add a host contract test only for behavior confirmed by the recorded output. A failing or unavailable API remains unsupported until an alternative is probed.

## Probe matrix

| Capability | Probe question | Required evidence | Status |
| --- | --- | --- | --- |
| Paragraph styles | Can a named style be created, applied, and read back in a scratch document? | Created/applied style names and scratch-document cleanup | Pass in memory; persistence not run |
| Character styles | Can a named style be created, applied, and read back in a scratch document? | Created/applied style names and scratch-document cleanup | Prepared; not run |
| Object styles | Can a style be applied to a placed graphic frame and read back? | Style identity and frame properties | Not run |
| Script labels | Do namespaced keyed labels survive save/reopen and locate uniquely? | Key/value report before and after reopen | Not run |
| Parent pages and page operations | Can a template parent be assigned and an appropriate page duplicated? | Page count, parent identity, and item placement | Not run |
| Stories and threading | Can the adapter populate one story and link template frames in order? | Story text and previous/next frame chain | Not run |
| Overset | Does the host report the expected overset state before and after adding flow capacity? | `overflows` and page/frame counts | Not run |
| Anchored objects | Can an image frame be anchored at the semantic block location? | Story position and anchored frame identity | Not run |
| Graphics and fitting | Can a graphic be placed, its parent frame styled, and fitting applied? | Link status, frame bounds, and fit state | Not run |
| Text wrap | Can wrap mode and offsets be applied and read back? | Wrap properties and exported page | Not run |
| Export | Can configured exports run without dialogs? | File existence, page count, and export settings | Not run |
| Font substitution | Can missing/substituted fonts be detected reliably? | Host-reported font state and diagnostic mapping | Not run |
| Stable identity | Which IDs remain stable across save/reopen and duplicate operations? | Identity comparison across operations | Not run |
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
