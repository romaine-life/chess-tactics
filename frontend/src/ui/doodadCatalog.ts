// The doodad shelf: decorative props a unit can stand *inside*. Each doodad ships as a
// back/front sprite pair (rendered from Blender, split at the contact plane) so the unit
// sorts between them — back tucks behind, front falls over the shins. Mirrors unitCatalog.

export interface DoodadAsset {
  id: string;
  label: string;
  status: string;
  /** ground-contact-anchored sprite halves (96x180, anchor at pixel 48,69). */
  back: string;
  front: string;
}

const sprite = (id: string, half: 'back' | 'front') => `/assets/doodads/${id}/${half}.png`;

export const DOODAD_ASSETS: DoodadAsset[] = [
  { id: 'grass-tuft', label: 'Grass tuft', status: 'placeholder', back: sprite('grass-tuft', 'back'), front: sprite('grass-tuft', 'front') },
];

export const doodadAsset = (id: string): DoodadAsset => DOODAD_ASSETS.find((d) => d.id === id) ?? DOODAD_ASSETS[0];
