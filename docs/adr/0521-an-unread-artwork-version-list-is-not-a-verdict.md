---
status: accepted
date: 2026-08-08
deciders: Nelson, Claude
refines:
  - "[ADR-0306](0306-browser-authentication-has-one-session-owner.md)"
  - "[ADR-0519](0519-an-expired-sign-in-pauses-the-level-editor.md)"
---

# ADR-0521: An unread artwork version list is not a verdict about the artwork

## Context and Problem Statement

A pre-drawn level's artwork disappeared out of an open Level Editor. The board went on claiming the
artwork was set — "Pre-drawn board · 6×6", terrain still suppressed — and painted nothing, so the
page backdrop showed through an empty board. It stayed that way until the page was reloaded.

Nothing was wrong with the artwork. The raster is `published`, its endpoint serves it without a
session, and it answered 200 with the whole PNG throughout.

What failed was the check that runs *before* the plate is allowed to mount. The editor lists the
document's background versions to prove the remembered selection is one exact, complete, current
artifact. That list is account-gated, and every failure of it landed in one `catch` that produced
`{ kind: 'error' }` — and the plate mounts only on `valid`.

Three properties turned a transient failure into a permanent blank board.

**It fails closed onto a state that cannot be distinguished from a bad selection.** `error` sat
beside `stale` and `unavailable`, which are real findings about the artwork. It is not one; it is
the absence of a finding.

**It never asked again.** The effect's inputs are the board's own environment geometry, the surface
key, and the document id. A lost backend and an expired cookie change none of them, so no retry
existed at all — not on reconnect, not on sign-in. ADR-0519's paused re-probe restores identity and
resumes autosave, and the artwork still did not come back.

**It required no logout.** Verified both ways against a real document: forcing the list to `401`
and forcing it to a plain transport failure produce the identical blank board with exactly one
attempt. A few seconds of backend restart under an open editor was enough.

## Decision Outcome

**A version list that could not be READ is a transport state that retries, never a verdict about
the artwork.** It gets its own kind, `unreachable`, separate from every settled finding.

- **`unreachable` is distinct from `error`.** `error` means the check could not be *attempted* —
  today, no editor document — and clears when its missing input arrives. `unreachable` means the
  check was attempted and the answer never came, so asking again is exactly the right move. Only
  `unreachable` retries; `stale`, `unavailable` and `missing` are answers, and spinning on them
  would hammer a server that will keep saying the same thing.
- **The 401 is classified by the session owner, not by this screen.** The catch calls
  ADR-0306's `reportAuthSessionFailure`, so a true 401 flips the shared identity and ADR-0519's
  pause raises the banner that names what happened. The screen records only whether it was
  signed-out, and reads that for its words.
- **Recovery rides the signals ADR-0519 already re-probes on** — `online`, focus, visibility, and
  the same 20s tick — plus the shared session snapshot, so a sign-in completed in another tab
  repaints the artwork without waiting for the tick. The sign-in retry is keyed on that snapshot
  ALONE and reads the check through a ref: keying it on the check's own state would re-fire on
  every retry it causes, which is an unbounded loop.
- **The failure announces itself.** Level Artwork is one panel out of eighteen and was the only
  place this state was ever reported; the owner hit it on the Unit layer and saw an empty board and
  no words. One status entry per failure — held across the `checking` a retry passes through, so a
  retry loop does not become a status-log loop.
- **The plate stays hidden while unreachable.** Fail-closed is about lineage and completeness, and
  an unread list is no evidence either way. What changes is that the state is temporary, named, and
  self-healing, not that unproven artwork may draw.

**"Unavailable" is the wrong word for a question that was never answered.** The panel says *AI
artwork could not be checked*, says the level still holds it, and says it retries — because the
previous copy read as a finding against the artwork, which is how a working level looked broken.

## Consequences

- The artwork check can now run many times over one page's life. It must stay free of side effects
  on the working copy; it reads, compares, and sets local state only.
- A backend that is down for a long time retries every 20s while the editor is open. That is the
  same cadence and the same conditions as ADR-0519's identity re-probe, and it stops as soon as one
  read succeeds.
- Anything new that keys off the selection check must handle `unreachable` explicitly. Falling into
  an `unavailable` branch would reintroduce exactly the wrong word.
- Verified against the real document that showed the defect: with the list forced to 401 and to a
  transport failure, the board blanks, announces itself, retries, and repaints the artwork when the
  list is allowed through — with no reload.
