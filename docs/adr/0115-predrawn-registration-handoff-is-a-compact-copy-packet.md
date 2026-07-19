---
status: "accepted"
date: 2026-07-14
deciders: Nelson, Codex
---

# ADR-0115: Pre-drawn registration handoff is a compact copy packet

## Context

A saved pre-drawn registration was previously handed from the owner to an agent
by copying the editor address bar. That URL mixed the useful source and
registration with route, document, layer, and browser-state parameters. It was
unnecessarily large and made browser choice look like part of the calibration
contract.

## Decision

After `SAVE REGISTRATION` has synchronously written and read-back-verified the
source-scoped local record, the calibration instrument enables
`COPY CODEX HANDOFF`. It copies one compact JSON packet containing only:

```json
{"kind":"chess-tactics/predrawn-registration","source":"...","registration":"..."}
```

The copied registration must be the exact verified saved value, never pending
picker state. The instrument uses the Clipboard API when available and a local
copy fallback otherwise. The development URL may continue to mirror the value
for reopen and debugging, but it is not the owner-to-agent handoff format.

## Consequences

- The owner can hand off an exact calibration from any ordinary browser without
  copying unrelated editor or document state.
- The packet is small, versioned by its registration string, and directly
  machine-readable.
- `COPY CODEX HANDOFF` remains disabled until the current registration has been
  explicitly saved and verified.
