---
status: "accepted; terminal environment-name prompt superseded by ADR-0199"
date: 2026-07-29
deciders: Nelson, Codex
---

# ADR-0197: Codex agents discover named environments from setup state

## Context and Problem Statement

ADR-0196 established a stable owner-named localhost identity and proposed a
project `SessionStart` hook to inject it into agent context. The existing Codex
environment setup already owns the complete lifecycle: it names the worktree,
starts its server, prints the resulting URL, and writes the same identity to an
ignored machine-readable record. Requiring a separately trusted command hook
duplicates that setup contract and adds an unnecessary approval.

## Decision Drivers

- Keep environment creation and identity in one deterministic setup path.
- Let agents and owners observe the same persisted source of truth.
- Avoid a project command-hook trust decision when no lifecycle interception is
  required.
- Preserve dynamic ports as internal details.

## Considered Options

- Inject the identity with a project `SessionStart` hook.
- Discover the identity from setup-owned state and `devctl`.

## Decision Outcome

Chosen: **discover the identity from setup-owned state and `devctl`**.

The Windows Codex setup script remains responsible for prompting for the
environment name, writing `.codex-session/environment.json`, starting the
full-stack Vite process through `devctl`, registering the Caddy route, and
printing the stable URL.

Agents read `url` from `.codex-session/environment.json` before application
verification or user handoff. `devctl list -Json` is the diagnostic fallback.
The repository does not install a project lifecycle hook for this purpose.

This supersedes ADR-0196 while retaining its named-host, auth-labeling,
loopback-only Caddy, dynamic-port, collision, and cleanup decisions.

### Consequences

- Good: New worktrees require no hook review or hook-hash trust.
- Good: Setup, auth, routing, browser verification, and handoff share one
  persisted identity.
- Good: The URL remains easy to inspect in the setup terminal and `devctl`.
- Cost: The URL is not preloaded into model context; agents must follow project
  instructions and read the setup-owned record.

## Pros and Cons of the Options

### Project `SessionStart` hook

- Good: Preloads the URL into every new agent context.
- Bad: Adds a separate executable lifecycle surface and one-time trust review.
- Bad: Duplicates information already written and printed by setup.

### Setup-owned discovery

- Good: Uses the existing deterministic environment lifecycle.
- Good: Avoids hook-specific configuration, approval, and maintenance.
- Bad: Requires an explicit record read when the agent first needs the app URL.

## More Information

- Supersedes ADR-0196.
- Refines ADR-0138's authenticated Codex environment setup.
- The living agent instructions are `AGENTS.md` and `CLAUDE.md`.
