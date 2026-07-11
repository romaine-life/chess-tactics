---
status: accepted
date: 2026-07-10
deciders: owner (Nelson) + Codex
supersedes:
  - ADR-0039
  - ADR-0048
---

# ADR-0075: Tile assets are explicit layers, never combined sprite stems

## Context

ADR-0039 established the correct render model: a tile's walkable TOP and exposed SIDE
are independent layers. Its first migration phase nevertheless kept a flattened
`<family>-<variant>.png`, derived `-top` and `-side` siblings from it, and used the
flattened path as a registry stem and Studio preview. ADR-0048 repeated that convention
for animated water by deriving a top-sheet filename from the same stem.

That transitional representation outlived the transition. Runtime boards drew the split
files, while the registry, preview surfaces, generators, and a fallback still put the
combined art in front of callers. A caller could therefore select a whole cube when it
needed a top material, even though the renderer already treated those concepts as
different assets. Filename substitution also made side-only mural assets appear to have
virtual combined files that did not exist.

The repository also retained whole-tile Blender renders, rejected bake-off art, and a QA
viewer for a retired whole-tile PixelLab pipeline. Those paths no longer produced or
validated the production surface-swap tileset.

## Decision

Production terrain is stored, registered, built, previewed, and rendered as explicit
layers end to end.

- A base tile registry record owns a stable gameplay `id`, an explicit `topSrc`, an
  explicit `sideSrc`, and, when animated, an explicit `topAnimSrc` plus frame count.
- A side-only perimeter, mural, or story-feature record owns only `sideSrc`. It does not
  invent a basename or redundant top merely to satisfy a whole-tile type.
- Browser boards, Studio boards, Level Editor boards, and server thumbnails consume those
  registered paths directly. They do not derive layer filenames with string replacement.
- The surface builder writes `-top.png` and `-side.png` directly from generated top
  material plus a committed side-only source template. There is no combined production
  output, split pass, repair fallback, or combined catalog image.
- Rich-edge and mural builders write side assets only. Build-only masks and templates live
  with source art, outside the browser's public runtime tree.
- Water animation remains eight full 96x180 TOP frames in one generated horizontal sheet.
  Every frame copies the static top's alpha channel, frame 0 is byte-identical to the
  static top, and the static side never animates. The sheet is named explicitly by
  `topAnimSrc`; it is not derived from another path.
- The renderer advances only the water frame index. Cells receive a deterministic
  whole-frame phase from their board coordinates, so a water field does not pulse in
  unison. The explicit in-game `:root.reduce-motion` preference freezes frame 0; the OS
  reduced-motion media query does not freeze ambient board art. Canvas composition
  replaces ADR-0048's old DOM/CSS implementation detail without changing those behaviors.
- Studio previews show the relevant layer or compose registered layers at display time.
  A preview never requires a flattened production file.
- Committed whole top+side terrain sprites and the retired whole-tile QA/reference path are
  removed. The exact retired bytes are recoverable from the private tile-source archive;
  they are not kept runnable or browseable in the application.

This rule is about a logical 1x1 terrain tile. It does not reclassify intentionally
different asset types: a macrotile is one larger TOP image, a road/river is an independent
overlay, and a wall is a separately anchored board object.

Stable tile IDs do not change. Persisted boards therefore require no data rewrite. Surface
PNG paths were never database-backed content; the production database has no tile-art rows
to delete.

## Consequences

- Top-only art work can no longer accidentally receive a cube containing side pixels.
- Side selection remains independent without N-by-M baked sprite combinations.
- Registry types describe files that actually exist, including side-only assets.
- Rebuilding the surface tileset cannot silently recreate retired combined files.
- Catalogs lose obsolete whole-tile comparison art, while the production board, top
  previews, side inspector, and animated water remain directly inspectable.
- The migration carries a guard that rejects combined surface files, filename-derived
  layer paths, retired generators/routes, unregistered public surface files, malformed
  water sheets, and missing or overlapping base layers. It also requires every registered
  rich-edge, mural, and story-feature side file.
- Base top/side pairs use disjoint hard alpha. Side-only perimeter art may retain its
  approved translucent rubble shadow, but it remains outside the top-owned region.

## Archive and provenance

The retired art and runnable whole-tile source were archived before Git removal under the private
`chesstacticssrc/tile-sources` prefix recorded in
[`docs/art/tile-concepts/SOURCES.md`](../art/tile-concepts/SOURCES.md). The canonical
manifests cover all 207 removed PNGs and all 17 removed source files, recording the source
commit, Git object IDs, and byte lengths (plus per-file SHA-256 for PNGs). Fresh downloads
of all three archive pairs were verified against every entry before this migration proceeded.

## Related decisions

Supersedes ADR-0039 and ADR-0048. Retains ADR-0041's side-only continuity murals and story
features. Follows ADR-0040's geometry/material boundary and the repository migration policy.
