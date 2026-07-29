---
status: accepted
date: 2026-07-29
deciders: Nelson, Codex
---

# ADR-0199: Codex environment names are chosen during auth approval

## Context and Problem Statement

Fresh Windows Codex worktree setup performs two owner interactions in sequence:
first a terminal-launched environment-name prompt, then an
`auth.romaine.life` browser approval for the development token. Both values
belong to the same environment-creation decision, and the auth grant already
provides the durable request, approval, and polling handoff needed to return a
non-secret value to the setup client.

## Decision

A fresh Windows environment requests the auth-owned `environment_name`
approval input when it creates its CLI device grant. The authenticated approval
page renders and validates that known non-secret field, stores its canonical
value on the one-time grant, and returns it as
`approval_values.environment_name` beside the token response. The environment
name is grant metadata and is never added to the JWT.

Before opening the device request, chess-tactics verifies that requester
guidance advertises the required input. It fails before approval if the
deployed auth service does not support the contract. After exchange, setup
writes the approved name through the existing canonical
`.codex-session/environment.json` writer, stores the token separately in
`.codex-session/auth.json`, and continues with branch creation, dependency
installation, `devctl`, Caddy registration, and the named health check.

An existing environment record remains authoritative on setup reruns and does
not request a rename. `CODEX_ENVIRONMENT_NAME` remains the non-interactive
override and is written before the grant request. Non-Windows setup retains its
existing unnamed behavior.

The approval page explicitly says that requested values return to the CLI and
must not contain passwords, tokens, or other secrets. Requesters may select
only auth-owned field names; they cannot provide arbitrary labels, help text,
or form definitions.

## Consequences

- One browser interaction now establishes both the owner-approved development
  credential and the human environment identity.
- The approved name shown in auth is exactly the canonical name later used by
  the local hostname and handoff record.
- Auth must be deployed before this chess-tactics setup change is released;
  feature detection prevents a request against the older contract.
- Local `devctl` remains the collision authority. A name that is already owned
  by another live worktree fails closed during server registration.

## More Information

- Partially supersedes ADR-0197's terminal environment-name prompt while
  retaining its setup-state discovery and `devctl` decisions.
- Refines ADR-0138's browser-approved development-auth setup.
