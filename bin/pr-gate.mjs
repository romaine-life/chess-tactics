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

import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)

const MERGE_STATE_POLL_MS = 2000
const MERGE_STATE_LIMIT_MS = 60_000
const CHECK_POLL_MS = 10_000

function parseArgs(argv) {
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

function verdict(word, lines, code) {
  console.log(`VERDICT: ${word}`)
  for (const line of lines) console.log(line)
  process.exit(code)
}

/** Which workflows actually trigger on `pull_request`. Answers "is CI even configured?" */
async function pullRequestWorkflows() {
  try {
    const dir = '.github/workflows'
    const names = (await readdir(dir)).filter((n) => /\.ya?ml$/.test(n))
    const hits = []
    for (const name of names) {
      const body = await readFile(`${dir}/${name}`, 'utf8')
      // Only look at the `on:` block, so a `pull_request` mention in a job body
      // is not miscounted as a trigger.
      const on = body.match(/^on:[\s\S]*?(?=^\S)/m)?.[0] ?? ''
      if (/\bpull_request\b/.test(on)) hits.push(name)
    }
    return hits
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
    verdict('ERROR', [msg], 1)
  }
  return JSON.parse(res.stdout)
}

/**
 * GitHub computes mergeability lazily, so the first read after `gh pr create` is
 * normally UNKNOWN. A one-shot check reads UNKNOWN and sails past — poll until it resolves.
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

function readChecks(res) {
  const noneReported = /no checks reported/i.test(res.stderr || res.stdout)
  if (noneReported) return []
  if (!res.stdout.trim()) return res.ok ? [] : null
  try {
    return JSON.parse(res.stdout)
  } catch {
    return null
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const pr = await settleMergeState(opts.pr)
  const where = `PR #${pr.number} (${pr.headRefName}) ${pr.url}`

  switch (pr.mergeStateStatus) {
    case 'DIRTY':
      verdict('CONFLICT', [
        where,
        'Conflicts with the base branch. No CI can run until this is resolved:',
        'GitHub cannot build the merge commit that `pull_request` workflows run against.',
        'Resolve the conflict, push, and re-run this gate. Do not wait on checks.',
      ], 2)
      break
    case 'BEHIND':
      verdict('BEHIND', [
        where,
        'Base branch has moved and this PR must be updated before it can merge.',
        'Update from the base branch, push, and re-run this gate.',
      ], 3)
      break
    case 'UNKNOWN':
      verdict('ERROR', [
        where,
        `GitHub did not compute mergeability within ${MERGE_STATE_LIMIT_MS / 1000}s. Re-run the gate.`,
      ], 1)
      break
    default:
      break
  }

  const notes = []
  if (pr.isDraft) notes.push('Note: PR is a draft; some workflows skip drafts.')

  const started = Date.now()
  const appearBy = started + opts.appear * 1000
  const overallBy = started + opts.timeout * 1000
  let sawChecks = false

  for (;;) {
    const args = ['pr', 'checks', '--json', 'name,state,bucket,link,workflow']
    if (opts.pr) args.splice(2, 0, opts.pr)
    const checks = readChecks(await gh(args))

    if (checks === null) verdict('ERROR', [where, 'could not read check results from gh'], 1)

    if (checks.length > 0) {
      sawChecks = true
      const failed = checks.filter((c) => c.bucket === 'fail')
      const pending = checks.filter((c) => c.bucket === 'pending')

      if (failed.length > 0) {
        verdict('CI_FAILED', [
          where,
          ...failed.map((c) => `  FAIL ${c.workflow ? `${c.workflow} / ` : ''}${c.name}  ${c.link ?? ''}`),
          ...notes,
        ], 5)
      }
      if (pending.length === 0) {
        verdict('READY', [
          where,
          `mergeStateStatus=${pr.mergeStateStatus}; ${checks.length} check(s) passed or skipped.`,
          ...notes,
        ], 0)
      }
      if (!opts.wait) {
        verdict('PENDING', [where, `${pending.length} check(s) still running.`, ...notes], 6)
      }
    } else if (!sawChecks && (!opts.wait || Date.now() > appearBy)) {
      // The bug class this tool exists for: zero checks is NOT a terminal state, and it does
      // not mean CI is unconfigured. Say which it is instead of waiting forever.
      const workflows = await pullRequestWorkflows()
      const diagnosis = workflows === null
        ? ['Could not read .github/workflows to check trigger configuration.']
        : workflows.length === 0
          ? ['No workflow in .github/workflows triggers on `pull_request`. CI is genuinely unconfigured.']
          : [
              `These workflows DO trigger on pull_request: ${workflows.join(', ')}.`,
              'CI is configured but produced no run — investigate path filters, branch filters,',
              'draft status, or a required approval for first-time contributor runs.',
            ]
      verdict('NO_CHECKS', [
        where,
        `No checks appeared within ${opts.appear}s. mergeStateStatus=${pr.mergeStateStatus}.`,
        ...diagnosis,
        ...notes,
      ], 4)
    }

    if (Date.now() > overallBy) {
      verdict('TIMEOUT', [where, `Checks did not finish within ${opts.timeout}s.`, ...notes], 6)
    }
    await sleep(CHECK_POLL_MS)
  }
}

main().catch((err) => {
  verdict('ERROR', [err.message], 1)
})
