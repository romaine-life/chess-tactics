export const TILE_TEMPLATE = {
  topWidth: 96,
  topHeight: 54,
  sideHeight: 86,
  stepX: 48,
  stepY: 27,
  originX: 438,
  originY: 62,
  selectionOffsetX: -48,
  selectionOffsetY: -27,
};

export const TILE_EDGE_ANGLE_DEGREES =
  Math.atan((TILE_TEMPLATE.topHeight / 2) / (TILE_TEMPLATE.topWidth / 2)) * (180 / Math.PI);
