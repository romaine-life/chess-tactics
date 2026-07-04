// Client for the live prop-seat overlay (ADR-0061). The committed propSeats.json is the always-render
// BASELINE; a global DB row (public GET) supplies LIVE OVERRIDES layered on top per propId. This
// mirrors loadOfficialCampaigns in net/campaignWorkspace — public read, admin write. Reads NEVER
// throw: props must render with zero DB, so any error/miss just leaves the baseline in place.

import { applyLiveSeats, type PropSeatMap } from '../core/props';
import { HttpError } from './http';

const PROP_SEATS_ID = 'default';

function asSeatMap(value: unknown): PropSeatMap {
  return value && typeof value === 'object' ? (value as PropSeatMap) : {};
}

// Fetch the live seat overrides (public GET, prop_seats envelope: {portfolio:{data}}). A synthesized
// -empty miss yields {} — the overlay is a no-op and the baseline stands. Returns the overrides so
// the server-thumbnail/other callers can reuse; never throws.
export async function fetchLiveSeats(): Promise<PropSeatMap> {
  try {
    const res = await fetch(`/api/prop-seats/${PROP_SEATS_ID}`, { cache: 'no-cache' });
    if (!res.ok) return {};
    const body = (await res.json()) as { portfolio?: { data?: unknown } };
    return asSeatMap(body.portfolio?.data);
  } catch {
    return {};
  }
}

// Boot hydrate: fetch the live overrides and overlay them on the baseline, re-deriving PROP_DEFS.
// Fail-soft — a DB outage / empty row leaves the committed baseline in place. Returns whether the
// overlay changed anything, so the caller can trigger a re-render only when it matters.
export async function loadLiveSeats(): Promise<boolean> {
  const overrides = await fetchLiveSeats();
  return applyLiveSeats(overrides);
}

// Publish the live seat overrides (admin-only PUT). 401→sign-in, 403→admin-required, 503→retry are
// surfaced via HttpError.status for the caller (/prop-lab Save) to map — see Step 3.
export async function saveLiveSeats(seats: PropSeatMap): Promise<{ revision: number }> {
  const res = await fetch(`/api/prop-seats/${PROP_SEATS_ID}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ data: seats }),
  });
  if (!res.ok) throw new HttpError('save-prop-seats', res.status);
  const body = (await res.json()) as { portfolio?: { revision?: number } };
  return { revision: body.portfolio?.revision ?? 0 };
}
