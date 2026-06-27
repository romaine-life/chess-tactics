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
- **Pixel gate (second):** transparency hygiene only — a gross magenta keying
  fringe or background bleeding to the canvas edge (`verifyGlyph`). It does **not**
  require binary alpha; **anti-aliasing is allowed and expected**. It does not
  judge whether the drawing is any good — that's the method gate's and the
  eyeball's job.

The forge enforces method-then-pixels in `forgeOne` via `usedImageGenerator()`,
and records `method: "image-generator (verified)"` in
`src/ui/design/kitProvenance.json`. If you build any other codex-image pipeline,
do the same — gate the method first.

## "Gate PASS" never means "ship"

The gates are necessary but not sufficient. They certify *clean transparency*,
not *a good drawing*. Always eyeball generated assets before onboarding them, and
never replace known-good art with a batch of "30/30 PASS" output you haven't
looked at. The eyeball is the required backstop; do not automate it away.

## The gate is transparency hygiene, NOT a quality judge

`verifyGlyph` only fails on real mechanical transparency defects: a gross
magenta keying fringe (dozens of saturated-magenta px outlining the subject) or
opaque pixels bleeding to the canvas edge. It used to *also* demand binary alpha
(no semi-transparent pixels) — that was a bug, removed. Anti-aliased edges are
what make icons look clean; demanding hard alpha rejected the good originals and
pushed codex to hand-draw jagged icons in code to satisfy it. Don't reintroduce
a binary-alpha fail. Whether the art is *good* is decided by the method gate
(was it really generated) plus a human eyeball — never by this pixel check.

## The transparency path (decided — ADR-0013)

Transparency for generated chrome is produced by generating on a flat `#00ff00`
chroma-key background (built-in / subscription codex, method-verified) and keying
to alpha locally with `$CODEX_HOME/skills/.system/imagegen/scripts/remove_chroma_key.py`.

The native paid-API path (gpt-image-1.5 `background=transparent`) is **rejected on
cost** — the subscription's flagship model (gpt-image-2) deliberately dropped
native transparency, and pinning the older model requires the paid API. Chroma-key
+ despill is the community-standard way to get transparency from a gpt-image-2-class
model; it is the method here, not a placeholder.

Key color: `#00ff00` for steel/blue/gold chrome (no pure green in the palette);
`#ff00ff` if an asset's art uses green. **Always verify alpha** (corners
transparent, no holes/fringe) — a key-color collision must fail loudly, not ship.
The despilled, anti-aliased edge is fine; a sloppy removal that leaves a key
fringe is (correctly) caught. Full rationale and sources: ADR-0013.
