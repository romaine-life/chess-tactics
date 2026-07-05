# Advance Wars → Chess Tactics map importer

Turns an Advance Wars ROM's campaign maps into a chess-tactics campaign `Workspace`
(`{campaigns, levels}`). Deterministic; ROMs are NOT committed (kept in `roms/`).

## Regenerate the AW2 campaign workspace (dependency-free)
    node tools/aw-import/buildlevel.mjs "roms/1155 - Advance Wars 2 - Black Hole Rising (E) (M5).gba" out.json
Reads the ROM map table, translates terrain + the unit table + buildings through the
locked piece mapping, and labels each level from the bundled `hcmap.json`.

## Import path
`out.json` is a `Workspace` for the OFFICIAL tier. Ship it via the DB only:
`PUT /api/official-campaigns/default` with body `{ data: <merged officials incl. this> }`
(GET first and MERGE — the endpoint replaces the whole official tier). No dev-only fixtures
(enforced by frontend `scripts/check-no-dev-data-seam.mjs`).

## Re-derive mission labels (needs `npm i pngjs` + the WWN aw2hcm image pack)
    node tools/aw-import/matchassign.mjs <rom.gba>   # matches ROM maps -> HC mission #, writes hcmap.json

## Files
lz77 (GBA decompress) · extract (map table) · legend (terrain-id→type) · buildlevel (→Workspace)
· matchassign (mission labeling) · hcmap.json (offset→mission)
