import { describe, expect, it } from 'vitest';
import {
  createSceneFailureRecovery,
  sceneFailureError,
  sceneFailureRemedy,
} from './sceneFailure';

const unreachable = { reachable: false, identityKey: 'unknown' };
const signedIn = { reachable: true, identityKey: 'account:nelson@romaine.life' };
const otherAccount = { reachable: true, identityKey: 'account:someone@else.test' };
const anonymous = { reachable: true, identityKey: 'anonymous' };

describe('scene failure remedy', () => {
  it('carries the remedy the failing screen declared', () => {
    expect(sceneFailureRemedy(sceneFailureError('private document', 'sign-in'))).toBe('sign-in');
    expect(sceneFailureRemedy(sceneFailureError('transport blip', 'retry'))).toBe('retry');
  });

  it('reports no remedy for an ordinary error, so the session owner decides instead', () => {
    expect(sceneFailureRemedy(new Error('artwork could not be decoded'))).toBeNull();
    expect(sceneFailureRemedy(null)).toBeNull();
    expect(sceneFailureRemedy(undefined)).toBeNull();
  });

  it('keeps the message readable, because it is still the failure copy', () => {
    expect(sceneFailureError('Sign in to open this editor document', 'sign-in').message)
      .toBe('Sign in to open this editor document');
  });
});

describe('scene failure recovery', () => {
  it('retries once the backend that stopped answering answers again', () => {
    // The dev-server restart Nelson reported: the account never changed, so nothing but the
    // backend coming back distinguishes the recovered read from the one the scene failed under.
    const recovery = createSceneFailureRecovery(signedIn.identityKey);
    expect(recovery.observe(unreachable)).toBe(false);
    expect(recovery.observe(unreachable)).toBe(false);
    expect(recovery.observe(signedIn)).toBe(true);
  });

  it('retries when the identity moves under a backend that never went away', () => {
    const expired = createSceneFailureRecovery(signedIn.identityKey);
    expect(expired.observe(anonymous)).toBe(true);

    const restored = createSceneFailureRecovery('anonymous');
    expect(restored.observe(signedIn)).toBe(true);

    const switched = createSceneFailureRecovery(signedIn.identityKey);
    expect(switched.observe(otherAccount)).toBe(true);
  });

  it('resolves an identity that was still unknown when the scene failed', () => {
    // A cold load can fail before the owner's first read lands. Learning who we are is new
    // information, so it earns the one retry; learning it again does not.
    const recovery = createSceneFailureRecovery('unknown');
    expect(recovery.observe(anonymous)).toBe(true);
  });

  it('never retries on a probe that says exactly what the failure already knew', () => {
    // The retry-loop guard: a scene broken for its own reasons must sit on its manual action
    // however long the beat runs.
    const recovery = createSceneFailureRecovery(signedIn.identityKey);
    for (let beat = 0; beat < 25; beat += 1) {
      expect(recovery.observe(signedIn)).toBe(false);
    }
  });

  it('does not treat a still-unreachable probe as recovery', () => {
    const recovery = createSceneFailureRecovery('unknown');
    expect(recovery.observe(unreachable)).toBe(false);
  });
});
