# Devctl Environment Reliability Handoff

## Objective

Turn `devctl` from a PID registry into a reliable local development-environment
supervisor.

A named environment must have truthful health state, stable routing, attributable
process exits, and bounded recovery from unexpected failures. A dead environment
must never continue to advertise itself as ready or masquerade as an application,
database, or media failure.

## Incident that prompted this work

The `loading-scenes` chess-tactics environment was registered at:

- URL: `http://loading-scenes.chess-tactics.localhost`
- Expected frontend port: `5174`
- Registered process PID: `51232`

The server log shows that the environment was healthy through **2026-07-29
15:07:25 local time**, when Vite processed HMR updates for the title-bar work.
Shortly afterward, the complete registered process tree disappeared.

The available evidence showed:

- No Vite exception
- No backend exception or orderly backend shutdown
- No Node fatal error
- No Windows out-of-memory or application-crash event
- No recorded `devctl stop loading-scenes`
- No recorded `taskkill` or `Stop-Process` targeting the registered PID
- No process-termination audit event identifying the terminating caller
- `devctl list -Json` reported the environment as dead
- `.codex-session/environment.json` still reported `"status": "ready"`
- Caddy continued routing the named hostname to port 5174
- Port 5174 was no longer listening
- Browser requests consequently produced reverse-proxy failures

The browser retained enough cached frontend state to display part of the
application. Subsequent `/api/media/...` requests failed because the environment
and its backend proxy were gone. This was initially mistaken for a live-media
data failure.

The logs establish that the process tree was terminated externally rather than
exiting through a logged application failure. They do not retain enough
information to identify the exact terminating caller after the fact.

## Current systemic problems

### Readiness is a stale assertion

`.codex-session/environment.json` stores `"status": "ready"` as durable state.
It is not continuously reconciled with process, port, frontend, backend, or
routing health.

### Devctl records a wrapper PID, not a supervised service

Devctl launches a hidden PowerShell process containing npm, Vite, and the
backend process tree. It records the wrapper PID but does not provide durable
supervision or exit attribution.

### Process exits are unattributed

Devctl does not record:

- Exit code or terminating signal
- Whether devctl requested the stop
- Which managed child exited first
- The last successful health check
- A bounded tail of stdout/stderr at failure time
- Whether Windows or another process manager terminated the tree

### Routing outlives service health

Caddy can continue routing a named hostname to a port after the corresponding
environment dies. The resulting `502` responses look like application endpoint
failures even though the entire environment is unavailable.

### Port identity can drift

A named environment and Caddy route can retain one port while a manually or
incorrectly restarted Vite process chooses another. This creates a split-brain
state: the process may exist, but the named URL points elsewhere.

### Verification tools do not fail early enough

Browser and screenshot verification can encounter cached frontend state and
continue until a lower-level request fails. This produces misleading diagnoses
such as missing media, broken authentication, or unavailable database content.

## Required design

### 1. Truthful, derived environment health

Environment status must be derived from current observations rather than trusted
as permanent metadata.

Use at least these states:

- `starting`
- `ready`
- `degraded`
- `restarting`
- `failed`
- `stopped`

An environment is `ready` only when all of the following are true:

1. The supervisor is alive.
2. The expected frontend process is alive.
3. The assigned frontend port is listening.
4. A frontend health request succeeds.
5. A backend health request succeeds through the frontend proxy.
6. The named Caddy route resolves to that exact frontend port.

Any command that reads environment state must reconcile or freshly probe these
conditions. A stale `"ready"` field must never override observed failure.

### 2. A real supervisor

Devctl must own the complete managed process tree:

- PowerShell launcher, if one remains necessary
- npm
- Vite
- chess-tactics backend

Prefer a Windows Job Object or an equivalent explicit process-group mechanism.
Track the actual serving PID and backend PID in addition to any wrapper PID.

The supervisor must:

- Observe child exits
- Distinguish requested shutdown from unexpected termination
- Preserve exit details before restarting
- Prevent orphaned backend processes
- Shut down the complete owned tree on an intentional stop

### 3. Durable exit telemetry

Append one structured event for every lifecycle transition. JSON Lines is a
suitable format.

Each exit event should contain:

- Environment name
- Project and working directory
- Timestamp
- Supervisor PID
- Frontend PID
- Backend PID, when known
- Assigned port
- Exit code
- Terminating signal or Windows termination status, when available
- `requested_stop: true|false`
- Restart attempt number
- Last successful health-check timestamp
- Last failed health-check details
- Bounded stdout/stderr tail
- Configuration and source revision identifiers useful for reproduction

If the platform cannot identify the external terminating caller, state that
explicitly in the event. Do not silently omit the field.

The supervisor should also enable or document the Windows process-auditing
facility needed to attribute external termination where feasible.

### 4. Bounded automatic recovery

Unexpected exits should trigger automatic restart using bounded exponential
backoff.

Suggested policy:

- Restart immediately after the first unexpected exit.
- Back off progressively for repeated exits.
- Stop after a defined number of failures within a rolling time window.
- Transition to `failed` after the retry budget is exhausted.
- Preserve the complete causal chain across attempts.

Do not restart an intentionally stopped environment.

A repeatedly failing environment must remain inspectable. Avoid endless
crash-looping that overwrites the useful first failure.

### 5. Strict, atomic port ownership

A named environment must either:

- Bind its assigned port using strict-port behavior, or
- Atomically select a new port and update the registry, environment metadata,
  health state, and Caddy route as one transaction.

It must never silently bind another port while Caddy retains the old one.

Before reporting readiness:

- Verify which PID owns the listening socket.
- Verify that PID belongs to the managed environment.
- Reject collisions with another worktree or unmanaged process.

