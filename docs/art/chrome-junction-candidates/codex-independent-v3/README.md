# Codex independent v3

This candidate restarts the chrome generation with separate source lanes:

- `outer-atoms-alpha.png`: decorative atoms only. No rails.
- `outer-rails-alpha.png`: rail/chrome pieces only. No decorative atoms.
- `inner-atoms-alpha.png`: decorative atoms only. No rails.
- `inner-rails-alpha.png`: rail/chrome pieces only. No decorative atoms.

This folder is intentionally not registered as a baked kit yet. The next step is
to choose crops from the atom-only sheets and rail-only sheets separately, then
build a new extraction spec from those choices.

Do not assemble from source art where an atom already includes rail arms. If an
atom candidate visually reads as a frame corner with attached rail, skip it.
