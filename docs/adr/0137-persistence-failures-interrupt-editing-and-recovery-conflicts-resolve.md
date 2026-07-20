---
status: accepted
date: 2026-07-19
deciders: Nelson, Codex
---

# ADR-0137: Persistence failures interrupt editing and recovery conflicts resolve

## Context

The Level Editor could restore a browser recovery based on an older cloud document revision,
mark that recovery as conflicted, and then preserve the marker on every subsequent browser write.
Reloading treated the marker itself as proof of a new conflict even after the recovery had been
rebound to the cloud revision currently on screen. Autosave remained paused forever. The warning
and destructive Discard action lived only in the Status layer, so authors could continue editing
without seeing that cloud persistence had stopped.

## Decision

- A cloud autosave error or conflict is an editor-wide interruption shown over every editing layer,
  never Status-only ambient information.
- A browser recovery conflict preserves both versions and offers **Keep recovered work**. The
  acknowledgement succeeds only when the scoped browser entry still matches the exact document
  revision and cloud signature on screen; it clears only the conflict marker and resumes the normal
  compare-and-swap autosave. A newer server write still returns a conflict instead of being
  overwritten.
- **Discard changes** remains an explicit confirmed choice of the canonical saved position. It is
  never presented as the only way to escape a browser recovery conflict.
- Browser acceptance and the following cloud acknowledgement remain separately visible. Choosing
  the recovery does not promote or publish it; canonical Save retains its existing boundary.

## Consequences

- A recovery marker is no longer a permanent dead end.
- Authors see persistence loss immediately regardless of the active tool or editor layer.
- Resolution remains fail-closed against a genuinely newer cloud revision.
- The browser copy, cloud working copy, and canonical saved position keep distinct meanings.

## More Information

- [Persistence](../persistence.md#level-editor-working-copies)
- [ADR-0090](0090-private-draft-cards-preview-and-manage-working-copies.md)
