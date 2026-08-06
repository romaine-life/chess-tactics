---
status: accepted
date: 2026-08-05
deciders: owner (Nelson) + Codex
partially_supersedes:
  - "[ADR-0166](0166-manual-ai-handoff-separates-generation-references-from-raw-pipeline-sources.md)'s mandatory Generation Reference binding for every new AI result"
  - "[ADR-0465](0465-board-art-pipeline-owns-ai-result-ingress.md)'s producing-reference selector and reference-bound waiting attempt"
refines:
  - "[ADR-0168](0168-creation-slots-begin-with-reusable-raw-pipeline-sources.md)"
  - "[ADR-0464](0464-generation-references-freeze-the-autosaved-working-copy.md)"
---

# ADR-0466: AI artwork intake is source-agnostic

## Context

Generation References are useful model inputs, but a finished AI-painted PNG
may come from any external model, conversation, file, or clipboard. Requiring
the owner to identify a producing Generation Reference made optional generation
provenance a prerequisite for Board Art processing and connected two workflows
that do not need to share state.

## Decision

Generation References remain an optional library for obtaining exact
level-derived model inputs. They do not start, authorize, or bind Board Art
Pipeline intake.

The Board Art Pipeline accepts any decodable full-resolution PNG through
**Paste AI artwork**, native paste, or **Choose PNG file**. The client previews
the exact bytes before mutation. **Use this board** stores those unchanged bytes
as an immutable `kind='raw'` version and creates a processing slot that binds
that raw identity and hash to the current autosaved working-copy semantic
snapshot, 16:9 viewing pane, and environment geometry. The intake request
records no Generation Reference identity and makes no claim about the external
model, prompt, or provenance beyond owner-supplied file/clipboard ingress.

This is the sole ingress model for new AI artwork. The application does not
initiate image generation and does not require or offer a separate
"generated here" route. Because media upload precedes slot creation, the server
accepts a narrowly typed raw intake reservation, binds it to the current pane
and environment geometry, and then requires the processing slot to claim that
ready raw.

Existing historical reference-bound attempts remain valid retained history.
New Pipeline intake does not create them or expose their handoff controls.
Eligible retained Raw Pipeline Sources may still seed additional processing
slots without copying media.

## Consequences

- An owner with finished artwork can enter the Pipeline directly.
- Generation preparation and result processing remain independently useful.
- The server still rejects stale viewing panes, incompatible board geometry,
  altered content hashes, and invalid raw contracts.
- Exact pixels and current processing context remain auditable without
  inventing generation provenance.

## Verification

- Pipeline ingress has no Generation Reference selector or prerequisite copy.
- Invalid PNG input creates no raw version or slot.
- Confirmed input stores exact bytes before creating a source-agnostic intake
  slot whose raw input is immediately ready for grid fitting.
- The intake slot records current working-copy semantics and geometry but no
  Generation Reference fields.
