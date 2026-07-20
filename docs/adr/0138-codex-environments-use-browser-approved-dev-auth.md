---
status: accepted
date: 2026-07-19
deciders: Nelson, Codex
---

# ADR-0138: Codex environments use browser-approved development authentication

## Context

Local browser verification repeatedly stopped at the authenticated Level Editor because localhost
cannot receive the `.romaine.life` session cookie. The existing mock identity did not prove the
owner's real account and forced the owner to repair authentication after work was supposedly ready.
`auth.romaine.life` provides a browser-approved CLI device flow specifically for Codex-style agents.

## Decision

Every Codex worktree setup starts a fresh `auth.romaine.life` CLI device request and opens its
approval page in the owner's default browser. The approved 24-hour `purpose=bot` JWT is written only
to the ignored, worktree-local `.codex-session/auth.json` file with owner-only permissions where the
platform supports them. It is never printed, committed, or placed in a URL.

The development backend verifies the JWT signature, issuer, expiry, key id, and bot purpose against
the auth service JWKS. On loopback requests only, the verified claims supply the browser's local
development identity without requiring a localhost cookie. Production remains cookie-only. LAN
requests to a network-exposed Vite server never inherit the workstation grant.

Setup fails if the owner declines the request, the request expires, or the token cannot be stored.
Starting a new environment therefore establishes authenticated verification as an environment
prerequisite instead of deferring it until handoff.

## Consequences

Agent-run Chrome captures and local editor checks use the approving owner's real account. The owner
performs one explicit grant per new environment, and the short-lived credential expires naturally.
Compromise response remains auth signing-key rotation under the central token contract.
