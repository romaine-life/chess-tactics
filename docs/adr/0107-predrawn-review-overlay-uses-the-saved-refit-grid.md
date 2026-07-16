---
status: "accepted"
date: 2026-07-13
deciders: Nelson, Codex
partially_supersedes: "[ADR-0106](0106-predrawn-refit-target-dimensions-are-owner-configurable.md)"
---

# ADR-0107: Pre-drawn review overlay uses the saved refit grid

## Context

ADR-0106 made the artwork refit target dimensions owner-configurable while
leaving the visible post-picker grid derived from the authored level. A saved
six-column target therefore transformed the art as six columns but showed five
grid columns after the picker closed. The control appeared to revert and the
owner could not review the fit they had just authored.

The canonical level must remain gameplay-authoritative, but that does not
require the temporary candidate-review overlay to hide the candidate's measured
grid topology.

## Decision

While a temporary pre-drawn candidate registration is active, every visible
review grid uses the registration's saved refit row and column counts. The same
target dimensions therefore govern the picker, saved guide arrays, artwork
homography, and the grid shown after **Done**.

The review grid is visual evidence only. Board data, playable cells, hit
targets, movement, collision, and saved level dimensions continue to use the
authored level. If a five-column level has a six-column candidate target, the
post-picker overlay displays all six review columns while interaction remains
limited to the five authored columns.

Without a candidate registration, ordinary grid rendering continues to use the
authored cells. Production acceptance still requires a native, correctly sized
plate and does not persist this review-only discrepancy.

## Consequences

- Closing the picker no longer appears to discard the selected target size.
- The owner can compare the complete measured candidate grid without changing
  gameplay geometry.
- Review-grid cells and interactive gameplay cells must remain separate data
  sets in rendering code.
