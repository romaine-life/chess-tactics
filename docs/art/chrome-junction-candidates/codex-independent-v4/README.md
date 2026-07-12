# Codex independent v4 rails

This folder adds rail-only sources for both rail contracts:

- `outer-rails-repeatable-alpha.png`: outer rail tile candidates intended to
  repeat. These still need edge-match validation before extraction.
- `outer-rails-long-alpha.png`: outer long-authored rail sources intended to be
  used as whole rails and clipped/masked under independent atoms.
- `inner-rails-repeatable-alpha.png`: inner rail tile candidates intended to
  repeat. These still need edge-match validation before extraction.
- `inner-rails-long-alpha.png`: inner long-authored rail sources intended to be
  used as whole rails and clipped/masked under independent atoms.

Rules:

- These are rail-only sources. Do not use a rail source that contains atoms,
  plaques, corner caps, cover plates, or decorative junction overlays.
- A repeatable rail must be explicitly validated as seamless. Do not crop a
  random strip out of authored rail art and treat it as repeat-safe.
- A long-authored rail is not a repeat source. It is used as a whole piece and
  hidden beneath independent atoms or cover plates at its ends/intersections.
- No v4 assets are registered or baked yet.
