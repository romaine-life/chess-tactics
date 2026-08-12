---
status: accepted
date: 2026-08-12
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0576](0576-authentication-is-a-server-held-session.md)"
  - "[ADR-0193](0193-runs-are-persistent-wars-around-unchanged-chess-battles.md)"
---

# ADR-0587: A Run can be owned by a guest, and a guest Run uploads on every acknowledged mutation

## Context

A signed-out player generated **no server data at all** — not data we collected and discarded, but
data with nowhere to go. `active_runs` was `PRIMARY KEY (owner_email)` (migration 44), so a Run
without an account had no row it could occupy. `GET/PUT/DELETE /api/active-run` each opened with
`requireUser`, so a guest got `401 sign_in_required`, and `run/store.ts` gated every remote save
behind an `accountLinked` flag that a signed-out hydrate never set. A guest's Run lived in
`localStorage` and nowhere else.

**That was a consequence of keying the table by email, not a decision anyone made about guests.**
Nothing in the codebase argued that anonymous play should be invisible; the invisibility fell out
of the primary key. It made every population figure silently mean "signed-in players", and it put
guests permanently out of reach of the observation and sharing tiers, both of which need something
server-side to point at.

One prior anonymous tier existed and was retired. `editor_maps` (migration 13) carried
`anonymous_user_hash` and put guest rows in an expiring "misc pool"; migration 16 dropped the table
and migrated only `WHERE em.owner_email IS NOT NULL`, discarding every anonymous row. That is worth
knowing before reaching for it as precedent — it is not a pattern to revive, it is a pattern that
was already tried and thrown away, and the shape it lacked is the one below.

## Decision

### A guest is an opaque key the browser holds and the server never stores

`frontend/src/run/guestIdentity.ts` mints 32 bytes from `crypto.getRandomValues`, hex-encoded, and
keeps them in `localStorage`. The server stores **only the SHA-256**, domain-separated
(`sha256('guest-run\0' + key)`), in `active_runs.guest_hash`.

This is not a third pattern. It is the shape [ADR-0576](0576-authentication-is-a-server-held-session.md)
already established for the auth session cookie — "the cookie carries a random token; only its
SHA-256 is stored, so a database leak yields no usable session" — and the shape the Level Editor's
page credential already uses in `editorSessionKeyHash`. A leak of `active_runs` yields no key that
can write anything.

**There is deliberately no weak fallback.** A browser without `crypto.getRandomValues` gets `null`
and keeps playing locally, exactly as every signed-out player did before this. A `Math.random` key
would be guessable, and a guessable key hands the guest's row to whoever guesses it — strictly
worse than the local-only play it would be replacing. `levelEditorDraft.ts` refuses for the same
reason and says so in the same words.

**The key is minted lazily, on the first save.** Loading the game is not playing it, so a read asks
only for a key that already exists (`readGuestRunKey`) while a write mints one (`ensureGuestRunKey`).
A visitor who opens the app and leaves creates nothing. The identity and the row it owns come into
being together.

The key travels as `x-guest-run-key`, mirroring the editor's `x-editor-edit-session-key`.

### A guest Run uploads on EVERY acknowledged mutation

This was the product call, and it was the owner's to make, because it is the change that makes
guest play leave the device for the first time. It determines write volume, what the population
figures can answer, and what a guest is implicitly consenting to. Two alternatives were put up and
rejected:

- **Phase checkpoints only** (Sectio → Deployment → Battle → Aftermath) — maybe 5–10 writes per Run
  instead of 30–60. Rejected because it cannot answer anything within a phase, and it makes a
  future observer see jumps rather than play.
- **Only on an explicit act** (Share, or sign-up). Rejected because the guests most worth counting
  are the ones who bounce, and they never perform the act.

So a guest Run takes the *same* code path as an account Run — one save chain, one CAS token, one
set of semantics. Run mutations are discrete player acts (buy, place, take, leave phase), so this
is tens of writes per Run, not a stream.

### Ownership is exactly one of two columns

Migration 79 drops the `owner_email` primary key, makes that column nullable, adds `guest_hash`,
and states the rest as constraints:

- `CHECK ((owner_email IS NOT NULL) <> (guest_hash IS NOT NULL))` — the XOR is what makes the other
  spelling **unsayable**. A row naming both would be an account Run and a guest Run at once, and
  whichever query reached it first would win.
- `CHECK (guest_hash IS NULL OR guest_hash ~ '^[0-9a-f]{64}$')` — 64 hex characters because that is
  what SHA-256 is; the database says so rather than trusting the caller.
