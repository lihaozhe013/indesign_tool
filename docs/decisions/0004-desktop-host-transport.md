# ADR 0004: Desktop host job transport

## Status

Accepted; supersedes the original UXP panel polling proposal

## Decision

Use versioned job and result files in a unique application-cache folder. Rust launches a generated
`.idjs` script through macOS Apple Events. The script uses top-level `await` to read one job,
execute it, write its result, and create a completion marker. Rust serializes access to InDesign and
validates the result before returning it to the WebView.

Each operation gets an independent UUID directory and generated script. The bridge enforces a
timeout and rejects unsupported versions, malformed results, and job ID mismatches. The React app
calls Rust commands through Tauri IPC; it does not communicate with InDesign directly.

## Rationale

This keeps the UI and local filesystem access out of UXP, uses the supported InDesign script entry
point, and gives each host operation an inspectable payload and result.

## Consequences

The original 2026-09-24 I/O probe ran file operations inside an unawaited async IIFE, so its hanging
result did not establish that UXP file I/O was blocked. A corrected InDesign 21.0.0.192 probe used
top-level `await` and completed a temporary-file write, read, and delete. AppleScript does not pass
`with arguments` to a `.idjs` file, so the generated script receives explicit file paths through its
own source and reads the JSON job from disk. Product support is macOS/InDesign 2026 only.
