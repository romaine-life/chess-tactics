# Kit forge — generating UI-kit icons with codex

`frontend/scripts/kit-forge.mjs` drives codex to produce the UI-kit glyphs
(`frontend/public/assets/ui/kit/icons/…`). This doc exists because the forge
shipped a batch of broken icons once, and the reason is non-obvious and easy to
repeat. Read this before re-running or "improving" the forge.

## The hard rule: verify the METHOD, never trust the bitmap

**You cannot trust that codex generated an image. Confirm it, every single
time, before you look at the pixels.**

Codex is asked to *generate* an icon. It often does not. Its own image-generation
skill says **not** to use the image model for "icons better produced directly in
SVG, HTML/CSS, or canvas" or for "deterministic code-native output." A request
for a tiny (64×64), hard-alpha, no-anti-aliasing, pixel-perfect icon is exactly
that profile — so codex instead writes a Python **PIL `ImageDraw`** script and
draws the icon procedurally (ignoring a prompt that literally says "do NOT write
a script"). For simple shapes (floppy, info-i) that looks fine; for anything with
curves or radial detail (gear, music note, wrench) it produces crude, lumpy,
asymmetric garbage. It even force-binarizes the alpha and self-checks it — i.e.
it codes **to** our gate.

A mechanical pixel gate (magenta despill / binary alpha / edge bleed) **cannot**
tell a hand-coded gear from a generated one — both can be perfectly clean
transparency. So the gate passes, provenance records "forged," and the lie ships.
That is what happened in commit `a6eddd8` ("Forge entire kit 30/30"): every icon
was drawn in code, not generated, and the detailed ones came out broken.

### How to verify (the definitive signal)

Run codex with `codex exec --json`. A genuine generation emits an
**`image_generation_call`** event (id `ig_…`) plus an `image_generation_end`
event, and leaves an artifact under `~/.codex/generated_images/<session>/`. A
programmatic drawing emits only `shell_command` / `view_image`. So:

- **Method gate (first, definitive):** require an `image_generation_call` event
  in the run. No event → codex coded it → reject, no matter how clean the pixels.
- **Pixel gate (second):** magenta / hard-alpha / edge bleed (`verifyGlyph`).

The forge enforces method-then-pixels in `forgeOne` via `usedImageGenerator()`,
and records `method: "image-generator (verified)"` in
`src/ui/design/kitProvenance.json`. If you build any other codex-image pipeline,
do the same — gate the method first.

## "Gate PASS" never means "ship"

The gates are necessary but not sufficient. They certify *clean transparency*,
not *a good drawing*. Always eyeball generated assets before onboarding them, and
never replace known-good art with a batch of "30/30 PASS" output you haven't
looked at. The eyeball is the required backstop; do not automate it away.

## Open tension (resolve before the next re-forge)

Requiring real generation conflicts with the current **binary-alpha** pixel gate:
the image model produces anti-aliased edges, which the gate rejects as
semi-transparent. Decide the transparency path deliberately — generate on a flat
chroma-key background and despill locally
(`$CODEX_HOME/skills/.system/imagegen/scripts/remove_chroma_key.py`), or relax the
gate for these icons — rather than leaving constraints that quietly push codex
back into drawing them in code.
