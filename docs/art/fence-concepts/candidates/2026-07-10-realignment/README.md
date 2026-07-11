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
- The noisy Blender stone kit is archived as rejected evidence and is not part of
  the active artwork cycle.
- PixelLab wood, Codex wood, and Codex stone keep their post pixels and anchor.
  The shared positive half-band vertex depth puts every post ahead of every rail
  incident at that vertex on every renderer.

The four-kit active review set must be judged on the durable editable Level Editor board;
standalone files and this document are supplementary evidence.
