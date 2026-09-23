# ADR 0002: Versioned semantic and document representations

## Status

Accepted

## Decision

Persist versioned `SemanticDocument`, `TemplateInventory`, `CompiledTemplate`, `DocumentIR`, `HostJob`, and `DocumentDump` values. Do not persist a separate Operation IR in the first version; adapters emit a normalized operation trace for debugging.

## Rationale

The core needs stable, inspectable boundaries without duplicating the same intent in two intermediate formats.

## Consequences

Changes to persisted values require schema version changes. Replaying host operations can be added later if traces show that it is needed.
