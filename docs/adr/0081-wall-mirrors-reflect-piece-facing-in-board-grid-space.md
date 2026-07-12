---
status: "superseded by ADR-0082"
date: 2026-07-11
deciders: Nelson, Codex
---

# ADR-0081: Wall mirrors reflect piece facing in board-grid space

> **Superseded by
> [ADR-0082](0082-wall-mirrors-are-exact-one-to-one-game-world-reflections.md)
> (2026-07-11).** ADR-0081's wall-specific facing and pre-flip sprite-selection rules
> remain. ADR-0082 replaces the inherited grid-depth FOV and subject-scale controls with
> exact one-to-one position and size, and requires taller mirror-bearing walls/apertures.

## Context and Problem Statement

ADR-0080 correctly reflects a piece's position along the supporting wall's board-grid
normal, but deliberately kept the physical piece's directional sprite and applied only a
horizontal raster flip. The live gallery exposed the contradiction: a west-facing knight
looked north-facing in both mirrors. A screen-horizontal flip exchanges the two projected
board axes, so it cannot by itself express either wall's semantic facing reflection.

Mirror orientation must answer to the same wall-specific board-grid transform as mirror
position while retaining a raster flip for the reflected image's chirality.

## Decision Drivers

- The reflected image must show the piece's semantic board-facing reflected across the
  actual supporting wall: west negates grid X; north negates grid Y.
- North and west mirrors must be allowed to select different directional sprites for the
  same physical piece.
- The final mirror composition must retain a horizontal raster flip so asymmetric pixels
  have mirror chirality rather than merely showing an ordinary authored view.
- The accepted eight-direction unit catalog must remain the source of directional art;
  this correction must not require a mirror camera or a second reverse-side sprite set.
- Facing must come from physical piece state, never from parsing a sprite URL or inferring
  orientation from raster pixels.
- One shared planner must serve gameplay, the level editor, Studio, read-only boards,
  previews, and client or server thumbnails.
- ADR-0080's corridor, position, grid-depth FOV, canonical projection, scale, aperture,
  clipping, subject scope, and multi-span composition rules must remain unchanged.

## Considered Options

- Keep the physical directional sprite and apply `flipX` for every wall (ADR-0080).
- Select the wall-reflected directional sprite and omit raster flipping.
- Reflect semantic facing per wall, select the pre-flip directional sprite whose mirrored
  raster has that facing, and retain one horizontal raster flip (chosen).
- Render a reverse-camera scene or author a separate mirror-only directional asset set.

## Decision Outcome

Chosen: **reflect the physical piece's facing vector in board-grid space per wall, then
select the accepted directional sprite whose horizontally flipped raster displays that
reflected facing.** Orientation and position now use the same wall normal, while the
raster flip continues to provide mirror chirality.

The implementation follows these rules:

1. **Facing is semantic board state.** Map the physical piece's eight-way facing to a
   board-grid vector `v = (vx, vy)` using north `(0, -1)`, east `(1, 0)`, south `(0, 1)`,
   west `(-1, 0)`, and the corresponding signed pairs for diagonal facings. The shared
   reflection subject must carry enough semantic unit identity, palette, and facing data
   to resolve another accepted directional sprite. An opaque already-selected raster is
   not sufficient input for orientation planning.

2. **Reflect facing across the supporting wall.** The desired reflected visual facing
   `t = (tx, ty)` is:

   ```text
   west wall at x = -0.5:  t = (-vx,  vy)
   north wall at y = -0.5: t = ( vx, -vy)
   ```

   This transform is independent of FOV, position, subject scale, aperture shape, and
   continuous movement. It changes only when the physical piece's facing or the mirror's
   wall face changes.

