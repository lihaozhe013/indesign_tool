# ADR 0004: Desktop host job transport

## Status

Accepted for the queue contract; UXP file access remains pending host probe

## Decision

Use versioned job and result files in a user-selected workspace folder. The CLI queues jobs; the UXP panel runner processes them while open. The core owns orchestration and the adapter owns DOM execution.

The host package provides a queue port and a serial job processor. It writes a result before removing the pending job. The storage implementation and UXP panel polling loop are not enabled until permissions and persistence are verified in InDesign.

## Rationale

This keeps CLI and host code separate, avoids platform-specific process automation, and gives failed jobs inspectable inputs and outputs.

## Consequences

The UXP folder permission and polling behavior must pass a host probe. CLI host commands currently report `HostUnavailable`; concrete host commands will enqueue and wait only after the runner transport is implemented and exercised.
