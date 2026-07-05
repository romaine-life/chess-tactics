---
name: dev-end
description: Finish the chess-tactics project coding session. Use when the user invokes $dev-end, asks to finish development, or asks Codex to open a PR, wait for green CI, merge the PR, and close the dev server.
---

# Dev End

## Workflow

Use this closeout workflow for `D:\repos\chess-tactics` after code changes are complete.

1. Stop the dev server started during the session. If the server was started outside the session or ownership is unclear, identify it and ask before killing it.
2. Inspect `git status --short --branch` and review the diff. Keep unrelated user changes out of the commit.
3. Run the relevant local validation before committing. If validation cannot run, explain why before continuing.
4. Stage only files that belong to the completed task.
5. Commit with a concise message that reflects the user-facing change.
6. Push the feature branch.
7. Create a pull request against `main` using the repository's usual tool, normally `gh pr create` when available.
8. Watch CI until it reaches a terminal state.
   - If CI fails, inspect the failing job, fix the issue, rerun validation, push another commit, and continue watching.
   - Do not merge while CI is pending, skipped unexpectedly, or failing.
9. Merge the PR after CI is green. Use the repository's normal merge method when discoverable; otherwise prefer squash merge for a clean project history. When using `gh pr merge`, do **not** pass `--delete-branch`: it also attempts local branch cleanup/checkouts and can fail when `main` is checked out in another worktree. Merge without that flag and do not manually delete branches as part of the normal flow; remote branch deletion is handled automatically by repository settings.
10. Report the PR URL, merge result, final commit, and dev-server shutdown status.

## Notes

- Do not include unrelated dirty files in the PR.
- Do not force-push or rewrite shared history unless the user explicitly asks.
- Do not rely on `gh pr merge --delete-branch` in worktree-based sessions; it may try to switch the local checkout to `main`. Leave the local worktree and branch cleanup alone unless the user explicitly asks for local cleanup.
- If branch protection, permissions, or external CI access blocks merging, report the exact blocker and leave the PR ready for the user.
