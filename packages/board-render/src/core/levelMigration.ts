import { LEVEL_FORMAT_VERSION, validateLevel, type Level } from './level';

const LEVEL_FORMAT_PAWN_ZONE_SOURCE = 1;
const RETIRED_PAWN_ZONE_TYPE = 'player-pawn-spawn';
const GENERAL_PLAYER_ZONE_TYPE = 'player-spawn';

export class UnsupportedLevelFormatError extends Error {
  constructor(message = 'This Level was saved by an unsupported version.') {
    super(message);
    this.name = 'UnsupportedLevelFormatError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function distinctValues(values: readonly unknown[]): unknown[] {
  const seen = new Set<string>();
  const result: unknown[] = [];
  for (const value of values) {
    const key = JSON.stringify(value) ?? 'undefined';
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

/**
 * Version 1 briefly allowed a Pawn-only deployment zone. Version 2 owns the
 * complete retirement: its squares join the first general Player Deployment
 * zone, and Pawn is no longer excluded from that zone.
 */
function migrateLayerZones(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const pawnZones = value.filter((zone) => isRecord(zone) && zone.type === RETIRED_PAWN_ZONE_TYPE);
  if (pawnZones.length === 0) {
    return value.map((zone) => {
      if (!isRecord(zone) || zone.type !== GENERAL_PLAYER_ZONE_TYPE) return zone;
      if (!Array.isArray(zone.excludedPieceTypes) || !zone.excludedPieceTypes.includes('pawn')) return zone;
      const excludedPieceTypes = zone.excludedPieceTypes.filter((piece) => piece !== 'pawn');
      const migrated = { ...zone };
      if (excludedPieceTypes.length > 0) migrated.excludedPieceTypes = excludedPieceTypes;
      else delete migrated.excludedPieceTypes;
      return migrated;
    });
  }

  const pawnTiles = distinctValues(pawnZones.flatMap((zone) => (
    Array.isArray(zone.tiles) ? zone.tiles : []
  )));
  let merged = false;
  const migrated = value.flatMap((zone): unknown[] => {
    if (isRecord(zone) && zone.type === RETIRED_PAWN_ZONE_TYPE) return [];
    if (!isRecord(zone) || zone.type !== GENERAL_PLAYER_ZONE_TYPE) return [zone];
    const next = { ...zone };
    if (Array.isArray(next.excludedPieceTypes)) {
      const excludedPieceTypes = next.excludedPieceTypes.filter((piece) => piece !== 'pawn');
      if (excludedPieceTypes.length > 0) next.excludedPieceTypes = excludedPieceTypes;
      else delete next.excludedPieceTypes;
    }
    if (!merged) {
      next.tiles = distinctValues([
        ...(Array.isArray(next.tiles) ? next.tiles : []),
        ...pawnTiles,
      ]);
      merged = true;
    }
    return [next];
  });
  if (!merged) {
    const firstPawn = { ...pawnZones[0], type: GENERAL_PLAYER_ZONE_TYPE, tiles: pawnTiles };
    delete firstPawn.excludedPieceTypes;
    migrated.push(firstPawn);
  }
  return migrated;
}

function migrateBoardWireZones(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const migrated = { ...value };
  if (Array.isArray(value.zn)) {
    const pawnEntries = value.zn.filter((entry) => (
      Array.isArray(entry) && entry[1] === RETIRED_PAWN_ZONE_TYPE
    ));
    const pawnTiles = distinctValues(pawnEntries.flatMap((entry) => (
      Array.isArray(entry[2]) ? entry[2] : []
    )));
    let merged = false;
    const entries = value.zn.flatMap((entry): unknown[] => {
      if (Array.isArray(entry) && entry[1] === RETIRED_PAWN_ZONE_TYPE) return [];
      if (!Array.isArray(entry) || entry[1] !== GENERAL_PLAYER_ZONE_TYPE) return [entry];
      const next = [...entry];
      if (Array.isArray(next[5])) next[5] = next[5].filter((piece) => piece !== 'pawn');
      if (!merged && pawnEntries.length > 0) {
        next[2] = distinctValues([
          ...(Array.isArray(next[2]) ? next[2] : []),
          ...pawnTiles,
        ]);
        merged = true;
      }
      return [next];
    });
    if (!merged && pawnEntries.length > 0) {
      const firstPawn = [...pawnEntries[0]];
      firstPawn[1] = GENERAL_PLAYER_ZONE_TYPE;
      firstPawn[2] = pawnTiles;
      if (Array.isArray(firstPawn[5])) firstPawn[5] = [];
      entries.push(firstPawn);
    }
    migrated.zn = entries;
  }
  if (isRecord(value.z)) {
    migrated.z = Object.fromEntries(Object.entries(value.z).map(([cell, type]) => [
      cell,
      type === RETIRED_PAWN_ZONE_TYPE ? GENERAL_PLAYER_ZONE_TYPE : type,
    ]));
  }
  return migrated;
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function migrateBoardCode(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    const wire = JSON.parse(decodeBase64Url(value)) as unknown;
    return encodeBase64Url(JSON.stringify(migrateBoardWireZones(wire)));
  } catch {
    // Keep an opaque board code unchanged rather than guessing at its wire shape.
    return value;
  }
}

function migrateLevelFromVersion1(value: Record<string, unknown>): Record<string, unknown> {
  const layers = isRecord(value.layers)
    ? { ...value.layers, zones: migrateLayerZones(value.layers.zones) }
    : value.layers;
  return {
    ...value,
    formatVersion: LEVEL_FORMAT_VERSION,
    ...(layers === undefined ? {} : { layers }),
    ...(Object.hasOwn(value, 'boardCode') ? { boardCode: migrateBoardCode(value.boardCode) } : {}),
  };
}

/**
 * Advance one persisted Level to the exact current shape, then validate it.
 * Current writers never call an older-schema compatibility branch directly.
 */
export function migrateLevelDocument(value: unknown): Level {
  if (!isRecord(value)) throw new UnsupportedLevelFormatError();
  const migrated = value.formatVersion === LEVEL_FORMAT_PAWN_ZONE_SOURCE
    ? migrateLevelFromVersion1(value)
    : value.formatVersion === LEVEL_FORMAT_VERSION
      ? value
      : null;
  if (!migrated) throw new UnsupportedLevelFormatError();
  const validation = validateLevel(migrated);
  if (!validation.ok) {
    throw new UnsupportedLevelFormatError(`Level migration produced an invalid Level: ${validation.errors[0]}`);
  }
  return migrated as unknown as Level;
}
