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
- **No player-hoverable anchors remain** (amended same-day, owner decision): the first cut
  kept the brand lockup ("logo links home"), the auth sign-ins, and external links as real
  anchors — importing a *website* convention into a game shell. All converted:
  1. the **brand lockup** → NavButton `to="/"` — the title mark is a game control like any
     other; hovering the most-seen element in the game must not print a URL;
  2. **auth sign-in** controls → plain buttons calling `goSignIn()` — still the same
     full-page trip to `/api/auth/sign-in` (NavButton is wrong here: navigateApp refuses
     `/api/` targets), just no hover URL;
  3. **external destinations** (SettingsButton's `external` branch, the ambience credit) →
     plain buttons calling `window.open(href, '_blank', 'noopener,noreferrer')` — same new
     tab, no hover URL;
  4. synthetic **download** anchors (export blobs) remain — created programmatically,
     clicked programmatically, never rendered or hoverable.
- **The anchor machinery stays** (App's click interceptor + pointerover/focusin delegates):
  inert today, but it keeps any future anchor — a docs link in a changelog, say — behaving
  correctly, and it costs nothing.
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

### Research (2026-07-02, owner-requested — settles the brand-lockup question)

**Live DOM probe of 12 game-first web apps** (immersive shells, not game websites/portals):
10 of 11 reachable shells expose NO hoverable URL on their logo or menu. Logos are unlinked
`<img>`/`<div>`s (diep.io, venge.io, slither, zombsroyale, melvor, shapez, GeForce NOW's
gate); menu verbs are `<button>`s/divs (agar.io, krunker, Cookie Clicker, Universal
Paperclips); ZombsRoyale paints its entire menu on one canvas. slither even uses `href="#"`
anchors purely as button chrome — no real URL. Anchors appear only at the shell's edge,
pointing OUTWARD (legal, Discord, app stores, studio homepages) — A Dark Room has exactly one
anchor on the whole page (the studio logo, off-site). The lone counter-example is
xbox.com/play, which behaves as a store portal, not a game shell. The desktop-gaming idiom in
browsers: URL-on-hover marks the site chrome AROUND a game; everything inside the shell is
URL-less.

**Canon:** WCAG does not require navigation to be links — SC 4.1.2 needs accurate
name/role/value, and failure F42 targets non-semantic div-links, not native buttons.
"Links go places, buttons do things" (Sutton, Eggert, APG) is *advisory* authoring practice
keyed to URL change; NN/g's own games heuristics point consistency at GAME conventions, not
web ones; game-a11y practice (Atkinson's proxy UI, Game Accessibility Guidelines) demands
exposed names/roles, never link roles. Decisive platform signal: Chrome deliberately
**removed the link-hover URL bubble from installed PWAs** because it "screams web browser" —
the vendor itself classes link affordances as browser-ness to strip from app-like surfaces.
NN/g's logo-links-home research is about the BEHAVIOR (mark returns home — preserved) and
placement, not the HTML element. Honest counterpoint, for the record: the advisory canon
would still call a URL-changing control a link, and power users lose middle-click-new-tab in
a plain browser tab — accepted; both cut against immersion by design.

### Implementation notes

- Sits on: navigateApp/`APP_NAVIGATION_EVENT` (ui/navigation.ts) — the router's real input,
  anchor-independent from day one; ADR-0051 (transition choreography rides the same events);
  ADR-0046/0049 (chrome + surfaces).
- Precedent: the Studio's Lab tab was already `<button onClick={() => navigateApp(...)}>`.
- The sfx click-sound delegate (`src/sfx.ts` UI_CONTROL_SELECTOR) matches `button` and checks
  `disabled` — conversion-safe, unchanged.
- Gotcha for future button conversions: the global `button { … }` base rule near the top of
  style.css (44px min-height, padding, gradient, text-shadow, letter-spacing) leaks into any
  property a kit class doesn't declare — the `.ce-sign-in` conversion shipped 24px too tall
  until pixel-diff caught it. A converted text-styled control must also unset
  min-height/border-radius and `inherit` text-shadow/letter-spacing.
