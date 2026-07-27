'use strict';

async function loadRendererSnapshotSources({
  queryable = null,
  readMediaCatalog,
  readDrawableCatalog,
  readPropSeats,
  readUnitCatalog,
  readMediaAvailability,
}) {
  const [mediaCatalog, drawableCatalog, seats, unitCatalog] = await Promise.all([
    readMediaCatalog(queryable),
    readDrawableCatalog(queryable),
    readPropSeats(queryable),
    readUnitCatalog(queryable),
  ]);
  const mediaAvailability = await readMediaAvailability(mediaCatalog, queryable);
  return {
    mediaCatalog,
    drawableCatalog,
    seats,
    unitCatalog,
    mediaAvailability,
  };
}

module.exports = {
  loadRendererSnapshotSources,
};
