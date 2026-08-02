import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EXIT,
  checksVerdict,
  detectPullRequestWorkflows,
  mergeStateVerdict,
  parseArgs,
  readChecks,
} from './pr-gate.mjs'

const PR = { number: 631, url: 'https://example/pull/631', headRefName: 'topic', mergeStateStatus: 'CLEAN' }
const base = {
  pr: PR,
  checks: [],
  sawChecks: false,
  appearExpired: false,
  overallExpired: false,
  wait: true,
  appearSeconds: 90,
  workflows: [],
}

test('parseArgs takes a PR number, flags, and rejects junk', () => {
  assert.deepEqual(parseArgs([]), { pr: null, wait: true, appear: 90, timeout: 1800 })
  assert.deepEqual(parseArgs(['631', '--no-wait']), { pr: '631', wait: false, appear: 90, timeout: 1800 })
  assert.equal(parseArgs(['--appear', '5', '--timeout', '60']).appear, 5)
  assert.throws(() => parseArgs(['--bogus']), /unknown flag/)
  assert.throws(() => parseArgs(['--appear', 'soon']), /take seconds/)
})

test('detectPullRequestWorkflows reads only the on: block', () => {
  const files = [
    { name: 'inline.yml', body: 'on: pull_request\n\npermissions: {}\n' },
    { name: 'block.yaml', body: 'on:\n  pull_request:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n' },
    { name: 'push-only.yaml', body: 'on:\n  push:\n    branches: [main]\n\njobs:\n  a:\n    if: pull_request\n' },
    { name: 'dispatch-only.yml', body: 'on:\n  workflow_dispatch:\n\npermissions:\n' },
  ]
  assert.deepEqual(detectPullRequestWorkflows(files), ['inline.yml', 'block.yaml'])
})

test('mergeStateVerdict blocks the CI wait on a conflict', () => {
  const v = mergeStateVerdict({ ...PR, mergeStateStatus: 'DIRTY' })
  assert.equal(v.word, 'CONFLICT')
  assert.equal(v.code, EXIT.CONFLICT)
  assert.match(v.lines.join('\n'), /No CI can run/)
})

test('mergeStateVerdict flags BEHIND and refuses an unresolved UNKNOWN', () => {
  assert.equal(mergeStateVerdict({ ...PR, mergeStateStatus: 'BEHIND' }).code, EXIT.BEHIND)
  // UNKNOWN reaching the verdict means polling already gave up; it must never read as a pass.
  assert.equal(mergeStateVerdict({ ...PR, mergeStateStatus: 'UNKNOWN' }).word, 'ERROR')
})

test('mergeStateVerdict lets mergeable states through to the CI wait', () => {
  for (const s of ['CLEAN', 'UNSTABLE', 'BLOCKED', 'HAS_HOOKS', 'DRAFT']) {
    assert.equal(mergeStateVerdict({ ...PR, mergeStateStatus: s }), null, s)
  }
})

test('checksVerdict keeps polling while checks are pending', () => {
  const checks = [{ name: 'build', bucket: 'pending' }]
  assert.equal(checksVerdict({ ...base, checks, sawChecks: true }), null)
})

test('checksVerdict reports READY only when nothing is pending', () => {
  const checks = [{ name: 'build', bucket: 'pass' }, { name: 'lint', bucket: 'skipping' }]
  const v = checksVerdict({ ...base, checks, sawChecks: true })
  assert.equal(v.word, 'READY')
  assert.equal(v.code, EXIT.READY)
})

test('checksVerdict fails fast on a failing check and names the job link', () => {
  const checks = [
    { name: 'build', bucket: 'pass' },
    { name: 'Check frontend contracts', workflow: 'Docker Build Check', bucket: 'fail', link: 'https://example/job' },
  ]
  const v = checksVerdict({ ...base, checks, sawChecks: true })
  assert.equal(v.code, EXIT.CI_FAILED)
  assert.match(v.lines.join('\n'), /Docker Build Check \/ Check frontend contracts {2}https:\/\/example\/job/)
})

test('checksVerdict waits out an empty read before the appear deadline', () => {
  assert.equal(checksVerdict({ ...base }), null)
})

test('checksVerdict distinguishes unconfigured CI from untriggered CI', () => {
  const unconfigured = checksVerdict({ ...base, appearExpired: true, workflows: [] })
  assert.equal(unconfigured.code, EXIT.NO_CHECKS)
  assert.match(unconfigured.lines.join('\n'), /genuinely unconfigured/)

  const untriggered = checksVerdict({ ...base, appearExpired: true, workflows: ['docker-build-check.yaml'] })
  assert.equal(untriggered.code, EXIT.NO_CHECKS)
  assert.match(untriggered.lines.join('\n'), /DO trigger on pull_request: docker-build-check\.yaml/)
  assert.doesNotMatch(untriggered.lines.join('\n'), /genuinely unconfigured/)
})

test('checksVerdict says so when the workflow directory is unreadable', () => {
  const v = checksVerdict({ ...base, appearExpired: true, workflows: null })
  assert.match(v.lines.join('\n'), /Could not read \.github\/workflows/)
})

test('a check that appeared once stops NO_CHECKS from firing on a transient empty read', () => {
  const v = checksVerdict({ ...base, sawChecks: true, appearExpired: true })
  assert.equal(v, null)
})

test('checksVerdict reports TIMEOUT when checks never finish', () => {
  const checks = [{ name: 'build', bucket: 'pending' }]
  const v = checksVerdict({ ...base, checks, sawChecks: true, overallExpired: true })
  assert.equal(v.code, EXIT.TIMEOUT)
})

test('--no-wait returns immediately instead of polling', () => {
  const pending = checksVerdict({ ...base, checks: [{ name: 'b', bucket: 'pending' }], sawChecks: true, wait: false })
  assert.equal(pending.code, EXIT.TIMEOUT)
  const none = checksVerdict({ ...base, wait: false, workflows: [] })
  assert.equal(none.code, EXIT.NO_CHECKS)
})

test('readChecks maps gh output onto checks, none, or unreadable', () => {
  assert.deepEqual(readChecks({ ok: true, stdout: '[{"name":"a"}]', stderr: '' }), [{ name: 'a' }])
  // gh exits 1 with this on stderr; it means zero checks, not a failure to read.
  assert.deepEqual(readChecks({ ok: false, stdout: '', stderr: 'no checks reported on the "x" branch' }), [])
  assert.deepEqual(readChecks({ ok: true, stdout: '', stderr: '' }), [])
  assert.equal(readChecks({ ok: false, stdout: '', stderr: 'gh: something broke' }), null)
  assert.equal(readChecks({ ok: true, stdout: 'not json', stderr: '' }), null)
})
