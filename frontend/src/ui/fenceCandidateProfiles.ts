import type {
  AdminLiveMediaCatalog,
  AdminLiveMediaSlot,
  AdminLiveMediaVersion,
  AdminLiveMediaVersionStatus,
} from '../net/liveMediaAdmin';
import type { FenceMaterial } from '../core/featureAutotile';

type FenceMediaComponent = 'rail-e' | 'rail-s' | 'post';

export type FenceArtLifecycle = Extract<
  AdminLiveMediaVersionStatus,
  'candidate' | 'archived' | 'accepted' | 'legacy-bridge'
>;

/**
 * One backend-described review kit. Git owns how E/S rails and posts are seated;
 * the backend owns which exact version bytes belong to the kit and their state.
 */
export interface FenceArtKit {
  id: string;
  label: string;
  material: FenceMaterial;
  railE: string;
  railS: string;
  /** Omitted when the backend review membership is intentionally rail-only. */
  post?: string;
  thumb: string;
  lifecycle: FenceArtLifecycle;
  acceptanceRegistered: boolean;
  productionEligible: boolean;
  semanticSlots: readonly string[];
  versionIds: readonly string[];
}

export interface FenceArtworkBackendReview {
  status: 'backend-accepted' | 'backend-candidate' | 'backend-archived' | 'bridge-only' | 'unsupported-accepted';
  statusLabel: string;
  note: string;
}

interface FenceVersionComponent {
  component: FenceMediaComponent;
  groupId: string;
  kitId: string;
  label: string;
  material: FenceMaterial;
  batchId: string;
  version: AdminLiveMediaVersion;
  slot: AdminLiveMediaSlot | null;
}

interface FenceKitAccumulator {
  groupKey: string;
  kitId: string;
  label: string;
  material: FenceMaterial;
  lifecycle: FenceArtLifecycle;
  components: Partial<Record<FenceMediaComponent, FenceVersionComponent>>;
}

const COMPONENT_SUFFIX = /^(.*)-(rail-e|rail-s|post)\.[A-Za-z0-9]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonemptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function fenceComponent(value: unknown): FenceMediaComponent | null {
  const normalized = nonemptyString(value)?.toLowerCase();
  if (normalized === 'rail-e' || normalized === 'east-rail') return 'rail-e';
  if (normalized === 'rail-s' || normalized === 'south-rail') return 'rail-s';
  return normalized === 'post' ? 'post' : null;
}

function fenceMaterial(value: unknown, identity: string): FenceMaterial | null {
  const explicit = nonemptyString(value)?.toLowerCase();
  if (explicit === 'wood' || explicit === 'stone') return explicit;
  const tokens = identity.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.includes('stone')) return 'stone';
  if (tokens.includes('wood')) return 'wood';
  return null;
}

