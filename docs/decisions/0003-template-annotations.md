# ADR 0003: Designer-managed template annotations

## Status

Accepted, pending InDesign persistence probe

## Decision

Use plugin-assigned semantic roles on existing page, frame, and style objects. Prefer namespaced keyed script labels and compile them into a generated manifest. If labels do not survive save and reopen, use a generated sidecar keyed to uniquely named template objects and contract-test object resolution.

## Rationale

Designers work in InDesign and should not maintain configuration files. Existing templates should need only the annotations required for automation.

## Consequences

The compiler implementation must follow the result of the first real-host persistence and identity probes.
