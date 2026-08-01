import { describe, expect, it, vi } from 'vitest';
import type { AuthStatus } from './auth';
import { createAuthSessionController } from './authSession';

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
});
