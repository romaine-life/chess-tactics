# Fence realignment review batch

This batch responds to the live-board review of the 2026-07-10 candidates.

- The original PixelLab stone rail is owner-accepted and frozen byte-for-byte
  for a future bishop-passable fence. This batch never rewrites it.
- It is now one intentionally rail-only active kit. Both native PixelLab post
  trials were rejected and remain provenance evidence only; neither has a live
  review output.
- PixelLab object-generation attempts could not reach the board's 48×27 pitch.
  The active wood correction therefore follows ADR-0040: deterministic canonical
  rail geometry consumes the established PixelLab wood material at 1:1 texel
  density, without spatial resampling or code-authored RGB.
- Codex wood/stone were regenerated against an explicit geometry reference. Their
  board frames are corrected calibration previews and remain non-production
  because LANCZOS resampling settles their reviewed footprint.
- The noisy Blender stone kit is archived as rejected evidence. ADR-0299 now keeps
  that retained history out of every artwork chooser.
- PixelLab wood, Codex wood, and Codex stone keep their post pixels and anchor.
  This historical run used a positive half-band vertex depth; ADR-0298 replaced
  that policy with far-post, rail, near-post interleaving.

The four-kit set was the active review batch for this run. Its dated review route
is retired; this file and the immutable backend records are historical evidence,
not current chooser entries or supported review links.
