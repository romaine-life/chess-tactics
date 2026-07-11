# Fence Art Sources

Fence rails and their vertex posts follow ADR-0040: deterministic code owns
the exact isometric footprint and fence-graph topology, while generated/source art
owns every visible material pixel.

## Production Status

**Calibration bridge — not accepted production art under
[ADR-0076](../../adr/0076-scaling-is-calibration-production-art-is-native-1x.md).**
This pass satisfies ADR-0040's pixel-provenance split, but its production bake
spatially resamples the art: wood/stone material sources are resized to `48×48`,
the generated wood-post subject is reduced from `418×1173` to `10×28`, and the
stone-post subject from `590×808` to `18×24`. Serving the resulting `96×180`
frames 1:1 does not make those visible subjects native-generated.

The current runtime assets remain calibration evidence. They are deliberately absent
from the Studio and Level Editor artwork-review catalog because their procedural read
is not useful as a candidate. Their visible footprints and anchors can still inform a
native-pixel regeneration brief; they must not be described as final or accepted until
that pass removes spatial resizing and a family-specific native-size gate passes.

## Active Bake

- Run record: `docs/art/fence-concepts/runs/fence-art-runs-2026-07-10.json`
- Contact sheet: `docs/art/fence-concepts/fence-bake-contact-sheet.png`
- Runtime proofs: `docs/art/fence-concepts/proofs/fence-<material>-runtime-proof.png`
- Live editor proof: `docs/art/fence-concepts/proofs/fence-editor-runtime-proof.png`
- Bake script: `frontend/scripts/build-fence-tiles.py`
- Command:

```powershell
python frontend/scripts/build-fence-tiles.py
```

## Native candidate bake-off

The initial three-lane native replacement exploration is archived at
`docs/art/fence-concepts/candidates/2026-07-10/`, with the run record at
`docs/art/fence-concepts/runs/fence-native-candidates-2026-07-10.json`.

- Blender stone rails and terminal post render directly at `96x180`, but the
  owner rejected their noisy photoscan/shader appearance.
- The PixelLab stone rail pixels are owner-accepted and hash-frozen unchanged
  for a future bishop-passable fence. They do not claim the standard board-edge
  projection and are not promoted into the current live fence family.
- The original PixelLab stone post was rejected as visually oversized. The
  remaining first-pass PixelLab subjects stay archived as footprint/projection
  evidence rather than being resized into production.
- Codex wood/stone kit sheets are labeled high-resolution calibration references
  and cannot be promoted until their selected designs are regenerated natively.

The active correction batch is at
`docs/art/fence-concepts/candidates/2026-07-10-realignment/`.

- PixelLab stone is one owner-accepted, byte-frozen rail-only kit for the future
  bishop-passable fence. Both generated post trials were rejected; this kit
  intentionally emits no post artwork.
- PixelLab wood now follows ADR-0040's canonical path: deterministic 48×27 rail
  geometry consumes the existing PixelLab wood material at 1:1 texel density.
  There is no spatial resampling or code-authored RGB in that candidate.
- Codex wood/stone were regenerated against an explicit projection reference.
  Their corrected board frames use LANCZOS only as disclosed calibration previews
  and remain non-production under ADR-0076.
- The projection guard measures the shown PNG pixels; canvas dimensions and alpha
  bounds alone can no longer be mistaken for board alignment.

None of these candidates replaces the runtime calibration bridge in this pass.
The four active candidate sets are selectable in the real editable Level Editor board at
`/editor/level?document=5d04d83f-474e-4d76-a49e-094bbe26ec0d&levelId=l6&from=studio&layer=fence&kind=fence&artReview=fence-native-candidates-2026-07-10&fenceArt=pixellab-stone-rail-r2`.
That route opens a pre-drawn, account-private durable working copy served from
the editor-document database. The normal Fence controls draw rails on any board edge and, for
the three post-bearing kits, posts on any board vertex; cycling the artwork kit restyles the same geometry without changing
its placement, collision, or saved wood/stone representation. Artwork-kit ids
remain review-route state and do not enter gameplay data. This interactive
mounting does not alter any lane's production status.
The Studio gallery at `/studio?mode=catalog&cat=fences` and the contact sheet are
supplementary evidence.

