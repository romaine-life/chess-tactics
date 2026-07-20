---
status: accepted
date: 2026-07-20
deciders: Nelson, Codex
refines: "[ADR-0090](0090-private-draft-cards-preview-and-manage-working-copies.md), [ADR-0132](0132-admins-may-direct-read-editor-documents.md), [ADR-0139](0139-persistence-failures-interrupt-editing-and-recovery-conflicts-resolve.md), and [ADR-0140](0140-working-copy-revisions-are-retained-and-owner-restorable.md)"
---

# ADR-0143: Level Editor sessions are attributable, single-writer, and owner-takeoverable

## Context

The Level Editor's working-copy compare-and-swap revision prevents a stale write
from silently replacing a newer server document, but it does not establish who
currently has editing authority. A revision conflict alone cannot distinguish a
live tab on another device from an old browser recovery, an external canonical
Level change, or an unexpected writer. Describing every conflict as "another tab
or device" is therefore both vague and sometimes false.

The same document can also be reached through different browser tabs, devices,
and development servers. A process-memory lock, `BroadcastChannel`, or one
document-wide browser-storage key cannot coordinate those writers or preserve
their independent recovery branches. Conversely, a lock that simply ejects the
previous writer would prevent overwrites while still losing the displaced
editor's branch.

## Decision

Each owner-opened Level Editor page is an attributable **editor session**, and
each editor document has at most one live **writer lease**. The authenticated
document owner may explicitly take that lease from another owner session. Live
editing authority and content divergence are separate state axes; neither is a
proxy for the other.

### Attributable sessions

The server binds every editor session to the authenticated owner's verified
display name and email. It also records an opaque page-session id, an opaque
stable device id relationship, `opened_at`, and server-observed `last_seen_at`.
The device id exists to distinguish **another tab on this device** from another
device; it is not a device fingerprint or an authorization credential, and only
a one-way representation is stored server-side. A human-readable browser/OS
label is best-effort presentation metadata and must never be presented as a
machine name or trusted for authorization.

Whenever another session holds or most recently held editing authority, the
owner-facing editor chrome identifies it with:

- the authenticated display name and email;
- the tab/device relationship, plus a best-effort browser/OS label when useful;
- when the session opened; and
- a server-derived active/last-seen time.

The UI must not substitute "someone," "another user," or an unattributed
"another tab or device" for data the session authority owns. It must also not
invent a person or live session from a browser draft, document revision, or
baseline conflict when no current session record supports that claim.

Registering the owner's opened page creates coordination state only. It does
not create another editor document, mutate its body, Save, publish, change
permissions, or rewrite the URL; copying the address remains side-effect free
under ADR-0068.

### One database-authoritative writer

The lease and a monotonically increasing fencing epoch are durable PostgreSQL
state associated with the editor document. Opening, heartbeats, expiry,
takeover, and every transfer of authority are resolved transactionally against
that state. This remains one authority when requests for the same document hit
different production pods or different local development servers.

Process memory, browser storage, `BroadcastChannel`, Server-Sent Events, and
polling may accelerate presence display or notifications, but none may grant or
extend write authority. Every operation that can replace, rename, promote,
discard, or delete Level Editor working content must prove the current session
id and fencing epoch as well as the applicable document revision. An expired or
displaced session, including an already in-flight request, is rejected even if
its document revision would otherwise match.

An owner page that does not hold the lease is a read-only follower. Its board
may follow acknowledged server state, but editing gestures, autosave, Save,
Discard, rename, and delete cannot mutate the document. A management surface
outside the open editor must either acquire the same owner authority or fail
closed while another writer holds it; it cannot bypass the fence.

### Explicit takeover and displaced-branch recovery

A live lease is never silently transferred because a page loads or because a
revision conflict occurs. The owner receives an explicit **Take over editing**
action naming the current session. Confirmation explains that the other editor
will become read-only and that its latest recoverable branch will be preserved.

Takeover is one transaction that:

1. locks the document's session authority;
2. writes an immutable, owner-scoped recovery snapshot for the displaced
   session from its latest server-known branch and records that snapshot's
   source and capture time;
3. advances the fencing epoch and assigns the lease to the requesting session;
   and
4. returns the displaced recovery identity and new authority to the caller.

The transfer is not successful unless the server-known displaced branch is
durably reachable. Notification to the displaced page follows the transaction;
it is not what makes the transfer authoritative. That page immediately becomes
read-only. If it is still alive and has a newer local candidate, it may upload
that candidate only as another immutable snapshot in its owner-scoped recovery
branch. This post-displacement recovery write can never change the live working
copy, canonical Level, lease, or fencing epoch.

Preserved copies are reachable from the document's Status/recovery UI, not only
from a toast or transient activity message. They identify their source session,
capture source, and capture time and remain until the owner explicitly removes
them. Restoring one requires the current writer lease, first snapshots the
current working branch, and then creates a new fenced working-copy revision; it
never mutates history in place or creates a second canonical Level.

Lease expiry does not erase the previous branch. Resuming after an expired
session preserves the last server-known branch and tells the owner when it was
captured before a new lease is granted.

