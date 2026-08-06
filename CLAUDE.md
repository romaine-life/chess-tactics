# Working in this repo

## Hand over a link, every turn

**End every turn with a clickable markdown link to the exact running surface your work can be
judged on**, unless there is a real reason none exists (a pure question, a refactor with no visible
surface, a turn that produced nothing to look at). This is not a nicety and not a substitute for
doing the work — it is how the work gets reviewed at all.

**Nelson usually will not read the prose.** He scans for the link, clicks it, and reads the state of
your work off the screen. Write with that in mind. The direct consequence:

> **Never hand over a link he will open and have to ask "what is this?"**

If the link would land him somewhere ambiguous, the answer is *not* a longer paragraph explaining
it. It is one of exactly two things: **do more work** so the surface speaks for itself, or **ask him
the intent question** you have been avoiding. A vague link plus an explanation is the failure mode,
not the fix.

Two more rules that follow from the same place:

- **A link, never a command.** Give the bare URL as a markdown link. Do not wrap it in a
  ```bash fence with `start ""` / `open` / `xdg-open`, and do not tell him to run anything to see
  a page. Shell fences are for commands he asked for.
- **Maximum specificity.** Link the deepest address that puts him *inside* the thing to review —
  the right tab, the right phase, the right board, with the right brush armed. Landing one click
  short (the default tab, the picker instead of the board, the editor instead of the running test)
  makes him do the navigating, which is the thing the link was for.

### The repo is built to make specific links possible

Most surfaces encode their state in the address. Read the route contract and build the URL; a click
path is at best extra context, never the deliverable.

**Run states — a link that CRAFTS what it shows (the common case).** `POST /api/active-run/craft`
mints `/run/craft/<id>`. Opening it *sets* the active Run to that state, from whatever the Run has
since become — so it is a repeatable restart button: he finds a bug on the state you sent, presses
the same link, and is back at it without asking you. Lead with one of these while troubleshooting,
not just at the end. Full grammar under "Crafting a Run state to link to" below.

**Run states — a one-shot identity address (rare).** `/run?run=<id>` only asserts a Run already in
hand and cannot restore one that has moved on. Use it only when you specifically mean "the Run as it
stands", never as the handoff for a state you crafted.

**Deep navigation is linkable nearly everywhere.** Non-exhaustive, all verified in-tree:

- **Level Editor panels** — `?layer=<id>` opens straight on a panel: `board`, `camera`,
  `level-artwork`, `tile`, `generate`, `paths`, `fence`, `wall`, `subterrain`, `wallart`, `unit`,
  `placed-art`, `cover`, `zone`, `rules`, `status`, `history`. `?kind=<brush>` arms a brush and
  `?brush=<id>` pre-selects one; `layer=prop` and `layer=doodad` are aliases that open Placed Art
  with that brush kind. Props are **Placed Art → Props**, so a prop link is
  `/editor/level?layer=prop&brush=oak&board=<code>` — `/editor/level?board=<code>` alone lands on
  Board and makes him go find them.
- **Level Editor events** — `layer=rules&eventsEditor=1`, plus `eventsTab=deployment|other`.
- **A whole board from a URL** — `?board=<code>` on the editor (see `ui/boardCode.encodeBoard`;
  the wire is base64url JSON, `c`/`r` dims, `f` fill tile, `t` tiles, `u` units, `p` props keyed by
  anchor cell). Tile ids are catalog ids like `grass-surf-0`, not family names.
- **A playable board-link** — `/play?board=<code>&obj=capture-all&returnTo=<editor url>` boots
  straight into the live game with a "Back to editor" so tweak → play → back is a loop. Prefer this
  over the editor when the thing to judge is how it PLAYS.
- **Studio** — `mode=catalog|lab|viewer`, `cat=`, `vk=`, `lab=`, and per-item params; see
  "Reaching a specific UI state" below.

When a surface you need is not addressable, that is worth fixing — an unlinkable review surface
costs him a navigation every single time it comes up.

## Agent backend rule

Codex environment setup obtains a browser-approved `auth.romaine.life` device grant and stores it
in ignored worktree-local state. The full local dev backend consumes that verified grant for
loopback browser requests, so authenticated application and screenshot verification must use the
owner identity established at setup; do not fall back to a signed-out editor or ask the owner to
repair authentication during handoff.

For a fresh Windows Codex environment, the same browser approval asks the owner
for one non-secret feature name and returns it beside the token response. Setup
stores that identity in `.codex-session/environment.json`. `devctl` persists and
supervises the top-level Vite launch; Vite is the sole lifecycle owner of its
required backend child. The workstation Caddy router only maps the assigned
port to `http://<environment>.chess-tactics.localhost`. Backend health loss makes
devctl advertise a degraded diagnostic route but does not authorize it to
restart a living Vite process; Vite must recover the backend or exit nonzero.
See ADR-0308. At the start
of work, read that exact URL from `.codex-session/environment.json`;
`devctl list -Json` is the fallback if the record needs diagnosis. Use the named
URL for browser testing, screenshots, and owner handoff; `localhost:<port>` is
an internal diagnostic fallback. See ADR-0199.

