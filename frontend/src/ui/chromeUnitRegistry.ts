import { type ChromeRole } from './chromeCandidateSources';

export type ChromeUnitDimensionPolicy =
  | 'free-panel'
  | 'free-form'
  | 'locked-square'
  | 'locked-height-variable-width';

export type ChromeUnitControlPolicy =
  | 'width-height-dividers'
  | 'width-height'
  | 'width-only'
  | 'none';

export type ChromeUnitCatalogKind =
  | 'template'
  | 'implementation';

export type ChromeUnitContentPolicy =
  | 'none'
  | 'slot'
  | 'fixed';

export type ChromeUnitTone =
  | 'structural'
  | 'neutral'
  | 'primary'
  | 'danger';

export type ChromeUnitStateModel =
  | 'static'
  | 'toggle'
  | 'disabled-capable';

export type ChromeUnitId =
  | 'outer-panel'
  | 'inner-box'
  | 'inner-asset-swatch'
  | 'inner-locked-rectangle'
  | 'inner-text-button'
  | 'inner-toggle'
  | 'inner-list-row'
  | 'inner-tool-square'
  | 'inner-select-tool'
  | 'inner-brush-tool'
  | 'inner-erase-tool'
  | 'inner-move-tool'
  | 'inner-undo-key'
  | 'inner-redo-key'
  | 'inner-plus-key'
  | 'inner-minus-key'
  | 'inner-dropdown';

export type ChromeUnitVariantSpec = {
  name: string;
  label: string;
  tone: ChromeUnitTone;
  stateModel: ChromeUnitStateModel;
  specimenText: string;
  className?: string;
  usage: string;
};

export type ChromeUnitSpec = {
  id: ChromeUnitId;
  name: string;
  label: string;
  role: ChromeRole;
  dimensionPolicy: ChromeUnitDimensionPolicy;
  controlPolicy: ChromeUnitControlPolicy;
  catalogKind: ChromeUnitCatalogKind;
  contentPolicy: ChromeUnitContentPolicy;
  tone: ChromeUnitTone;
  stateModel: ChromeUnitStateModel;
  badge: string;
  token: string;
  iconClass?: string;
  specimenText?: string;
  variants?: ChromeUnitVariantSpec[];
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  defaultDividers?: number;
  maxDividers?: number;
  parentId?: ChromeUnitId;
  selectors: string[];
  usage: string[];
};

