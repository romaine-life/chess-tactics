// Terrain-ID -> category legend. Decoded from awacm12 (AW1) + aw2hcm2 (AW2) real-tile crops.
// AW1/AW2 share the engine's terrain IDs. Each terrain spans several autotile-variant IDs.
const SET = {
  grass:    [1, 33, 34, 65, 66, 67, 68],
  forest:   [39, 100, 103, 134, 135, 136, 137],
  mountain: [2, 3, 32, 35, 36, 37, 38],
  road:     [19, 20, 21, 64, 96, 97, 98, 99, 128, 129, 130, 131, 133, 161, 165],
  water:    [9, 10, 11, 12, 40, 41, 42, 43, 44, 45, 46, 50, 72, 73, 74, 75, 76, 77,
             81, 109, 147, 164, 169, 176, 208, 232, 243, 268],
};
const V2C = {};
for (const [cat, vals] of Object.entries(SET)) for (const v of vals) V2C[v] = cat;

export function categoryOf(v) {
  if (v >= 300) return 'property';       // cities/bases/HQ/port/airport (owner-encoded)
  return V2C[v] || 'unknown';
}

export const CATCOLOR = {
  grass: [110, 195, 75], forest: [35, 115, 50], mountain: [140, 100, 60], road: [155, 155, 165],
  water: [45, 95, 210], shoal: [235, 220, 120], property: [225, 85, 225], hq: [235, 45, 45],
  unknown: [12, 12, 12],
};
