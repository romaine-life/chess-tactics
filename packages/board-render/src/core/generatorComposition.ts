/**
 * Generator-owned composition for saved placement generators.
 *
 * Authors draw one outer patch. Sections describe recipes, never polygons. A distinct section
 * starts a new automatically allocated territory; a mixed section shares the territory started
 * by the nearest preceding distinct section. This keeps the internal geometry out of the editor
 * while still allowing separate, combined, and hybrid compositions.
 */

export type GeneratorSectionRelationship = 'distinct' | 'mixed';

export interface GeneratorCompositionSection {
  id: string;
  relationship: GeneratorSectionRelationship;
}

export interface GeneratorCompositionBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GeneratorCompositionGroup {
  sectionIds: string[];
  bounds: GeneratorCompositionBounds;
}

const normalizedBounds = (bounds: GeneratorCompositionBounds): GeneratorCompositionBounds => ({
  minX: Math.min(bounds.minX, bounds.maxX),
  minY: Math.min(bounds.minY, bounds.maxY),
  maxX: Math.max(bounds.minX, bounds.maxX),
  maxY: Math.max(bounds.minY, bounds.maxY),
});

function hash(seed: number, salt: number): number {
  let value = Math.imul((seed ^ salt) | 0, 0x45d9f3b);
  value ^= value >>> 16;
  value = Math.imul(value, 0x45d9f3b);
  value ^= value >>> 16;
  return value >>> 0;
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = hash(seed, index * 0x9e3779b1) % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

/** Integer lengths that fill `total` and give every generated group a cell when possible. */
function apportionedLengths(count: number, total: number): number[] {
  if (count <= 0) return [];
  const available = Math.max(1, Math.floor(total));
  const minimum = available >= count ? 1 : 0;
  const reserved = minimum * count;
  const remainder = available - reserved;
  const exact = Array.from({ length: count }, () => remainder / count);
  const lengths = exact.map((value) => minimum + Math.floor(value));
  let unassigned = available - lengths.reduce((sum, length) => sum + length, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; unassigned > 0; index = (index + 1) % order.length) {
    lengths[order[index].index] += 1;
    unassigned -= 1;
  }
  return lengths;
}

/**
 * Resolve user-authored section relationships into generator-owned territories.
 *
 * The territories are deliberately not persisted. Regeneration may reorder them and, for a
 * roughly square patch, choose a different split axis from the new seed. Sections in one group
 * always receive the exact same bounds and therefore genuinely combine.
 */
export function composeGeneratorSections(
  outerBounds: GeneratorCompositionBounds,
  sections: readonly GeneratorCompositionSection[],
  seed: number,
): GeneratorCompositionGroup[] {
  if (!sections.length) return [];

  const authoredGroups: Array<{ sectionIds: string[] }> = [];
  for (const section of sections) {
    const current = authoredGroups[authoredGroups.length - 1];
    if (!current || section.relationship !== 'mixed') {
      authoredGroups.push({ sectionIds: [section.id] });
    } else {
      current.sectionIds.push(section.id);
    }
  }

  const bounds = normalizedBounds(outerBounds);
  if (authoredGroups.length === 1) return [{ sectionIds: [...authoredGroups[0].sectionIds], bounds }];

  const groups = shuffled(authoredGroups, seed >>> 0);
  const width = Math.floor(bounds.maxX - bounds.minX) + 1;
  const height = Math.floor(bounds.maxY - bounds.minY) + 1;
  const nearSquare = Math.abs(width - height) <= Math.max(1, Math.min(width, height) * 0.2);
  const splitX = nearSquare ? (hash(seed, 0x51ed270b) & 1) === 0 : width >= height;
  const lengths = apportionedLengths(groups.length, splitX ? width : height);
  const allocated = groups
    .map((group, index) => ({ group, length: lengths[index] }))
    .filter((entry) => entry.length > 0);

  let cursor = splitX ? bounds.minX : bounds.minY;
  return allocated.map(({ group, length }, index) => {
    const low = cursor;
    const high = index === allocated.length - 1
      ? (splitX ? bounds.maxX : bounds.maxY)
      : cursor + Math.max(0, length - 1);
    cursor = high + 1;
    return {
      sectionIds: [...group.sectionIds],
      bounds: splitX
        ? { ...bounds, minX: low, maxX: high }
        : { ...bounds, minY: low, maxY: high },
    };
  });
}