export const CHROME_UNIT_REGISTRY: ChromeUnitSpec[] = [
  {
    id: 'outer-panel',
    name: 'outer-panel',
    label: 'Outer panel',
    role: 'outer',
    dimensionPolicy: 'free-panel',
    controlPolicy: 'width-height-dividers',
    catalogKind: 'template',
    contentPolicy: 'slot',
    tone: 'structural',
    stateModel: 'static',
    badge: 'free panel',
    token: '--le-chrome-outer-rail-w',
    defaultWidth: 560,
    minWidth: 260,
    maxWidth: 1600,
    defaultHeight: 320,
    minHeight: 160,
    maxHeight: 680,
    defaultDividers: 1,
    maxDividers: 5,
    selectors: [
      '[data-chrome-unit="outer-panel"]',
      '.level-editor-screen .le-outer-panel',
      '[data-chrome-consumer="level-editor-controls"]',
      '[data-chrome-consumer="events-overlay"]',
      '[data-chrome-consumer="skirmish-hud"]',
      '.level-editor-screen .le-control-divider-host',
      '.level-editor-screen .le-control-divider-host .kit-divider',
    ],
    usage: [
      'Level Editor control rail',
      'Rules/events overlay shell',
      'Skirmish command HUD',
      'Section dividers inherited from the outer rail',
    ],
  },
  {
    id: 'inner-box',
    name: 'inner-box',
    label: 'Inner box',
    role: 'inner',
    dimensionPolicy: 'free-form',
    controlPolicy: 'width-height',
    catalogKind: 'template',
    contentPolicy: 'none',
    tone: 'structural',
    stateModel: 'static',
    badge: 'free form',
    token: '--le-chrome-inner-rail-w',
    defaultWidth: 180,
    minWidth: 64,
    maxWidth: 1600,
    defaultHeight: 112,
    minHeight: 44,
    maxHeight: 320,
    selectors: [
      '[data-chrome-unit="inner-box"]',
      '.le-violations',
      '.le-status-current',
      '.le-material-values',
      '.le-status-entry',
      '.unit-portrait',
      '.skirmish-service-record',
    ],
    usage: [
      'Base free-form primitive for inner-role controls',
      'Concrete inner controls inherit their geometry contract from child classes',
    ],
  },
  {
    id: 'inner-asset-swatch',
    name: 'asset-swatch',
    label: 'Inner asset swatch',
    role: 'inner',
    dimensionPolicy: 'free-form',
    controlPolicy: 'width-height',
    catalogKind: 'template',
    contentPolicy: 'slot',
    tone: 'neutral',
    stateModel: 'toggle',
    badge: 'asset choice',
    token: '--le-chrome-inner-rail-w',
    parentId: 'inner-box',
    defaultWidth: 84,
    minWidth: 64,
    maxWidth: 180,
    defaultHeight: 78,
    minHeight: 56,
    maxHeight: 220,
    selectors: [
      '.le-swatch',
      '[data-chrome-unit="inner-asset-swatch"]',
    ],
    usage: [
      'Level Editor unit, terrain, prop, doodad, cover, wall, and feature choices',
      'Asset preview buttons whose content dimensions remain feature-owned',
    ],
  },
  {
    id: 'inner-locked-rectangle',
    name: 'locked-height-rectangle',
    label: 'Inner locked-height rectangle',
    role: 'inner',
    dimensionPolicy: 'locked-height-variable-width',
    controlPolicy: 'width-only',
    catalogKind: 'template',
    contentPolicy: 'slot',
    tone: 'neutral',
    stateModel: 'disabled-capable',
    badge: 'variable width',
    token: '--le-inner-control-h',
    parentId: 'inner-box',
    defaultWidth: 220,
    minWidth: 96,
    maxWidth: 520,
    selectors: [
      '[data-chrome-unit="inner-locked-rectangle"]',
      '.le-seg-btn',
      '.le-faction-select',
      '.le-board-link-input',
      '.settings-chrome-button',
    ],
    usage: [
      'Base locked-height rectangle primitive for inner-role controls',
      'Square controls inherit this height and then lock width to the same surface',
      'Text buttons',
      'Segmented choices',
      'Faction select',
      'Board-link input chrome',
    ],
  },
  {
    id: 'inner-text-button',
    name: 'text-button',
    label: 'Inner text button',
    role: 'inner',
    dimensionPolicy: 'locked-height-variable-width',
    controlPolicy: 'width-only',
    catalogKind: 'template',
    contentPolicy: 'slot',
    tone: 'neutral',
    stateModel: 'disabled-capable',
    badge: 'text command',
    token: '--le-inner-control-h',
    parentId: 'inner-locked-rectangle',
    defaultWidth: 156,
    minWidth: 72,
    maxWidth: 520,
    selectors: [
      '.le-seg-btn',
      '.le-seg-btn.active',
      '.le-seg-btn.danger',
      '.le-play-board',
      '[data-chrome-unit="inner-text-button"]',
    ],
    variants: [
      {
        name: 'neutral',
        label: 'Neutral',
        tone: 'neutral',
        stateModel: 'disabled-capable',
        specimenText: 'Action',
        usage: 'Board actions, event add/apply commands, cancel buttons',
      },
      {
        name: 'primary',
        label: 'Primary',
        tone: 'primary',
        stateModel: 'disabled-capable',
        specimenText: 'Save',
        className: 'active',
        usage: 'Save, generate, confirm, play-test style emphasis',
      },
      {
        name: 'danger',
        label: 'Danger',
        tone: 'danger',
        stateModel: 'disabled-capable',
        specimenText: 'Clear',
        className: 'danger',
        usage: 'Clear/remove/destructive commands',
      },
      {
        name: 'toggle',
        label: 'Toggle',
        tone: 'neutral',
        stateModel: 'toggle',
        specimenText: 'Selected',
        className: 'active',
        usage: 'Tabs, segmented choices, active text toggles',
      },
    ],
    usage: [
      'Wide inner box with text',
      'Neutral, primary, danger, and toggle states of the same chrome unit',
      'Concrete labels like Play test and Clear are usages, not new box types',
    ],
  },
  {
    id: 'inner-toggle',
    name: 'toggle',
    label: 'Inner toggle',
    role: 'inner',
    dimensionPolicy: 'locked-height-variable-width',
    controlPolicy: 'width-only',
    catalogKind: 'template',
    contentPolicy: 'slot',
    tone: 'neutral',
    stateModel: 'toggle',
    badge: 'on / off',
    token: '--le-inner-control-h',
    parentId: 'inner-locked-rectangle',
    defaultWidth: 124,
    minWidth: 88,
    maxWidth: 320,
    selectors: [
      '.settings-toggle',
      '[data-chrome-unit="inner-toggle"]',
    ],
    usage: [
      'Binary settings and Level Editor choices',
      'Off and on states of the shared inner control frame',
    ],
  },
  {
    id: 'inner-list-row',
    name: 'list-row',
    label: 'Inner list row',
    role: 'inner',
    dimensionPolicy: 'locked-height-variable-width',
    controlPolicy: 'width-only',
    catalogKind: 'template',
    contentPolicy: 'slot',
    tone: 'neutral',
    stateModel: 'toggle',
    badge: 'selectable row',
    token: '--le-inner-control-h',
    parentId: 'inner-locked-rectangle',
    defaultWidth: 260,
    minWidth: 160,
    maxWidth: 620,
    selectors: [
      '.le-md-item',
      '.house-select-option',
      '.palette-select-option',
      '[data-chrome-unit="inner-list-row"]',
    ],
    usage: [
      'Rules and event master-detail list rows',
      'House and palette dropdown option rows',
      'Selectable named rows with trailing status text',
    ],
  },
  {
    id: 'inner-tool-square',
    name: 'tool-square',
    label: 'Inner tool square',
    role: 'inner',
    dimensionPolicy: 'locked-square',
    controlPolicy: 'none',
    catalogKind: 'template',
    contentPolicy: 'slot',
    tone: 'neutral',
    stateModel: 'toggle',
    badge: 'height square',
    token: '--le-inner-square',
    parentId: 'inner-locked-rectangle',
    selectors: [
      '.le-seg-icons .le-seg-btn',
      '.le-icon-btn',
      '.le-action-toolbar .le-seg-btn',
      '.le-gen-cover-caret-btn',
      '[data-chrome-unit="inner-tool-square"]',
    ],
    usage: [
      'Square child of the locked-height rectangle contract',
      'Level Editor tool picker',
      'Undo/redo history controls',
      'Small icon-only action controls',
      'Generator cover disclosure control',
    ],
  },
  {
    id: 'inner-select-tool',
    name: 'select-tool',
    label: 'Inner select tool',
    role: 'inner',
    dimensionPolicy: 'locked-square',
    controlPolicy: 'none',
    catalogKind: 'implementation',
    contentPolicy: 'fixed',
    tone: 'neutral',
    stateModel: 'toggle',
    badge: 'select tool',
    token: '--le-inner-square',
    parentId: 'inner-tool-square',
    iconClass: 'ic-eyedropper',
    selectors: [
      '.le-action-toolbar .le-seg-btn',
      '[data-chrome-unit="inner-select-tool"]',
    ],
    usage: [
      'Level Editor select tool',
    ],
  },
  {
    id: 'inner-brush-tool',
    name: 'brush-tool',
    label: 'Inner brush tool',
    role: 'inner',
    dimensionPolicy: 'locked-square',
    controlPolicy: 'none',
    catalogKind: 'implementation',
    contentPolicy: 'fixed',
    tone: 'neutral',
    stateModel: 'toggle',
    badge: 'brush tool',
    token: '--le-inner-square',
    parentId: 'inner-tool-square',
    iconClass: 'ic-brush',
    selectors: [
      '.le-action-toolbar .le-seg-btn',
      '[data-chrome-unit="inner-brush-tool"]',
    ],
    usage: [
      'Level Editor brush tool',
    ],
  },
  {
    id: 'inner-erase-tool',
    name: 'erase-tool',
    label: 'Inner erase tool',
    role: 'inner',
    dimensionPolicy: 'locked-square',
    controlPolicy: 'none',
    catalogKind: 'implementation',
    contentPolicy: 'fixed',
    tone: 'neutral',
    stateModel: 'toggle',
    badge: 'erase tool',
    token: '--le-inner-square',
    parentId: 'inner-tool-square',
    iconClass: 'ic-eraser',
    selectors: [
      '.le-action-toolbar .le-seg-btn',
      '[data-chrome-unit="inner-erase-tool"]',
    ],
    usage: [
      'Level Editor erase tool',
    ],
  },
  {
    id: 'inner-move-tool',
    name: 'move-tool',
    label: 'Inner move tool',
    role: 'inner',
    dimensionPolicy: 'locked-square',
    controlPolicy: 'none',
    catalogKind: 'implementation',
    contentPolicy: 'fixed',
    tone: 'neutral',
    stateModel: 'toggle',
    badge: 'move tool',
    token: '--le-inner-square',
    parentId: 'inner-tool-square',
    iconClass: 'ic-move',
    selectors: [
      '.le-action-toolbar .le-seg-btn',
      '[data-chrome-unit="inner-move-tool"]',
    ],
    usage: [
      'Level Editor move tool',
    ],
  },
  {
    id: 'inner-undo-key',
    name: 'undo-key',
    label: 'Inner undo key',
    role: 'inner',
    dimensionPolicy: 'locked-square',
    controlPolicy: 'none',
    catalogKind: 'implementation',
    contentPolicy: 'fixed',
    tone: 'neutral',
    stateModel: 'disabled-capable',
    badge: 'undo key',
    token: '--le-inner-square',
    parentId: 'inner-tool-square',
    iconClass: 'ic-undo',
    selectors: [
      '.le-icon-btn',
      '[data-chrome-unit="inner-undo-key"]',
    ],
    usage: [
      'Level Editor undo command',
    ],
  },
  {
    id: 'inner-redo-key',
    name: 'redo-key',
    label: 'Inner redo key',
    role: 'inner',
    dimensionPolicy: 'locked-square',
    controlPolicy: 'none',
    catalogKind: 'implementation',
    contentPolicy: 'fixed',
    tone: 'neutral',
    stateModel: 'disabled-capable',
    badge: 'redo key',
    token: '--le-inner-square',
    parentId: 'inner-tool-square',
    iconClass: 'ic-redo',
    selectors: [
      '.le-icon-btn',
      '[data-chrome-unit="inner-redo-key"]',
    ],
    usage: [
      'Level Editor redo command',
    ],
  },
  {
    id: 'inner-plus-key',
    name: 'plus-key',
    label: 'Inner plus key',
    role: 'inner',
    dimensionPolicy: 'locked-square',
    controlPolicy: 'none',
    catalogKind: 'implementation',
    contentPolicy: 'fixed',
    tone: 'neutral',
    stateModel: 'disabled-capable',
    badge: '+ key',
    token: '--le-inner-square',
    parentId: 'inner-tool-square',
    selectors: [
      '.settings-stepper .settings-chrome-button',
      '.le-zone-stepper-button.settings-chrome-button',
      '[data-chrome-unit="inner-plus-key"]',
    ],
    usage: [
      'Stepper increment key',
      'Zone add/select controls',
    ],
  },
  {
    id: 'inner-minus-key',
    name: 'minus-key',
    label: 'Inner minus key',
    role: 'inner',
    dimensionPolicy: 'locked-square',
    controlPolicy: 'none',
    catalogKind: 'implementation',
    contentPolicy: 'fixed',
    tone: 'neutral',
    stateModel: 'disabled-capable',
    badge: '- key',
    token: '--le-inner-square',
    parentId: 'inner-tool-square',
    selectors: [
      '.settings-stepper .settings-chrome-button',
      '.le-zone-stepper-button.settings-chrome-button',
      '[data-chrome-unit="inner-minus-key"]',
    ],
    usage: [
      'Stepper decrement key',
      'Zone remove/select controls',
    ],
  },
  {
    id: 'inner-dropdown',
    name: 'dropdown',
    label: 'Inner dropdown',
    role: 'inner',
    dimensionPolicy: 'locked-height-variable-width',
    controlPolicy: 'width-only',
    catalogKind: 'template',
    contentPolicy: 'slot',
    tone: 'neutral',
    stateModel: 'disabled-capable',
    badge: 'select field',
    token: '--le-inner-field-h',
    parentId: 'inner-locked-rectangle',
    defaultWidth: 300,
    minWidth: 150,
    maxWidth: 620,
    selectors: [
      '.le-select-wrap',
      '.le-layer-select-wrap',
      '.le-event-select-wrap',
      '.le-layer-select',
      '[data-chrome-unit="inner-dropdown"]',
    ],
    usage: [
      'Layer picker',
      'Zone picker',
      'Event template picker',
    ],
  },
];

