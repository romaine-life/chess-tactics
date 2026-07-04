---
status: "accepted"
date: 2026-07-01
deciders: Nelson, Claude
---

# ADR-0050: Game modes are authored win rules + a placement axis; saves gate on playability

The first gameplay-rules ADR (ADR-0038 covers content tiers; the rest govern UI chrome).
Builds on the level schema of [ADR-0038](0038-campaigns-are-tiered-game-content.md) and
the Level Editor save loop (`docs/level-editor-save-and-officials-inline.md` — this ADR
updates it: editor saves now author `layers.zones` instead of writing `[]`).

## Context and Problem Statement

The game had four implemented win conditions (`ObjectiveType`: `capture-all`,
`capture-king`, `survive`, `reach` — `core/objectives.ts`) but **no way to author them**
(no UI selects an objective; new levels silently default to `capture-all`), **no
gameplay validation** (a level with zero pieces, or a `capture-king` level without an
enemy king — an instant win — saved and published without complaint), and a **blanket
4×16 / 4×20 board clamp** that existed only as an arbitrary schema guardrail (no
technical floor; the owner never requested 4×4).

Separately, the zone system (`ZoneType`: `player-spawn`/`enemy-spawn`/`enemy-threat`/
`objective`/`falling-rock`) survived the legacy→React port as schema only: the legacy
app.js editor could paint zones and required spawn zones sized to the party, but that
authoring UI was deleted un-ported (commit 8b438a50), the current editor hard-codes
`zones: []` on save, and **no game code ever consumed spawn zones for placement in any
era** — random placement always used hard-coded back ranks (`game/setup.ts`).

The owner's direction (2026-07-01): the board minimum depends on the **game mode**;
modes are *last man standing*, *king assault*, *rival kings*, *survive*, *reach*, with
**random placement as an orthogonal toggle** on any of them (roster + placement zones);
the editor must give **freedom to mess the board up, but block saving** rule-violating
levels with **clear violations**.

## Decision Drivers

- Owner-specified mode semantics and the freedom-to-edit / gated-save principle.
- Zero data migration: persisted `objective` ids exist in the live DB (user workspaces +
  official campaigns); a rename would force either a prod data migration or a load-time
  compat shim (prohibited by `docs/migration-policy.md`).
- One vocabulary: the shipped `survive`/`reach` objectives stay first-class modes
  (official campaign levels already use them).
- The whole-workspace PUT must keep working for workspaces containing legacy levels.

## Decision Outcome

### Vocabulary: mode ids are the existing objective ids; owner names are labels

`ObjectiveType` (the **win-rule mode**) gains one value and keeps the rest:

```ts
export type ObjectiveType = 'capture-all' | 'capture-king' | 'rival-kings' | 'survive' | 'reach';
```

Display names (single source of truth in `core/objectives.ts`; every UI label map that
duplicated objective strings is deleted in favor of these):

| id             | name (`MODE_NAME`)  | win rule                                                                  |
| -------------- | ------------------- | ------------------------------------------------------------------------- |
| `capture-all`  | Last Man Standing   | wipe the other side (core last-side-standing already enforces this)       |
| `capture-king` | King Assault        | exactly ONE side fields a King; that side loses the moment it falls; the kingless side loses by wipe |
| `rival-kings`  | Rival Kings         | both sides field one King; first King captured decides (capture, not checkmate — check is still unimplemented, per `docs/game-concept.md`) |
| `survive`      | Survive             | player outlasts `surviveTurns` player-turns (NEW schema field, default 8) |
| `reach`        | Reach               | a living player piece reaches an `objective` zone tile (back-rank default when unauthored) |

Stored ids stay untouched **deliberately**: `capture-all` ≡ Last Man Standing and
`capture-king` ≡ King Assault semantically; renaming ids buys nothing but a data
migration. Ids are implementation detail; players only ever see `MODE_NAME`.

`capture-king` becomes **direction-aware**: either side may hold the King.
`ObjectiveContext` gains `kingSide: 'player' | 'enemy'`, computed at game start from the
initial pieces (`kingSideOf(pieces)` — a free skirmish stays `enemy`, as today). HUD /
result copy derives from `kingSide` ("Capture the enemy King" vs "Protect your King").

### Placement axis: `placement: 'fixed' | 'random'` toggle on any mode

New optional Level fields (absent ⇒ `fixed`, so every existing body stays valid — same
back-compat pattern as `boardCode` / `layers.props`):

```ts
placement?: 'fixed' | 'random';
roster?: { player: Roster; enemy: Roster };   // Roster = Partial<Record<PieceType, number>>
surviveTurns?: number;                         // survive mode; default DEFAULT_SURVIVE_TURNS (8)
```

