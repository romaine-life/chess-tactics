---
status: accepted
date: 2026-08-09
deciders: Nelson, Claude
refines:
  - "[ADR-0205](0205-navigation-loads-atomic-scenes-through-one-director.md)"
  - "[ADR-0306](0306-browser-authentication-has-one-session-owner.md)"
  - "[ADR-0519](0519-an-expired-sign-in-pauses-the-level-editor.md)"
  - "[ADR-0102](0102-runtime-buttons-use-registered-inner-chrome.md)"
---

# ADR-0548: A failed scene offers the one act that can fix it, and retries itself when the world changes

## Context and Problem Statement

Restart the dev server while a page that needs an account is open and the game lands on **This
scene could not be loaded / Required scene data or artwork could not be reached / Retry**, and
stays there. Nelson reported it as the default outcome of an ordinary backend restart.

Three separate defects made that screen a dead end, and each one alone was enough.

**Retry did nothing.** `retry` moves the director from `error` back to `loading` and bumps the
generation, but the mounted layer's React key is its scene identity, so the screen that failed is
never rebuilt. A failure is normally held in that screen's own state — the Level Editor's resolved
document error is the canonical case — and a resolve effect that has already run does not run again
because the phase moved. The participant re-reported the error it was still holding and the director
failed straight back. Verified live: the button advanced the generation 1 → 2 → 3 and never once
reloaded the page. **The only action on the screen had never worked.**

**Nothing was watching for the world to fix itself.** The backend comes back seconds later, usually
with the session cookie still valid, and the screen had no way to notice. Recovering from a restart
meant knowing to reload the browser.

**A signed-out failure offered no way in.** The Level Editor already distinguishes "sign in to open
this editor document" and renders a Sign in beside the board — but a failed participant hides the
whole scene boundary, so that button is inert and invisible underneath the director's own failure
screen. What the owner sees offers Retry, which for a missing session can never succeed. The 403/404
branch was worse: its copy says *"Sign in with the account that owns this working copy"* and it
rendered no button at all.

The Retry button was also unregistered chrome — a bespoke `border-image` rule carried in the
UI-surface debt baseline, which is why the ADR-0102 gate never flagged it.

## Decision Outcome

**A failed scene names the act that can fix it, and takes that act itself when it can.**

- **Retrying REBUILDS the screen that failed.** `SceneState.retryEpoch` advances only on `retry`
  and the mounted layer key carries it, so a retry destroys and recreates the failed screen and its
  resolve runs again. Generation cannot serve: it advances on every navigation, and remounting on
  that would destroy every just-committed screen and its store — the exact thing the layer key was
  shaped to prevent. **This is what makes Retry work at all**; the recovery below is built on it.
- **The remedy travels on the error, not in its wording.** `sceneFailureError(message, remedy)`
  tags `sign-in` or `retry`; the Level Editor tags what it already knows. A screen that declared
  `sign-in` offers Sign in ALONE, because ADR-0519's rule holds here too — re-reading a document
  this account may not have cannot start succeeding however often it is pressed.
- **Otherwise the session owner decides, and only "signed out" changes anything.** An untagged
  failure under an authoritatively signed-out session offers Sign in **beside** Retry, never
  instead of it: being signed out does not prove the sign-out is what broke the screen, and playing
  never requires an account (ADR-0060). Sign in leaves through the app's one entry with the failing
  address as `returnTo`, so the round trip lands back on the exact screen.
- **The failure re-reads the session owner while it is on screen** — a 3s beat plus focus,
  visibility and `online` — and retries itself when the answer is MATERIALLY better than the one it
  failed under: a backend that had stopped answering doing so again, or an identity that moved.
  Same backend, same account, same failure retries nothing, so a scene broken for its own reasons
  cannot spin on the beat. `createSceneFailureRecovery` is that rule, pure and tested.
- **`refreshAuthSession` resolves with its own probe's result**, including a false `reachable`. The
  published snapshot policy is unchanged — a transport blip is still not a sign-out — but the caller
  that asked also needs to know whether the backend answered, which is the single fact something
  waiting for a restart is waiting on. `authSessionIdentityKey` is the owner's comparable name for
  an identity, so no screen re-derives one (ADR-0306).
- **The actions are registered `inner-text-button` units** sharing the app's one text-button content
  geometry, exactly as `.confirm-actions` does; the bespoke frame rule and its debt-baseline entry
  are deleted, and `RouteLoadBoundary` is moved over with them. `.app-startup-status` deliberately
  keeps its native button: it renders when the live asset catalog failed, so there is no installed
  chrome for a registered unit to wear.

## Consequences

- A retry is now a remount. A screen that wants to survive one must not hold anything the retry is
  supposed to clear — which is the point, but it means in-flight scene work is discarded rather
  than resumed.
- Verified live against a real document, backend failure injected in-page: the scene fails with a
  reachable action, holds at one generation through eight seconds of unreachable probes, and then
  settles the editor on its own the moment the backend answers — no click. The manual Retry now
  settles it too. Signed out, the screen offers only Sign in and it leaves for
  `/api/auth/sign-in?returnTo=` the exact failing address.
- The local backend treats loopback requests as the owner, so a signed-out session exists here only
  as a stubbed `/api/auth/me`. The redirect target and its `returnTo` are proven; the provider round
  trip beyond it is the same path the header cluster's Sign in has always used.