export function chromeUnitById(id: string | undefined): ChromeUnitSpec {
  return CHROME_UNIT_REGISTRY.find((entry) => entry.id === id) ?? CHROME_UNIT_REGISTRY[0];
}

export function chromeUnitAncestorChain(unit: ChromeUnitSpec): ChromeUnitSpec[] {
  const ancestors: ChromeUnitSpec[] = [];
  const seen = new Set<ChromeUnitId>();
  let cursor: ChromeUnitSpec | undefined = unit.parentId ? chromeUnitById(unit.parentId) : undefined;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    ancestors.push(cursor);
    cursor = cursor.parentId ? chromeUnitById(cursor.parentId) : undefined;
  }
  return ancestors.reverse();
}

export function chromeUnitClassPath(unit: ChromeUnitSpec): string {
  return [...chromeUnitAncestorChain(unit), unit]
    .map((entry) => entry.name)
    .join('.');
}

/**
 * Returns the real DOM classes for a registered unit, from its root ancestor to
 * the concrete leaf. Consumers keep their legacy layout classes as extras while
 * the shared ancestry becomes the runtime chrome contract.
 */
export function chromeUnitClassNames(
  id: ChromeUnitId,
  ...extras: Array<string | false | null | undefined>
): string {
  const unit = chromeUnitById(id);
  const names = [
    ...chromeUnitAncestorChain(unit).map((entry) => entry.name),
    unit.name,
    ...extras.filter((extra): extra is string => typeof extra === 'string'),
  ];
  const uniqueNames = new Set<string>();
  for (const name of names) {
    for (const token of name.trim().split(/\s+/)) {
      if (token) uniqueNames.add(token);
    }
  }
  return [...uniqueNames].join(' ');
}

