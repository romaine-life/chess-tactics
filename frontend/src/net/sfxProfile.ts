import {
  SFX_PROFILE_ID,
  SFX_PROFILE_SCHEMA_VERSION,
  applyLiveSfxProfile,
  assertSfxProfile,
  resetLiveSfxProfile,
  type SfxProfile,
  type SfxProfileDocument,
} from '../core/sfxProfile';
import { HttpError } from './http';

const SFX_PROFILE_ROUTE = `/api/sfx-profiles/${SFX_PROFILE_ID}`;

function profileDocumentFrom(value: unknown): SfxProfileDocument {
  const body = value as { profile?: Partial<SfxProfileDocument> };
  const profile = body?.profile;
  if (!profile || profile.id !== SFX_PROFILE_ID
    || profile.clientSchemaVersion !== SFX_PROFILE_SCHEMA_VERSION
    || !Number.isSafeInteger(profile.revision) || Number(profile.revision) < 0) {
    throw new Error('SFX profile response metadata is invalid');
  }
  assertSfxProfile(profile.data);
  return {
    id: SFX_PROFILE_ID,
    data: profile.data,
    clientSchemaVersion: SFX_PROFILE_SCHEMA_VERSION,
    revision: Number(profile.revision),
    createdAt: typeof profile.createdAt === 'string' ? profile.createdAt : null,
    updatedAt: typeof profile.updatedAt === 'string' ? profile.updatedAt : null,
    updatedBy: typeof profile.updatedBy === 'string' ? profile.updatedBy : null,
  };
}

export async function fetchLiveSfxProfile(): Promise<SfxProfileDocument | null> {
  const response = await fetch(SFX_PROFILE_ROUTE, { cache: 'no-cache' });
  if (response.status === 404) return null;
  if (!response.ok) throw await HttpError.fromResponse('load-sfx-profile', response);
  return profileDocumentFrom(await response.json());
}

/** Missing SFX is decorative silence, not a Git/default-profile fallback. */
export async function loadLiveSfxProfile(): Promise<boolean> {
  try {
    const profile = await fetchLiveSfxProfile();
    if (!profile) {
      resetLiveSfxProfile();
      return false;
    }
    return applyLiveSfxProfile(profile);
  } catch (error) {
    resetLiveSfxProfile();
    throw error;
  }
}

export async function saveLiveSfxProfile(
  data: SfxProfile,
  expectedRevision: number | null,
): Promise<SfxProfileDocument> {
  assertSfxProfile(data);
  const response = await fetch(SFX_PROFILE_ROUTE, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      data,
      expectedRevision,
      clientSchemaVersion: SFX_PROFILE_SCHEMA_VERSION,
    }),
  });
  if (!response.ok) throw await HttpError.fromResponse('save-sfx-profile', response);
  const profile = profileDocumentFrom(await response.json());
  applyLiveSfxProfile(profile);
  return profile;
}
