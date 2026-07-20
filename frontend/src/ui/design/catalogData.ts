// Design vocabulary and the small URL sanitizer used by its tests. Concrete
// installed catalog records live in the drawable projection, not this module.
function sanitizeCssUrl(raw: string): string {
  return String(raw || '').replace(/["'\\\n\r]/g, '');
}

// The drawable projection has already selected one immutable media version.
export function imageCssValue(imageUrl: string): string {
  const clean = sanitizeCssUrl(imageUrl);
  if (!clean) return 'none';
  return `url(${clean})`;
}

export interface GlossaryEntry { term: string; tag: string; def: string; src: string }

export const GLOSSARY: GlossaryEntry[] = [
  { term: 'asset', tag: '', def: 'A reusable image plus contract the game operates on: it renders, state-switches, slots into, or swaps it.', src: 'Unity / Unreal' },
  { term: 'button row', tag: 'asset', def: 'A stateful, mode-specific button skin whose badge/cap, frame, and arrow are authored together while the label stays live.', src: 'project' },
  { term: '9-slice', tag: 'asset', def: 'A texture that scales while its corners stay fixed and the middle stretches; the reusable, icon-less button or panel background.', src: 'Unity 9-slicing · Godot NinePatchRect' },
  { term: 'icon', tag: 'asset', def: 'A standalone image composited into a slot.', src: 'universal' },
  { term: 'sprite atlas', tag: 'asset', def: 'One image packing several unrelated sprites (our source sheets).', src: 'Unity Sprite Atlas' },
  { term: 'catalog', tag: '', def: 'The library of all assets, browsed sorted by type. It holds assets, not widgets.', src: 'project' },
  { term: 'type', tag: '', def: 'An inventory shelf: a kind of asset (9-slice, icon). The catalog tree top levels.', src: 'project' },
  { term: 'state', tag: '', def: 'A named visual variant: normal, pressed (later highlighted, selected, disabled).', src: 'Unity UI transitions' },
  { term: 'slot', tag: '', def: 'A labelled region of a 9-slice filled at runtime by an asset (icon) or live text: iconSlot, textInset, arrowSlot.', src: 'Unreal UMG' },
  { term: 'rect', tag: '', def: 'A pixel rectangle {x, y, w, h}; the bounds of a state or slot.', src: 'Unity Rect · Godot region_rect' },
  { term: 'patch margins', tag: '', def: 'The fixed border thicknesses of a 9-slice: the parts that do not stretch.', src: 'Unity / Godot' },
  { term: 'widget', tag: 'not an asset', def: 'The general term for an interactive element the player manipulates; assembled at runtime from assets, not a stored asset. Also called a control.', src: 'Unreal UMG · Wikipedia' },
  { term: 'button', tag: 'not an asset', def: 'A kind of widget: a clickable control. Widget is the general term; button is the specific kind. The Main Menu Button is the button this catalog builds from its 9-slice and icons.', src: 'Unity / Unreal / Godot Button' },
  { term: 'template', tag: 'not an asset', def: 'The reusable definition a widget instance is built from.', src: 'Unreal UI Template · Unity Prefab' },
  { term: 'instance', tag: 'not an asset', def: 'A specific live widget produced from a template.', src: 'all engines' },
  { term: 'split-layer doodad', tag: '', def: 'A terrain prop rendered as a back/front sprite pair split at the ground-contact plane, so a unit sorts between the halves and stands inside it.', src: 'project' },
];