### 6. Health-aware Caddy routing

Publish or activate a named Caddy route only after the environment becomes
ready.

When the environment becomes unavailable:

- Remove or deactivate its reverse proxy, or
- Route to a devctl-owned diagnostic response.

The diagnostic response should clearly identify an environment-level failure,
for example:

> Development environment `loading-scenes` is unavailable. Last healthy:
> 2026-07-29 15:07:25. Current state: restarting.

Do not expose a generic reverse-proxy `502` that can be mistaken for a failed
application endpoint.

### 7. Verification preflight

Application verification, browser automation, and screenshot tools must perform
an environment-health preflight before navigation.

The preflight must verify:

- Named environment is registered
- Status is freshly observed as `ready`
- Frontend health succeeds
- Backend health succeeds through the named URL
- Expected hostname routes to the registered port

If the preflight fails, stop immediately with a precise environment-level
error. Do not continue using cached page state.

Example:

> `loading-scenes` is dead; port 5174 is not listening. Last healthy at
> 15:07:25. See lifecycle event `<event-id>`.

### 8. Environment metadata reconciliation

`.codex-session/environment.json` must be treated as discoverable environment
identity, not unquestioned health authority.

Options include:

- Have devctl update it on every state transition, and still verify health when
  reading it.
- Store only stable identity there and obtain current status from devctl.

The second model is preferable because current health is inherently dynamic.

## Required health endpoints

Use separate probes for separate responsibilities.

### Frontend probe

Confirms that the expected Vite/application server is responding and identifies:

- Environment name
- Worktree or repository identity
- Current revision
- Frontend process identity

This prevents a different worktree on the same port from satisfying the check.

### Backend-through-frontend probe

Confirms that:

- Vite's `/api` proxy is operational
- The correct backend is alive
- The backend can satisfy its essential startup dependencies

The response should be lightweight and must not require expensive catalog or
media loading.

### Routing probe

Confirms that the named hostname reaches the same environment identity and port
registered by devctl.

## Regression tests

Automate at least the following scenarios:

1. **Frontend crash**
   - Terminate Vite unexpectedly.
   - Confirm an exit event is recorded.
   - Confirm status leaves `ready`.
   - Confirm bounded restart occurs.

2. **Backend crash**
   - Terminate the backend while Vite remains alive.
   - Confirm status becomes `degraded` or `restarting`.
   - Confirm the backend-through-frontend probe fails clearly.
   - Confirm recovery behavior is recorded.

3. **Intentional stop**
   - Run `devctl stop`.
   - Confirm `requested_stop: true`.
   - Confirm no restart occurs.
   - Confirm the complete process tree exits.

4. **Assigned port occupied**
   - Occupy the requested port with another process.
   - Confirm startup does not silently drift.
   - Confirm the collision identifies the owning PID/process.

5. **Wrong worktree on assigned port**
   - Serve another worktree on the port.
   - Confirm environment-identity health checks reject it.

6. **Vite configuration reload**
   - Modify `vite.config.js`.
   - Confirm reload/restart preserves supervision, port identity, routing, and
     accurate PIDs.

7. **Wrapper process disappears**
   - Terminate the launcher independently.
   - Confirm owned children are handled deterministically.
   - Confirm the event records which process disappeared first.

8. **Caddy unavailable**
   - Stop or misconfigure Caddy.
   - Confirm the environment is not reported ready at its named URL.

9. **Stale environment metadata**
   - Write `"status": "ready"` while the process is dead.
   - Confirm every consumer reports observed dead state.

10. **Repeated crash loop**
    - Force multiple startup failures.
    - Confirm bounded backoff and terminal `failed` state.
    - Confirm the first and final failure evidence remain available.

11. **Cached browser state**
    - Load the app, stop the environment, then revisit with browser cache.
    - Confirm verification preflight reports environment failure before
      diagnosing individual assets or endpoints.

## Acceptance criteria

This work is complete only when:

- A dead process cannot remain reported as ready.
- Every managed process exit has a durable lifecycle event.
- Intentional and unexpected termination are distinguishable.
- An unexpected single crash restarts automatically.
- Repeated crashes terminate in a visible, inspectable failed state.
- A named environment cannot silently serve from a different port.
- Caddy cannot route a healthy-looking named URL to a dead port.
- Health checks identify the exact worktree/environment being served.
- Screenshot and browser verification fail before loading cached application
  state when the environment is unavailable.
- Automated tests cover the failure modes listed above.
- Operator documentation explains how to inspect status, lifecycle events, and
  restart history.

## Implementation locations

The current devctl implementation is outside this repository:

`D:\profiles\shell-config-profile-5\pwsh\devctl.ps1`

Its configuration is adjacent to that script:

`D:\profiles\shell-config-profile-5\pwsh\devctl-apps.json`

Runtime state currently lives under:

`C:\Users\Nelson\.devctl`

Chess-tactics startup and verification integration points include:

- `frontend/scripts/start-vite-dev.mjs`
- `frontend/vite.config.js`
- `frontend/scripts/shot.mjs`
- `.codex-session/environment.json`
- `CLAUDE.md`

Changes to external devctl infrastructure and repository-owned integration
should be coordinated, tested together, and documented without making the
application responsible for supervising its own development environment.

## Non-goals and cautions

- Do not hide failures by setting `DEV_NO_BACKEND=1` or `DEV_OFFLINE=1`.
- Do not classify a generic `502` as an asset, database, or authentication
  failure until environment health is proven.
- Do not use an alternate unregistered Vite port as a verification workaround.
- Do not let automatic restart erase the original failure evidence.
- Do not make durable `"ready"` metadata the source of truth for dynamic health.