function titleFromId(id: string): string {
  return id
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => part.length <= 2 && /^r\d$/i.test(part)
      ? part.toUpperCase()
      : `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function explicitAcceptance(slot: AdminLiveMediaSlot | null): boolean {
  const acceptance = isRecord(slot?.metadata.acceptance) ? slot.metadata.acceptance : null;
  return acceptance?.mode === 'standalone' || acceptance?.mode === 'group';
}

function isCurrentActiveVersion(version: AdminLiveMediaVersion, slot: AdminLiveMediaSlot | null): boolean {
  if (version.status !== 'accepted' && version.status !== 'legacy-bridge') return true;
  return slot?.lifecycleState === 'active' && slot.activeVersionId === version.id;
}

/**
 * Interpret backend version metadata first, then fall back to deterministic
 * semantic-slot suffix taxonomy. Repository/source paths are deliberately not
 * consulted: a private archive becomes review media only when its backend
 * metadata explicitly says so.
 */
function fenceVersionComponent(
  version: AdminLiveMediaVersion,
  slot: AdminLiveMediaSlot | null,
): FenceVersionComponent | null {
  if (version.domain !== 'terrain') return null;
  if (!version.media || !version.media.mediaType.startsWith('image/')) return null;
  const review = isRecord(version.metadata.fenceReview) ? version.metadata.fenceReview : {};
  const runtime = isRecord(version.metadata.runtime) ? version.metadata.runtime : {};
  const slotLeaf = version.slot?.split('/').at(-1) ?? '';
  const suffix = slotLeaf.match(COMPONENT_SUFFIX);
  const component = fenceComponent(review.component ?? runtime.component ?? suffix?.[2]);
  if (!component) return null;

  const inferredKitId = suffix?.[1] ?? '';
  const kitId = nonemptyString(review.kitId ?? review.kit_id ?? runtime.variant) ?? inferredKitId;
  if (!kitId) return null;
  const inferredBase = version.slot && suffix
    ? `${version.slot.slice(0, version.slot.length - slotLeaf.length)}${inferredKitId}`
    : '';
  const groupId = nonemptyString(review.groupId ?? review.group_id) ?? inferredBase;
  if (!groupId) return null;
  const material = fenceMaterial(review.material, `${kitId}/${groupId}`);
  if (!material) return null;

  return {
    component,
    groupId,
    kitId,
    label: nonemptyString(review.label) ?? titleFromId(kitId),
    material,
    batchId: nonemptyString(review.batchId ?? review.batch_id) ?? version.status,
    version,
    slot,
  };
}

function newerVersion(
  current: FenceVersionComponent | undefined,
  candidate: FenceVersionComponent,
): FenceVersionComponent {
  if (!current) return candidate;
  const timeOrder = String(candidate.version.updatedAt).localeCompare(String(current.version.updatedAt));
  if (timeOrder !== 0) return timeOrder > 0 ? candidate : current;
  return candidate.version.id.localeCompare(current.version.id) > 0 ? candidate : current;
}

function stableSuffix(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function routeIdFor(accumulator: FenceKitAccumulator): string {
  if (accumulator.lifecycle === 'candidate' || accumulator.lifecycle === 'archived') {
    return `${accumulator.kitId}@${accumulator.lifecycle}`;
  }
  return accumulator.kitId;
}

function lifecycleOrder(lifecycle: FenceArtLifecycle): number {
  return ({ candidate: 0, 'legacy-bridge': 1, accepted: 2, archived: 3 })[lifecycle];
}

/**
 * Project the authenticated backend catalog into complete fence review kits.
 * Incomplete E/S pairs are omitted rather than filled from a compiled registry.
 */
export function fenceArtKits(catalog: AdminLiveMediaCatalog | null): FenceArtKit[] {
  if (!catalog) return [];
  const slots = new Map(catalog.slots.map((slot) => [slot.slot, slot]));
  const groups = new Map<string, FenceKitAccumulator>();

  for (const version of catalog.versions) {
    const slot = version.slot ? slots.get(version.slot) ?? null : null;
    if (!isCurrentActiveVersion(version, slot)) continue;
    const parsed = fenceVersionComponent(version, slot);
    if (!parsed) continue;
    const groupKey = `${version.status}\0${parsed.groupId}\0${parsed.batchId}`;
    const group = groups.get(groupKey) ?? {
      groupKey,
      kitId: parsed.kitId,
      label: parsed.label,
      material: parsed.material,
      lifecycle: version.status,
      components: {},
    };
    if (group.kitId !== parsed.kitId || group.material !== parsed.material) continue;
    group.components[parsed.component] = newerVersion(group.components[parsed.component], parsed);
    groups.set(groupKey, group);
  }

  const complete = [...groups.values()].filter((group) => group.components['rail-e'] && group.components['rail-s']);
  const routeIdCounts = new Map<string, number>();
  for (const group of complete) {
    const routeId = routeIdFor(group);
    routeIdCounts.set(routeId, (routeIdCounts.get(routeId) ?? 0) + 1);
  }

  return complete.map((group): FenceArtKit => {
    const railE = group.components['rail-e']!;
    const railS = group.components['rail-s']!;
    const members = [railE, railS, group.components.post].filter(
      (component): component is FenceVersionComponent => Boolean(component),
    );
    const baseRouteId = routeIdFor(group);
    return {
      id: routeIdCounts.get(baseRouteId) === 1 ? baseRouteId : `${baseRouteId}~${stableSuffix(group.groupKey)}`,
      label: group.label,
      material: group.material,
      railE: railE.version.media!.url,
      railS: railS.version.media!.url,
      ...(group.components.post ? { post: group.components.post.version.media!.url } : {}),
      thumb: railE.version.media!.url,
      lifecycle: group.lifecycle,
      acceptanceRegistered: members.every((member) => explicitAcceptance(member.slot)),
      productionEligible: members.every((member) => member.version.productionEligible),
      semanticSlots: members.flatMap((member) => member.version.slot ? [member.version.slot] : []),
      versionIds: members.map((member) => member.version.id),
    };
  }).sort((a, b) => (
    lifecycleOrder(a.lifecycle) - lifecycleOrder(b.lifecycle)
    || a.label.localeCompare(b.label)
    || a.id.localeCompare(b.id)
  ));
}

/** Backend status only; labels and filenames cannot manufacture promotion. */
export function fenceArtworkBackendReview(kit: FenceArtKit): FenceArtworkBackendReview {
  const componentCount = `${kit.versionIds.length} backend component version${kit.versionIds.length === 1 ? '' : 's'}`;
  if (kit.lifecycle === 'accepted') {
    if (kit.acceptanceRegistered && kit.productionEligible) {
      return {
        status: 'backend-accepted',
        statusLabel: 'Backend accepted',
        note: `${componentCount}; acceptance is recorded by the live-media backend.`,
      };
    }
    return {
      status: 'unsupported-accepted',
      statusLabel: 'Unsupported accepted record',
      note: `${componentCount}; the slots do not expose a registered fence acceptance contract.`,
    };
  }
  if (kit.lifecycle === 'candidate') {
    return {
      status: 'backend-candidate',
      statusLabel: kit.acceptanceRegistered ? 'Backend candidate' : 'Backend candidate · bridge-only',
      note: kit.acceptanceRegistered
        ? `${componentCount}; review state is backend-owned.`
        : `${componentCount}; fence acceptance is not registered, so this remains review-only.`,
    };
  }
  if (kit.lifecycle === 'archived') {
    return {
      status: 'backend-archived',
      statusLabel: 'Backend archived',
      note: `${componentCount}; retained as private backend history, not a production pointer.`,
    };
  }
  return {
    status: 'bridge-only',
    statusLabel: 'Backend legacy bridge · bridge-only',
    note: `${componentCount}; these migrated bytes are active but not accepted or production-eligible.`,
  };
}

export function fenceArtKit(kits: readonly FenceArtKit[], id: string | null | undefined): FenceArtKit | undefined {
  return kits.find((kit) => kit.id === id);
}

export function cycleFenceArtKit(
  kits: readonly FenceArtKit[],
  id: string,
  delta: -1 | 1,
): FenceArtKit | undefined {
  if (!kits.length) return undefined;
  const index = kits.findIndex((kit) => kit.id === id);
  if (index < 0) return delta > 0 ? kits[0] : kits[kits.length - 1];
  return kits[(index + delta + kits.length) % kits.length];
}
