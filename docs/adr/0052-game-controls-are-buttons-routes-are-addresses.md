---
status: "accepted"
date: 2026-07-02
deciders: Nelson, Claude
---

# ADR-0052: Game controls are buttons; routes are addresses, not affordances

## Context and Problem Statement

Every player-facing navigation control was a real `<a href>` — the main-menu rail, the
campaign tabs and Play buttons, the settings tabs and Back, the picker's Edit/Play, Party's
Deploy, the editors' header actions, the title-bar gear. A document-level click interceptor
(`shouldInterceptAppLinkClick` → `navigateApp`) turned those clicks into SPA navigations, and
a document-level pointerover/focusin delegate warmed the destination chunk off `anchor.href`.

The owner's call: **the game's buttons must not feel like hyperlinks.** Anchors leak browser
link affordances — the status-bar URL preview on hover, the right-click link context menu,
middle-click open-in-new-tab, the drag ghost — that read as "web page", not "game UI". Routes
should remain purely as *addresses* (deep links, reload, back/forward) bolted on underneath,
not as the surface affordance of every control.

Anchor-ness also forced real hacks: the gear needed a pointerdown/keydown just-in-time href
rewrite (its render-time `returnTo` goes stale when screens rewrite their query via
`replaceState`), and "disabled" anchors faked it with `aria-disabled` + `pointer-events:none`
(Party Deploy, Campaign's Locked).

## Decision Outcome

**In-app game controls are `<button>`s that navigate programmatically through a single shared
primitive; the URL stays fully routable but is never the control's affordance.**

- **`NavButton`** (`ui/shared/NavButton.tsx`): `<button type="button">` with `to`
  (path+query, or a **thunk** resolved at activation for targets that must be computed late —
  the gear, whose stale-href hack this retires). Click → `navigateApp` (the same same-origin
  gate the interceptor applied); pointerenter/focus → `prefetchRoute`. It stamps `data-nav`
  (string targets) for tests/debugging — invisible to the player.
- **`routePrefetch.ts`**: the chunk thunks + `chunkForPath` + `prefetchRoute` (JS **and**
  route-data warm-up, ADR-0051) moved out of App.tsx so NavButton and App's delegates share
  one warm path. App's `lazy()` consumes the same thunks — warming is still the click-time
  download.
- **The anchor machinery stays** for what remains: App's click interceptor and
  pointerover/focusin delegates are unchanged, serving the deliberate anchors below.
- **Deliberate anchors** (the full list — everything else is a button):
  1. the **brand lockup** (`href="/"`) — a logo linking home is the one conventional
     hyperlink, and the sole place link affordances are correct;
  2. **auth sign-in** controls (`/api/auth/sign-in` — a full-page round-trip the interceptor
     already never intercepts);
  3. **external links** (SettingsButton's `external` branch, the ambience credit) —
     `target="_blank" rel="noopener noreferrer"`;
  4. synthetic **download** anchors (export blobs).
- **Native `disabled`** replaces the anchor fakes where controls converted (Party Deploy,
  Campaign Locked); the shared classes gained `:disabled` alongside the kept
  `[aria-disabled]`/`.is-disabled` selectors (other consumers still use those).
- **CSS**: `.settings-tab` gains `font: inherit; cursor: pointer` (buttons don't inherit
  font); `.cluster-icon-button` gains `appearance:none; background:transparent` (UA button
  face); `.ce-link-button` family gains `cursor:pointer`. Everything else was already
  dual-element (`.app-header-button`, `.utility-button` are used on `<button>`s elsewhere).

### What is deliberately LOST on converted controls

Status-bar URL preview, right-click link menu, middle-click/ctrl+click new-tab, link drag —
these are the point of the change, not casualties. Do NOT re-add `onAuxClick`/`window.open`
emulation; a player wanting a second tab can copy the address bar (URLs still track every
screen). Screen readers announce these as buttons, not links — correct for game controls;
Enter AND Space both activate (anchors were Enter-only).

## More Information

- Sits on: navigateApp/`APP_NAVIGATION_EVENT` (ui/navigation.ts) — the router's real input,
  anchor-independent from day one; ADR-0051 (transition choreography rides the same events);
  ADR-0046/0049 (chrome + surfaces).
- Precedent: the Studio's Lab tab was already `<button onClick={() => navigateApp(...)}>`.
- The sfx click-sound delegate (`src/sfx.ts` UI_CONTROL_SELECTOR) matches `button` and checks
  `disabled` — conversion-safe, unchanged.