Environment setup and single-environment diagnosis use the named
`devctl list <environment> -Json` or `devctl status <environment> -Json` path.
Do not serialize one worktree behind health probes for every other registered
worktree by using an unfiltered list when the environment name is already known.

`DEV_NO_BACKEND=1` and `DEV_OFFLINE=1` are owner-only escape hatches. Agents must
not set them, suggest them, or use them to keep working after the backend fails to
start. If the Vite-spawned backend fails, fix the backend startup issue (for
example install backend dependencies or address auth/DB access) or report the
backend failure as the blocker.

## Level Editor persistence rule

The stable `/editor/level?document=<opaque-id>&levelId=<id>` URL identifies its private
editor document; `levelId` alone is account-local and is never the URL authority. Its owner, or
an authenticated allowlisted administrator given that exact opaque URL, may read the existing
document. Admin review remains observation-only and does not grant cross-owner listing or mutation.

Per [ADR-0304](docs/adr/0304-level-editor-documents-are-live-shared-working-copies.md), every
ordinary authenticated owner page immediately edits the same durable unpublished working copy.
Page sessions use a separate unexposed credential whose hash is server-held, but their historical
presence or lease state is never mutation authority. Multiple tabs and devices stay writable, poll
the acknowledged copy, and automatically merge stale local changes with newer server changes.
There is no owner-facing Start editing, Follow latest, or Take over flow.

A page close, process loss, stale heartbeat, or expired legacy lease metadata must not create a
recovery branch or block a later page. Browser storage is only a bounded crash/offline retry buffer
for the same working copy. It must not become a second document identity or routine cleanup queue.

Automated verification opens an **observing** session against a real document — screenshots and
checks read it, they never write to it. That protects the documents Nelson actually cares about; it
is not a ban on writing. When proving a behaviour genuinely needs a writer session, create a
throwaway level, prove it there, and delete it afterwards. Do not report work as merely "wired,
unverified" when a scratch level would have settled it.

Authenticated edits autosave to the durable working copy. **Save** promotes that copy to the
canonical Level, and **Discard changes** restores it from canonical. Copying the browser URL remains
side-effect free: it does not save, publish, create another document, change permissions, rewrite the
URL, or navigate. Gameplay and campaign/share/server thumbnails read canonical levels only. The
sole working-copy preview exception is the signed-in owner's bounded **Continue editing** card list
at `/editor`; it may read an existing private document to identify resumed work without saving or
publishing it (ADR-0090).

Every acknowledged working-copy mutation retains a restorable private server revision. History is
collapsed and unloaded by default; expanding it is an explicit secondary action. Restore is an
owner-only compare-and-swap that creates a new working revision and never publishes. An untouched
document load is read-only: compare the stored Level through the editor's canonical projection
before deciding to autosave, because serialization normalization is not a user edit.

