---
name: end-dev
description: Close out a coding session — make sure everything is pushed, wait for CI to go green, merge the branch, and stop the dev server to free its ports.
---

# /end-dev — Land the work and clean up

Run this to finish a coding session cleanly. The goal: the work is merged, CI
proved it green first, and no orphaned dev server is holding ports.

## Do this in order

1. **Make sure everything is pushed.** Confirm the branch's commits are all on
   the remote — `git status` clean, nothing ahead of origin. If there's
   anything uncommitted or unpushed, commit and push it (don't ask — see
   `/start-dev`). Losing local-only work at the finish line is the failure this
   step exists to prevent.

2. **Wait for CI to be green.** Do not merge on faith. Poll the branch's CI
   (e.g. `gh pr checks` / `gh run watch`) until it actually reports success. If
   CI fails, fix it — a red or pending pipeline is not "done."

3. **Merge.** Only once CI is green, merge the branch (into `main`). Use the
   repo's normal merge path (`gh pr merge`, or the project's convention).

4. **Stop the dev server to free the ports.** Shut down the `npm run dev` server
   this session started so its frontend/backend ports are released for other
   worktrees. Don't leave it running after the work has landed.

Pair with `/start-dev`, which opens the session.
