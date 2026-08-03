---
name: chess-dev-start
description: Set up this worktree's named dev environment for chess-tactics. Use when the user invokes $chess-dev-start, or asks to start the dev server / bring the environment up at the beginning of a session.
---

# Chess Dev Start

Run once, at the start of the session:

```
bin\codex-worktree-setup.cmd
```

It requests a browser-approved auth grant, ensures dependencies and the preview build, and starts
the named full-stack dev server through devctl. It prints the environment URL when it finishes —
hand that URL to the owner and use it for screenshots and verification.

## Notes

- A session gets a fresh worktree, so nothing is set up when the session begins. Run this once and
  do not re-run it. If a later step needs the server back, say so and run it again deliberately.
- Do not add guards, ownership checks, or "is it already running" logic to the script. There is
  only ever one session in a worktree; the conditions those would test cannot occur.
- `DEV_NO_BACKEND=1` and `DEV_OFFLINE=1` are owner-only. If the backend fails to start, fix the
  backend or report it as the blocker.