## Generated-art handoff rule

Generated-art work is not complete at exported files, manifests, filesystem
links, or contact sheets. Before saying **done** or **finished**, mount every
candidate Nelson is being asked to judge in a game-owned viewing surface and put
that exact surface in front of him.

For board art — tiles, units, props, walls, fences, and overlays — the default
proof is a durable private Level Editor document at canonical 1× over
representative terrain and neighboring game objects. Prefer an editable
document handoff under the persistence rule above.
A dedicated Studio map is allowed for a multi-candidate review batch only when it
uses the real game board renderer, mounts every candidate, and does not overwrite
accepted runtime art. Studio asset pages are supplemental when a map applies.

Open the exact deep link and provide a focused capture from that live route.
Review-only mounting does not promote a candidate. Contact sheets and standalone
PNGs are supplementary and never satisfy this handoff. If the game-surface proof
cannot be produced, report the generation task as unfinished and name the blocker.

## Taking screenshots (read this before trying to screenshot the app)

**Do NOT use the in-editor preview/screenshot tool to capture images on this
machine — its capture step hangs (every grab times out at ~30s, even on a blank
page). The dev server is fine; only the pixel grab is broken.** Don't retry it,
and don't tell the user screenshots are impossible. Use the helper below.

### How

1. Codex setup starts the dev server **persistently** through devctl and records
   the stable URL in `.codex-session/environment.json`; read the URL from that
   record. Do not start a duplicate process. Plain non-Codex fallback from
   `frontend/` is `npm run dev`; only that fallback uses the dynamic local URL
   Vite prints.

