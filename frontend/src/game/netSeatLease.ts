import type { PlayingSide } from './clientPerspective';

export function netSeatLeaseName(lobbyId: string, side: PlayingSide): string {
  return `chess-tactics:lobby-seat:${lobbyId}:${side}`;
}

/** Acquire this browser profile's one interactive tab for a lobby seat. The returned
 * release function is idempotent and must be held for the whole interactive lifetime. */
export type NetSeatLease =
  | { acquired: true; release: () => void }
  | { acquired: false; reason: 'unsupported' | 'unavailable' | 'error' };

export async function acquireNetSeatLease(lobbyId: string, side: PlayingSide): Promise<NetSeatLease> {
  const manager = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!manager) return { acquired: false, reason: 'unsupported' };

  return new Promise((resolve) => {
    let resolved = false;
    const settle = (lease: NetSeatLease) => {
      if (resolved) return;
      resolved = true;
      resolve(lease);
    };
    void manager.request(
      netSeatLeaseName(lobbyId, side),
      { mode: 'exclusive', ifAvailable: true },
      async (lock) => {
        if (!lock) { settle({ acquired: false, reason: 'unavailable' }); return; }
        let releaseLock!: () => void;
        let released = false;
        settle({
          acquired: true,
          release: () => {
            if (released) return;
            released = true;
            releaseLock();
          },
        });
        await new Promise<void>((done) => { releaseLock = done; });
      },
    ).catch((error) => {
      console.warn('[netplay] seat lease request failed', error);
      settle({ acquired: false, reason: 'error' });
    });
  });
}

/** Run one lifecycle mutation under the same lease used by the play surface. */
export async function withNetSeatLease<T>(
  lobbyId: string,
  side: PlayingSide,
  action: () => Promise<T>,
): Promise<{ acquired: false; reason: Exclude<NetSeatLease, { acquired: true }>['reason'] } | { acquired: true; value: T }> {
  const lease = await acquireNetSeatLease(lobbyId, side);
  if (!lease.acquired) return lease;
  try {
    return { acquired: true, value: await action() };
  } finally {
    lease.release();
  }
}
