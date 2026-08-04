const RUN_LIPSANON_REGISTRY = [
  { id: 'conscription-notice', name: 'Conscription Notice', description: 'Choose one army unit. It permanently gains Adlected.', flavorText: 'One name was underlined. No reason was entered.', unitTarget: true },
  { id: 'congressional-approval', name: 'Sealed Valuation', description: 'Gain 5 gold immediately.', flavorText: 'The vessels were weighed after the prayers had stopped.', immediate: true },
  { id: 'inspirational-record', name: 'Dawn Register', description: 'Before each Battle, one random persistent unit gains Adlected for that Battle.', flavorText: 'Before each departure, a different name was read.' },
  { id: 'training-linens', name: 'Field Linens', description: 'Your Pawns gain Eutactic.', flavorText: 'The sheets dried before the road did.' },
  { id: 'royal-decree', name: 'Royal Decree', description: 'Your King gains Eutactic.', flavorText: 'The order arrived after the keys had changed hands.' },
  { id: 'crenellated-rampart', name: 'Crenellated Rampart', description: 'Your Rooks gain Eutactic.', flavorText: 'The stones remembered a roof. The sheep did not.' },
  { id: 'ghibelline-rampart', name: 'Ghibelline Rampart', description: 'Your Rooks gain Agminate.', flavorText: 'One wall faced the road. The other faced what was gone.' },
  { id: 'popes-staff', name: "Pope's Staff", description: 'Your Bishops gain Eutactic.', flavorText: 'The staff remained wrapped after the chapel doors were opened.' },
  { id: 'popes-robes', name: "Pope's Robes", description: 'Your Bishops gain Agminate.', flavorText: 'Pale cloth and dark cloth were packed in separate chests.' },
  { id: 'royal-tent', name: 'Royal Tent', description: 'Place up to three temporary rocks in front of the King.', flavorText: 'Three stones were set where the canvas would not hold.', requires: 'royal-decree' },
  { id: 'royal-sceptre', name: 'Royal Sceptre', description: 'Your King gains Agminate.', flavorText: 'It pointed outward after the gate was closed.' },
  { id: 'mercenarys-rifle', name: 'Returned Rifle', description: 'After victory, gain 10% of the value of surviving persistent units.', flavorText: 'Only the returned rifles were entered in the final column.' },
  { id: 'merchants-shopkey', name: 'After-Hours Key', description: 'Each Conflict keeps one additional lipsanon in its Sectio for 10 gold.', flavorText: 'The small door opened after the courtyard emptied.' },
  { id: 'occult-dagger', name: 'Unclaimed Dagger', description: 'Gain 10 gold. Eliminate every enemy non-King before checkmating the King.', flavorText: 'It was counted with the valuables. No hand claimed it.', immediate: true },
  { id: 'deployment-vehicle', name: 'The Waiting Cart', description: 'Deaths can call equal-or-lower-value blocked units through the Reservist pool.', flavorText: 'When one cart left, another waited at the siding.' },
  { id: 'mercenary-boat', name: 'The Paid Crossing', description: 'A promoting persistent Pawn may vanish permanently instead and grant 2 gold.', flavorText: 'The fare was counted once. The passenger was not.' },
  { id: 'quartermasters-ledger', name: "Quartermaster's Ledger", description: 'The Sectio reveals four Piece bundles instead of three.', flavorText: 'The ledger had a column for onward.' },
  { id: 'fair-scales', name: 'Fair Scales', description: 'Alienatio returns 75% of a unit’s value instead of 50%.', flavorText: 'That summer, seed was weighed more carefully than silver.' },
  { id: 'muster-roll', name: 'Muster Roll', description: 'Retired for this beta; has no effect.', flavorText: 'Those left in the margin did not board the train.' },
  { id: 'surveyors-compass', name: "Surveyor's Compass", description: 'Retired for this beta; has no effect.', flavorText: 'The road west grew busy after the second frost.' },
] as const;

export type LipsanonId = typeof RUN_LIPSANON_REGISTRY[number]['id'];

export interface LipsanonDefinition {
  id: LipsanonId;
  name: string;
  description: string;
  flavorText: string;
  requires?: LipsanonId;
  immediate?: boolean;
  /**
   * The lipsanon cannot be granted blind: it needs one army unit named before it
   * means anything. This belongs to the registry because the model, Bona Vacantia,
   * paid Sectio offer, and admin grant all need the same answer.
   */
  unitTarget?: boolean;
}

export const RUN_LIPSANA: readonly LipsanonDefinition[] = Object.freeze(RUN_LIPSANON_REGISTRY);

/**
 * Lipsana that seeded Run rewards and paid Shop offers may reveal.
 *
 * Muster Roll and Surveyor's Compass remain registered identities so existing Run saves keep
 * their references, but ADR-0403/0404 defer further acquisition until Deployment's developing
 * player-choice boundaries are settled.
 */
export const RUN_LIPSANON_OFFER_POOL: readonly LipsanonDefinition[] = Object.freeze(
  RUN_LIPSANA.filter((lipsanon) => (
    lipsanon.id !== 'muster-roll' && lipsanon.id !== 'surveyors-compass'
  )),
);

export const LIPSANON_BY_ID: Readonly<Record<LipsanonId, LipsanonDefinition>> = Object.freeze(
  Object.fromEntries(RUN_LIPSANA.map((lipsanon) => [lipsanon.id, lipsanon])) as Record<LipsanonId, LipsanonDefinition>,
);

/**
 * Whether taking this lipsanon requires naming one army unit first. Pickers use an
 * empty string before anything is chosen, so the shared question accepts that value
 * directly instead of making every caller guard it independently.
 */
export function lipsanonNeedsUnitTarget(lipsanon: string | null | undefined): boolean {
  return Boolean(lipsanon && LIPSANON_BY_ID[lipsanon as LipsanonId]?.unitTarget);
}