2. Capture with the `shot` tool. It drives the installed Chrome via `puppeteer-core`
   (system browser, no bundled download), freezes animation for determinism, and **clips
   to a CSS selector** — so you get small, focused, analyzable pixels instead of a
   full-page grab (too many pixels is what breaks image analysis):
   ```
   npm run shot -- <url> [--select <css>] [--out <path>] [--size <WxH>] [--ready <jsExpr>] [--full]
   ```
   Examples:
   ```
   # one element off a REAL screen — small, exact, no fixture needed:
   npm run shot -- <vite-url>/play/select/skirmish --select '.menu-dest'
   npm run shot -- '<vite-url>/play?campaignId=off-c-crown-valoria&levelId=off-l-hold-bridge' --select '.skirmish-board-unit' --out tmp-shots/unit.png
   # whole viewport / a small fixture page:
   npm run shot -- <vite-url>/unit-studio --size 1200x800
   ```
   Level Editor captures automatically use an authenticated observation-only session: the real
   private document renders without gaining write access or changing its working copy. Do not
   replace this with a normal headless editor visit.
   Output defaults to `frontend/tmp-shots/shot.png` (gitignored). **Default to showing the
   small PNG inline — never substitute a link + description for the pixels.**

   Persistent title-bar control changes additionally run the rendered geometry gate
   on the exact live route and every affected responsive width:
   ```
   npm run verify:titlebar -- '<vite-url>/editor/level?returnTo=%2Feditor&...' --size 1280x800
   npm run verify:titlebar -- '<same-url>' --size 740x430
   ```
   The gate measures the real DOM: contributed and persistent controls must share a
   top/bottom coordinate, clear the horizontal divider, and use the same tokenized
   gaps at both sides of the persistent divider and the viewport edge.

   Shell-replacement workspace changes additionally verify the body and its
   primary visible frame or scroll rail against the live Controls boundary:
   ```
   npm run verify:workspace -- '<live-strategikon-url>' --size 1440x900 --dock '.strategikon-content > .enchiridion-workspace'
   npm run verify:workspace -- '<live-run-army-url>' --size 1440x900 --dock '.run-army-ledger-grid'
   npm run verify:workspace -- '<live-events-url>' --size 1440x900 --align '.le-events-done, .le-cond-remove, .le-rule-remove'
   ```
   The default dock target is the shared `[data-shell-workspace-body]`; pass the
   visible primary frame/scroll owner when the workspace contains one. Pass the
   visible right-aligned inner controls for an inset content lane; the gate
   compares their border boxes with the shell-computed content line rather than
   decorative atom overhang. A source check that merely finds `ShellWorkspace`
   does not satisfy this geometry gate.

   Scene-director / navigation-lifecycle changes additionally run the live
   transition gate (menu → Play with a mid-transition address canonicalization):
   ```
   npm run verify:play-transition -- '<vite-url>'
   ```
   It fails on more than one exit per navigation, a lost canonicalization
   navigation, or an uncanonicalized final address — the double-fade bug class.

   Run viewport/scene-authority changes additionally run the Run scene gate on a
   Bona Vacantia craft link containing Conscription Notice:
   ```
   npm run verify:run-scenes -- '<bona-vacantia-craft-url>'
   ```
   It drives mat → target ledger, target ledger → profile, and ordinary Army
   ledger → profile; each must execute one director preparation/entrance with a
   changed committed identity. (Run's overlapping layers acknowledge exit in the
   same commit, so the observable phases begin at `loading`.) It also fails if more
   than one Run viewport contribution
   is visible, a contribution escapes the authored Run slot, the target repeats
   its lipsanon icon/phase prose, or unit rows do not identify themselves as
   Select actions (ADR-0383).

   Board reveal / unit-entrance changes additionally run the live entrance gate,
   which records the real transition and reads its pixels:
   ```
   npm run verify:unit-arrival -- '<vite-url>/play/select/campaign/off-c-crown-valoria' --click '.campaign-level-row [aria-label^="Play "]'
   npm run verify:unit-arrival -- '<vite-url>/play/select/continue/run' --click 'a[href^="/run"], [data-nav^="/run"]'
   npm run verify:unit-arrival -- '<battle-victory-craft-url>' --settled
   ```
   It fails when a battlefield is revealed with units still to arrive standing at
   their seats, and when a board that has already resolved disagrees with its own
   settled composition — the seen-then-vanished-then-placed bug class (ADR-0357).
   Terminal mode instead requires settled units and Victory to be fully composed
   before the scene becomes current, with no independent child opacity entrance.

This works on ANY live route by selector — no per-target fixture, so there's no "new
screen ⇒ flail" cliff. `frontend/scripts/shot.mjs` is the implementation.

### Reaching a specific UI state

The app is ours and the routes are inspectable. When the owner asks how to see
or verify an owned app surface, build the direct URL from the route contract
instead of giving only click-by-click instructions. Click paths are fine as
extra context, but they are not a substitute for the link.

For the Level Editor's full Events workspace, append `eventsEditor=1` to the
canonical `layer=rules` URL. Append `eventsTab=deployment` for Deployment or
`eventsTab=other` for Other Events; Victory Rules is the default and omits that
parameter.

The Studio encodes its state in the URL, so deep-link instead of clicking:
- `mode=catalog|lab|viewer`
- `cat=<category>` (for example `gym`, `gamelab`, `assets`, `props`)
- `vk=<viewer-kind>` for Viewer surfaces (for example `gym`, `gamelab`,
  `nineslice`)
- selected item params such as `gymlvl=<levelId>`, `glvl=<levelId>`,
  `kit=<asset>`, `frame=<frame>`, `prop=<propId>`
- `lab=board|tile|unit` (Lab component view)
- `view=board`, `family=<id>`, `collection=<id>`, `asset=<id>`, `unit=<id>`, `seed=<n>`
- `/unit-studio` is an alias for the Studio with the Units shelf preselected.

#### Crafting a Run state to link to (ADR-0338, ADR-0354)

