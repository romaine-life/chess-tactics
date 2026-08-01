---
status: accepted
date: 2026-08-01
deciders: owner (Nelson) + Codex
extends:
  - "[ADR-0197](0197-codex-agents-discover-named-environments-from-setup-state.md)"
  - "[ADR-0199](0199-codex-environment-names-are-chosen-during-auth-approval.md)"
---

# ADR-0308: Local development layers have one recovery owner

## Context

The named Windows development environment accumulated three mechanisms with an
unclear boundary. Caddy routed the stable hostname, devctl supervised the
top-level Vite launch, and Vite launched and recovered the required backend.
Devctl nevertheless also treated a failed backend health probe as authority to
terminate the complete Vite process tree. One backend crash could therefore
activate two independent recovery loops.

The repository instructions described a Vite-owned process tree while the
devctl reliability handoff said devctl owned the complete process tree. Both
statements were true only in different senses—application-child lifecycle versus
operating-system containment—and the unstated distinction produced competing
behavior.

Caddy cannot resolve this conflict. A reverse proxy maps a hostname to a port;
it does not allocate the port, persist the application beyond a shell, own
intentional stop, retain lifecycle evidence, or recover an exited top-level
process.

## Decision

Each local-development layer has exactly one recovery owner:

- **Caddy owns routing only.** It publishes the named reverse proxy while the
  environment is ready and a devctl diagnostic response while it is unavailable.
  It never launches or restarts application processes.
- **Devctl owns environment lifecycle and OS containment.** It owns environment
  identity, port allocation, the persistent top-level `npm run dev` launch, the
  Windows Job Object containing that launch, intentional stop, observations,
  lifecycle logs, and bounded restart after the top-level launch exits
  unexpectedly.
- **Vite owns the backend child lifecycle.** It launches, observes, and recovers
  the backend. If its bounded startup/recovery contract cannot restore the
  required backend, Vite exits nonzero and hands recovery to devctl at the
  top-level process boundary.

Backend or routing health loss after an environment has reached ready is an
observation, not permission for devctl to terminate a living Vite process.
Devctl marks the environment degraded, replaces the reverse proxy with its
diagnostic route, and continues observing. Recovery restores the route without
changing the Vite PID. A persistent application failure must cause the
application owner to exit; only that top-level exit activates devctl's restart
budget.

Direct application readiness and aggregate named-route readiness are separate
state. The supervisor publishes the direct-readiness fact atomically before
requesting a route change; Caddy consumes that fact rather than inferring it
from aggregate `ready`/`degraded` status. This ordering lets a recovered app
replace its diagnostic route before that named route can pass its own check.

Before an environment has ever become ready, devctl may enforce its top-level
startup deadline. This is supervision of a launch that failed to satisfy its
contract, not a competing backend recovery policy.

## Consequences

- One backend crash produces one recovery attempt sequence rather than nested
  whole-environment restarts.
- The named URL remains truthful during recovery without stranding the browser
  on a generic Caddy 502.
- Devctl remains necessary even with Caddy because persistence, identity,
  lifecycle, observation, and top-level recovery are not routing concerns.
- A regression test must kill an app-owned backend for longer than the former
  devctl health-failure threshold and prove that the backend PID changes while
  the frontend and launcher PIDs do not. It must also observe Caddy publish the
  diagnostic route during the outage and restore the reverse proxy afterward.
- New managed applications must place child recovery inside the application or
  make the top-level process exit. Devctl does not grow component-specific
  restart branches.

## Rejected alternatives

### Let Caddy replace devctl

Rejected because Caddy has no process, worktree, port-allocation, intentional
stop, or lifecycle-evidence authority.

### Let devctl restart the whole tree after several failed child probes

Rejected because a generic health observer cannot know whether the child owner
is already recovering, preserving state, or collecting failure evidence. This
was the competing behavior that extended the outage.

### Add an opt-in grace period only for Chess Tactics

Rejected because ownership is an invariant, not per-surface or per-application
timing. Health never grants component recovery authority to devctl after ready.

## More Information

- [Devctl environment supervision contract](../devctl-environment-supervision-handoff.md)
- [Repository development rules](../../CLAUDE.md)
- External devctl source: `D:\profiles\shell-config-profile-5\pwsh`
