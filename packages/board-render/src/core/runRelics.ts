const RUN_RELIC_REGISTRY = [
  { id: 'conscription-notice', name: 'Conscription Notice', description: 'Choose one army unit. It permanently gains Discipline.' },
  { id: 'congressional-approval', name: 'Congressional Approval', description: 'Gain 5 gold immediately.', immediate: true },
  { id: 'inspirational-record', name: 'Inspirational Record', description: 'Before each Battle, one random persistent unit gains Discipline for that Battle.' },
  { id: 'training-linens', name: 'Training Linens', description: 'Pawns gain Positioned and prefer the front deployment row.' },
  { id: 'royal-decree', name: 'Royal Decree', description: 'Your King gains Positioned and prefers the back deployment row.' },
  { id: 'crenellated-rampart', name: 'Crenellated Rampart', description: 'Rooks gain Positioned and prefer the outer back-row squares.' },
  { id: 'ghibelline-rampart', name: 'Ghibelline Rampart', description: 'Rooks prefer opposite sides of the King and retain corner placement when possible.' },
  { id: 'popes-staff', name: "Pope's Staff", description: 'Bishops prefer the back deployment row.' },
  { id: 'popes-robes', name: "Pope's Robes", description: 'Bishops alternate light and dark starting squares; an odd extra color is random.' },
  { id: 'royal-tent', name: 'Royal Tent', description: 'Place up to three temporary rocks in front of the King.', requires: 'royal-decree' },
  { id: 'royal-sceptre', name: 'Royal Sceptre', description: 'Your King starts on a board-edge square in the placement zone.' },
  { id: 'mercenarys-rifle', name: "Mercenary's Rifle", description: 'After victory, gain 10% of the value of surviving persistent units.' },
  { id: 'merchants-shopkey', name: "Merchant's Shopkey", description: 'Each Conflict keeps one additional relic in its shops for 10 gold.' },
  { id: 'occult-dagger', name: 'Occult Dagger', description: 'Gain 10 gold. Eliminate every enemy non-King before checkmating the King.', immediate: true },
  { id: 'deployment-vehicle', name: 'Deployment Vehicle', description: 'Deaths can call equal-or-lower-value blocked units through the Reservist pool.' },
  { id: 'mercenary-boat', name: 'Mercenary Boat', description: 'A promoting persistent Pawn may vanish permanently instead and grant 2 gold.' },
  { id: 'quartermasters-ledger', name: "Quartermaster's Ledger", description: 'Piece shops reveal four bundles instead of three.' },
  { id: 'fair-scales', name: 'Fair Scales', description: 'Units sell for 75% of their value instead of 50%.' },
  { id: 'muster-roll', name: 'Muster Roll', description: 'When capacity is short, choose which army units sit out.' },
  { id: 'surveyors-compass', name: "Surveyor's Compass", description: 'Choose between two deterministic random deployment layouts.' },
] as const;

export type RunRelicId = typeof RUN_RELIC_REGISTRY[number]['id'];

export interface RunRelicDefinition {
  id: RunRelicId;
  name: string;
  description: string;
  requires?: RunRelicId;
  immediate?: boolean;
}

export const RUN_RELICS: readonly RunRelicDefinition[] = Object.freeze(RUN_RELIC_REGISTRY);

export const RUN_RELIC_BY_ID: Readonly<Record<RunRelicId, RunRelicDefinition>> = Object.freeze(
  Object.fromEntries(RUN_RELICS.map((relic) => [relic.id, relic])) as Record<RunRelicId, RunRelicDefinition>,
);
