# InDesign probe procedure

## Current status

InDesign and UXP Developer Tool are not installed in the development environment. No InDesign behavior has been exercised here. Adobe's documentation is evidence of documented API surface, not a substitute for host execution. The `contract-probe.idjs` script is a passive inventory probe and requires an already-open disposable document.

## Procedure

1. Install a supported desktop InDesign version and UXP Developer Tool. Record the exact InDesign version, UXP version, OS, and `app.scriptPreferences.version` reported by the probe.
2. Make a disposable copy of a template with representative paragraph, character, and object styles, parent pages, a threaded story, graphics, and text wrap.
3. Run one behavior probe at a time. Save the script, JSON report, and disposable input/output files with the host-version identifier.
4. For persistence claims, save, close, reopen, and query the same objects in a separate run. In-memory success does not establish persistence.
5. Add a host contract test only for behavior confirmed on the supported installation. A failing or unavailable API remains unsupported until an alternative is probed.

## Probe matrix

| Capability | Probe question | Required evidence |
| --- | --- | --- |
| Paragraph and character styles | Can existing named styles be resolved, applied, and read back? | Qualified style names before and after save/reopen |
| Object styles | Can a style be applied to a placed graphic frame and read back? | Style identity and frame properties |
| Script labels | Do namespaced keyed labels survive save/reopen and locate uniquely? | Key/value report before and after reopen |
| Parent pages and page operations | Can a template parent be assigned and an appropriate page duplicated? | Page count, parent identity, and item placement |
| Stories and threading | Can the adapter populate one story and link template frames in order? | Story text and previous/next frame chain |
| Overset | Does the host report the expected overset state before and after adding flow capacity? | `overflows` and page/frame counts |
| Anchored objects | Can an image frame be anchored at the semantic block location? | Story position and anchored frame identity |
| Graphics and fitting | Can a graphic be placed, its parent frame styled, and fitting applied? | Link status, frame bounds, and fit state |
| Text wrap | Can wrap mode and offsets be applied and read back? | Wrap properties and exported page |
| Export | Can configured exports run without dialogs? | File existence, page count, and export settings |
| Font substitution | Can missing/substituted fonts be detected reliably? | Host-reported font state and diagnostic mapping |
| Stable identity | Which IDs remain stable across save/reopen and duplicate operations? | Identity comparison across operations |
| UXP file access | Can the plugin request a workspace folder and exchange job/result files? | Permission flow, read/write, polling, and restart behavior |

Keep each probe minimal. Do not promote undocumented behavior into an adapter abstraction until it has a recorded result and a contract test.