- **fixed** (default): `layers.units` are exact authored positions — today's behavior.
- **random**: `layers.units` must be **empty**; the author instead defines a **roster**
  (piece counts per side; playable piece types only — no rocks) and paints **placement
  zones** using the *existing* `player-spawn` / `enemy-spawn` zone types (multiple zones
  of a type pool their tiles). At game start `createFromLevel` places each side's roster
  on seeded-random free cells of its own spawn pool (`startY` = the spawn row, matching
  free-skirmish pawn behavior). Restart reshuffles (new seed), which is the point.

This finally gives the schema's spawn-zone vocabulary a consumer. `enemy-threat` and
`falling-rock` remain unconsumed (out of scope, unchanged). The free-skirmish path in
`setup.ts` is untouched (it is conceptually King Assault + random placement, but
unifying it is deliberately deferred — no UI selects free-skirmish parameters yet).

### Board floor drops to 1×1; playability rules are the real gate

`BOARD_COLS = { min: 1, max: 16 }`, `BOARD_ROWS = { min: 1, max: 20 }` (backend
`validateWorkspaceLevel` mirrors). The old 4×4 floor was never load-bearing. What
actually makes a board saveable is the new **playability validation**:

`validatePlayability(level)` in `core/playability.ts` returns a list of
`{ code, message }` violations (plain-language, e.g. "Enemy side needs at least one
piece", "Player placement zone needs 2 more usable tiles"). Rules:

- **P1 — presence**: each side fields ≥ 1 piece (from `layers.units` when fixed, from
  `roster` when random).
- **P2 — kings**: `capture-king` ⇒ exactly one side has exactly one King (either side);
  `rival-kings` ⇒ each side exactly one King; other modes have no King constraint.
- **P3 — random placement**: `layers.units` empty; each side has ≥ 1 spawn zone whose
  pooled **usable** tiles (in-bounds, passable terrain, not under a blocking-prop
  footprint, deduped) count ≥ that side's roster size; player and enemy spawn pools
  must not overlap.
- **P4 — survive**: `surviveTurns`, when present, is an integer ≥ 1.

Everything else (shapes, enums, bounds) stays structural (`validateLevel` +
`validateWorkspaceLevel`, both extended for the new fields and for zone tile bounds).

### Enforcement: the editor gates saves per level; the backend stays structural

The Level Editor validates live while editing — the user can freely produce a broken
board; violations render as a plain-language list and **Save is disabled while any
exist**. (The list first shipped as an always-visible rail fixture; the owner demoted
it on 2026-07-02 — a blank board starts violating, so it permanently crowded every
layer. It now renders in the Status layer beside the Save it gates. The title-bar
save-state chip was removed the same day: no ambient editor status rides global
chrome — the author discovers the state when they come to save.) The backend deliberately does **NOT** enforce playability: the
workspace PUT carries *all* levels, so a legacy unplayable level would brick saving
every other level. The trust boundary for playability is the editor's per-level gate;
the backend keeps enforcing structure/enums/bounds. (Known gap, accepted: a hand-crafted
API call can persist an unplayable level; it still loads and merely plays out as its
rules dictate.)

Editor saves now write real `layers.zones` (the `zones: []` hard-code in
`levelBoard.ts` dies); `boardCode` grows a zones channel so zones round-trip losslessly
(old codes without the channel decode to no zones — no shipped content has zones, so no
preservation shim is needed).

## Considered Options

- **Rename stored ids to the owner's mode names** (`last-man-standing`, …). Rejected:
  forces a prod DB migration or a permanent load-time alias layer
  (`docs/migration-policy.md` prohibits compat layers) for zero player-visible gain.
- **Modes as a mutually-exclusive list including "random placement"**. Rejected by the
  owner: placement is orthogonal ("no reason to make the axes mutually exclusive —
  a toggle on any mode").
- **Random placement scatters the author's painted units**. Rejected by the owner in
  favor of a roster config (counts per piece type, no painted units).
- **Backend mirrors playability rules**. Rejected (for now): whole-workspace PUT +
  legacy levels means one broken level would block all saves; duplicating the rule set
  in the backend's hand-written validator also invites drift (props already drifted).
- **Keep a hard 4×4 (or 2-cell) stepper floor**. Rejected: arbitrary; P1–P3 make
  degenerate boards unsavable anyway, and tiny boards (1×2) are legitimate for several
  modes.

## Consequences

- A fresh blank level is now **unsavable until it satisfies its mode** (it has no
  pieces). This is the owner's explicit intent: freedom to mess up, gated save.
- Official/demo content must satisfy playability when re-edited (verify at
  implementation time; fix content if any level violates).
- `LevelInfoCompact`'s zone counts become meaningful; the campaign-editor "Edit
  objective" contract item is satisfied by the Level Editor's mode picker (the campaign
  editor stays display-only for now).
- `DEFAULT_SURVIVE_TURNS` stops being the only knob: `surviveTurns` is authorable.
- The permanently-disabled editor "Test" button's premise ("Validation arrives once…")
  is obsolete — validation is here; wiring Test-Play enablement to zero-violations is
  fair game for the editor implementation.
