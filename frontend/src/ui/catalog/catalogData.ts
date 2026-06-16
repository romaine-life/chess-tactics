// Static catalog structure ported verbatim from the retired app.js
// (ASSET_TREE_PROTOTYPE, GLOSSARY, MENU_MODES). These describe the *shape* of
// the design catalog — the classification tree, the glossary vocabulary, and
// the completed main-menu widgets. The asset *data* (images, states, slot
// rects) is loaded separately from the DB-backed catalog (render/assetCatalog).

export interface TreeNode {
  label: string;
  href: string;
  planned?: boolean;
  children?: TreeNode[];
}

export interface GlossaryEntryData {
  term: string;
  /** '', 'asset', or 'not an asset' — drives the colored tag. */
  tag: string;
  def: string;
  src: string;
}

export interface MenuMode {
  action: string;
  slug: string;
  icon: string;
  label: string;
}

// The catalog is a classification of our entities by object type (is-a), vague
// class at top -> specific entity at the leaf. The classes/terms are the
// glossary's object types; the leaves are the specific entities you find/build.
export const ASSET_TREE_PROTOTYPE: TreeNode[] = [
  {
    label: 'asset',
    href: '/design/catalog',
    children: [
      {
        label: '9-slice',
        href: '/design/catalog/main-menu-buttons',
        children: [
          { label: 'Main Menu', href: '/design/catalog/main-menu-buttons/button-9slice.main-menu' },
        ],
      },
      {
        label: 'icon',
        href: '/design/catalog/main-menu-button-icons',
        children: [
          { label: 'Sword', href: '/design/catalog/main-menu-button-icons/button-icon.main-menu.sword' },
          { label: 'Crown', href: '/design/catalog/main-menu-button-icons/button-icon.main-menu.crown' },
          { label: 'Scroll', href: '/design/catalog/main-menu-button-icons/button-icon.main-menu.scroll' },
          { label: 'Players', href: '/design/catalog/main-menu-button-icons/button-icon.main-menu.people' },
          { label: 'Gear', href: '/design/catalog/main-menu-button-icons/button-icon.main-menu.gear' },
        ],
      },
      { label: 'sprite atlas', href: '#', planned: true },
    ],
  },
  {
    label: 'widget',
    href: '/design/catalog/widgets/main-menu',
    children: [
      {
        label: 'button',
        href: '/design/catalog/widgets/main-menu',
        children: [
          {
            label: 'Main Menu',
            href: '/design/catalog/widgets/main-menu',
            children: [
              { label: 'Solo Skirmish', href: '/design/catalog/widgets/main-menu/solo-skirmish' },
              { label: 'Campaign Editor', href: '/design/catalog/widgets/main-menu/campaign-editor' },
              { label: 'Level Editor', href: '/design/catalog/widgets/main-menu/level-editor' },
              { label: 'Lobbies', href: '/design/catalog/widgets/main-menu/lobbies' },
              { label: 'Settings', href: '/design/catalog/widgets/main-menu/settings' },
            ],
          },
        ],
      },
    ],
  },
];

export const GLOSSARY: GlossaryEntryData[] = [
  { term: 'asset', tag: '', def: 'A reusable image plus contract the game operates on: it renders, state-switches, slots into, or swaps it.', src: 'Unity / Unreal' },
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
];

export const MENU_MODES: MenuMode[] = [
  { action: 'party', slug: 'solo-skirmish', icon: 'button-icon.main-menu.sword', label: 'Solo Skirmish' },
  { action: 'campaigns', slug: 'campaign-editor', icon: 'button-icon.main-menu.crown', label: 'Campaign Editor' },
  { action: 'level-editor-preview', slug: 'level-editor', icon: 'button-icon.main-menu.scroll', label: 'Level Editor' },
  { action: 'lobbies', slug: 'lobbies', icon: 'button-icon.main-menu.people', label: 'Lobbies' },
  { action: 'settings', slug: 'settings', icon: 'button-icon.main-menu.gear', label: 'Settings' },
];

// Glossary mode reuses the classification tree but drops the specific-entity
// leaves, leaving only the glossary-term nodes; each links to its definition.
export function pruneTreeToTerms(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .filter((node) => GLOSSARY.some((g) => g.term === node.label))
    .map((node) => {
      const kids = node.children ? pruneTreeToTerms(node.children) : [];
      const out: TreeNode = { label: node.label, href: `/design/catalog/glossary/${encodeURIComponent(node.label)}` };
      if (kids.length) out.children = kids;
      return out;
    });
}

export function assetTypeLabel(type: string): string {
  if (type === 'button-9slice.main-menu') return 'Main Menu Button 9-Slice';
  if (type === 'button-icon.main-menu') return 'Main Menu Button Icon';
  return `${type[0].toUpperCase()}${type.slice(1)}`;
}

function assetTypePath(type: string): string {
  if (type === 'button-9slice.main-menu') return '/design/catalog/main-menu-buttons';
  if (type === 'button-icon.main-menu') return '/design/catalog/main-menu-button-icons';
  return `/design/catalog/${type}s`;
}

export function assetPath(type: string, id: string): string {
  return `${assetTypePath(type)}/${encodeURIComponent(id)}`;
}
