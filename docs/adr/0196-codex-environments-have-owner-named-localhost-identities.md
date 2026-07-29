---
status: accepted
date: 2026-07-29
deciders: Nelson, Codex
---

# ADR-0196: Codex environments have owner-named localhost identities

## Context

Codex desktop environments already create isolated worktrees, obtain an
environment-local browser-approved development grant, and run the full
Vite-spawned application. Vite and its backend correctly acquire dynamic ports
so concurrent worktrees cannot collide, but those ports are not meaningful to
the owner or agent. With several features running, a URL such as
`localhost:5173` does not identify which feature or worktree it serves.

The environment setup is the one lifecycle point that precedes authentication,
server launch, agent work, and browser handoff. It can therefore establish one
human identity that every later part of the environment consumes.

## Decision

Every Windows Codex worktree setup asks the owner to name the environment with
one human feature label. Setup normalizes that label to a DNS-safe label and
writes the non-secret identity to the ignored worktree-local
`.codex-session/environment.json`.

The owner-facing origin is
`http://<environment>.chess-tactics.localhost`. Dynamic frontend and backend
ports remain implementation details:

- `devctl` starts and owns the persistent Vite process, records its actual
  dynamically selected port, and updates the environment record.
- A workstation-level Caddy service binds only to loopback port 80 and routes
  each active named hostname to its Vite port.
- Vite continues to spawn the matching backend on a separate free port and
  proxies its backend-owned routes. Caddy does not create a second backend
  routing contract.
- Starting, stopping, and pruning `devctl` entries regenerates and gracefully
  reloads the Caddy routing table. A live name collision fails closed.

The same name labels the `auth.romaine.life` development-grant request. The JWT
remains only in ignored `.codex-session/auth.json`; neither Caddy, the hostname,
nor agent context receives the token.

A project `SessionStart` hook reads the non-secret environment record and adds
the name and stable URL to Codex developer context on startup, resume, clear,
and compaction. Agents use that URL for browser testing, screenshots, and owner
handoff instead of exposing the internal port.

Re-running setup in the same worktree reuses its name and live `devctl` process.
If no interactive terminal is available, setup requires an explicit
`CODEX_ENVIRONMENT_NAME` rather than silently inventing a human-facing name.

## Consequences

The owner names a feature once and sees the same identity in the auth approval,
browser URL, server registry, and agent handoff. Many worktrees can continue to
use collision-free dynamic ports without making those ports part of the user
interface.

The Windows Codex environment now has an explicit workstation prerequisite:
the loopback Caddy service and `devctl` router integration must be installed.
Setup fails visibly if registration or the named health check fails.

Project hooks require the normal one-time Codex trust review. The hook exposes
only non-secret identity and routing metadata.

Unexpected process termination may leave a stale registry entry; `devctl clean`
is the recovery path and also regenerates Caddy from the surviving live
processes.
