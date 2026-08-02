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
8. Gate the PR with `node bin/pr-gate.mjs` from the repo root. It checks mergeability, then
   waits out CI, and prints one verdict. **Do not hand-write a `gh pr view` / `gh pr checks`
   polling loop — this tool exists so you never have to.**

   | Verdict | Exit | What to do |
   | --- | --- | --- |
   | `READY` | 0 | Proceed to merge. |
   | `CONFLICT` | 2 | Branch conflicts with base. Resolve, push, re-run the gate. |
   | `BEHIND` | 3 | Update from base, push, re-run the gate. |
   | `NO_CHECKS` | 4 | Read the printed diagnosis; it says whether CI is unconfigured or configured-but-not-triggered. |
   | `CI_FAILED` | 5 | Open the printed job link, fix, rerun local validation, push, re-run the gate. |
   | `TIMEOUT` | 6 | Checks never finished; report the wait rather than merging. |
   | `ERROR` | 1 | Read the message — usually no PR for the branch, or `gh` unavailable. |

   Report `CONFLICT`, `BEHIND`, and `NO_CHECKS` to the user as soon as the gate returns them.
   Each means the long wait is over before it started, not that it should be restarted blindly.
   Use `--no-wait` for a one-shot status read while troubleshooting.
9. Merge the PR after the gate returns `READY`. Use the repository's normal merge method when discoverable; otherwise prefer squash merge for a clean project history. When using `gh pr merge`, do **not** pass `--delete-branch`: it also attempts local branch cleanup/checkouts and can fail when `main` is checked out in another worktree. Merge without that flag and do not manually delete branches as part of the normal flow; remote branch deletion is handled automatically by repository settings.
10. Report the PR URL, merge result, final commit, and dev-server shutdown status.

## Notes

- Do not include unrelated dirty files in the PR.
- Do not force-push or rewrite shared history unless the user explicitly asks.
- Do not rely on `gh pr merge --delete-branch` in worktree-based sessions; it may try to switch the local checkout to `main`. Leave the local worktree and branch cleanup alone unless the user explicitly asks for local cleanup.
- If branch protection, permissions, or external CI access blocks merging, report the exact blocker and leave the PR ready for the user.
