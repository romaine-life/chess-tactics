import { describe, expect, it, vi } from 'vitest';
import type { AuthStatus } from './auth';
import { authSessionIdentityKey, createAuthSessionController } from './authSession';

const unavailable: AuthStatus = { user: { signed_in: false }, reachable: false };
const authenticated: AuthStatus = {
  user: { signed_in: true, email: 'player@example.com' },
  reachable: true,
};

describe('auth session owner', () => {
  it('shares one restart-tolerant probe and one state sequence with every consumer', async () => {
    const readStatus = vi.fn()
      .mockResolvedValueOnce(unavailable)
      .mockResolvedValueOnce(authenticated);
    const controller = createAuthSessionController(readStatus, 0);
    const phases = [controller.getSnapshot().phase];
    controller.subscribe(() => phases.push(controller.getSnapshot().phase));

    const first = controller.start();
    const second = controller.start();

    expect(first).toBe(second);
    await expect(Promise.all([first, second])).resolves.toEqual([authenticated, authenticated]);
    expect(readStatus).toHaveBeenCalledTimes(2);
    expect(phases).toEqual(['checking', 'unavailable', 'authenticated']);
  });

  it('publishes an authoritative signed-out response as anonymous', async () => {
    const anonymous: AuthStatus = { user: { signed_in: false }, reachable: true };
    const controller = createAuthSessionController(async () => anonymous, 0);

    await expect(controller.start()).resolves.toEqual(anonymous);
    expect(controller.getSnapshot()).toEqual({ phase: 'anonymous', status: anonymous });
  });

  it('updates the one shared user snapshot after an account rename', async () => {
    const controller = createAuthSessionController(async () => authenticated, 0);
    await controller.start();

    controller.replaceUser({ ...authenticated.user, name: 'Renamed' });

    expect(controller.getSnapshot().status?.user.name).toBe('Renamed');
  });

  it('keeps retrying when the identity transport unexpectedly throws', async () => {
    const readStatus = vi.fn()
      .mockRejectedValueOnce(new Error('proxy reset'))
      .mockResolvedValueOnce(authenticated);
    const controller = createAuthSessionController(readStatus, 0);

    await expect(controller.start()).resolves.toEqual(authenticated);
    expect(readStatus).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().phase).toBe('authenticated');
  });

  it('accepts an authoritative 401 into the shared owner and ignores other failures', async () => {
    const controller = createAuthSessionController(async () => authenticated, 0);
    await controller.start();

    expect(controller.reportFailure({ status: 503 })).toBe(false);
    expect(controller.getSnapshot().phase).toBe('authenticated');
    expect(controller.reportFailure({ status: 401 })).toBe(true);
    expect(controller.getSnapshot()).toEqual({
      phase: 'anonymous',
      status: { user: { signed_in: false }, reachable: true },
    });
  });

  it('re-reads an expired session so a later sign-in is observed without a reload', async () => {
    const anonymous: AuthStatus = { user: { signed_in: false }, reachable: true };
    const readStatus = vi.fn()
      .mockResolvedValueOnce(anonymous)
      .mockResolvedValueOnce(authenticated);
    const controller = createAuthSessionController(readStatus, 0);

    await controller.start();
    expect(controller.getSnapshot().phase).toBe('anonymous');

    // `start` settles and stops, so only an explicit re-read can notice the restored session.
    await expect(controller.refresh()).resolves.toEqual(authenticated);
    expect(controller.getSnapshot().phase).toBe('authenticated');
  });

  it('shares one in-flight re-read between concurrent callers', async () => {
    const readStatus = vi.fn().mockResolvedValue(authenticated);
    const controller = createAuthSessionController(readStatus, 0);
    await controller.start();
    readStatus.mockClear();

    const first = controller.refresh();
    const second = controller.refresh();

    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(readStatus).toHaveBeenCalledTimes(1);
  });

  it('keeps the last authoritative snapshot when a re-read cannot reach the backend', async () => {
    const readStatus = vi.fn()
      .mockResolvedValueOnce(authenticated)
      .mockResolvedValueOnce(unavailable);
    const controller = createAuthSessionController(readStatus, 0);
    await controller.start();

    // A transport blip during a background re-read is not a sign-out and must not
    // knock a signed-in shell into `unavailable`. The caller that ASKED still learns the
    // backend did not answer — that is the fact a screen waiting for it to come back needs.
    await expect(controller.refresh()).resolves.toEqual(unavailable);
    expect(controller.getSnapshot()).toEqual({ phase: 'authenticated', status: authenticated });
  });

  it('notices a session that expired while the shell was claiming it was live', async () => {
    const anonymous: AuthStatus = { user: { signed_in: false }, reachable: true };
    const readStatus = vi.fn()
      .mockResolvedValueOnce(authenticated)
      .mockResolvedValueOnce(anonymous);
    let clock = 0;
    const controller = createAuthSessionController(readStatus, 0, () => clock);
    await controller.start();
    expect(controller.getSnapshot().phase).toBe('authenticated');

    // This is the whole defect: before the owner re-read on its own, the shell went on
    // presenting this account until some account-gated call happened to fail — which in a game
    // that needs no session to play could be never.
    clock += 5 * 60_000;
    await controller.wake(controller.reprobeIntervalMs());
    expect(controller.getSnapshot().phase).toBe('anonymous');
  });

  it('quickens while signed out and stays patient while signed in', async () => {
    const anonymous: AuthStatus = { user: { signed_in: false }, reachable: true };
    const readStatus = vi.fn().mockResolvedValue(anonymous);
    const controller = createAuthSessionController(readStatus, 0, () => 0);
    await controller.start();

    // Signed out is the impatient case: someone is probably signing in right now.
    expect(controller.reprobeIntervalMs()).toBe(20_000);
    controller.replaceUser({ signed_in: true, email: 'player@example.com' });
    expect(controller.reprobeIntervalMs()).toBe(5 * 60_000);
  });

  it('collapses a flurry of returns into one read', async () => {
    const readStatus = vi.fn().mockResolvedValue(authenticated);
    let clock = 0;
    const controller = createAuthSessionController(readStatus, 0, () => clock);
    await controller.start();
    expect(readStatus).toHaveBeenCalledTimes(1);

    // Focus, visibilitychange and online all fire when someone comes back to a tab. They are one
    // arrival, not three, and the identity provider should be asked once.
    clock += 100;
    await Promise.all([controller.wake(), controller.wake(), controller.wake()]);
    expect(readStatus).toHaveBeenCalledTimes(1);

    clock += 3_000;
    await controller.wake();
    expect(readStatus).toHaveBeenCalledTimes(2);
  });

  it('never wakes alongside the startup probe that is still retrying', async () => {
    // `start` owns an unbounded retry loop until it gets an authoritative answer. A second reader
    // racing it would have nothing to add and everything to confuse.
    const readStatus = vi.fn().mockResolvedValue(unavailable);
    const controller = createAuthSessionController(readStatus, 10_000, () => 0);
    void controller.start();
    await expect(controller.wake()).resolves.toBeNull();
  });

  it('names identities so a consumer compares them without reading them', () => {
    expect(authSessionIdentityKey(authenticated)).toBe('account:player@example.com');
    expect(authSessionIdentityKey({ user: { signed_in: false }, reachable: true })).toBe('anonymous');
    // A probe that never reached the backend carries no identity to compare.
    expect(authSessionIdentityKey(unavailable)).toBe('unknown');
    expect(authSessionIdentityKey(null)).toBe('unknown');
  });
});
