---
status: "accepted"
date: 2026-07-12
deciders: Nelson, Codex
partially_supersedes:
  - ADR-0047
---

# ADR-0089: The SFX runtime profile is DB-authoritative

## Context

ADR-0047 correctly requires authored recordings, random take selection, and
honest silence instead of synthesized fallback sounds. ADR-0085 moved those
recording bytes and active pointers out of Git, but the runtime mix still kept
sound-set labels and gains, terrain assignments, and arrival behavior in
TypeScript. Studio wrote a browser draft and asked the owner to copy it into
chat so an agent could bake the choice into source. Changing a sound assignment
therefore still required a push even though the bytes were already live.

## Decision

Postgres owns one complete global `sfx_profiles/default` document. Its typed
JSON profile contains:

- sound-set semantic keys, labels, character/build descriptions, and mix gains;
- one explicit assignment for every landable terrain, either a declared sound
  set or `null` for intentional silence; and
- the arrival sample, gain, and `per-unit` or `once` firing behavior.

The public backend GET supplies the profile. Admin PUT validates the complete
shape and uses the caller's observed revision as a compare-and-swap token. The
migration creates the table but does not seed a row from source. A missing or
invalid profile means decorative runtime silence and an unavailable Studio
editor; it never selects hardcoded values, a packaged profile, or last-known
browser state.

The SFX Studio edits the hydrated document directly. Local storage may preserve
an unsaved draft tied to its base revision, but Save writes the backend profile
and conflicts rather than overwriting a newer revision. Copy-for-agent and
source-bake publication are retired.

Recording bytes remain in the shared live-media catalog under stable
`sfx/<sound-set>/v<n>.<format>` slots. Updating this profile does not accept or
publish candidate audio. Audio promotion remains blocked until the SFX domain
has its own exact-byte review and acceptance instrument under ADR-0085.

ADR-0047's authored-recording-only, random-take, bounded-playback, and silence-
over-synthesis rules remain authoritative. This decision supersedes only its
Git-owned runtime configuration and localStorage-copy-to-source workflow.

## Consequences

- Terrain voices, set trims, metadata, and deploy-thump behavior can change
  through the running app without a Git commit or deploy.
- Runtime and Studio observe the same revisioned profile.
- Browser drafts are recoverable editing state, not production authority.
- Missing backend configuration is visibly unavailable and audibly silent.
- Profile editing cannot manufacture acceptance for unreviewed recording bytes.