Run screens need an active Run, so `/run` alone lands wherever the account already is. Craft the
state first, then hand over the craft link. Never hand-author a Run document or edit
`active_runs`: the server validator cross-checks army/card membership, authored formation ids,
complete placement plans, and offer pricing, and a crafted document passes because the game built it.

**Every Run state you put Nelson on is handed over as a link that CRAFTS it.** Opening the link
sets his active Run to that state and lands on the Run screen — every time, from whatever the Run
has since become. That is what makes it a restart button: he finds a bug on the state you sent,
presses the same link, and is back at it without asking you. Handing over `/run?run=<id>`, a
board-code, a click path, or "craft it again and I'll send a new link" for a state you crafted is
a defect — those cannot reproduce what they show.

This is not only for the end of a task. **While troubleshooting, lead with a craft link**: the
fastest way to move a Run question forward is to put him on the exact state and let him press it
as often as he needs.

**`POST /api/active-run/craft`** (admin, works anywhere) mints the link, sets your own active
Run to that state, and answers with both:

```
curl -X POST <url>/api/active-run/craft -H 'content-type: application/json' -d '{
  "phase": "sectio", "battle": 4, "gold": 33.5,
  "army": [{ "type": "rook" }, "knight", "pawn"],
  "offers": [{ "id": "q" }, { "id": "ppb-protected" }],
  "loot": ["fair-scales"], "lipsana": ["quartermasters-ledger"] }'
```

Same fields as the address grammar below, plus structured plain units and exact formation-card
objects. An unknown field is refused, not ignored.

`cards` is the field for a Run that has already performed Adlectio — the Chartulary, and anything
downstream of that admission. Each is adlected in the opening Sectio and carried through every
Battle before the target, so it arrives with its persistent units and card seats rather than as
a fresh Adlectio; gold is restored afterwards. It cannot be given
beside `army`, which replaces the roster those cards put there — use `add` for extra units.

**The `url` it answers with — `/run/craft/<id>` — is the link to hand over, exactly as given.**
The id is all it carries; the spec lives on the server, so the address stays short however large
the spec grows, survives copy-paste intact, and re-crafts on every open. The id is the
fingerprint of the spec itself, so the same state always mints the same link. (`runUrl` is the
identity address, `/run?run=<id>`; it only asserts a Run already in hand and cannot restore one
that has moved on. `POST /api/run-craft-links` mints without crafting.)

The `?craft=` grammar below is how a spec is **written**, not a kind of link. Type one into the
browser and it is minted into its `/run/craft/<id>` address before anything is crafted, so a
hand-authored one-off leaves a durable link behind:

```
/run?craft=sectio&battle=3&gold=25&army=knight,rook&offers=q,ppb-protected,rr-vertical
/run?craft=deployment&battle=2&army=rook,rook,bishop,pawn&gold=12
/run?craft=battle&battle=4&lipsana=fair-scales
/run?craft=battle-victory&battle=4&lipsana=fair-scales
/run?craft=aftermath&battle=3&turns=21&seconds=402&fallen=2
/run?craft=victory&gold=40
```

- `craft=sectio|deployment|battle|battle-victory|aftermath|victory` — the phase to land on;
  `battle-victory` opens the settled Battle directly on its board-visible Victory/Rewards state.
- `battle=N` — the Battle you are at, 1-based. For a Sectio that is the Sectio you leave into
  Battle N, so `battle=1` is the opening Sectio (which takes no overrides — the Run contract
  pins its offers, army and 8 gold).
- `gold=25` (decimals fine), `army=knight,rook` (the exact non-King army; `add=queen`
  appends instead), `lipsana=<id,id>`.
- Sectio only: `offers=<card-id>[,<card-id>]`; `loot=<id,id>`; `paid=<id>`. Use exact
  authored ids such as `p`, `pp`, `ppb-protected`, `bb-diagonal`, and `rr-vertical`.
  Composition shorthand is accepted only when it identifies one formation unambiguously.
