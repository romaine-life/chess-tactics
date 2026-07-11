const AVAILABILITY_CRITICAL = 'critical';
const AVAILABILITY_DECORATIVE = 'decorative';

function catalogSlots(catalog) {
  return catalog && Array.isArray(catalog.slots) ? catalog.slots : [];
}

function semanticSlotFromSource(src) {
  const value = String(src || '').split('?', 1)[0];
  if (!value.startsWith('/assets/') || value.startsWith('/assets/level-thumb/')) return null;
  try {
    const segments = value.slice('/assets/'.length).split('/').map(decodeURIComponent);
    if (
      !segments.length
      || segments.some((segment) => (
        !segment || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\')
      ))
    ) return null;
    return segments.join('/');
  } catch {
    return null;
  }
}

function immutableShaFromSource(src) {
  const value = String(src || '').split('?', 1)[0];
  const match = /^\/api\/media\/([0-9a-f]{64})$/.exec(value);
  return match ? match[1] : null;
}

function thumbnailAvailabilityCatalogFromRows(mediaCatalog, rows) {
  if (!mediaCatalog || !Array.isArray(rows) || !rows.length) return mediaCatalog || null;
  const expectedRevision = Number(mediaCatalog.revision || 0);
  const actualRevision = Number(rows[0]?.catalog_revision || 0);
  if (actualRevision !== expectedRevision) return mediaCatalog;
  const publicBySlot = new Map(catalogSlots(mediaCatalog).map((slot) => [slot.slot, slot]));
  return {
    revision: actualRevision,
    slots: rows.filter((row) => row && row.slot).map((row) => ({
      slot: row.slot,
      availabilityPolicy: row.availability_policy,
      media: publicBySlot.get(row.slot)?.media || null,
    })),
  };
}

/**
 * Resolve the availability policy from the exact catalog snapshot used for
 * this thumbnail. Unknown, malformed, unit, and mixed-use sources fail closed.
 */
function thumbnailSourceAvailability(src, catalog) {
  const slots = catalogSlots(catalog);
  const semanticSlot = semanticSlotFromSource(src);
  if (semanticSlot) {
    const record = slots.find((slot) => slot && slot.slot === semanticSlot);
    return record && record.availabilityPolicy === AVAILABILITY_DECORATIVE
      ? AVAILABILITY_DECORATIVE
      : AVAILABILITY_CRITICAL;
  }

  const immutableSha = immutableShaFromSource(src);
  if (immutableSha) {
    const records = slots.filter((slot) => slot && slot.media && slot.media.sha256 === immutableSha);
    if (records.length && records.every((slot) => slot.availabilityPolicy === AVAILABILITY_DECORATIVE)) {
      return AVAILABILITY_DECORATIVE;
    }
  }
  return AVAILABILITY_CRITICAL;
}

module.exports = {
  AVAILABILITY_CRITICAL,
  AVAILABILITY_DECORATIVE,
  semanticSlotFromSource,
  thumbnailAvailabilityCatalogFromRows,
  thumbnailSourceAvailability,
};