3. **Account for the final raster flip when choosing the asset.** Under the canonical
   isometric projection, a horizontal screen flip maps the visual board-facing vector
   `(a, b)` to `(b, a)`. That transform is its own inverse. Therefore the directional
   sprite chosen before the flip must have board-facing vector:

   ```text
   q = (ty, tx)
   ```

   Resolve the ordinary accepted unit sprite for `q`, then include exactly one horizontal
   raster reflection relative to that resolved asset in the mirror draw. Choosing the
   asset for `t` and flipping it would generally display the wrong facing; reusing the
   physical piece's source sprite blindly is the ADR-0080 defect this decision retires.

4. **The reported west-facing knight is a required regression case.** For physical
   facing west, `v = (-1, 0)`:

   | Mirror face | Desired visual `t` | Pre-flip sprite `q` | Flipped result |
   | --- | --- | --- | --- |
   | west | east `(1, 0)` | south `(0, 1)` | east |
   | north | west `(-1, 0)` | north `(0, -1)` | west |

   Tests must also cover cardinal and diagonal facings across both faces, proving that the
   final visual facing equals the wall-reflected vector rather than merely asserting a
   source URL or `flipX` flag.

5. **The shared draw plan owns orientation resolution.** Gameplay, the level editor,
   Studio, read-only boards, previews, and client or server thumbnails consume this same
   face-aware facing and sprite-selection result. A renderer may execute the planned
   raster flip, but may not independently remap directions, reuse the physical sprite as
   a fallback, or substitute a screen-facing convention.

6. **All other live-mirror rules remain unchanged.** Corridor admission still occurs
   before planning; reflected position and FOV remain board-grid wall-normal transforms
   followed by canonical projection; scale remains uniform; live physical pieces remain
   the only subjects; and generated material, aperture clipping, lens treatment, painter
   order, and continuous multi-span composition remain downstream presentation.

This decision supersedes ADR-0080. It replaces only ADR-0080's rule 5 and associated
prohibition on face-specific directional sprite selection. Every other ADR-0080 rule and
all inherited live-mirror requirements remain in force.

### Consequences

- Good: reflected location, motion, and visual facing now answer to one coherent
  wall-specific board-grid model.
- Good: north and west mirrors can show the correct different orientation for the same
  physical piece.
- Good: accepted eight-direction art and one raster flip provide both semantic facing and
  mirror chirality without a mirror camera or mirror-only asset family.
- Cost: reflection subjects and draw plans must retain semantic facing and sprite-resolver
  identity instead of carrying only an opaque physical draw operation.
- Cost: both wall faces and all eight facings require regression coverage.

## Pros and Cons of the Options

### Physical directional sprite plus `flipX`

- Good: requires no face-aware sprite lookup.
- Bad: a horizontal screen flip swaps the projected grid axes, so a west-facing piece can
  appear north-facing regardless of which wall contains the mirror.
- Bad: north and west incorrectly share one orientation transform.

### Reflected-facing sprite without raster flipping

- Good: the selected asset directly names the desired semantic facing.
- Bad: displays an ordinary authored directional view rather than horizontally mirrored
  raster chirality, which is visible on asymmetric pieces.

### Pre-flip directional sprite plus raster flipping

- Good: produces the exact wall-reflected semantic facing after compositing.
- Good: retains mirror chirality using the accepted eight-direction catalog.
- Bad: requires the planner to account explicitly for the canonical projection's
  screen-horizontal flip transform.

### Reverse-camera or mirror-only assets

- Good: could depict otherwise hidden surface detail with higher physical fidelity.
- Bad: creates a second art and rendering system beyond the fixed-camera piece-reflection
  scope and is unnecessary for correct current facing.

## More Information

- Superseded decision:
  [ADR-0080](0080-wall-mirrors-reflect-along-the-board-grid-wall-normal.md)
- Original physical facing intent:
  [ADR-0077](0077-wall-mirrors-are-live-piece-reflective-surfaces.md)
- Directional sprite authority:
  [ADR-0075](0075-unit-directions-are-blender-authored.md)
- Canonical projection contract: [Blender projection contract](../blender-projection-contract.md)
- Derived current-state contract: [Board render contract](../board-render-contract.md)
- Shared primitive rule:
  [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)
