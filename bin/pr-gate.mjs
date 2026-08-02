#!/usr/bin/env node
// pr-gate — one command that answers "is this PR actually ready to merge?"
//
// Replaces the agent-authored poll loop that cost tokens and got the answer wrong: a
// CONFLICTING PR produces no CI at all, because `pull_request` workflows run against a
// merge commit GitHub cannot create. Watching one waits forever and reads as "CI is not
// configured". This gates mergeability FIRST, then bounds the CI wait on checks appearing.
//
//   node bin/pr-gate.mjs [<pr>] [--no-wait] [--appear <s>] [--timeout <s>]
//
// Exit codes: 0 READY · 2 CONFLICT · 3 BEHIND · 4 NO_CHECKS · 5 CI_FAILED · 6 TIMEOUT · 1 ERROR
//
// The decision logic below is pure and exported so ../bin/pr-gate.test.mjs can cover every
// verdict without a live PR. Only main() touches gh or the clock.

import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

const MERGE_STATE_POLL_MS = 2000
const MERGE_STATE_LIMIT_MS = 60_000
const CHECK_POLL_MS = 10_000

export const EXIT = {
  READY: 0,
  ERROR: 1,
  CONFLICT: 2,
  BEHIND: 3,
  NO_CHECKS: 4,
  CI_FAILED: 5,
  TIMEOUT: 6,
}

export function parseArgs(argv) {
  const opts = { pr: null, wait: true, appear: 90, timeout: 1800 }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--no-wait') opts.wait = false
    else if (arg === '--appear') opts.appear = Number(argv[++i])
    else if (arg === '--timeout') opts.timeout = Number(argv[++i])
    else if (!arg.startsWith('-')) opts.pr = arg
    else throw new Error(`unknown flag ${arg}`)
  }
  if (!Number.isFinite(opts.appear) || !Number.isFinite(opts.timeout)) {
    throw new Error('--appear and --timeout take seconds')
  }
  return opts
}

/**
 * Which workflows actually trigger on `pull_request`. Answers "is CI even configured?"
 * Only the `on:` block counts, so a `pull_request` mention inside a job body is not
 * miscounted as a trigger. Handles both `on: pull_request` and the block form.
 */
export function detectPullRequestWorkflows(files) {
  return files
    .filter(({ body }) => {
      const on = body.match(/^on:[\s\S]*?(?=^\S)/m)?.[0] ?? ''
      return /\bpull_request\b/.test(on)
    })
    .map(({ name }) => name)
}

export function describePr(pr) {
  return `PR #${pr.number} (${pr.headRefName}) ${pr.url}`
}

/** Verdict for a resolved mergeStateStatus, or null to proceed to the CI wait. */
export function mergeStateVerdict(pr) {
  const where = describePr(pr)
  switch (pr.mergeStateStatus) {
    case 'DIRTY':
      return {
        word: 'CONFLICT',
        code: EXIT.CONFLICT,
        lines: [
          where,
          'Conflicts with the base branch. No CI can run until this is resolved:',
          'GitHub cannot build the merge commit that `pull_request` workflows run against.',
          'Resolve the conflict, push, and re-run this gate. Do not wait on checks.',
        ],
      }
    case 'BEHIND':
      return {
        word: 'BEHIND',
        code: EXIT.BEHIND,
        lines: [
          where,
          'Base branch has moved and this PR must be updated before it can merge.',
          'Update from the base branch, push, and re-run this gate.',
        ],
      }
    case 'UNKNOWN':
      return {
        word: 'ERROR',
        code: EXIT.ERROR,
        lines: [
          where,
          `GitHub did not compute mergeability within ${MERGE_STATE_LIMIT_MS / 1000}s. Re-run the gate.`,
        ],
      }
    default:
      return null
  }
}

/**
 * Verdict for the current check set, or null to keep polling.
 * `checks` is the parsed `gh pr checks --json` array; `sawChecks` stays true once any
 * check has ever appeared, so a transient empty read cannot trip the NO_CHECKS path.
 */
