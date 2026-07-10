# Agent Workflow

## User verification gates feature completion

- A feature is not complete until the user has verified it in the running application and explicitly confirmed that it works.
- Automated tests, type checks, builds, and agent-run browser checks are prerequisites for handoff, not substitutes for the user's verification.
- After implementing a feature, describe it as **ready for verification**, provide the exact development URL, and keep that development server running.
- Do not stop the development server or report the feature as done while user verification is still pending.
- If the application cannot be made available for verification, report the blocker clearly and leave the feature marked as unverified.