- Aftermath only: `turns=<n>`, `seconds=<n>` and `fallen=<n>` write the Battle report a
  crafted Battle cannot produce on its own — it is placed, not played. `battle=N` is the
  Battle just won; the FINAL Battle has no aftermath (its report is the War victory
  screen), so craft `victory` for that one.
- `war=<id>` picks the War (default: the first Run-eligible official one), `seed=<n>` and
  `tier=0` fix the roll. `view=army|lipsana|expunctio` still applies and survives the craft.
- `cards=<card>[,<card>]` — the cards the Run already HOLDS, written exactly like `offers`.
- Run units and cards carry no ability or qualifier fields in the current save format.

**Append `?to=<address>` to a craft link to land inside a Run workspace** rather than one click
short of it — `/run/craft/<id>?to=/run/strategikon/chartulary` crafts the state and opens the
Strategikon's held-card register on it. Only an address inside the Run is honoured. Use it
whenever the thing to judge lives in a Run workspace; `/run` alone makes him go find it.

A refused spec prints the reason on the Run screen and writes nothing. Crafting **replaces
the account's active Run** — there is one per account. Overwrite it freely; see below.

## The owner's active Run is not a thing to protect

Nelson is **building** this game, not playing it. His active Run is disposable test state, and
it is worth exactly nothing next to shipping the change correctly.

That does not make other accounts' active Runs disposable data. Every RunSaveVersion that reaches
players requires the canonical database migration and browser-storage migration to its successor.
Retired content becomes a typed tombstone or neutral replacement (for example, **Removed card**),
not a reason to erase the containing Run (ADR-0380).

So: craft over it, overwrite it, invalidate it, discard it. Bump RunSaveVersion the
moment a document change warrants one, and never soften a design or a migration to keep an
in-progress Run alive. Do not ask permission to overwrite it, do not schedule work around it,
do not offer to preserve it, and do not add a compatibility path whose only beneficiary is a
Run already on his account.

State the consequence once, in plain terms, as part of reporting what shipped — "Run save version 12
makes in-progress Sectio runs unsupported" is useful; treating that as a cost to be weighed,
mitigated, or apologized for is not. The migration policy in `docs/migration-policy.md` still
governs what the *code* must do with old documents; this rule is only about whose Run it is.

## Dev environment gotchas (git worktrees)

- A fresh worktree's `backend/node_modules` is expected to be missing. That is
  normal setup, not a surprising backend failure. `npm run dev` installs or
  refreshes backend dependencies before starting the Vite-spawned backend.
  Do not use `DEV_NO_BACKEND=1` to skip this.
- A worktree's `frontend/node_modules` may be **partial** (missing react /
  typescript / etc.). Run `npm install` in the worktree once, or typecheck with
  the main checkout's compiler:
  `node ../../../frontend/node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`.
- Never create symlinks/junctions to share `node_modules` — do a real install.
- Plain `npm run dev` serves the full app and lets Vite dynamically acquire a
  frontend port. Named Codex environments hide that port behind their stable
  `.localhost` URL; a plain non-Codex run uses the URL Vite prints.
- **`npm run dev` (from `frontend/`) runs the WHOLE app** — vite auto-spawns the backend
  (each worktree gets its own free port + pidfile, so many run side-by-side). On a fresh
  worktree it now **auto-installs `backend/node_modules` on first run**, so you no longer
  `cd backend && npm ci` by hand for dev. And the backend is a **HARD dependency**: if it
  can't start (deps install fails, exits before ready 3×, or hangs >60s), vite prints a
  loud banner and **exits `npm run dev` with code 1** instead of crash-looping or serving a
  backend-less UI that silently 500s on `/api`. Do NOT work around a dead backend — fix it.
  The one sanctioned no-backend run is the explicit `DEV_NO_BACKEND=1` (mock stack).
  Implementation: `frontend/vite.config.js` → `prodBackend`.
