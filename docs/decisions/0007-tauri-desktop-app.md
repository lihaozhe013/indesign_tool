# ADR 0007: Tauri desktop app and InDesign script bridge

## Status

Accepted

## Context

The embedded InDesign panel is too difficult to use as the primary workflow. Users need an independent editor and publishing surface while InDesign remains the composition and export engine.

## Decision

Build the first release as a macOS Tauri 2 app with a React and TypeScript WebView. Rust owns local file dialogs, asset checks, staged output, and the Apple Events process bridge. A generated UXP `.idjs` script performs all InDesign DOM operations.

For every operation, Rust writes a separate HostJob v1 JSON file and script in a UUID directory. The script uses top-level `await` to read the job and write HostJobResult v1 plus a completion marker. Rust runs one job at a time, enforces a timeout, validates the job ID and result schema, and removes successful job files.

## Rationale

The desktop app can provide a larger editing and preview workspace without requiring a UXP panel to be installed. The shared parser, template compiler, planner, and overset feedback loop remain host-independent. The user grants InDesign control through macOS Automation the first time the app sends a script.

## Consequences

- The first release supports local macOS use with InDesign 2026.
- The app bundle declares `NSAppleEventsUsageDescription` and an Apple Events entitlement.
- Template labels are optional compatibility signals; automatic resolution and its fallback policy are defined in [ADR 0009](0009-tolerant-template-resolution.md).
- The older plugin source is not built or exposed as a product entry point.
- Signed and notarized distribution, Windows support, and InDesign Server are deferred.

## References

- [Adobe UXP scripts and plugins](https://developer.adobe.com/indesign/uxp/introduction/next-steps/script-and-plugin/)
- [Adobe UXP global await](https://developer.adobe.com/indesign/uxp/scripts/concepts/global-await/)
- [Adobe UXP file system API](https://developer.adobe.com/indesign/uxp/uxp/reference-js/Modules/uxp/Persistent%20File%20Storage/FileSystemProvider/)
- [Tauri commands](https://v2.tauri.app/develop/calling-rust/)
- [Apple Events usage description](https://developer.apple.com/documentation/bundleresources/information-property-list/nsappleeventsusagedescription)