The retained PixelLab/Codex wood posts and Codex stone post keep their exact pixels
and y=68 contact anchor. Their shared renderer z is the vertex contact depth plus
half a band, placing each post in front of every rail incident at that vertex so
the rail sprite's terminal upright cannot paint through it. This numeric rule is
shared by gameplay, the editor canvas, review substitution, and board thumbnails.

### Review-catalog removal

On 2026-07-10 the owner removed the procedural `live-wood` and `live-stone`
artwork-kit ids from the Studio catalog, Level Editor review selector/cycle, and
addressable review registry. The underlying twelve PNGs are not retired yet: normal
gameplay, the ordinary editor material palette, and board-thumbnail rendering still
resolve persisted `wood | stone` fence data directly to those files. Deleting or moving
them now would leave collision data present while making existing fences invisible.

Full retirement therefore waits for owner-accepted standard-edge wood and stone
replacement kits and then removes the old runtime assets and generator path end to end.
The accepted PixelLab stone rail is not that replacement; it is frozen for a future
bishop-passable fence family. A storage backup would not change this runtime dependency
and must not be mislabeled as retirement.

### Material lanes

- `wood` — PixelLab-generated palisade material from
  `docs/art/wall-concepts/materials/pixellab/wood-palisade.png`.
- `stone` — sourced photoscan material from
  `docs/art/wall-concepts/materials/source/stone-photoscan.png`.

The script reduces and projects these art sources through alpha-only rail masks.
It may decide the silhouette, repetition, orientation shade, placement, and seam;
it does not contain a wood or stone RGB palette.

### Generated post lanes

- `wood` — generated oak post with an iron band and pyramidal cap:
  `docs/art/fence-concepts/endings/codex/wood-terminal-{raw,alpha}.png`.
- `stone` — generated fieldstone pier with a capstone:
  `docs/art/fence-concepts/endings/codex/stone-terminal-{raw,alpha}.png`.

Both were produced with the built-in image generator on a flat green chroma
plate. The installed image-generation chroma helper removed the plate; the bake
then crops, low-fi reduces, hardens alpha, and seats the generated pixels without
redrawing them.

## Runtime Contract

- Rail frames: `fence-<material>-{2,4,6}.png`
- Post frame: `fence-<material>-post.png`
- Catalog previews: `fence-<material>-thumb.png` and
  `fence-<material>-post-thumb.png`
- Runtime bridge frame: `96x180`, contact anchor `(48,68)`; the frame is drawn
  1:1, but its resampled visible subjects are not ADR-0076-native
- Rail geometry: E/SE bit `2`, S/SW bit `4`, combined corner bit `6`
- Authored-post key: logical grid vertex `"vx,vy"`

`resolveFencePosts` counts how many unique fence segments touch each geometric
grid vertex. A generated post is drawn automatically when that degree is exactly one.
Two-segment continuations/corners, T joins, crossings, and closed loops therefore
remain uncapped unless the author paints a post at that vertex. Manual posts may
also stand alone, and an explicit post replaces the automatic one at the same
vertex without double-rendering. North/west boundary rails participate through
their off-board phantom owners, so their shared corners use the same rule.

The renderer draws the rails first and then seats each post at its resolved
vertex. The post sprite is direction-neutral; its underlying rail communicates
the attachment direction.

In the Level Editor's Fence panel, **Rails** targets the nearest diamond edge and
**Posts** targets the nearest diamond vertex. Both use the current wood/stone
material. Erase/right-click removes only the authored primitive under that mode;
erasing a manual post at a one-rail endpoint reveals the derived automatic post.

The live editor proof shows a standalone wood post plus a stone rail whose near
automatic endpoint has been explicitly overridden with wood. The green ring is
the editor's live hovered-vertex guide, not fence art.

## Replacement Note

The previous bake used Pillow `ImageDraw` with hard-coded wood and stone RGB
palettes. It produced code-drawn placeholder PNGs and had no endpoint topology.
This bake replaces that path in place: there is no legacy palette, fallback
renderer, SVG redraw, or alternate procedural art path left runnable.
