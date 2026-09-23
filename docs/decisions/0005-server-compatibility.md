# ADR 0005: InDesign Server compatibility

## Status

Accepted

## Decision

Keep host operations independent of active selection, windows, dialogs, and clipboard. Do not require InDesign Server initially. Revisit Server after desktop contracts pass and unattended rendering is a demonstrated need.

## Rationale

Server may improve unattended contract and golden tests, but it is not installed and adds operational and licensing requirements. The host-independent engine can be validated before then.

## Consequences

Server behavior is a later compatibility target, not a current support claim.
