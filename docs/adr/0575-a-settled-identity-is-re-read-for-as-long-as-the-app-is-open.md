---
status: accepted
date: 2026-08-11
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0306](0306-browser-authentication-has-one-session-owner.md)"
supersedes:
  - "[ADR-0519](0519-an-expired-sign-in-pauses-the-level-editor.md) — its bounded probe, and the
    reasoning that scoped re-reading to the paused state"
---

# ADR-0575: A settled identity is re-read for as long as the application is open

## Context and Problem Statement

[ADR-0306](0306-browser-authentication-has-one-session-owner.md) gave the browser one auth-session
owner and made a successful, contract-valid response the only authority for authenticated or
anonymous. It answered "who is this" correctly. It did not keep the answer true.

`start()` settles once and returns early forever after:

```ts
if (snapshot.status?.reachable) return Promise.resolve(snapshot.status);
```

After that the shared identity only ever changes when some account-gated call reports an
authoritative 401 into `reportAuthSessionFailure`, or when the Level Editor's paused state calls
`refresh()`. Nothing else asks again.

A session expires on a schedule the browser cannot observe. So a tab open past that moment goes on
presenting a signed-in account over a session that ended, and playing requires no session at all
([ADR-0060](0060-playing-never-requires-sign-in.md)) — so nothing contradicts the claim. The
account cluster shows the account. The editor believes it can save.

This is not hypothetical. It is how the defect recorded as F1 in
[`docs/auth-security-audit.md`](../auth-security-audit.md) stayed invisible for two weeks: sessions
were dying on the hour, and the only reliable way to find out was a backend restart, because a
restart forces a reload and a reload is the one thing that re-reads identity. The reboot looked
causal. It was only the messenger.

ADR-0519 met the same problem inside one screen and solved it there, deliberately: a bounded probe
on focus, visibility and a 20s tick, running *only* in the `signed-out` state, explicitly "so a
sign-in completed in another tab is noticed without polling identity in the general case." That
scoping was a reasonable trade at the time. The general case is precisely what turned out to need
it.

## Decision Drivers

- The shell must never present an identity it has not recently confirmed.
- Identity is application state, not screen state (ADR-0306). A second screen wanting freshness
  must not mean a second scheduler.
- A transport blip is not a sign-out, and must not knock a signed-in shell into `unavailable`.
- Background tabs must not multiply load on the identity provider for an answer nobody is reading.

## Considered Options

- **A. Keep settle-once; have each screen that cares schedule its own re-read.** What the codebase
  had grown: the Level Editor and the scene-failure recovery in `App.tsx` each hand-rolled the same
  focus/visibility/interval loop.
- **B. Poll identity on a fixed interval from the owner.**
- **C. The owner watches the application lifecycle and re-reads on a cadence that varies by phase.**
  **(chosen)**

## Decision Outcome

Chosen: **C — the owner re-reads for as long as the application is open, and how eagerly depends on
what it currently believes.**

- `watchAuthSession()` binds to the *application*, once, at bootstrap in `main.tsx` — next to
  `startAuthSession()`, for the same reason. Screens come and go; identity does not.
- `wake(minGapMs)` is the single throttled entry. One mechanism serves both callers: the lifecycle
  passes a short floor because someone returning to the tab wants an answer now, and the cadence
  tick passes `reprobeIntervalMs()`, so offering every few seconds costs nothing until the interval
  has genuinely elapsed. It resolves `null` when nothing was read, so a caller learns that rather
  than receiving a stale snapshot dressed as a fresh answer.
- **The cadence varies by phase, and that asymmetry is the point.** Signed out re-reads every 20
  seconds: someone is likely signing in right now, in this tab or another, and the cost of noticing
  late is a screen insisting a person is signed out over work that is not lost. Signed in re-reads
  every five minutes: nothing is waiting on the answer, so it is a liveness check, not a poll. B
  was rejected for having to pick one number for both.
- **Hidden documents are skipped.** A background tab has nobody to mislead.
- **`wake` never runs while the startup probe is still retrying.** `start()` owns an unbounded retry
  loop until it gets an authoritative answer; a second reader racing it adds nothing.
- **The Level Editor's scheduler is deleted, not left alongside.** Its single read on entering
  `signed-out` stays — that read self-heals a spurious 401 immediately, which is ADR-0519's own
  reasoning and still correct. Noticing the real sign-in is now the owner's job at the same 20s
  cadence. A bespoke parallel to a canonical primitive is a defect
  ([ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)); keeping both would be
  two clocks for one question.
- **The scene-failure recovery in `App.tsx` stays.** It looks like the same loop and is not: it
  re-reads every 3 seconds while a scene is in `error` because it is waiting to *retry the scene*,
  and it already calls the shared owner rather than probing itself. Folding it into the owner's
  cadence would slow scene recovery from 3 seconds to 20 for no gain.

### Consequences

- An expired session now shows as expired, everywhere, within five minutes at worst and on the next
  return to the tab in practice. This is the precondition for trusting anything else in the
  authentication rework — a fix whose failure mode is invisible cannot be verified.
- Every open, visible tab costs one identity read every five minutes. Today that is an HTTP call to
  `auth.romaine.life` (F8 in the audit); once the session store lands it is a local read.
- ADR-0519's probe is gone and its ADR is partially superseded. Its other three decisions — the
  `signed-out` cloud state, the `isInterruptedByCloudSignOut` guard, and addressing recovery by the
  document's owner rather than the live session — are untouched and still load-bearing. **The guard
  in particular remains the fix; removing it still restores the bug.**
- The owner takes an injectable clock so cadence and throttling are tested without fake timers or a
  DOM.

## More Information

- [`docs/auth-security-audit.md`](../auth-security-audit.md) — F2, and the staged plan this is
  stage 1 of.
- Guarded by `frontend/scripts/check-auth-session-owner.mjs`, which still fails the build on any
  second probe, retry, or identity cache.
