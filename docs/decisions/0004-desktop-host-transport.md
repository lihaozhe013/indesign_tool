# ADR 0004: Desktop host job transport

## Status

Accepted for the queue contract; storage implementation blocked on the panel manifest

## Decision

Use versioned job and result files in a user-selected workspace folder. The CLI queues jobs; the UXP panel runner processes them while open. The core owns orchestration and the adapter owns DOM execution.

The host package provides a queue port and a serial job processor. It writes a result before removing the pending job. The storage implementation and UXP panel polling loop are not enabled until permissions and persistence are verified in InDesign.

## Rationale

This keeps CLI and host code separate, avoids platform-specific process automation, and gives failed jobs inspectable inputs and outputs.

## Consequences

The 2026-09-24 host probe showed that a Scripts Panel execution can obtain the plugin temporary folder and create a file, but `file.write`, `file.read`, and `file.delete` never settle, and `file.open` does not exist. File-based job transport therefore requires a real UXP panel with `localFileSystem` manifest permissions loaded through the UXP Developer Tool (not installed on this workstation). CLI host commands currently report `HostUnavailable`; concrete host commands will enqueue and wait only after that panel transport exists. AppleScript `do script` cannot substitute for it because its `with arguments` values are not delivered to a `.idjs` script.
