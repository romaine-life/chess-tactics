import assert from 'node:assert/strict';
import test from 'node:test';
import {
  guidanceSupportsApprovalInput,
  requestedEnvironmentApprovalInputs,
  requireApprovedEnvironmentName,
} from './codex-auth-grant-contract.mjs';

test('fresh Windows environments request the environment name during approval', () => {
  assert.deepEqual(
    requestedEnvironmentApprovalInputs({
      platform: 'win32',
      environment: null,
      explicitEnvironmentName: '',
    }),
    ['environment_name'],
  );
});

test('existing, explicitly named, and non-Windows environments do not request a name', () => {
  assert.deepEqual(
    requestedEnvironmentApprovalInputs({
      platform: 'win32',
      environment: { name: 'existing' },
      explicitEnvironmentName: '',
    }),
    [],
  );
  assert.deepEqual(
    requestedEnvironmentApprovalInputs({
      platform: 'win32',
      environment: null,
      explicitEnvironmentName: 'explicit',
    }),
    [],
  );
  assert.deepEqual(
    requestedEnvironmentApprovalInputs({
      platform: 'linux',
      environment: null,
      explicitEnvironmentName: '',
    }),
    [],
  );
});

test('approval-input feature detection accepts only an owned guidance entry', () => {
  assert.equal(
    guidanceSupportsApprovalInput({
      supported_approval_inputs: { environment_name: { label: 'Environment name' } },
    }, 'environment_name'),
    true,
  );
  assert.equal(guidanceSupportsApprovalInput({}, 'environment_name'), false);
  assert.equal(
    guidanceSupportsApprovalInput({ supported_approval_inputs: {} }, '__proto__'),
    false,
  );
});

test('requires the approved environment name in the token response envelope', () => {
  assert.equal(
    requireApprovedEnvironmentName({
      approval_values: { environment_name: 'loading-feature' },
    }),
    'loading-feature',
  );
  assert.throws(
    () => requireApprovedEnvironmentName({ approval_values: {} }),
    /approval_values\.environment_name/,
  );
});
