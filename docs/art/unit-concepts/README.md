# Unit Concepts

## Identity Lock

The six production identities are pawn, rook, knight, bishop, queen, and king.

Direction:
- Normal chess piece first, squad unit second.
- Each unit keeps the classic chess silhouette readable before tactical ornament.
- Pawn uses a restrained helm shell and collar relationship, but should still read
  as a pawn first.
- Rook uses a square castle form with a wide top-platform gate as the facing cue.
- Knight uses leather tack/straps instead of gold trim.
- Bishop uses a mitre-like head and classic diagonal cut, without religious props.
- Queen uses a carved tiara crest, not jewelry or a coronet cup.
- King uses the classic small structural cross finial as a chess-piece cue.
- South-facing details sit on the front of the piece to make facing direction obvious.
- No face, arms, legs, weapon, or character body.
- No separate pedestal, plinth, trophy base, or oversized base ring as a design feature.
- Style target is pixel-tactics: Into the Breach / Advance Wars clarity with Chessmaster identity.

Open polish pass:
- Make the sprite more pixel-native and less glossy.
- Reduce ornament if it starts reading too royal, ceremonial, or character-like.
- Keep the facing mark readable without turning pieces into full character poses.

## Live Asset Contract

Board-unit candidates and accepted frames are uploaded through Unit Art. Postgres
owns metadata and accepted pointers; immutable PNG bytes live in the unit-assets
storage container. Authoring tools may create local review outputs, but they do not
write board sprites into `frontend/public`.

Every candidate requires six palettes and eight directions. Acceptance publishes
the complete asset atomically while the stable piece-family identity remains the
same.

## Orientation Contract

ADR-0075 separates new geometry from resizing accepted art. A new unit starts
from one calibrated Blender model under a fixed camera at eight exact 45-degree
facings. A scale-only calibration starts from the accepted 6-palette x 8-direction
sprite set so its approved styling and orientation cannot drift. ADR-0076
supersedes ADR-0075 only where it allowed that spatially resampled calibration to
be accepted as production art.

The canonical entry point is below.

```powershell
python scripts/generate-unit-art.py render pawn --target 51x61
python scripts/generate-unit-art.py verify pawn --target 51x61
```

For several genuinely new pieces, pass the Unit Studio handoff JSON to `render
all --handoff <file>`. The command writes eight exact Blender frames and
`render.json` beneath `.unit-art-output/unit-art/<piece>/<WIDTH>x<HEIGHT>/`.

For an accepted-art size revision, set the size in Unit Studio and open Unit Art's
**Recapture** tab. **Recapture accepted** samples every approved palette and
direction with an aspect-preserving, premultiplied-alpha area reduction, previews
the calibration PNGs live, and **Create candidate** uploads them as explicitly
non-production evidence. A square accepted source is contained within the delivery canvas;
for example, `512x512 -> 51x61` means a smooth `51x51` image centered in a
transparent `51x61` frame, not a nonuniform stretch. Provenance records the
accepted source asset, source, contained, and delivery dimensions, and the fact
that spatial resampling occurred. The result is deliberately called downscaled,
never pixel-authored or native-generated, and it cannot be accepted. The reviewed
dimensions become the target for a fresh Blender render; only that native output,
with no spatial resampling and a passing live-board review, is acceptance-eligible.

Direct image generation, whole-sheet restyling/slicing, and the old south-concept
fan-out are retired for board units. Downscaling is allowed only as this explicit,
deterministic calibration recapture of an accepted complete asset, never as the
final production raster. Local authoring output must not be written under
`frontend/public`.

## Historical Archive

The pre-cleanup candidate library and retired generator tools are stored privately
in the `unit-art-archive` container:

- `git/2026-07-10/57b85436/git-unit-art-pre-cleanup.zip`
- `git/2026-07-10/57b85436/git-unit-art-pre-cleanup.manifest.json`
- `git/2026-07-10/57b85436/git-unit-art-pixelover-addendum.zip`
- `git/2026-07-10/57b85436/git-unit-art-pixelover-addendum.manifest.json`
- `database/2026-07-10T16-45-08-591Z-unused-unit-assets-226ab98073a3.json`
- `database/2026-07-11T02-27-12-438Z-unused-unit-assets-7524126b3016.json`

The Git manifest records every original path, Git object id, byte length, and
whether the file was removed, retained, or moved into the canonical source tree.
The database manifest contains the eight retired asset rows, 384 sprite mappings,
and their audit events. Immutable sprite blobs remain in the runtime storage
container. The later targeted manifest contains the five obsolete Codex Sheet
restyle candidates removed after the accepted-sprite recapture cutover: bishop,
king, knight, pawn, and queen. It records 240 sprite mappings and 245 audit events;
its SHA-256 is `7524126b3016401a24ab4fa36a81df4bbf4259f1df4bd76179528bf82a5cc4c1`.
