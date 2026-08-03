---
name: dev-end
description: Finish the chess-tactics project coding session. Use when the user invokes $dev-end, asks to finish development, or asks Codex to open a PR, wait for green CI, merge the PR, and close the dev server.
---

# Dev End

## Workflow

Use this closeout workflow for `D:\repos\chess-tactics` after code changes are complete.

1. **Delete the production state this session created to verify itself.** `npm run dev` talks to
   production Postgres, so a throwaway Level Editor document opened for a screenshot, a scratch
   level, or any other verification artifact is a real row in the owner's live data. Clean up what
   you made:
   - Editor documents — `DELETE /api/editor-documents/<documentId>` for each one the session
     created. A document reached through `?board=<code>` mints a NEW document on open, so every
     such link left a row behind.
   - Scratch files written into the repo (`tmp-shots/` is gitignored and fine to leave).

   Do this **before** step 2: the API is only reachable through the running dev server. Only
   delete what this session created — never an owner document you merely opened or were handed.
   If something can't be removed, name it and its id in the final report instead of leaving it
   silently behind.
2. Stop the dev server started during the session. If the server was started outside the session or ownership is unclear, identify it and ask before killing it. If a later step sends you back to fix something, restart it through `devctl` rather than working blind.
3. Inspect `git status --short --branch` and review the diff. Keep unrelated user changes out of the commit.
4. Run the **exact command CI runs**, not a subset of it. Bare `vitest` is not the gate and
   passes while CI fails: `npm run check` also runs `tsc --noEmit` and every
   `frontend/scripts/check-*.mjs` guard, several of which pin exact JSX literals and break on
   any shell or chrome refactor.
   - Touched `frontend/` — `cd frontend && npm run check`
   - Touched `backend/`, `bin/`, or `packages/` — `cd backend && npm run test:backend`. Its
     tail (`smoke-test.js`) needs Postgres, which this Windows box does not have. When it
     cannot run, say so plainly and name what did: `node netplay-smoke-test.js` covers all
     lobby/netplay behaviour DB-free, and a narrow change can run just its own script (for
     example `npm run test:pr-gate`).
   If validation cannot run, explain why before continuing. Do not proceed to a PR on a
   subset run and describe it as green.
5. Stage only files that belong to the completed task.
6. Commit with a concise message that reflects the user-facing change.
7. Push the feature branch.
8. Create a pull request against `main` using the repository's usual tool, normally `gh pr create` when available.
9. Gate the PR with `node bin/pr-gate.mjs` from the repo root. It checks mergeability, then
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
10. Merge the PR after the gate returns `READY`. Use the repository's normal merge method when discoverable; otherwise prefer squash merge for a clean project history. When using `gh pr merge`, do **not** pass `--delete-branch`: it also attempts local branch cleanup/checkouts and can fail when `main` is checked out in another worktree. Merge without that flag and do not manually delete branches as part of the normal flow; remote branch deletion is handled automatically by repository settings.
11. Report the PR URL, merge result, final commit, cleanup of session-created production state, and dev-server shutdown status.

## Notes

- The owner's **active Run** is the one exception to step 1: it is disposable test state, crafting
  over it is expected, and it needs no cleanup and no mention beyond stating a format consequence.
- Adding a NEW live-media slot for review is additive and recoverable by retiring it; overwriting,
  retiring, or re-pointing an EXISTING slot is a production content change. Never undo one as
  "cleanup" — report it and let the owner decide.
- Do not include unrelated dirty files in the PR.
- Do not force-push or rewrite shared history unless the user explicitly asks.
- Do not rely on `gh pr merge --delete-branch` in worktree-based sessions; it may try to switch the local checkout to `main`. Leave the local worktree and branch cleanup alone unless the user explicitly asks for local cleanup.
- If branch protection, permissions, or external CI access blocks merging, report the exact blocker and leave the PR ready for the user.