### Browser recovery is per session and is not presence

Browser storage remains a crash/offline fallback, but each draft is keyed and
payload-validated by account, opaque document id, and page-session id. Two tabs
on the same device therefore cannot overwrite one another's recovery. A draft
also records its observed document revision, fencing epoch, and local write
time. It never grants a lease and never proves that its source session is live.

The old account-plus-document singleton key is retired. Migration may consume
it once into a session-scoped recovery candidate and must then delete it; no
continuing reader, writer, compatibility branch, or fallback to that key
remains.

The system can preserve only content that reached a server checkpoint or a
session-scoped browser draft. It cannot recover edits that existed solely in a
dead tab's RAM and were never written anywhere. Recovery UI therefore reports
the actual body checkpoint time separately from session `last_seen_at`, names
whether a copy came from an acknowledged server body or a live displaced-tab
upload, and never promises that a dead tab's unsent RAM was captured.

### Authority and content conflicts stay distinct

The editor represents these conditions independently:

- **Live editing authority:** checking, writing here, following another
  attributable session, takeover pending, or displaced.
- **Browser recovery:** a session-scoped local candidate that may have diverged
  from the acknowledged working copy. It offers review/preserve/keep-cloud
  choices and is never automatically applied by takeover.
- **Canonical baseline conflict:** the saved canonical Level changed while the
  working copy remained dirty. It offers compare/rebase/discard decisions, not
  takeover, because changing canonical content is not evidence of a live editor
  session.
- **Unexpected document revision conflict:** an acknowledged working revision
  changed outside the holder's fenced sequence. The local candidate is
  preserved for recovery and the authority is reloaded; the conflict does not
  invent an identity when no session record exists.

Presence may add attribution to a real live-authority state, but it never
collapses these content states into one generic conflict. Taking over grants
write authority only; it does not choose which divergent content should win.

### Owner-only mutation boundary

Only the authenticated document owner may create an editing session, acquire or
take over its lease, upload or list recovery branches, restore one, or otherwise
mutate the document. The ADR-0132 administrator exception remains exact-link
read-only. An administrator reviewing another owner's document does not create
presence, block the owner, acquire a lease, take over, or access that owner's
recovery branches. No possession of a document id, session id, device id, or
recovery id grants cross-owner authority.

## Required verification

- Two backend processes using the same database cannot simultaneously grant
  the lease for one document.
- A takeover transaction creates the displaced recovery before it returns the
  new epoch, and an old-epoch request already in flight is rejected.
- Browser recovery, baseline conflict, revision conflict, and live competing
  authority exercise distinct state and actions; a recovery without presence
  never receives an invented person or device label.
- Two same-browser tabs keep independent local drafts, and migration consumes
  and deletes the retired singleton key exactly once.
- A displaced live page can append its local candidate to recovery without
  changing the working copy, while a dead-tab case reports only the last actual
  body checkpoint.
- An administrator's exact cross-owner read cannot create/list a session,
  heartbeat, take over, upload/list/restore recovery, or invoke any fenced
  document mutation.

## Consequences

- Owners can tell exactly which of their tabs or devices has authority and can
  deliberately move editing without silently overwriting either branch.
- Fencing protects the document across server processes and closes the race in
  which an old in-flight write arrives after takeover.
- Recovery has durable, owner-reachable provenance instead of being implied by
  a generic conflict message.
- Session heartbeats, lease expiry, recovery storage, and owner-facing recovery
  management add schema, endpoint, and lifecycle work.
- A tab that dies before writing its newest changes anywhere remains
  unrecoverable; the product must state that limit rather than claiming complete
  preservation.

## Rejected alternatives

- **Revision compare-and-swap alone:** prevents silent overwrite but cannot
  identify the writer, make one tab read-only before a collision, or support an
  intentional transfer.
- **Browser- or process-local locking:** cannot coordinate different devices,
  backend processes, or development servers and is not an authorization
  boundary.
- **Last opener wins:** makes route loading destructive and can discard a live
  branch without owner intent.
- **Takeover without recovery:** transfers authority but fails the requirement
  to preserve and expose the displaced work.
- **Treat every recovery or baseline conflict as presence:** displays false
  identity and offers the wrong resolution action.

## More Information

- [Persistence: Level editor working copies and sessions](../persistence.md#level-editor-working-copies-and-sessions)
- [ADR-0068: Link-copy controls are side-effect free](0068-link-copy-controls-are-side-effect-free.md)
- [ADR-0090: Private draft cards preview and manage working copies](0090-private-draft-cards-preview-and-manage-working-copies.md)
- [ADR-0132: Admins may direct-read editor documents](0132-admins-may-direct-read-editor-documents.md)
- [ADR-0139: Persistence failures interrupt editing and recovery conflicts resolve](0139-persistence-failures-interrupt-editing-and-recovery-conflicts-resolve.md)
- [ADR-0140: Working-copy revisions are retained and owner-restorable](0140-working-copy-revisions-are-retained-and-owner-restorable.md)
- [Migration policy](../migration-policy.md)
