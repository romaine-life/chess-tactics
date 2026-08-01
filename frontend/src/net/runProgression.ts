import type { RunProgression } from '../run/progression';

export async function getAccountRunProgression(): Promise<RunProgression | null> {
  try {
    const response = await fetch('/api/run-progression', { credentials: 'include', cache: 'no-cache' });
    if (!response.ok) return null;
    const body = await response.json() as { progression?: RunProgression };
    return body.progression && typeof body.progression === 'object' ? body.progression : null;
  } catch {
    return null;
  }
}

export async function putAccountRunProgression(progression: RunProgression): Promise<boolean> {
  try {
    const response = await fetch('/api/run-progression', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ progression }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
