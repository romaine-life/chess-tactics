import type { LiveMediaAvailabilityPolicy, LiveMediaDescriptor, LiveMediaVersionStatus } from '@chess-tactics/board-render';
import { HttpError } from './http';

export type AdminLiveMediaLifecycle = 'staging' | 'active' | 'retired';
export type AdminLiveMediaVersionStatus = 'candidate' | LiveMediaVersionStatus | 'archived';
export type AdminLiveMediaDescriptor = Omit<LiveMediaDescriptor, 'immutableUrl'> & { immutableUrl?: string };

export interface AdminLiveMediaSlot {
  slot: string;
  domain: string;
  role: string;
  availabilityPolicy: LiveMediaAvailabilityPolicy;
  lifecycleState: AdminLiveMediaLifecycle;
  activeVersionId: string | null;
  rowRevision: number;
  metadata: Record<string, unknown>;
  versionStatus: LiveMediaVersionStatus | null;
  productionEligible: boolean;
  media: LiveMediaDescriptor | null;
}

export interface AdminLiveMediaVersion {
  id: string;
  slot: string | null;
  sourcePath: string | null;
  domain: string;
  role: string;
  label: string;
  status: AdminLiveMediaVersionStatus;
  productionEligible: boolean;
  metadata: Record<string, unknown>;
  provenance: Record<string, unknown>;
  nativeEvidence: Record<string, unknown>;
  reviewEvidence: Record<string, unknown>;
  rowRevision: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  media: AdminLiveMediaDescriptor | null;
}

export interface AdminLiveMediaCatalog {
  schemaVersion: 1;
  revision: number;
  updatedAt: string | null;
  slots: AdminLiveMediaSlot[];
  versions: AdminLiveMediaVersion[];
}

/**
 * Acceptance is compare-and-swap on both sides of the pointer change. A
 * candidate revision alone is not enough: another admin may have changed the
 * slot contract or active version after this proof was reviewed.
 */
export interface AcceptLiveMediaVersionInput {
  id: string;
  expectedRevision: number;
  expectedSlotRevision: number;
  expectedActiveVersionId: string | null;
}

export interface CreateLiveMediaVersionInput {
  slot?: string;
  allocateSlot?: 'predrawn-board';
  domain: string;
  role: string;
  label: string;
  availabilityPolicy?: LiveMediaAvailabilityPolicy;
  metadata?: Record<string, unknown>;
  provenance: Record<string, unknown>;
  nativeEvidence?: Record<string, unknown>;
  slotMetadata?: Record<string, unknown>;
}

async function jsonResponse<T>(action: string, response: Response): Promise<T> {
  if (!response.ok) throw await HttpError.fromResponse(action, response);
  return response.json() as Promise<T>;
}

export async function fetchAdminLiveMediaCatalog(): Promise<AdminLiveMediaCatalog> {
  const response = await fetch('/api/admin/media-assets', {
    cache: 'no-store',
    credentials: 'include',
  });
  return jsonResponse<AdminLiveMediaCatalog>('load-live-media-admin-catalog', response);
}

/** Create the private candidate row before its immutable bytes are uploaded. */
export async function createLiveMediaVersion(
  input: CreateLiveMediaVersionInput,
  idempotencyKey: string,
): Promise<AdminLiveMediaVersion> {
  const response = await fetch('/api/admin/media-versions', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(input),
  });
  const body = await jsonResponse<{ version: AdminLiveMediaVersion }>('create-live-media-version', response);
  return body.version;
}

/** Attach exact immutable bytes to a still-private candidate using its observed revision. */
export async function uploadLiveMediaVersionContent(input: {
  id: string;
  expectedRevision: number;
  bytes: Blob;
  mediaType: string;
}): Promise<AdminLiveMediaVersion> {
  const response = await fetch(`/api/admin/media-versions/${encodeURIComponent(input.id)}/content`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': input.mediaType,
      'If-Match': `"${input.expectedRevision}"`,
    },
    body: input.bytes,
  });
  const body = await jsonResponse<{ version: AdminLiveMediaVersion }>('upload-live-media-version-content', response);
  return body.version;
}

export async function reviewLiveMediaVersion(input: {
  id: string;
  expectedRevision: number;
  notes: string;
  surfaceUrl: string;
  evidence: Record<string, unknown>;
}): Promise<AdminLiveMediaVersion> {
  const response = await fetch(`/api/admin/media-versions/${encodeURIComponent(input.id)}/review`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expectedRevision: input.expectedRevision,
      approved: true,
      notes: input.notes,
      surfaceUrl: input.surfaceUrl,
      evidence: input.evidence,
    }),
  });
  const body = await jsonResponse<{ version: AdminLiveMediaVersion }>('review-live-media-version', response);
  return body.version;
}

export async function reviewLiveMediaVersions(input: {
  versions: readonly Pick<AdminLiveMediaVersion, 'id' | 'rowRevision'>[];
  notes: string;
  surfaceUrl: string;
  evidence: Record<string, unknown>;
}): Promise<{ versions: AdminLiveMediaVersion[]; catalogRevision: number; reviewBatchId: string }> {
  const response = await fetch('/api/admin/media-versions/review-batch', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      approved: true,
      notes: input.notes,
      surfaceUrl: input.surfaceUrl,
      evidence: input.evidence,
      items: input.versions.map((version) => ({
        id: version.id,
        expectedRevision: version.rowRevision,
      })),
    }),
  });
  return jsonResponse('review-live-media-versions', response);
}

export async function acceptLiveMediaVersions(
  versions: readonly AcceptLiveMediaVersionInput[],
): Promise<{ versions: AdminLiveMediaVersion[]; catalogRevision: number; batchId: string }> {
  const response = await fetch('/api/admin/media-versions/accept-batch', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: versions.map((version) => ({
        id: version.id,
        expectedRevision: version.expectedRevision,
        expectedSlotRevision: version.expectedSlotRevision,
        expectedActiveVersionId: version.expectedActiveVersionId,
      })),
    }),
  });
  return jsonResponse('accept-live-media-versions', response);
}
