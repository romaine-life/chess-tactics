---
status: accepted
date: 2026-08-11
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0421](0421-a-preparing-scene-has-no-permission-to-perform.md)"
  - "[ADR-0369](0369-one-cold-load-ladder-builds-background-then-chrome-then-scene.md)"
  - "[ADR-0307](0307-every-replaceable-region-is-a-director-owned-scene-slot.md)"
---

# ADR-0572: A visible scene accepts the click that lands on it

## Context and Problem Statement

`SceneBoundary` made the destination `inert` and `aria-hidden` for the whole of `preparing`, and
`.scene-boundary.is-preparing` silenced its pointer. `preparing` spans `startup`, `loading`,
**`entering`** and `error` — so the gate stayed shut through the entire entrance, which is the one
part of preparation the player is looking at.

Measured on the live Level Editor route, cold, four runs:

| | observed |
| --- | --- |
| Save carries its final label, scene still unreachable | 1.4–1.9 s |
| …of which the scene is **visible** (opacity > 2%) | 250–320 ms |
| …of which the scene is **fully opaque** | up to ~120 ms |
| maximum opacity reached while unreachable | **1.000** |

The first row is harmless: it is spent at opacity 0, behind the ladder's curtain, where nothing is
advertised to anyone. The last row is the defect. The entrance fade is 350 ms
(`--ds-duration-fade`), and `entrance-finished` is dispatched from the browser's `transitionend`
and then waits on a React commit — so the destination finishes painting, sits there at full
opacity looking completely finished, and still swallows every press.

Nothing distinguished the last dead frame from the first live one. A press on the Level Editor's
**Publish to all players** in that window produced no confirm dialog, no status-log entry and no
request; the author's only available reading was that the application had silently refused to
publish. A synthetic `el.click()` at the same instant opened the dialog, because dispatched events
ignore `inert` — which is what identified the gate rather than an overlay.

ADR-0369 §5 had already settled the governing pairing, in the other direction: `reveal-pending` is
*"inert as well as invisible"*, because a `z-index: 10000` element at `opacity: 0` still takes
clicks. The entrance was the one place the pair came apart — inert **and seen**.

The two repairs that suggest themselves are both wrong. Dropping `inert` from the entrance outright
would also hand an entering scene functional permission, which ADR-0421 exists to deny. Making every
control paint a not-yet-live state until commit would put a ~300 ms label flicker on the primary
action at the end of every navigation, app-wide — and would still lose the press.

## Decision

- **Reachability tracks visibility, not commit.** A scene that is hidden must not take a click; a
  scene the player can see must. `SceneBoundary` gates `inert`/`aria-hidden` on
  `preparing && !revealing`, so the DOM gate lifts when the entrance *begins* rather than one commit
  after it ends. The host-preserving region gate lifts on the same signal.
- **The pointer silence lifts with it.** The `pointer-events: none` carried by `.is-preparing` and
  by each `.is-region-preparing` descendant level is scoped under
  `.scene-director:not(.is-entering)`. It is withdrawn rather than overridden with
  `pointer-events: auto`: an `auto` override would blanket-revive decorative layers that declare
  their own `none`, handing them 350 ms of click-stealing on every navigation. Withdrawing the rule
  leaves every child the value it actually declared, and preserves the reason each descendant level
  is named at all — a child that opts back into the pointer is not bound by an ancestor's silence.
- **This grants no permission to perform.** ADR-0421 is untouched and is still the authority over
  functional time, motion, entered actions and gameplay mutation. `SceneActivity`,
  `useSceneActivation()` and `useSceneReveal()` keep their existing meanings, and activation still
  becomes true only at commit. The DOM gate and the activation gate are now distinct facts about a
  scene rather than one fact expressed twice.
- **A screen that must refuse early input declares it.** This is already how the app is built:
  `Skirmish` gates the board's `interactive` and its clock on `useSceneActivation()`, and
  `TitleBarSlot`/`TitleBarControls` gate contributions on it. ADR-0307's requirement that Battle
  clocks and input begin only after commit is therefore carried by the screens that hold those
  clocks, not by a blanket attribute on every route. A new screen that needs the same guarantee
  states it the same way.
- The outgoing side is unchanged. A scene being replaced is `deactivating`, stays inert, and keeps
  `.scene-director.is-exiting`'s pointer silence: it is leaving, and a press on it belongs to
  nothing.

## Consequences

- The visible-and-unreachable window is **zero**. Verified on the live route across three cold
  loads: maximum opacity reached while unreachable is `0.000`, and a real `page.mouse.click` fired
  during `entering` now dispatches inside the scene where it previously dispatched to an element
  behind it.
- Nothing changes visually. No control gains a loading state, no label flickers, and the entrance
  choreography is byte-for-byte the same — only the moment the screen starts answering moves.
- `unreachable` and `preparing` are no longer synonyms in `SceneBoundary`. Code that wants "the
  player cannot see this yet" reads the former; code that wants "this may not act yet" reads
  `useSceneActivation()`.
- A screen that silently relied on the boundary's `inert` to refuse input for the last 350 ms of its
  entrance no longer gets that for free. `Skirmish` is the only screen in-tree with a real stake and
  it already declares its own gate; a future one must do the same, which is the point.

## More Information

- [ADR-0421](0421-a-preparing-scene-has-no-permission-to-perform.md) — what a preparing scene may
  still not do, unchanged by this.
- [ADR-0369](0369-one-cold-load-ladder-builds-background-then-chrome-then-scene.md) §5 — the
  inert-as-well-as-invisible pairing this restores.
- [ADR-0558](0558-a-scene-being-replaced-is-not-rebuilt-on-its-way-out.md) — the outgoing side.