export function checksVerdict({
  pr,
  checks,
  sawChecks,
  appearExpired,
  overallExpired,
  wait,
  appearSeconds,
  workflows,
  notes = [],
}) {
  const where = describePr(pr)

  if (checks.length > 0) {
    const failed = checks.filter((c) => c.bucket === 'fail')
    if (failed.length > 0) {
      return {
        word: 'CI_FAILED',
        code: EXIT.CI_FAILED,
        lines: [
          where,
          ...failed.map((c) => `  FAIL ${c.workflow ? `${c.workflow} / ` : ''}${c.name}  ${c.link ?? ''}`),
          ...notes,
        ],
      }
    }
    const pending = checks.filter((c) => c.bucket === 'pending')
    if (pending.length === 0) {
      return {
        word: 'READY',
        code: EXIT.READY,
        lines: [
          where,
          `mergeStateStatus=${pr.mergeStateStatus}; ${checks.length} check(s) passed or skipped.`,
          ...notes,
        ],
      }
    }
    if (!wait) {
      return {
        word: 'TIMEOUT',
        code: EXIT.TIMEOUT,
        lines: [where, `${pending.length} check(s) still running.`, ...notes],
      }
    }
  } else if (!sawChecks && (!wait || appearExpired)) {
    // The bug class this tool exists for: zero checks is NOT a terminal state, and it does
    // not mean CI is unconfigured. Say which it is instead of waiting forever.
    const diagnosis = workflows === null
      ? ['Could not read .github/workflows to check trigger configuration.']
      : workflows.length === 0
        ? ['No workflow in .github/workflows triggers on `pull_request`. CI is genuinely unconfigured.']
        : [
            `These workflows DO trigger on pull_request: ${workflows.join(', ')}.`,
            'CI is configured but produced no run — investigate path filters, branch filters,',
            'draft status, or a required approval for first-time contributor runs.',
          ]
    return {
      word: 'NO_CHECKS',
      code: EXIT.NO_CHECKS,
      lines: [
        where,
        `No checks appeared within ${appearSeconds}s. mergeStateStatus=${pr.mergeStateStatus}.`,
        ...diagnosis,
        ...notes,
      ],
    }
  }

  if (overallExpired) {
    return { word: 'TIMEOUT', code: EXIT.TIMEOUT, lines: [where, 'Checks did not finish in time.', ...notes] }
  }
  return null
}

/** Parse `gh pr checks --json` output. Returns [] for "none reported", null if unreadable. */
export function readChecks(res) {
  if (/no checks reported/i.test(res.stderr || res.stdout)) return []
  if (!res.stdout.trim()) return res.ok ? [] : null
  try {
    return JSON.parse(res.stdout)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- side effects below

// gh exits non-zero for states we care about (8 = checks pending, 1 = none reported), so
// never throw on exit code alone — the caller inspects stdout/stderr and decides.
async function gh(args) {
  try {
    const { stdout } = await run('gh', args, { maxBuffer: 8 * 1024 * 1024 })
    return { ok: true, stdout, stderr: '', code: 0 }
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error('gh CLI not found on PATH')
    return { ok: false, stdout: err.stdout ?? '', stderr: err.stderr ?? '', code: err.code ?? 1 }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function emit(v) {
  console.log(`VERDICT: ${v.word}`)
  for (const line of v.lines) console.log(line)
  process.exit(v.code)
}

async function readWorkflowFiles() {
  try {
    const dir = '.github/workflows'
    const names = (await readdir(dir)).filter((n) => /\.ya?ml$/.test(n))
    return await Promise.all(
      names.map(async (name) => ({ name, body: await readFile(`${dir}/${name}`, 'utf8') })),
    )
  } catch {
    return null
  }
}

async function resolvePr(prArg) {
  const args = ['pr', 'view', '--json', 'number,url,mergeable,mergeStateStatus,isDraft,headRefName']
  if (prArg) args.splice(2, 0, prArg)
  const res = await gh(args)
  if (!res.ok) {
    const msg = (res.stderr || res.stdout).trim().split('\n')[0] || 'gh pr view failed'
    emit({ word: 'ERROR', code: EXIT.ERROR, lines: [msg] })
  }
  return JSON.parse(res.stdout)
}

/**
 * GitHub computes mergeability lazily, so the first read after `gh pr create` is normally
 * UNKNOWN. A one-shot check reads UNKNOWN and sails past — poll until it resolves.
 */
async function settleMergeState(prArg) {
  const deadline = Date.now() + MERGE_STATE_LIMIT_MS
  let pr = await resolvePr(prArg)
  while (pr.mergeStateStatus === 'UNKNOWN' && Date.now() < deadline) {
    await sleep(MERGE_STATE_POLL_MS)
    pr = await resolvePr(prArg)
  }
  return pr
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const pr = await settleMergeState(opts.pr)

  const blocked = mergeStateVerdict(pr)
  if (blocked) emit(blocked)

  const notes = pr.isDraft ? ['Note: PR is a draft; some workflows skip drafts.'] : []
  const started = Date.now()
  const appearBy = started + opts.appear * 1000
  const overallBy = started + opts.timeout * 1000
  let sawChecks = false

  for (;;) {
    const args = ['pr', 'checks', '--json', 'name,state,bucket,link,workflow']
    if (opts.pr) args.splice(2, 0, opts.pr)
    const checks = readChecks(await gh(args))
    if (checks === null) {
      emit({ word: 'ERROR', code: EXIT.ERROR, lines: [describePr(pr), 'could not read check results from gh'] })
    }
    if (checks.length > 0) sawChecks = true

    const files = checks.length === 0 && !sawChecks ? await readWorkflowFiles() : []
    const verdict = checksVerdict({
      pr,
      checks,
      sawChecks,
      appearExpired: Date.now() > appearBy,
      overallExpired: Date.now() > overallBy,
      wait: opts.wait,
      appearSeconds: opts.appear,
      workflows: files === null ? null : detectPullRequestWorkflows(files),
      notes,
    })
    if (verdict) emit(verdict)

    await sleep(CHECK_POLL_MS)
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  main().catch((err) => emit({ word: 'ERROR', code: EXIT.ERROR, lines: [err.message] }))
}
