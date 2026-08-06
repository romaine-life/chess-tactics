const RUN_LIPSANON_REGISTRY = [
  { id: 'congressional-approval', name: 'Sealed Valuation', description: 'Gain 5 gold immediately.', flavorText: 'The vessels were weighed after the prayers had stopped.', immediate: true },
  { id: 'royal-tent', name: 'Royal Tent', description: 'Place up to three temporary rocks in front of the King.', flavorText: 'Three stones were set where the canvas would not hold.' },
  { id: 'mercenarys-rifle', name: 'Returned Rifle', description: 'After victory, gain 10% of the value of surviving persistent units.', flavorText: 'Only the returned rifles were entered in the final column.' },
  { id: 'merchants-shopkey', name: 'After-Hours Key', description: 'Each Conflict keeps one additional lipsanon in its Sectio for 10 gold.', flavorText: 'The small door opened after the courtyard emptied.' },
  { id: 'occult-dagger', name: 'Unclaimed Dagger', description: 'Gain 10 gold. Eliminate every enemy non-King before checkmating the King.', flavorText: 'It was counted with the valuables. No hand claimed it.', immediate: true },
  { id: 'deployment-vehicle', name: 'The Waiting Cart', description: 'Deaths can call equal-or-lower-value blocked units through the Reservist pool.', flavorText: 'When one cart left, another waited at the siding.' },
  { id: 'mercenary-boat', name: 'The Paid Crossing', description: 'A promoting persistent Pawn may vanish permanently instead and grant 2 gold.', flavorText: 'The fare was counted once. The passenger was not.' },
  { id: 'quartermasters-ledger', name: "Quartermaster's Ledger", description: 'The Sectio reveals four unit cards instead of three.', flavorText: 'The ledger had a column for onward.' },
  { id: 'fair-scales', name: 'Fair Scales', description: 'Alienatio returns 75% of a unit’s value instead of 50%.', flavorText: 'That summer, seed was weighed more carefully than silver.' },
] as const;

export type LipsanonId = typeof RUN_LIPSANON_REGISTRY[number]['id'];

export interface LipsanonDefinition {
  id: LipsanonId;
  name: string;
  description: string;
  flavorText: string;
  immediate?: boolean;
  requires?: LipsanonId;
}

export const RUN_LIPSANA: readonly LipsanonDefinition[] = Object.freeze([...RUN_LIPSANON_REGISTRY]);
export const RUN_LIPSANON_OFFER_POOL: readonly LipsanonDefinition[] = RUN_LIPSANA;
export const LIPSANON_BY_ID: Readonly<Record<LipsanonId, LipsanonDefinition>> = Object.freeze(
  Object.fromEntries(RUN_LIPSANON_REGISTRY.map((lipsanon) => [lipsanon.id, lipsanon])) as Record<LipsanonId, LipsanonDefinition>,
);