- **Development recovery has one owner per layer (ADR-0308).** Vite alone
  launches and recovers its backend child. Devctl may restart the top-level
  `npm run dev` launch after that launch exits, but it must never kill a living
  ready-era Vite process merely because a backend health probe failed. Caddy
  only switches between the reverse proxy and devctl's diagnostic response.

## There is no dev database — localhost writes to PRODUCTION

The backend Vite spawns for `npm run dev` connects to **production Azure Postgres**. Not a
copy, not a seeded fixture, not a staging tier. `frontend/vite.config.js` → `prodBackend`
defaults `POSTGRES_HOST` to `chess-tactics-pg.postgres.database.azure.com`; the only other
path is the explicit opt-in of `LIVE_MEDIA_STORAGE_DIR` **plus** a loopback `DATABASE_URL`,
which nothing sets for you.

So `http://localhost:<port>/api/admin/...` is the live data plane. Uploading a media
candidate, accepting or activating one, crafting a Run, or any other admin write from your
local dev server **writes to production**. There is no place to rehearse it first.

- **Never call it a dev database, dev catalog, or staging.** It is production. Saying
  otherwise in a handoff has already caused an agent to report a prod install as pending
  work when it had already shipped.
- **Confirm the target before your first admin write.** Cheapest check: the catalog size.
  Production carries ~1700–2400 slots and a four-digit revision; anything disposable would
  carry neither. `grep -n DATABASE_URL frontend/vite.config.js` is the direct answer.
- Adding a NEW slot is additive and recoverable by retiring it. Overwriting, retiring, or
  re-pointing an EXISTING slot is a production content change — get the owner's word first.
- Reads are free. It is the writes that need the check.

The owner's active Run is the one exception that needs no ceremony: it is disposable test
state and crafting over it is expected (see the section above).

## Schema migrations ship through the PR — never run them by hand

**Do NOT run `npm run schema:migrate` (or otherwise set `SCHEMA_MIGRATIONS=auto` locally).**
Adding a migration to the registry in `backend/server.js` is the whole of your job; applying it
is the deployed backend's, on rollout. `k8s/templates/deployment.yaml` says so directly —
*"Deployed backends intentionally own schema rollout. Local backend defaults to read-only
schema checks unless explicitly opted into auto."* That default is the safety, not an
inconvenience to opt out of.

Why it matters more here than in a normal repo: there is no dev database (see above), so a
hand-run migration is a **forward-only production change** — undoing it means writing another
migration — and it lands on every other worktree sharing that database, breaking each one that
hasn't pulled your branch yet. You are not migrating your environment; you are migrating
everyone's, ahead of the review that was supposed to gate it.

- Write the migration, and let `npm run dev` fail loudly against it. A backend whose registry
  is ahead of the database answers `503 schema_migration_required` with the exact
  `missing_versions`. **That is the expected state of your worktree while the PR is open** —
  it is the system working, not a blocker to route around.
- **The other direction has exactly one fix: `git merge origin/main`.** When someone else's
  migration lands on `main`, the shared database carries a version your branch has never heard
  of, and every `/api/*` call answers `503 schema_migration_history_invalid` with
  `unexpected_versions: [N]`. In the browser that surfaces as **"Live assets unavailable"** or
  **"Required scene data or artwork could not be reached"** — which look like a dead server and
  are not. Confirm with `curl <url>/api/asset-catalog`, then merge `origin/main`; the
  Vite-spawned backend restarts itself and serves again. **Never** reach for the database:
  do not delete the row, do not add a matching stub migration, do not renumber yours to sit
  above it. The branch is behind, and the branch is what moves.
- Verify the migration through the tests that need no database:
  `cd backend && npm run test:live-media` covers migration integrity, append-only history, and
  execution planning.
- Do not report the feature as verified end-to-end when its migration has not run. Say which
  behaviour is proven by tests and which waits on rollout.