export function chromeUnitSelectors(id: ChromeUnitId): string[] {
  const unit = chromeUnitById(id);
  return [`.${unit.name}`, ...unit.selectors];
}

/**
 * The role root class is first so real hierarchy consumers are the primary
 * target. Registered legacy selectors follow for compatibility during migration.
 */
export function chromeUnitRoleSelectors(role: ChromeRole): string[] {
  const rootId: ChromeUnitId = role === 'outer' ? 'outer-panel' : 'inner-box';
  const selectors = [
    `.${chromeUnitById(rootId).name}`,
    ...CHROME_UNIT_REGISTRY
      .filter((entry) => entry.role === role)
      .flatMap((entry) => entry.selectors),
  ];
  return [...new Set(selectors)];
}

export function chromeUnitScopedSelectors(scope: string, selectors: readonly string[]): string {
  return selectors.map((selector) => `${scope} ${selector}`).join(',\n');
}

export function chromeUnitsInHierarchyOrder(): ChromeUnitSpec[] {
  const childrenByParent = new Map<ChromeUnitId | undefined, ChromeUnitSpec[]>();
  const ids = new Set(CHROME_UNIT_REGISTRY.map((entry) => entry.id));
  for (const entry of CHROME_UNIT_REGISTRY) {
    const parentKey = entry.parentId && ids.has(entry.parentId) ? entry.parentId : undefined;
    const children = childrenByParent.get(parentKey) ?? [];
    children.push(entry);
    childrenByParent.set(parentKey, children);
  }

  const ordered: ChromeUnitSpec[] = [];
  const seen = new Set<ChromeUnitId>();
  const visit = (entry: ChromeUnitSpec): void => {
    if (seen.has(entry.id)) return;
    seen.add(entry.id);
    ordered.push(entry);
    for (const child of childrenByParent.get(entry.id) ?? []) {
      visit(child);
    }
  };

  for (const root of childrenByParent.get(undefined) ?? []) {
    visit(root);
  }
  for (const entry of CHROME_UNIT_REGISTRY) {
    visit(entry);
  }
  return ordered;
}
