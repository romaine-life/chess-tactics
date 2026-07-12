// Client for the complete live prop-seat document. ADR-0085 supersedes
// ADR-0061's committed baseline/overlay: the DB row is the only authority and a
// missing or malformed read is an application-startup failure.

import { applyPropSeats, assertPropSeatMap, type PropSeatMap } from '../core/props';
import { HttpError } from './http';

const PROP_SEATS_ID = 'default';
let observedRevision: number | null = null;

function liveSeatsDocumentFrom(value: unknown): { data: PropSeatMap; revision: number } {
  const body = value as { portfolio?: { data?: unknown; revision?: unknown } };
  const data = body?.portfolio?.data;
  const revision = body?.portfolio?.revision;
  assertPropSeatMap(data);
  if (!Number.isSafeInteger(revision) || Number(revision) < 0) {
    throw new Error('prop seats response revision is invalid');
  }
  return { data, revision: Number(revision) };
}

export function currentLiveSeatsRevision(): number | null {
  return observedRevision;
}

export function resetLiveSeatsRevision(): void {
  observedRevision = null;
}

// Fetch and validate the one complete public document before exposing it.
export async function fetchLiveSeats(): Promise<PropSeatMap> {
  const res = await fetch(`/api/prop-seats/${PROP_SEATS_ID}`, { cache: 'no-cache' });
  if (!res.ok) throw await HttpError.fromResponse('load-prop-seats', res);
  const document = liveSeatsDocumentFrom(await res.json());
  observedRevision = document.revision;
  return document.data;
}

// Boot hydrate replaces renderer state with the complete DB snapshot. It throws
// on fetch, schema, completeness, or live-raster projection failure.
export async function loadLiveSeats(): Promise<boolean> {
  const seats = await fetchLiveSeats();
  return applyPropSeats(seats);
}

// Publish the complete live seat document (admin-only PUT). 401→sign-in, 403→admin-required, 503→retry are
// surfaced via HttpError.status for the caller (/prop-lab Save) to map — see Step 3.
export async function saveLiveSeats(seats: PropSeatMap): Promise<{ revision: number }> {
  assertPropSeatMap(seats);
  if (observedRevision === null) {
    throw new Error('prop seats cannot be saved before their live revision is loaded');
  }
  const expectedRevision = observedRevision;
  const res = await fetch(`/api/prop-seats/${PROP_SEATS_ID}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ data: seats, expectedRevision }),
  });
  if (!res.ok) throw await HttpError.fromResponse('save-prop-seats', res);
  const document = liveSeatsDocumentFrom(await res.json());
  observedRevision = document.revision;
  return { revision: document.revision };
}
