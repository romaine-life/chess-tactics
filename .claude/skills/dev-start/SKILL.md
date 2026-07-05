---
name: dev-start
description: Prepare the chess-tactics project for a coding session. Use when the user invokes $dev-start, asks to start development, or asks Codex to begin a project change workflow that should start from a fresh worktree branched from the latest origin/main with a fresh dev server.
---

# Dev Start

## Workflow

Use this session workflow for `D:\repos\chess-tactics` before making code changes.

1. Inspect the repository state with `git status --short --branch`.
2. Fetch remotes with `git fetch origin`. Treat `origin/main` as the source of truth for the fresh development base.
3. Create a fresh sibling worktree from `origin/main`, with a new `codex/` feature branch for the requested work unless the user already named a branch.
   - Prefer a descriptive sibling path next to the main checkout, such as `D:\repos\chess-tactics-<short-task-name>`.
   - Use `git worktree add -b <branch> <sibling-path> origin/main`.
   - If the current checkout has tracked or untracked changes, leave it untouched; do not stop just because the original checkout is dirty.
   - Only require a clean worktree if you are about to change branches, pull, merge, rebase, stash, delete, or otherwise mutate that existing checkout.
4. If the named branch or sibling path already exists, choose another safe descriptive name or ask the user if the intended destination is ambiguous.
5. Re-check `git status --short --branch` and report any blocker before edits.
6. Implement the user's requested code changes, preserving unrelated existing changes if any appear during the session.
7. Run the focused validation that matches the change. Broaden tests when touching shared behavior or user-facing workflows.
8. Start a fresh dev server after implementation.
   - Close or replace any server started by this session before launching a new one.
   - Start the dev server with the repository's normal command, usually `npm run dev`.
   - Let the repository's normal dev command run its own fresh-worktree setup hooks, including dependency installation for services it starts.
   - Do not pre-check backend dependencies or run ad hoc backend install commands before the normal dev command.
   - Do not scan for ports, choose ports, or pass a port flag such as `--port`.
   - Let the dev server choose its own available port, then read the printed local URL from stdout and tell the user that URL.
   - Inspect the repository to find the most specific URL for the thing the user requested. Prefer a direct feature, page, puzzle, scenario, editor state, or other inspectable route over the generic localhost root.
   - If the work is on a feature that can be tested in a playable surface, craft a playable board in the editor and send the user a link to that test version of the board.
   - Keep the server running for the user unless they ask to stop it or `$dev-end` is invoked.
   - After a dev server has been created, every user-facing turn must include a clickable Markdown link to the server or the most relevant feature route being worked on.
   - Never put that server or feature URL in a code block or inline code. Use normal Markdown link syntax, such as [Open the feature](http://127.0.0.1:5173/path).

## Notes

- For fresh development starts, avoid mutating the original checkout; create a sibling worktree from `origin/main` instead.
- Do not "clean up" unexpected files automatically.
- Prefer the repository's existing package scripts and development conventions over inventing new commands.
- If a dirty worktree blocks an operation you must perform in that same checkout, the correct result is a concise blocker report and a question for the user.
- Once the dev server is running, include a Markdown link to the active server/feature in every status update and final response until the server is stopped.