- If the owner explicitly asks you to apply one early, that is his call to make — state the
  blast radius (which worktrees go stale, that it cannot be rolled back) and let him decide.

## Verifying backend / multiplayer changes (NO Postgres needed)

Live lobby state and move/result relay live in an in-memory Map. Production level selection
and Start deliberately read the canonical official level from Postgres so a client cannot
author timing metadata and reconnect can pin the exact content snapshot. The DB-free protocol
smoke supplies canonical test content through an explicit `NODE_ENV=test`-only seam; gameplay
protocol changes therefore remain fully testable locally without Postgres:

```
cd backend && npm ci        # for the smoke test's OWN `node` run — `npm run dev` auto-installs this itself
node netplay-smoke-test.js  # boots DB-free with canonical test content; exercises lobby/netplay
```

`netplay-smoke-test.js` is the go-to for any lobby/netplay change — it runs anywhere in
seconds. Do NOT say "I couldn't run the smoke test" for a multiplayer change; run this.

The full `smoke-test.js` additionally covers the DB-backed persistence endpoints
(campaigns, portfolios), so it needs Postgres — it self-provisions from system
`initdb`/`pg_ctl`/`createdb` if present, else set `DATABASE_URL` to any reachable Postgres.
On a host without Postgres binaries (this Windows box has none), the full smoke test can't
run locally — but `netplay-smoke-test.js` covers everything multiplayer, so reach for that.
Both are wired into `npm test` (netplay first, so netplay regressions fail fast).

## Checking a PR: use `pr-gate`, never a hand-written poll loop

After opening a PR, run this from the repo root and read the one-line verdict:

```
node bin/pr-gate.mjs [<pr>] [--no-wait] [--appear <s>] [--timeout <s>]
```

| Verdict | Exit | What it means |
| --- | --- | --- |
| `READY` | 0 | Mergeable and every check passed or skipped. |
| `ERROR` | 1 | No PR for the branch, `gh` missing, or unreadable output. |
| `CONFLICT` | 2 | Conflicts with base. **No CI can run at all** — resolve, push, re-run. |
| `BEHIND` | 3 | Base moved; update the branch, push, re-run. |
| `NO_CHECKS` | 4 | None appeared in time. The output says whether CI is unconfigured or configured-but-untriggered. |
| `CI_FAILED` | 5 | Prints the failing job and its log link. |
| `TIMEOUT` | 6 | Checks never finished. Report the wait; do not merge. |

**Do not hand-write a `gh pr view` / `gh pr checks` polling loop.** Every attempt to date has
gone silent for 10–13 minutes and then reported the wrong cause. The three ways it fails, all
already handled inside `pr-gate`:

- **A conflicting PR produces no CI whatsoever.** `pull_request` workflows run against a merge
  commit GitHub cannot create while the branch conflicts. Watching one waits forever, and the
  empty check list reads as "CI is not configured". Always resolve mergeability *before*
  watching checks.
- **`jq` is not installed on this machine.** A bare `| jq` exits 127 into `/dev/null`, so a
  poll loop produces no output and never terminates. Use `gh --jq`, or parse in Node as
  `pr-gate` does. Never pipe to a `jq` binary in a local script.
- **`gh pr checks --json` does not emit `[]` when no checks are registered.** It prints a
  plain-English sentence, sometimes on stdout with exit 0 and sometimes on stderr with exit 1.
  Parse the payload; do not key off the exit code or scan only one stream.

A watch must speak on every poll, not only on success — `pr-gate` heartbeats elapsed/pending
to stderr so a live wait is never mistaken for a dead one.

Before opening the PR, run the command CI actually runs, not a subset. Bare `vitest` passes
while CI fails: `cd frontend && npm run check` also runs `tsc --noEmit` and the
`frontend/scripts/check-*.mjs` guards, several of which pin exact JSX literals and break on
any shell or chrome refactor. For `backend/`, `bin/`, or `packages/`, run
`cd backend && npm run test:backend`.
