# InDesign probe procedure

## Current host status

The workstation has InDesign 2026 version `21.0.0.192` on macOS. The host-version probe confirmed InDesign `21.0.0.192`, DOM `21.0`, and one open document. Its initial UXP value was `undefined` because the probe read the wrong property; the script now reads the documented `require("uxp").versions.uxp` property, and that corrected value awaits a rerun. Adobe's published runtime matrix associates InDesign 21.0 with UXP 9.0.3, but that is a documented mapping, not a measurement from this installation. The UXP Developer Tool is not installed. Do not treat the host version or Adobe's API documentation as proof that a DOM behavior works.

The designer's report package is copied to an ignored, disposable folder under `artifacts/host/indesign-21.0.0.192/`. The original `.indd` was not modified; its SHA-256 remained `abc750924fa0332061f7e6636c28d85b54ba9e42eb3573af414de498f1d0f1e4` after inspection. The open disposable copy reports 20 pages and 9 spreads in InDesign, two missing link instances that point to the same missing image, and four missing font faces. The packaged IDML is used only as a cross-check: it describes 261 stories, 15 paragraph styles, 20 character styles, and 9 object styles. These IDML counts are not recorded as DOM findings.

The `Host Version Probe.idjs` and passive scanner `Structured Publisher Template Scan.idjs` are installed in this host's user Scripts Panel folder: `~/Library/Preferences/Adobe InDesign/Version 21.0-J/zh_CN/Scripts/Scripts Panel/`. InDesign 2026 on this workstation uses the `21.0-J` preferences directory, not `21.0`; discover the active location by right-clicking the User folder in the Scripts panel and choosing Reveal in Finder instead of assuming the directory name. A disposable copy of the report is open from `artifacts/host/indesign-21.0.0.192/probe-run/`. The first scan attempt reached `document.allPageItems` and failed because that host value does not expose an `item()` method. The scanner now supports both callable `item(index)` collections and indexed array-like values; the updated script has been copied to the Scripts Panel folder and awaits a rerun. Run **Window > Utilities > Scripts**, then double-click **Host Version Probe** followed by **Structured Publisher Template Scan**. The first writes a `PUBLISHER_HOST_ENV_V1` record; the scanner writes a `PUBLISHER_TEMPLATE_SCAN_V1` record to the InDesign UXP log. On this workstation, logs are under `~/Library/Logs/Adobe/Adobe InDesign 2024/`, even though the installed application is InDesign 2026. Keep the report and host-version evidence in the ignored host-artifact folder; do not add designer source files, article text, images, or fonts to Git.

## Procedure

1. Open the disposable template, never the designer's source document.
2. Run `host-version-probe.idjs` and `template-scan.idjs`. Record the application version, UXP version, DOM version, operating system, input document hash, and scan output.
3. Run one capability probe at a time. Save each probe's input, result, and disposable output with the host-version identifier.
4. For persistence claims, save, close, reopen, and query the same objects in a separate run. In-memory success does not establish persistence.
5. Add a host contract test only for behavior confirmed by the recorded output. A failing or unavailable API remains unsupported until an alternative is probed.

## Probe matrix

| Capability | Probe question | Required evidence | Status |
| --- | --- | --- | --- |
| Paragraph and character styles | Can existing named styles be resolved, applied, and read back? | Qualified style names before and after save/reopen | Not run |
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
- [InDesign DOM versioning](https://developer.adobe.com/indesign/uxp/resources/fundamentals/dom-versioning/)
- [UXP runtime versions by host release](https://developer.adobe.com/uxp/uxp-api/versions)
- [UXP Developer Tool setup and privileges](https://developer.adobe.com/indesign/uxp/introduction/essentials/dev-tools/)
- [UXP file operations and permission model](https://developer.adobe.com/indesign/uxp/resources/recipes/file-operation/)
- [InDesign Server object-model differences](https://developer.adobe.com/indesign/uxp/scripts/tutorials/ids-object-model/)

Keep each probe minimal. Do not promote an undocumented assumption into an adapter abstraction before recording a result and adding a contract test.
