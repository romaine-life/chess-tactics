---
name: start-dev
description: Begin a coding session on a fresh worktree — rebase onto origin/main (the source of truth), stand up a review-ready frontend+backend dev server against the prod DB, and switch on commit-and-push-liberally mode.
---

# /start-dev — Ground the worktree and stand up a server before writing code

Run this at the very start of a coding session, before touching any feature
code. It has two jobs: make the worktree correct, and make the work reviewable.

## 1. Origin main is the source of truth — merge it in first

Do NOT camp on stale main. Before you write a line of code, this worktree must
be based off the current `origin/main`:

```
git fetch origin
git merge origin/main --no-edit   # fast-forward when possible
```

If it doesn't fast-forward, resolve honestly — do not paper over conflicts.
State the before/after commit so the user can see the worktree moved onto
current origin/main. This is not optional and not "usually fine to skip" — a
fresh worktree can be behind, and the whole point is to never build on stale
main.

## 2. Stand up a dev server the user can review against

Follow the in-repo guidance (`CLAUDE.md`) for standing up the server. The
shortcut we take in dev:

- **Use the prod DB.** We do not spin up a local Postgres. `npm run dev` spawns
  `backend/server.js` as a child pointed at the prod Flexible Server
  (passwordless via `az login`), signed in as the real account.
- **Spin up BOTH frontend and backend, every time.** Don't try to figure out
  whether a given change needs the backend — just let vite create it. Run
  `npm run dev` from `frontend/`.
- **Let vite pick the ports.** It dynamically chooses a free frontend port and a
  free backend port so concurrent worktree servers never collide. Do NOT
  override this — no `--port`, no `--strictPort`, no pinned `port` in
  `launch.json`.
- **Leave it running.** Don't kill the server you handed the user for review.

Then hand the user the exact route to look at.

### Giving the user a URL

**URLs must be markdown links, never inside code blocks or backticks** — the
user navigates by clicking, and a fenced/backticked URL isn't clickable. Write
[http://localhost:5179/](http://localhost:5179/), not a code block.

## 3. Nothing is done until the user reviews it

Do not assume your output is good. Every change is the user's to review — build
it, make it reviewable (running server + clickable route), and let them judge
it. Don't declare a feature finished as if review is a formality.

## 4. Commit and push liberally — never ask

This is a feature branch. There is never a reason not to commit, and never a
reason not to push.

- **Commit liberally, push liberally, by default.** If the session is lost, the
  user wants the code already on GitHub.
- **It is forbidden to ask "do you want me to commit this?" or "do you want me
  to push this?"** Just do it — it's free. Don't spend tokens asking.
- **Do not message the user about uncommitted or unpushed work.** There is no
  such thing as work worth leaving uncommitted here. Commit it and push it.

Carry these habits for the rest of the session. Pair with `/end-dev` to close
the session out.