- A partial unique index per kind, since neither column can be a primary key while it is null for
  the other kind of owner. The uniqueness guarantee is unchanged where it still applies.

**Rejected: storing guests in `owner_email` as `guest:<hash>`.** It would have preserved the
primary key and touched none of the ~247 existing queries — and it would have made an email column
hold non-emails, which is precisely the misuse the check above exists to forbid. The observation
handle already lowercases whatever it is given, which is a hint at how quietly that would have gone
wrong.

`REQUIRED_SCHEMA_REPAIR_MIGRATIONS` maps `active_runs` to `[44, 79]`, following the
`lipsanon_stat_events` precedent: replaying 44 alone would rebuild a table that cannot hold the
anonymous Runs the app is by then already writing.

### Signing in inherits the guest row, and the browser forgets the key

`POST /api/active-run/adopt-guest` takes both advisory locks (sorted, so two tabs cannot deadlock)
and either **moves** the guest row onto the account — `SET owner_email = $1, guest_hash = NULL`,
which preserves the revision so the next save does not have to conflict its way to agreement — or,
when the account is already playing something, **deletes** it. Either way the guest row is gone
afterwards. A guest row that outlived its adoption would be counted forever as a Run nobody is
playing, and would still be writable by a key its holder no longer owns.

**The Run's CONTENT is merged by the client, unchanged.** This reuses the merge `campaign_progress`
already defines — local storage is the guest's authority and signing in folds it into the account —
and the browser-versus-account comparison `hydrate()` has always performed. The server settles
which *row* the account holds; the store settles which *Run* wins. No new merge semantics.

`clearGuestRunKey()` runs only after the server has answered. A failure leaves the key in place so
the next hydrate retries, which is correct: the row still exists and still belongs to that browser.
Signing in is never blocked by it.

### The signed-out hydrate has no two-way chooser

An account's two Runs can come from two devices, and only a person can pick between them — that is
what `adoptionConflict` and its **Keep browser Run / Keep account Run** pair are for. A guest row is
written by exactly one browser, so there is never a second party to consult, and the chooser's
wording ("Your account") would be nonsense shown to someone with no account. The guest rule is
therefore: **the browser wins when it has a Run; otherwise take the row.**

Taking the row is not a formality — it is the case that makes guest persistence worth having.
Local storage lost, evicted or unparseable, with the Run still in the row, is a recovery that was
impossible before this.

### `remoteOwner` replaced `accountLinked`

One field (`'account' | 'guest' | null`) rather than a second boolean beside the first. A store
cannot be joined to both documents at once, and two flags could say that it was.

A `401` on a guest save means the browser could not mint a key. That drops the link to `null` and
reports **nothing** — it is the local-only play signed-out players always had, not a failure to
show anyone. It is handled before `reportAuthSessionFailure`, which would otherwise flip the whole
app to signed-out over a state that is already signed-out.

A guest hydrate that cannot reach the server drops the link for the session, matching the account
path. Keeping the link with a revision of 0 would make every subsequent mutation lose a conflict it
has no way to settle.

### Counting

`GET /api/admin/run-population` splits existing Runs by owner kind and phase. This is the question
guest identity was built to make answerable, and it is deliberately **not** presence — how many
Runs exist and who is playing right now are different questions with different answer shapes.

## Consequences

- **No RunSaveVersion bump.** The Run document shape is untouched; what changed is who owns the
  row. No browser-storage migration is needed, and no in-progress Run is invalidated.
- **Guest play now writes to production Postgres**, on the same pool everything else shares. This
  is the deliberate consequence of the write-cadence decision above, not an oversight.
- **The observation handle assumes an email.** `runWatchHandle(ownerEmail)` on the unmerged
  `claude/run-sharing-linking-62b093` branch derives from `owner_email` and `ownerForRunWatchHandle`
  scans `SELECT owner_email FROM active_runs`. Neither survives a guest-owned row. When that branch
  merges, the handle must derive from whichever column carries the owner — the XOR check guarantees
  exactly one does — and the scan must select both.
- **Sharing is unaffected by this shape.** A share row should still hold a snapshot keyed by its own
  share id rather than pointing into `active_runs`, following `public_maps`. What this ADR provides
  is the missing half: a guest can now own one.
- Signing out reloads the page, so the store rehydrates as a guest and mints a **new** identity on
  its next save. That is correct — the previous identity was absorbed into the account, and a new
  anonymous session is a new guest.
