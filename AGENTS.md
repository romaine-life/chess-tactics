# Agent Instructions

## Visual Verification

- For visual UI work, especially Chrome Lab, level editor chrome, rail/atom alignment, clipping, overflow, title text placement, preview surfaces, and dark-theme controls, do not treat typecheck or static inspection as sufficient verification.
- Take a screenshot of the affected surface before reporting the work as done. Inspect the screenshot for the actual visual claim being made.
- If browser or screenshot tooling appears unavailable, fixing or diagnosing that verification path becomes the priority. Do not stop at the first blocked screenshot attempt.
- A blocked screenshot attempt must be investigated until the concrete blocker is known: crashed page, dev server down, navigation/policy issue, stale tab, console/runtime error, or missing browser capability.
- If the blocker is an app crash or runtime error, fix that blocker before returning to the original visual task.
- Do not deliver visual work as complete while screenshot verification is blocked.
- If visual verification genuinely cannot be restored in the current turn after diagnosis, say exactly what was tried, what the concrete blocker is, and what user/external action is needed. Do not imply the change was visually verified.
- When screenshot verification is missing for visual UI work, the final response must be failure-first. Do not frame the work as done, successful, implemented, or complete.
- In that failure state, do not lead with edited files, feature descriptions, passing checks, or optimistic progress. The headline message is that the routine visual verification task failed and the work is blocked.
- Mention code edits or passing non-visual checks only as secondary context if they help the user decide what to do next.
