import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactElement, type ReactNode } from 'react';
import { SliderRow, ctlReset } from './dressing/SliderRow';
import { useInjectedStyle } from './dressing/useInjectedStyle';
import { useWindowScaledPreview } from './useWindowScaledPreview';
import {
  chromeSourceById,
  chromeSourcesFor,
  installChromeAdminCatalog,
  type ChromeCandidateSource,
  type ChromeRole,
} from './chromeCandidateSources';
import { fetchAdminLiveMediaCatalog } from '../net/liveMediaAdmin';
import { drawableAssets, requiredDrawableRole } from '@chess-tactics/board-render';
import { saveDrawableAsset } from '../net/drawableCatalogAdmin';
import {
  ChromeUnitAuditViewer,
  ChromeUnitSpecimen,
  chromeUnitThumbnailDims,
  type ChromeUnitAuditInfoRenderer,
} from './ChromeUnitAudit';
import { useInstalledChromeCss } from './useInstalledChromeCss';
import {
  chromeUnitById,
  chromeUnitClassPath,
  chromeUnitsInHierarchyOrder,
  type ChromeUnitId,
} from './chromeUnitRegistry';
import {
  ATOM_TURN_LABELS,
  ATOM_TURNS,
  ATOM_ALIGNMENT_MODES,
  ATOM_PREVIEW_MODES,
  CHROME_FILL_MODE_OPTIONS,
  CHROME_FILL_SURFACES,
  CHROME_FILL_TINTS,
  EMPTY_DIVIDER,
  EMPTY_FRAME,
  NO_ATOM_SOURCE_ID,
  chromeFillSurfaceById,
  chromeFillTintById,
  clamp,
  composeDividerRender,
  composeFrameDataUrl,
  defaultRailFitForSource,
  dividerDefault,
  dividerAtomAlignmentReadout,
  dividerJointPreviewBox,
  dividerJointSourceById,
  dividerJointSources,
  frameCss,
  installedChromeTuningPayload,
  roleDefault,
  roleAtomAlignmentReadout,
  sourcePreviewBox,
  type AtomAlignmentMode,
  type AtomPreviewMode,
  type ChromeFillMode,
  type ChromeFillSurfaceId,
  type ChromeFillTintId,
  type DividerRender,
  type DividerJointSource,
  type DividerTune,
  type DividerRenders,
  type DividerTunes,
  type FrameRender,
  type RailFit,
  type RoleTune,
  type SourcePreviewBox,
  type TitleHorizontalAlign,
  type TitleVerticalAlign,
} from './chromeFamilyRuntime';


type PreviewMode = 'interact' | 'pan';
type PreviewFocus = 'controls' | 'board' | 'current';
type ChromeLabControlTab = 'preview' | 'outer' | 'inner';
type RoleControlTab = 'chrome' | 'rail' | 'atom' | 'divider' | 'title' | 'info';

const CHROME_LAB_STORAGE_VERSION = 4;
const CHROME_LAB_PREVIOUS_STORAGE_VERSION = 3;
const CHROME_LAB_LEGACY_STORAGE_VERSION = 2;
const CHROME_LAB_STORAGE_PREFIX = 'chess-tactics.chrome-lab';
const SOURCE_PREVIEW_STAGE_LIMIT: SourcePreviewBox = { width: 264, height: 180 };
const CHROME_LAB_CONTROL_TAB_IDS: readonly ChromeLabControlTab[] = ['preview', 'outer', 'inner'];
const ROLE_CONTROL_TAB_IDS: readonly RoleControlTab[] = ['chrome', 'rail', 'atom', 'divider', 'title', 'info'];
const PREVIEW_FOCUS_IDS: readonly PreviewFocus[] = ['controls', 'board', 'current'];
const PREVIEW_MODE_IDS: readonly PreviewMode[] = ['interact', 'pan'];

type ChromeLabPageTarget = {
  id: string;
  label: string;
  kind: 'page';
  route: string;
  thumb: string;
  badge: string;
};

type ChromeLabUnitTarget = {
  id: string;
  label: string;
  kind: 'unit';
  unitId: ChromeUnitId;
  badge: string;
};

type ChromeLabTarget = ChromeLabPageTarget | ChromeLabUnitTarget;

type PreviewScrollMetrics = {
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
};

type ChromeLabTuneState = {
  previewMode: PreviewMode;
  previewFocus: PreviewFocus;
  controlTab: ChromeLabControlTab;
  outerRoleTab: RoleControlTab;
  innerRoleTab: RoleControlTab;
  outer: RoleTune;
  inner: RoleTune;
  dividers: DividerTunes;
};

type StoredChromeLabTuneState = ChromeLabTuneState & {
  version: typeof CHROME_LAB_STORAGE_VERSION;
  target: string;
};

const chromeLabPageTargets = (): ChromeLabPageTarget[] => drawableAssets('studio-page')
  .filter((asset) => Array.isArray(asset.behavior.roles) && asset.behavior.roles.includes('chrome-lab-page'))
  .map((asset) => {
    const id = String(asset.behavior.value ?? '');
    const route = String(asset.behavior.chromeLabRoute ?? '');
    const thumb = asset.media.thumbnail?.media.immutableUrl;
    if (!id || !route || !thumb) throw new Error(`Chrome Lab page ${asset.id} is incomplete`);
    return { id, label: asset.label, kind: 'page', route, thumb, badge: String(asset.metadata.chromeLabBadge ?? '') };
  });
const currentChromeLabTargets = (): ChromeLabTarget[] => [
  ...chromeLabPageTargets(),
  ...chromeUnitsInHierarchyOrder().map((unit): ChromeLabUnitTarget => ({
    id: `unit-${unit.id}`,
    label: unit.label,
    kind: 'unit',
    unitId: unit.id,
    badge: unit.badge,
  })),
];
export const CHROME_LAB_TARGETS: ChromeLabTarget[] = new Proxy([], { get: (_target, property) => { const values = currentChromeLabTargets(); const value = Reflect.get(values, property); return typeof value === 'function' ? value.bind(values) : value; } });
const chromeLabSharedTuningTargetId = (): string => String(requiredDrawableRole('studio-page', 'chrome-lab-page').behavior.value ?? '');


function chromeLabDefaultState(): ChromeLabTuneState {
  return {
    previewMode: 'interact',
    previewFocus: 'controls',
    controlTab: 'outer',
    outerRoleTab: 'atom',
    innerRoleTab: 'atom',
    outer: roleDefault('outer'),
    inner: roleDefault('inner'),
    dividers: {
      outer: dividerDefault('outer'),
      inner: dividerDefault('inner'),
    },
  };
}

function chromeLabStorageKey(targetId: string, version = CHROME_LAB_STORAGE_VERSION): string {
  return `${CHROME_LAB_STORAGE_PREFIX}.${targetId}.v${version}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberFrom(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function tabFrom<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === 'string' && (choices as readonly string[]).includes(value) ? value as T : fallback;
}

function chromeLabRouteParam(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(key);
}

function chromeLabRouteTab<T extends string>(key: string, choices: readonly T[], fallback: T): T {
  return tabFrom(chromeLabRouteParam(key), choices, fallback);
}

function writeChromeLabRouteParam(key: string, value: string, defaultValue?: string): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (value === defaultValue) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  const query = url.searchParams.toString();
  window.history.replaceState({}, '', `${url.pathname}${query ? `?${query}` : ''}${url.hash}`);
}

function turnFrom(value: unknown, fallback: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 {
  return ATOM_TURNS.includes(value as 0 | 1 | 2 | 3) ? value as 0 | 1 | 2 | 3 : fallback;
}

function railFitFrom(value: unknown, fallback: RailFit): RailFit {
  return value === 'stretch' || value === 'tile' ? value : fallback;
}

function fillModeFrom(value: unknown, fallback: ChromeFillMode): ChromeFillMode {
  return typeof value === 'string' && CHROME_FILL_MODE_OPTIONS.some((option) => option.id === value) ? value as ChromeFillMode : fallback;
}

function fillTintFrom(value: unknown, fallback: ChromeFillTintId): ChromeFillTintId {
  return typeof value === 'string' && CHROME_FILL_TINTS.some((option) => option.id === value) ? value as ChromeFillTintId : fallback;
}

function fillSurfaceFrom(value: unknown, fallback: ChromeFillSurfaceId): ChromeFillSurfaceId {
  return typeof value === 'string' && CHROME_FILL_SURFACES.some((option) => option.id === value) ? value as ChromeFillSurfaceId : fallback;
}

function atomAlignmentModeFrom(value: unknown, fallback: AtomAlignmentMode): AtomAlignmentMode {
  return typeof value === 'string' && (ATOM_ALIGNMENT_MODES as readonly string[]).includes(value) ? value as AtomAlignmentMode : fallback;
}

function atomPreviewModeFrom(value: unknown, fallback: AtomPreviewMode): AtomPreviewMode {
  return typeof value === 'string' && (ATOM_PREVIEW_MODES as readonly string[]).includes(value) ? value as AtomPreviewMode : fallback;
}

function titleVerticalAlignFrom(value: unknown, fallback: TitleVerticalAlign): TitleVerticalAlign {
  return value === 'center' || value === 'manual' ? value : fallback;
}

function titleHorizontalAlignFrom(value: unknown, fallback: TitleHorizontalAlign): TitleHorizontalAlign {
  return value === 'content-inset' || value === 'manual' ? value : fallback;
}

function roleAtomSourceId(role: ChromeRole, value: unknown, fallback: string): string {
  if (value === NO_ATOM_SOURCE_ID) return NO_ATOM_SOURCE_ID;
  if (typeof value !== 'string') return fallback;
  return chromeSourcesFor(role, 'atom').some((source) => source.id === value) ? value : fallback;
}

function roleRailSourceId(role: ChromeRole, value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return chromeSourcesFor(role, 'rail').some((source) => source.id === value) ? value : fallback;
}

function dividerAtomSourceId(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return dividerJointSources().some((source) => source.id === value) ? value : fallback;
}

function roleTuneFromStorage(role: ChromeRole, value: unknown): RoleTune {
  const defaults = roleDefault(role);
  if (!isRecord(value)) return defaults;
  const railSourceId = roleRailSourceId(role, value.railSourceId, defaults.railSourceId);
  const storedRailFit = railFitFrom(value.railFit, defaults.railFit);
  const railFit = storedRailFit === 'stretch' && chromeSourceById(railSourceId).kind === 'rail-repeat'
    ? 'tile'
    : storedRailFit;
  const fillAlpha = numberFrom(value.fillAlpha, defaults.fillAlpha);
  const legacyFillMode = fillAlpha > 0 ? 'tint' : defaults.fillMode;
  const tune: RoleTune = {
    atomSourceId: roleAtomSourceId(role, value.atomSourceId, defaults.atomSourceId),
    railSourceId,
    atomTurns: turnFrom(value.atomTurns, defaults.atomTurns),
    atomSize: numberFrom(value.atomSize, defaults.atomSize),
    railThickness: numberFrom(value.railThickness, defaults.railThickness),
    atomX: numberFrom(value.atomX, defaults.atomX),
    atomY: numberFrom(value.atomY, defaults.atomY),
    atomLeftX: numberFrom(value.atomLeftX, defaults.atomLeftX),
    atomRightX: numberFrom(value.atomRightX, defaults.atomRightX),
    atomTopY: numberFrom(value.atomTopY, defaults.atomTopY),
    atomBottomY: numberFrom(value.atomBottomY, defaults.atomBottomY),
    railUnderlap: numberFrom(value.railUnderlap, defaults.railUnderlap),
    railFit,
    fillMode: fillModeFrom(value.fillMode, legacyFillMode),
    fillTintId: fillTintFrom(value.fillTintId, defaults.fillTintId),
    fillSurfaceId: fillSurfaceFrom(value.fillSurfaceId, defaults.fillSurfaceId),
    fillSurfaceScale: numberFrom(value.fillSurfaceScale, defaults.fillSurfaceScale),
    fillBoxLeft: numberFrom(value.fillBoxLeft, defaults.fillBoxLeft),
    fillBoxRight: numberFrom(value.fillBoxRight, defaults.fillBoxRight),
    fillBoxTop: numberFrom(value.fillBoxTop, defaults.fillBoxTop),
    fillBoxBottom: numberFrom(value.fillBoxBottom, defaults.fillBoxBottom),
    contentPadding: numberFrom(value.contentPadding, defaults.contentPadding),
    fillAlpha,
    atomAlignMode: atomAlignmentModeFrom(value.atomAlignMode, defaults.atomAlignMode ?? 'manual'),
    atomAnchorX: numberFrom(value.atomAnchorX, defaults.atomAnchorX ?? defaults.atomSize / 2),
    atomAnchorY: numberFrom(value.atomAnchorY, defaults.atomAnchorY ?? defaults.atomSize / 2),
    atomCoverX: numberFrom(value.atomCoverX, defaults.atomCoverX ?? defaults.atomSize / 2),
    atomCoverY: numberFrom(value.atomCoverY, defaults.atomCoverY ?? defaults.atomSize / 2),
    atomPreviewMode: atomPreviewModeFrom(value.atomPreviewMode, defaults.atomPreviewMode ?? 'live'),
  };
  if (role === 'outer') {
    tune.titleTextX = numberFrom(value.titleTextX, defaults.titleTextX ?? 0);
    tune.titleTextY = numberFrom(value.titleTextY, defaults.titleTextY ?? 0);
    tune.titleFontSize = numberFrom(value.titleFontSize, defaults.titleFontSize ?? 16);
    tune.titleVerticalAlign = titleVerticalAlignFrom(value.titleVerticalAlign, defaults.titleVerticalAlign ?? 'manual');
    tune.titleHorizontalAlign = titleHorizontalAlignFrom(value.titleHorizontalAlign, defaults.titleHorizontalAlign ?? 'manual');
  }
  return tune;
}

function dividerTuneFromStorage(role: ChromeRole, value: unknown): DividerTune {
  const defaults = dividerDefault(role);
  if (!isRecord(value)) return defaults;
  return {
    atomSourceId: dividerAtomSourceId(value.atomSourceId, defaults.atomSourceId),
    atomTurns: turnFrom(value.atomTurns, defaults.atomTurns),
    atomSize: numberFrom(value.atomSize, defaults.atomSize),
    bandHeight: numberFrom(value.bandHeight, defaults.bandHeight),
    atomX: numberFrom(value.atomX, defaults.atomX),
    atomY: numberFrom(value.atomY, defaults.atomY),
    atomLeftX: numberFrom(value.atomLeftX, defaults.atomLeftX),
    atomRightX: numberFrom(value.atomRightX, defaults.atomRightX),
    atomLeftY: numberFrom(value.atomLeftY, defaults.atomLeftY),
    atomRightY: numberFrom(value.atomRightY, defaults.atomRightY),
    atomAlignMode: atomAlignmentModeFrom(value.atomAlignMode, defaults.atomAlignMode ?? 'manual'),
    atomAnchorX: numberFrom(value.atomAnchorX, defaults.atomAnchorX ?? defaults.atomSize / 2),
    atomAnchorY: numberFrom(value.atomAnchorY, defaults.atomAnchorY ?? defaults.atomSize / 2),
    atomCoverX: numberFrom(value.atomCoverX, defaults.atomCoverX ?? defaults.atomSize / 2),
    atomCoverY: numberFrom(value.atomCoverY, defaults.atomCoverY ?? defaults.atomSize / 2),
    atomPreviewMode: atomPreviewModeFrom(value.atomPreviewMode, defaults.atomPreviewMode ?? 'live'),
  };
}

function chromeLabStateFromStorage(targetId: string): ChromeLabTuneState {
  const defaults = chromeLabDefaultState();
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(chromeLabStorageKey(targetId))
      ?? window.localStorage.getItem(chromeLabStorageKey(targetId, CHROME_LAB_PREVIOUS_STORAGE_VERSION))
      ?? window.localStorage.getItem(chromeLabStorageKey(targetId, CHROME_LAB_LEGACY_STORAGE_VERSION));
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || ![
      CHROME_LAB_STORAGE_VERSION,
      CHROME_LAB_PREVIOUS_STORAGE_VERSION,
      CHROME_LAB_LEGACY_STORAGE_VERSION,
    ].includes(parsed.version as number)) return defaults;
    const previousStandaloneDivider = parsed.controlTab === 'divider';
    const storedDividers = isRecord(parsed.dividers) ? parsed.dividers : null;
    const state: ChromeLabTuneState = {
      previewMode: tabFrom(parsed.previewMode, ['interact', 'pan'] as const, defaults.previewMode),
      previewFocus: tabFrom(parsed.previewFocus, ['controls', 'board', 'current'] as const, defaults.previewFocus),
      controlTab: previousStandaloneDivider
        ? 'outer'
        : tabFrom(parsed.controlTab, CHROME_LAB_CONTROL_TAB_IDS, defaults.controlTab),
      outerRoleTab: previousStandaloneDivider
        ? 'divider'
        : tabFrom(parsed.outerRoleTab, ROLE_CONTROL_TAB_IDS, defaults.outerRoleTab),
      innerRoleTab: tabFrom(parsed.innerRoleTab, ROLE_CONTROL_TAB_IDS, defaults.innerRoleTab),
      outer: roleTuneFromStorage('outer', parsed.outer),
      inner: roleTuneFromStorage('inner', parsed.inner),
      dividers: {
        outer: dividerTuneFromStorage('outer', storedDividers?.outer ?? parsed.divider),
        inner: dividerTuneFromStorage('inner', storedDividers?.inner),
      },
    };
    if (parsed.version !== CHROME_LAB_STORAGE_VERSION) saveChromeLabState(targetId, state);
    return state;
  } catch {
    return defaults;
  }
}

function saveChromeLabState(targetId: string, state: ChromeLabTuneState): void {
  if (typeof window === 'undefined') return;
  const stored: StoredChromeLabTuneState = {
    version: CHROME_LAB_STORAGE_VERSION,
    target: targetId,
    ...state,
  };
  try {
    window.localStorage.setItem(chromeLabStorageKey(targetId), JSON.stringify(stored));
  } catch {
    /* localStorage may be unavailable in private or embedded contexts; the live preview can still run. */
  }
}

async function saveChromeLabDefaults(payload: { target: string; outer: RoleTune; inner: RoleTune; dividers: DividerTunes }): Promise<string> {
  const installed = requiredDrawableRole('chrome-family', 'installed-chrome');
  await saveDrawableAsset({
    id: installed.id,
    kind: installed.kind,
    label: installed.label,
    sortOrder: installed.sortOrder,
    lifecycleState: installed.lifecycleState,
    behavior: payload,
    metadata: installed.metadata,
    media: Object.fromEntries(Object.entries(installed.media).map(([role, binding]) => [role, binding.slot])),
    expectedRevision: installed.rowRevision,
  });
  return 'database installed Chrome role';
}


function SourcePreview({ source, box }: { source: ChromeCandidateSource | null; box: SourcePreviewBox }): ReactElement {
  const displayBox = {
    width: Math.min(box.width, SOURCE_PREVIEW_STAGE_LIMIT.width),
    height: Math.min(box.height, SOURCE_PREVIEW_STAGE_LIMIT.height),
  };
  const isCapped = displayBox.width < box.width || displayBox.height < box.height;
  return (
    <div className="chrome-lab-crop-row">
      <div
        className="chrome-lab-source-stage"
        style={{
          width: `${displayBox.width}px`,
          height: `${displayBox.height}px`,
        }}
      >
        {source ? <img className="chrome-lab-source-canvas" src={source.src} alt="" draggable={false} /> : null}
      </div>
      {source ? (
        <dl className="al-meta">
          <div><dt>Authority</dt><dd>{source.authority === 'installed-slot' ? 'Installed backend slot' : `Backend ${source.versionStatus}`}</dd></div>
          <div><dt>Source</dt><dd>{source.sourceSheetLabel}</dd></div>
          <div><dt>Source identity</dt><dd>{source.sourceSheetPath}</dd></div>
          <div><dt>Candidate</dt><dd>{source.componentIndex + 1} / {source.componentCount}</dd></div>
          <div><dt>Size</dt><dd>{source.width} x {source.height}</dd></div>
          {isCapped ? <div><dt>Preview</dt><dd>{displayBox.width} x {displayBox.height} cap</dd></div> : null}
        </dl>
      ) : null}
    </div>
  );
}

function sourceOptionLabel(source: ChromeCandidateSource): string {
  const mark = source.recommended ? ' *' : '';
  const authority = source.authority === 'installed-slot' ? 'installed' : source.versionStatus;
  return `${source.label}${mark} [${authority}]`;
}

function cycleSourceId(sources: ChromeCandidateSource[], currentId: string, delta: number): string {
  if (!sources.length) return currentId;
  const currentIndex = sources.findIndex((source) => source.id === currentId);
  const baseIndex = currentIndex >= 0 ? currentIndex : 0;
  return sources[(baseIndex + delta + sources.length) % sources.length].id;
}

function sourceScalePercent(renderedSize: number, source: Pick<ChromeCandidateSource, 'width' | 'height'> | null): number | null {
  if (!source) return null;
  const sourceSize = Math.max(source.width, source.height);
  if (sourceSize <= 0) return null;
  return Math.round((renderedSize / sourceSize) * 100);
}

function railScalePercent(renderedThickness: number, source: Pick<ChromeCandidateSource, 'width' | 'height'>): number {
  const sourceThickness = Math.max(1, Math.min(source.width, source.height));
  return Math.round((renderedThickness / sourceThickness) * 100);
}

function fillTintCss(tune: RoleTune): string {
  const tint = chromeFillTintById(tune.fillTintId);
  const alpha = clamp(tune.fillAlpha, 0, 1);
  return `rgba(${tint.rgb[0]}, ${tint.rgb[1]}, ${tint.rgb[2]}, ${alpha})`;
}

function fillPreviewStyle(tune: RoleTune): CSSProperties {
  if (tune.fillMode === 'none') return { backgroundColor: 'transparent', backgroundImage: 'none' };
  if (tune.fillMode === 'tint') return { backgroundColor: fillTintCss(tune), backgroundImage: 'none' };
  const surface = chromeFillSurfaceById(tune.fillSurfaceId);
  const tint = fillTintCss(tune);
  const hasTint = clamp(tune.fillAlpha, 0, 1) > 0;
  return {
    backgroundColor: 'transparent',
    backgroundImage: `${hasTint ? `linear-gradient(${tint}, ${tint}), ` : ''}url("${surface.src}")`,
    backgroundPosition: '0 0',
    backgroundRepeat: 'repeat',
    backgroundSize: `${hasTint ? `auto, ${tune.fillSurfaceScale}px auto` : `${tune.fillSurfaceScale}px auto`}`,
  };
}

const ALIGNMENT_MODE_LABELS: Record<AtomAlignmentMode, string> = {
  manual: 'Manual Pixel',
  'rail-center': 'Rail Center',
  anchor: 'Anchor Point',
  'edge-cover': 'Edge Cover',
};

const PREVIEW_MODE_LABELS: Record<AtomPreviewMode, string> = {
  live: 'Live Page',
  baked: 'Baked',
  debug: 'Debug',
};

function fmtPx(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded}${Number.isInteger(rounded) ? '' : ''}px`;
}

function AlignmentReadout({ readout }: { readout: ReturnType<typeof roleAtomAlignmentReadout> }): ReactElement {
  const finalValues = [
    ['L', readout.finalLeftX],
    ['R', readout.finalRightX],
    ['T', readout.finalTopY],
    ['B', readout.finalBottomY],
  ] as const;
  return (
    <dl className="chrome-lab-align-readout">
      <div><dt>Target</dt><dd>{fmtPx(readout.targetX)}, {fmtPx(readout.targetY)}</dd></div>
      <div><dt>Anchor</dt><dd>{fmtPx(readout.anchorX)}, {fmtPx(readout.anchorY)}</dd></div>
      <div><dt>Base</dt><dd>{fmtPx(readout.baseX)}, {fmtPx(readout.baseY)}</dd></div>
      <div className="chrome-lab-align-final-row">
        <dt>Final</dt>
        <dd className="chrome-lab-final-readout">
          {finalValues.map(([label, value]) => (
            <span key={label}><b>{label}</b>{fmtPx(value)}</span>
          ))}
        </dd>
      </div>
    </dl>
  );
}

function AlignmentPreview({ url, previewMode, readout }: { url: string; previewMode: AtomPreviewMode; readout: ReturnType<typeof roleAtomAlignmentReadout> }): ReactElement | null {
  if (previewMode === 'live') {
    return <p className="chrome-lab-note">Live page preview uses the actual CSS overlay in the main pane. Switch to Baked or Debug for a local truth surface.</p>;
  }
  return (
    <div
      className={`chrome-lab-align-preview is-${previewMode}`}
      style={{
        '--chrome-align-target-x': `${readout.targetX}px`,
        '--chrome-align-target-y': `${readout.targetY}px`,
        '--chrome-align-anchor-x': `${readout.finalLeftX + readout.anchorX}px`,
        '--chrome-align-anchor-y': `${readout.finalTopY + readout.anchorY}px`,
      } as CSSProperties}
    >
      {url ? <img src={url} alt="" draggable={false} /> : null}
    </div>
  );
}

function AlignmentModeSelect({
  mode,
  previewMode,
  onMode,
  onPreviewMode,
}: {
  mode: AtomAlignmentMode;
  previewMode: AtomPreviewMode;
  onMode: (mode: AtomAlignmentMode) => void;
  onPreviewMode: (mode: AtomPreviewMode) => void;
}): ReactElement {
  return (
    <div className="chrome-lab-align-selects">
      <label className="tileset-category-select">
        <span>Alignment</span>
        <select value={mode} onChange={(event) => onMode(event.target.value as AtomAlignmentMode)}>
          {ATOM_ALIGNMENT_MODES.map((entry) => <option key={entry} value={entry}>{ALIGNMENT_MODE_LABELS[entry]}</option>)}
        </select>
      </label>
      <label className="tileset-category-select">
        <span>Preview</span>
        <select value={previewMode} onChange={(event) => onPreviewMode(event.target.value as AtomPreviewMode)}>
          {ATOM_PREVIEW_MODES.map((entry) => <option key={entry} value={entry}>{PREVIEW_MODE_LABELS[entry]}</option>)}
        </select>
      </label>
    </div>
  );
}

function RoleAtomAlignmentControls({
  tune,
  onTune,
  defaults,
  frame,
}: {
  tune: RoleTune;
  onTune: (patch: Partial<RoleTune>) => void;
  defaults: RoleTune;
  frame: FrameRender;
}): ReactElement {
  const alignMode = tune.atomAlignMode ?? 'manual';
  const previewMode = tune.atomPreviewMode ?? 'live';
  const readout = roleAtomAlignmentReadout(tune);
  const anchorX = tune.atomAnchorX ?? tune.atomSize / 2;
  const anchorY = tune.atomAnchorY ?? tune.atomSize / 2;
  const coverX = tune.atomCoverX ?? tune.atomSize / 2;
  const coverY = tune.atomCoverY ?? tune.atomSize / 2;
  const fineLabel = alignMode === 'manual' ? 'Atom seat' : 'Fine nudge';
  return (
    <section className="chrome-lab-align-tools" aria-label="Atom alignment tools">
      <AlignmentModeSelect
        mode={alignMode}
        previewMode={previewMode}
        onMode={(atomAlignMode) => onTune({ atomAlignMode })}
        onPreviewMode={(atomPreviewMode) => onTune({ atomPreviewMode })}
      />
      <AlignmentPreview url={frame.previewUrl ?? frame.url} previewMode={previewMode} readout={readout} />
      <AlignmentReadout readout={readout} />
      {alignMode === 'anchor' ? (
        <>
          <SliderRow label={<>Anchor X - {fmtPx(anchorX)}</>} value={anchorX} set={(value) => onTune({ atomAnchorX: value })} min={-16} max={tune.atomSize + 16} dflt={defaults.atomAnchorX ?? defaults.atomSize / 2} />
          <SliderRow label={<>Anchor Y - {fmtPx(anchorY)}</>} value={anchorY} set={(value) => onTune({ atomAnchorY: value })} min={-16} max={tune.atomSize + 16} dflt={defaults.atomAnchorY ?? defaults.atomSize / 2} />
        </>
      ) : null}
      {alignMode === 'edge-cover' ? (
        <>
          <SliderRow label={<>Cover X - {fmtPx(coverX)}</>} value={coverX} set={(value) => onTune({ atomCoverX: value })} min={-16} max={tune.atomSize + 32} dflt={defaults.atomCoverX ?? defaults.atomSize / 2} />
          <SliderRow label={<>Cover Y - {fmtPx(coverY)}</>} value={coverY} set={(value) => onTune({ atomCoverY: value })} min={-16} max={tune.atomSize + 32} dflt={defaults.atomCoverY ?? defaults.atomSize / 2} />
        </>
      ) : null}
      <SliderRow label={<>{fineLabel} X - {tune.atomX > 0 ? '+' : ''}{fmtPx(tune.atomX)}</>} value={tune.atomX} set={(value) => onTune({ atomX: value })} min={-64} max={64} step={0.5} nudge={0.5} dflt={defaults.atomX} />
      <SliderRow label={<>{fineLabel} Y - {tune.atomY > 0 ? '+' : ''}{fmtPx(tune.atomY)}</>} value={tune.atomY} set={(value) => onTune({ atomY: value })} min={-64} max={64} step={0.5} nudge={0.5} dflt={defaults.atomY} />
    </section>
  );
}

function DividerAtomAlignmentControls({
  tune,
  onTune,
  defaults,
  source,
  render,
}: {
  tune: DividerTune;
  onTune: (patch: Partial<DividerTune>) => void;
  defaults: DividerTune;
  source: DividerJointSource;
  render: DividerRender;
}): ReactElement {
  const alignMode = tune.atomAlignMode ?? 'manual';
  const previewMode = tune.atomPreviewMode ?? 'live';
  const readout = dividerAtomAlignmentReadout(tune, source);
  const anchorX = tune.atomAnchorX ?? tune.atomSize / 2;
  const anchorY = tune.atomAnchorY ?? tune.atomSize / 2;
  const coverX = tune.atomCoverX ?? tune.atomSize / 2;
  const coverY = tune.atomCoverY ?? tune.atomSize / 2;
  const fineLabel = alignMode === 'manual' ? 'Joint seat' : 'Fine nudge';
  return (
    <section className="chrome-lab-align-tools" aria-label="Divider joint alignment tools">
      <AlignmentModeSelect
        mode={alignMode}
        previewMode={previewMode}
        onMode={(atomAlignMode) => onTune({ atomAlignMode })}
        onPreviewMode={(atomPreviewMode) => onTune({ atomPreviewMode })}
      />
      <DividerAlignmentPreview render={render} previewMode={previewMode} readout={readout} />
      <AlignmentReadout readout={readout} />
      {alignMode === 'anchor' ? (
        <>
          <SliderRow label={<>Anchor X - {fmtPx(anchorX)}</>} value={anchorX} set={(value) => onTune({ atomAnchorX: value })} min={-16} max={tune.atomSize + 16} dflt={defaults.atomAnchorX ?? defaults.atomSize / 2} />
          <SliderRow label={<>Anchor Y - {fmtPx(anchorY)}</>} value={anchorY} set={(value) => onTune({ atomAnchorY: value })} min={-16} max={tune.atomSize + 16} dflt={defaults.atomAnchorY ?? defaults.atomSize / 2} />
        </>
      ) : null}
      {alignMode === 'edge-cover' ? (
        <>
          <SliderRow label={<>Cover X - {fmtPx(coverX)}</>} value={coverX} set={(value) => onTune({ atomCoverX: value })} min={-16} max={tune.atomSize + 32} dflt={defaults.atomCoverX ?? defaults.atomSize / 2} />
          <SliderRow label={<>Cover Y - {fmtPx(coverY)}</>} value={coverY} set={(value) => onTune({ atomCoverY: value })} min={-16} max={tune.atomSize + 32} dflt={defaults.atomCoverY ?? defaults.atomSize / 2} />
        </>
      ) : null}
      <SliderRow label={<>{fineLabel} X - {tune.atomX > 0 ? '+' : ''}{fmtPx(tune.atomX)}</>} value={tune.atomX} set={(value) => onTune({ atomX: value })} min={-96} max={96} step={0.5} nudge={0.5} dflt={defaults.atomX} />
      <SliderRow label={<>{fineLabel} Y - {tune.atomY > 0 ? '+' : ''}{fmtPx(tune.atomY)}</>} value={tune.atomY} set={(value) => onTune({ atomY: value })} min={-64} max={64} step={0.5} nudge={0.5} dflt={defaults.atomY} />
    </section>
  );
}

function loadPreviewImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${src}`));
    image.src = src;
  });
}

function DividerAlignmentPreview({ render, previewMode, readout }: { render: DividerRender; previewMode: AtomPreviewMode; readout: ReturnType<typeof roleAtomAlignmentReadout> }): ReactElement | null {
  const [snapshotUrl, setSnapshotUrl] = useState('');
  const railWidth = 132;
  const pad = Math.max(28, render.atomOverlay?.outset ?? 24);
  const railTop = pad + Math.round((render.height - render.railHeight) / 2);
  const stageHeight = pad * 2 + render.height;
  const stageWidth = railWidth + pad * 2;
  useEffect(() => {
    let live = true;
    const bake = async (): Promise<void> => {
      if (previewMode === 'live' || !render.railUrl) {
        if (live) setSnapshotUrl('');
        return;
      }
      const [railImage, leftAtom, rightAtom] = await Promise.all([
        loadPreviewImage(render.railUrl),
        render.atomOverlay ? loadPreviewImage(render.atomOverlay.left) : Promise.resolve(null),
        render.atomOverlay ? loadPreviewImage(render.atomOverlay.right) : Promise.resolve(null),
      ]);
      const canvas = document.createElement('canvas');
      canvas.width = stageWidth;
      canvas.height = stageHeight;
      const context = canvas.getContext('2d')!;
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, stageWidth, stageHeight);
      const tileW = Math.max(1, Math.round(render.railTileWidth));
      for (let x = pad; x < pad + railWidth; x += tileW) {
        const drawW = Math.min(tileW, pad + railWidth - x);
        context.drawImage(railImage, 0, 0, railImage.width, railImage.height, x, railTop, drawW, render.railHeight);
      }
      if (render.atomOverlay && leftAtom && rightAtom) {
        context.drawImage(leftAtom, 0, 0, leftAtom.width, leftAtom.height, pad + render.atomOverlay.leftX, pad + render.atomOverlay.leftY, render.atomOverlay.width, render.atomOverlay.height);
        context.drawImage(rightAtom, 0, 0, rightAtom.width, rightAtom.height, pad + railWidth - render.atomOverlay.width - render.atomOverlay.rightX, pad + render.atomOverlay.rightY, render.atomOverlay.width, render.atomOverlay.height);
      }
      if (live) setSnapshotUrl(canvas.toDataURL('image/png'));
    };
    bake().catch(() => { if (live) setSnapshotUrl(''); });
    return () => { live = false; };
  }, [pad, previewMode, railTop, railWidth, render.atomOverlay, render.height, render.railHeight, render.railTileWidth, render.railUrl, stageHeight, stageWidth]);
  if (previewMode === 'live') {
    return <p className="chrome-lab-note">Live page preview uses the actual divider row in the main pane. Switch to Baked or Debug for a local truth surface.</p>;
  }
  return (
    <div
      className={`chrome-lab-divider-align-preview is-${previewMode}`}
      style={{
        width: `${stageWidth}px`,
        height: `${stageHeight}px`,
        '--chrome-align-target-x': `${pad + readout.targetX}px`,
        '--chrome-align-target-y': `${pad + readout.targetY}px`,
        '--chrome-align-anchor-x': `${pad + readout.finalLeftX + readout.anchorX}px`,
        '--chrome-align-anchor-y': `${pad + readout.finalTopY + readout.anchorY}px`,
      } as CSSProperties}
    >
      {snapshotUrl ? <img className="chrome-lab-divider-align-baked" src={snapshotUrl} alt="" draggable={false} /> : null}
    </div>
  );
}

function TitleTextControls({ tune, onTune }: { tune: RoleTune; onTune: (patch: Partial<RoleTune>) => void }): ReactElement {
  const defaults = roleDefault('outer');
  const titleTextX = tune.titleTextX ?? defaults.titleTextX ?? 0;
  const titleTextY = tune.titleTextY ?? defaults.titleTextY ?? 0;
  const titleFontSize = tune.titleFontSize ?? defaults.titleFontSize ?? 16;
  const titleVerticalAlign = tune.titleVerticalAlign ?? defaults.titleVerticalAlign ?? 'manual';
  const titleHorizontalAlign = tune.titleHorizontalAlign ?? defaults.titleHorizontalAlign ?? 'manual';
  return (
    <section id="chrome-lab-outer-panel-title" className="chrome-lab-subsection chrome-lab-subpane">
      <label className="tileset-category-select">
        <span>Horizontal</span>
        <select value={titleHorizontalAlign} onChange={(event) => onTune({ titleHorizontalAlign: event.target.value as TitleHorizontalAlign })}>
          <option value="manual">Manual offset</option>
          <option value="content-inset">Match contents box</option>
        </select>
      </label>
      <label className="tileset-category-select">
        <span>Vertical</span>
        <select value={titleVerticalAlign} onChange={(event) => onTune({ titleVerticalAlign: event.target.value as TitleVerticalAlign })}>
          <option value="manual">Manual offset</option>
          <option value="center">Centered</option>
        </select>
      </label>
      <SliderRow label={<>Font size · {titleFontSize}px</>} value={titleFontSize} set={(value) => onTune({ titleFontSize: value })} min={8} max={36} dflt={defaults.titleFontSize ?? 16} />
      {titleHorizontalAlign === 'manual' ? (
        <SliderRow label={<>Text X · {titleTextX > 0 ? '+' : ''}{titleTextX}px</>} value={titleTextX} set={(value) => onTune({ titleTextX: value })} min={-80} max={160} dflt={defaults.titleTextX ?? 0} />
      ) : (
        <p className="chrome-lab-note">Text X is owned by the Contents Box alignment.</p>
      )}
      {titleVerticalAlign === 'manual' ? (
        <SliderRow label={<>Text Y · {titleTextY > 0 ? '+' : ''}{titleTextY}px</>} value={titleTextY} set={(value) => onTune({ titleTextY: value })} min={-48} max={48} dflt={defaults.titleTextY ?? 0} />
      ) : (
        <p className="chrome-lab-note">Text Y is owned by the visible title-field center.</p>
      )}
    </section>
  );
}

function RoleChromeControls({
  role,
  tune,
  onTune,
  frame,
  activeTab,
  onActiveTab,
  dividerControls,
  titleControls,
  infoControls,
}: {
  role: ChromeRole;
  tune: RoleTune;
  onTune: (patch: Partial<RoleTune>) => void;
  frame: FrameRender;
  activeTab: RoleControlTab;
  onActiveTab: (tab: RoleControlTab) => void;
  dividerControls?: ReactNode;
  titleControls?: ReactNode;
  infoControls?: ReactNode;
}): ReactElement {
  const hasAtom = tune.atomSourceId !== NO_ATOM_SOURCE_ID;
  const atomSource = hasAtom ? chromeSourceById(tune.atomSourceId) : null;
  const railSource = chromeSourceById(tune.railSourceId);
  const atomSources = chromeSourcesFor(role, 'atom');
  const railSources = chromeSourcesFor(role, 'rail');
  const atomPreviewBox = sourcePreviewBox(atomSources);
  const railPreviewBox = sourcePreviewBox(railSources);
  const roleLabel = role === 'outer' ? 'Outer' : 'Inner';
  const defaults = roleDefault(role);
  const atomScalePercent = sourceScalePercent(tune.atomSize, atomSource);
  const railPercent = railScalePercent(tune.railThickness, railSource);
  const cycleAtom = (delta: number): void => {
    if (!hasAtom) {
      onTune({ atomSourceId: atomSources[delta > 0 ? 0 : atomSources.length - 1]?.id ?? tune.atomSourceId });
      return;
    }
    onTune({ atomSourceId: cycleSourceId(atomSources, tune.atomSourceId, delta) });
  };
  const selectRailSource = (railSourceId: string): void => {
    onTune({ railSourceId, railFit: defaultRailFitForSource(railSourceId, tune.railFit) });
  };
  const cycleRail = (delta: number): void => selectRailSource(cycleSourceId(railSources, tune.railSourceId, delta));
  const modeOptions: Array<{ id: RoleControlTab; label: string }> = [
    { id: 'chrome', label: 'Box' },
    { id: 'rail', label: 'Rail' },
    { id: 'atom', label: 'Corner' },
    ...(dividerControls ? [{ id: 'divider' as const, label: 'Divider' }] : []),
    ...(titleControls ? [{ id: 'title' as const, label: 'Title' }] : []),
    ...(infoControls ? [{ id: 'info' as const, label: 'Info' }] : []),
  ];
  const selectedTab = modeOptions.some((option) => option.id === activeTab) ? activeTab : 'chrome';

  return (
    <section className="chrome-lab-section chrome-lab-pane" aria-label={`${roleLabel} Chrome`}>
      <label className="tileset-category-select chrome-lab-mode-select">
        <span>Mode</span>
        <select value={selectedTab} onChange={(event) => onActiveTab(event.target.value as RoleControlTab)}>
          {modeOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      <div className="chrome-lab-section-body">
        {selectedTab === 'chrome' ? (
          <section id={`chrome-lab-${role}-panel-chrome`} className="chrome-lab-subsection chrome-lab-subpane">
            <div className="chrome-lab-fill-preview" style={fillPreviewStyle(tune)} aria-hidden="true" />
            <label className="tileset-category-select">
              <span>Fill</span>
              <select value={tune.fillMode} onChange={(event) => onTune({ fillMode: event.target.value as ChromeFillMode })}>
                {CHROME_FILL_MODE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            {tune.fillMode !== 'none' ? (
              <>
                <label className="tileset-category-select">
                  <span>{tune.fillMode === 'surface' ? 'Tint overlay' : 'Tint color'}</span>
                  <select value={tune.fillTintId} onChange={(event) => onTune({ fillTintId: event.target.value as ChromeFillTintId })}>
                    {CHROME_FILL_TINTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </label>
                <SliderRow
                  label={<>{tune.fillMode === 'surface' ? 'Tint overlay' : 'Tint opacity'} - {Math.round(tune.fillAlpha * 100)}%</>}
                  value={tune.fillAlpha}
                  set={(value) => onTune({ fillAlpha: value })}
                  min={0}
                  max={1}
                  step={0.01}
                  nudge={0.05}
                  dflt={defaults.fillAlpha}
                />
              </>
            ) : null}
            {tune.fillMode === 'surface' ? (
              <>
                <label className="tileset-category-select">
                  <span>Surface</span>
                  <select value={tune.fillSurfaceId} onChange={(event) => onTune({ fillSurfaceId: event.target.value as ChromeFillSurfaceId })}>
                    {CHROME_FILL_SURFACES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </label>
                <SliderRow
                  label={<>Surface scale - {tune.fillSurfaceScale}px</>}
                  value={tune.fillSurfaceScale}
                  set={(value) => onTune({ fillSurfaceScale: value })}
                  min={128}
                  max={1024}
                  step={16}
                  nudge={16}
                  dflt={defaults.fillSurfaceScale}
                />
              </>
            ) : null}
            {role === 'outer' ? (
              <>
                <div className="chrome-lab-subsection chrome-lab-fill-box-controls">
                  <h3 className="chrome-lab-pane-title">Contents Box</h3>
                  <SliderRow label={<>Inset - {tune.contentPadding}px</>} value={tune.contentPadding} set={(value) => onTune({ contentPadding: value })} min={0} max={48} dflt={defaults.contentPadding} />
                </div>
                <div className="chrome-lab-subsection chrome-lab-fill-box-controls">
                  <h3 className="chrome-lab-pane-title">Fill Box</h3>
                  <SliderRow label={<>Left inset - {tune.fillBoxLeft > 0 ? '+' : ''}{tune.fillBoxLeft}px</>} value={tune.fillBoxLeft} set={(value) => onTune({ fillBoxLeft: value })} min={-32} max={32} dflt={defaults.fillBoxLeft} />
                  <SliderRow label={<>Right inset - {tune.fillBoxRight > 0 ? '+' : ''}{tune.fillBoxRight}px</>} value={tune.fillBoxRight} set={(value) => onTune({ fillBoxRight: value })} min={-32} max={32} dflt={defaults.fillBoxRight} />
                  <SliderRow label={<>Top inset - {tune.fillBoxTop > 0 ? '+' : ''}{tune.fillBoxTop}px</>} value={tune.fillBoxTop} set={(value) => onTune({ fillBoxTop: value })} min={-32} max={32} dflt={defaults.fillBoxTop} />
                  <SliderRow label={<>Bottom inset - {tune.fillBoxBottom > 0 ? '+' : ''}{tune.fillBoxBottom}px</>} value={tune.fillBoxBottom} set={(value) => onTune({ fillBoxBottom: value })} min={-32} max={32} dflt={defaults.fillBoxBottom} />
                </div>
              </>
            ) : null}
            <p className="chrome-lab-note">Fill is role-owned. Consumers choose outer or inner; they do not paint their own box background.</p>
          </section>
        ) : null}

        {selectedTab === 'atom' ? (
          <section id={`chrome-lab-${role}-panel-atom`} className="chrome-lab-subsection chrome-lab-subpane">
            <label className="tileset-category-select">
              <span>Source file</span>
              <select value={tune.atomSourceId} onChange={(event) => onTune({ atomSourceId: event.target.value })}>
                <option value={NO_ATOM_SOURCE_ID}>None</option>
                {atomSources.map((source) => <option key={source.id} value={source.id}>{sourceOptionLabel(source)}</option>)}
              </select>
            </label>
            <div className="chrome-lab-cycle">
              <button type="button" onClick={() => cycleAtom(-1)} disabled={!atomSources.length}>Prev</button>
              <span>{hasAtom && atomSource ? `${atomSource.componentIndex + 1} / ${atomSource.componentCount}` : 'None'}</span>
              <button type="button" onClick={() => cycleAtom(1)} disabled={!atomSources.length}>Next</button>
            </div>
            <SourcePreview source={atomSource} box={atomPreviewBox} />
            {hasAtom && atomSource ? (
              <>
                <div className="tileset-filter-field">
                  <span>Source orientation</span>
                  <div className="pages-ctl-row">
                    <div className="tileset-tier-seg" aria-label={`${roleLabel} atom source orientation`}>
                      {ATOM_TURNS.map((turns, index) => (
                        <button
                          key={turns}
                          type="button"
                          className={tune.atomTurns === turns ? 'is-active' : ''}
                          onClick={() => onTune({ atomTurns: turns })}
                        >
                          {ATOM_TURN_LABELS[index]}
                        </button>
                      ))}
                    </div>
                    {ctlReset(() => onTune({ atomTurns: defaults.atomTurns }))}
                  </div>
                </div>
                <SliderRow
                  label={<>Atom size - {tune.atomSize}px{atomScalePercent ? ` / ${atomScalePercent}%` : ''}</>}
                  value={tune.atomSize}
                  set={(value) => onTune({ atomSize: value })}
                  min={4}
                  max={48}
                  dflt={defaults.atomSize}
                />
                <RoleAtomAlignmentControls tune={tune} onTune={onTune} defaults={defaults} frame={frame} />
                <SliderRow label={<>Left atom X - {tune.atomLeftX > 0 ? '+' : ''}{fmtPx(tune.atomLeftX)}</>} value={tune.atomLeftX} set={(value) => onTune({ atomLeftX: value })} min={-32} max={32} step={0.5} nudge={0.5} dflt={defaults.atomLeftX} />
                <SliderRow label={<>Right atom X - {tune.atomRightX > 0 ? '+' : ''}{fmtPx(tune.atomRightX)}</>} value={tune.atomRightX} set={(value) => onTune({ atomRightX: value })} min={-32} max={32} step={0.5} nudge={0.5} dflt={defaults.atomRightX} />
                <SliderRow label={<>Top atom Y - {tune.atomTopY > 0 ? '+' : ''}{fmtPx(tune.atomTopY)}</>} value={tune.atomTopY} set={(value) => onTune({ atomTopY: value })} min={-32} max={32} step={0.5} nudge={0.5} dflt={defaults.atomTopY} />
                <SliderRow label={<>Bottom atom Y - {tune.atomBottomY > 0 ? '+' : ''}{fmtPx(tune.atomBottomY)}</>} value={tune.atomBottomY} set={(value) => onTune({ atomBottomY: value })} min={-32} max={32} step={0.5} nudge={0.5} dflt={defaults.atomBottomY} />
              </>
            ) : (
              <p className="chrome-lab-note">Atom hidden. The rail keeps its current thickness and corner overlap so the uncovered joint is inspectable.</p>
            )}
          </section>
        ) : null}

        {selectedTab === 'rail' ? (
          <section id={`chrome-lab-${role}-panel-rail`} className="chrome-lab-subsection chrome-lab-subpane">
            <label className="tileset-category-select">
              <span>Source file</span>
              <select value={tune.railSourceId} onChange={(event) => selectRailSource(event.target.value)}>
                {railSources.map((source) => <option key={source.id} value={source.id}>{sourceOptionLabel(source)}</option>)}
              </select>
            </label>
            <div className="chrome-lab-cycle">
              <button type="button" onClick={() => cycleRail(-1)} disabled={railSources.length < 2}>Prev</button>
              <span>{railSource.componentIndex + 1} / {railSource.componentCount}</span>
              <button type="button" onClick={() => cycleRail(1)} disabled={railSources.length < 2}>Next</button>
            </div>
            <SourcePreview source={railSource} box={railPreviewBox} />
            <div className="tileset-filter-field">
              <span>Fit</span>
              <div className="pages-ctl-row">
                <div className="tileset-tier-seg" aria-label={`${roleLabel} rail fit`}>
                  <button type="button" className={tune.railFit === 'stretch' ? 'is-active' : ''} onClick={() => onTune({ railFit: 'stretch' })}>Stretch</button>
                  <button type="button" className={tune.railFit === 'tile' ? 'is-active' : ''} onClick={() => onTune({ railFit: 'tile' })}>Tile</button>
                </div>
                {ctlReset(() => onTune({ railFit: defaults.railFit }))}
              </div>
            </div>
            <SliderRow label={<>Rail size - {tune.railThickness}px / {railPercent}% source</>} value={tune.railThickness} set={(value) => onTune({ railThickness: value })} min={1} max={24} dflt={defaults.railThickness} />
            <SliderRow label={<>Corner overlap - {tune.railUnderlap}px</>} value={tune.railUnderlap} set={(value) => onTune({ railUnderlap: value })} min={0} max={48} dflt={defaults.railUnderlap} />
          </section>
        ) : null}
        {dividerControls && selectedTab === 'divider' ? (
          <section id={`chrome-lab-${role}-panel-divider`} className="chrome-lab-subpane">
            {dividerControls}
          </section>
        ) : null}
        {titleControls && selectedTab === 'title' ? titleControls : null}
        {infoControls && selectedTab === 'info' ? (
          <section id={`chrome-lab-${role}-panel-info`} className="chrome-lab-subsection chrome-lab-subpane">
            {infoControls}
          </section>
        ) : null}
      </div>
    </section>
  );
}

function DividerJointPreview({ source }: { source: DividerJointSource }): ReactElement {
  const previewBox = dividerJointPreviewBox();
  return (
    <div className="chrome-lab-crop-row">
      <div
        className="chrome-lab-divider-atom-stage"
        style={{
          width: `${previewBox.width}px`,
          height: `${previewBox.height}px`,
        }}
      >
        {source.src ? <img className="chrome-lab-divider-atom-canvas" src={source.src} alt="" draggable={false} /> : null}
      </div>
    </div>
  );
}

function DividerControls({
  role,
  tune,
  onTune,
  render,
  railFit,
}: {
  role: ChromeRole;
  tune: DividerTune;
  onTune: (patch: Partial<DividerTune>) => void;
  render: DividerRender;
  railFit: RailFit;
}): ReactElement {
  const sources = dividerJointSources();
  const source = dividerJointSourceById(tune.atomSourceId);
  const sourceIndex = sources.findIndex((entry) => entry.id === tune.atomSourceId);
  const cycleSource = (delta: number): void => {
    const base = sourceIndex >= 0 ? sourceIndex : 1;
    const next = sources[(base + delta + sources.length) % sources.length];
    onTune({ atomSourceId: next.id });
  };
  const defaults = dividerDefault(role);
  const hasAtom = tune.atomSourceId !== NO_ATOM_SOURCE_ID;
  const jointScalePercent = sourceScalePercent(tune.atomSize, source);
  const railRepeat = railFit === 'tile' ? 'repeat-x' : 'no-repeat';
  const railSize = railFit === 'tile'
    ? `${render.railTileWidth}px ${render.railHeight}px`
    : `100% ${render.railHeight}px`;
  const roleLabel = role === 'outer' ? 'Outer' : 'Inner';
  return (
    <section className="chrome-lab-subsection chrome-lab-subpane">
          <p className="chrome-lab-note">Installed joint material is shared by both roles; {roleLabel.toLowerCase()} divider geometry is independent.</p>
          <div className="chrome-lab-frame-preview">
            <div
              className="chrome-lab-divider-mini"
              style={{
                backgroundImage: render.railUrl ? `url("${render.railUrl}")` : undefined,
                backgroundRepeat: railRepeat,
                backgroundSize: railSize,
              }}
            />
            <span>Divider row - height {render.height}px</span>
          </div>
          <SliderRow
            label={<>Divider band height - {tune.bandHeight}px</>}
            value={tune.bandHeight}
            set={(value) => onTune({ bandHeight: value })}
            min={1}
            max={96}
            dflt={defaults.bandHeight}
          />
          <label className="tileset-category-select">
            <span>Joint atom</span>
            <select value={tune.atomSourceId} onChange={(event) => onTune({ atomSourceId: event.target.value })}>
              {sources.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>
          </label>
          <div className="chrome-lab-cycle">
            <button type="button" onClick={() => cycleSource(-1)}>Prev</button>
            <span>{source.label}</span>
            <button type="button" onClick={() => cycleSource(1)}>Next</button>
          </div>
          <DividerJointPreview source={source} />
          {hasAtom ? (
            <>
              <div className="tileset-filter-field">
                <span>Source orientation</span>
                <div className="pages-ctl-row">
                  <div className="tileset-tier-seg" aria-label="Divider joint source orientation">
                    {ATOM_TURNS.map((turns, index) => (
                      <button
                        key={turns}
                        type="button"
                        className={tune.atomTurns === turns ? 'is-active' : ''}
                        onClick={() => onTune({ atomTurns: turns })}
                      >
                        {ATOM_TURN_LABELS[index]}
                      </button>
                    ))}
                  </div>
                  {ctlReset(() => onTune({ atomTurns: defaults.atomTurns }))}
                </div>
              </div>
              <SliderRow
                label={<>Joint size - {tune.atomSize}px{jointScalePercent ? ` / ${jointScalePercent}%` : ''}</>}
                value={tune.atomSize}
                set={(value) => onTune({ atomSize: value })}
                min={4}
                max={72}
                dflt={defaults.atomSize}
              />
              <DividerAtomAlignmentControls tune={tune} onTune={onTune} defaults={defaults} source={source} render={render} />
              <SliderRow label={<>Left joint X - {tune.atomLeftX > 0 ? '+' : ''}{fmtPx(tune.atomLeftX)}</>} value={tune.atomLeftX} set={(value) => onTune({ atomLeftX: value })} min={-64} max={64} step={0.5} nudge={0.5} dflt={defaults.atomLeftX} />
              <SliderRow label={<>Right joint X - {tune.atomRightX > 0 ? '+' : ''}{fmtPx(tune.atomRightX)}</>} value={tune.atomRightX} set={(value) => onTune({ atomRightX: value })} min={-64} max={64} step={0.5} nudge={0.5} dflt={defaults.atomRightX} />
              <SliderRow label={<>Left joint Y - {tune.atomLeftY > 0 ? '+' : ''}{fmtPx(tune.atomLeftY)}</>} value={tune.atomLeftY} set={(value) => onTune({ atomLeftY: value })} min={-64} max={64} step={0.5} nudge={0.5} dflt={defaults.atomLeftY} />
              <SliderRow label={<>Right joint Y - {tune.atomRightY > 0 ? '+' : ''}{fmtPx(tune.atomRightY)}</>} value={tune.atomRightY} set={(value) => onTune({ atomRightY: value })} min={-64} max={64} step={0.5} nudge={0.5} dflt={defaults.atomRightY} />
            </>
          ) : (
            <p className="chrome-lab-note">Joint atom hidden.</p>
          )}
    </section>
  );
}

function InheritedChromeControls({
  owner,
  ownerLabel,
  onJumpUnit,
  infoControls,
}: {
  owner: ChromeUnitId;
  ownerLabel: string;
  onJumpUnit: (id: ChromeUnitId) => void;
  infoControls: ReactNode;
}): ReactElement {
  const [mode, setMode] = useState<'inheritance' | 'info'>('inheritance');
  return (
    <section className="chrome-lab-section chrome-lab-pane" aria-label="Inherited chrome">
      <h3 className="chrome-lab-pane-title">Inherited Chrome</h3>
      <div className="chrome-lab-section-body">
        <label className="tileset-category-select chrome-lab-mode-select">
          <span>Mode</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as 'inheritance' | 'info')}>
            <option value="inheritance">Inheritance</option>
            <option value="info">Info</option>
          </select>
        </label>
        {mode === 'inheritance' ? (
          <>
            <p className="chrome-lab-note">This class does not own chrome-family tuning. It inherits from {ownerLabel}; only the controls above belong to this class.</p>
            <button type="button" className="tileset-view-action" onClick={() => onJumpUnit(owner)}>Edit {ownerLabel}</button>
          </>
        ) : (
          <section className="chrome-lab-subsection chrome-lab-subpane" aria-label="Chrome audit info">
            {infoControls}
          </section>
        )}
      </div>
    </section>
  );
}

function ChromeLabUnitChromeControls({
  unitId,
  outer,
  inner,
  dividers,
  outerFrame,
  innerFrame,
  dividerRenders,
  outerRoleTab,
  innerRoleTab,
  onOuterRoleTab,
  onInnerRoleTab,
  onOuter,
  onInner,
  onDivider,
  onJumpUnit,
  infoControls,
}: {
  unitId: ChromeUnitId;
  outer: RoleTune;
  inner: RoleTune;
  dividers: DividerTunes;
  outerFrame: FrameRender;
  innerFrame: FrameRender;
  dividerRenders: DividerRenders;
  outerRoleTab: RoleControlTab;
  innerRoleTab: RoleControlTab;
  onOuterRoleTab: (tab: RoleControlTab) => void;
  onInnerRoleTab: (tab: RoleControlTab) => void;
  onOuter: (patch: Partial<RoleTune>) => void;
  onInner: (patch: Partial<RoleTune>) => void;
  onDivider: (role: ChromeRole, patch: Partial<DividerTune>) => void;
  onJumpUnit: (id: ChromeUnitId) => void;
  infoControls: ReactNode;
}): ReactElement {
  if (unitId === 'outer-panel') {
    return (
      <>
        <p className="chrome-lab-note">This class owns the outer chrome family. Edits here apply anywhere that inherits outer chrome.</p>
        <RoleChromeControls
          role="outer"
          tune={outer}
          frame={outerFrame}
          activeTab={outerRoleTab}
          onActiveTab={onOuterRoleTab}
          onTune={onOuter}
          dividerControls={<DividerControls role="outer" tune={dividers.outer} render={dividerRenders.outer} railFit={outer.railFit} onTune={(patch) => onDivider('outer', patch)} />}
          titleControls={<TitleTextControls tune={outer} onTune={onOuter} />}
          infoControls={infoControls}
        />
      </>
    );
  }
  if (unitId === 'inner-box') {
    return (
      <>
        <p className="chrome-lab-note">This class owns the inner chrome family. Child controls inherit its box and divider geometry.</p>
        <RoleChromeControls
          role="inner"
          tune={inner}
          frame={innerFrame}
          activeTab={innerRoleTab}
          onActiveTab={onInnerRoleTab}
          onTune={onInner}
          dividerControls={<DividerControls role="inner" tune={dividers.inner} render={dividerRenders.inner} railFit={inner.railFit} onTune={(patch) => onDivider('inner', patch)} />}
          infoControls={infoControls}
        />
      </>
    );
  }
  const owner = chromeUnitById(unitId).role === 'outer' ? 'outer-panel' : 'inner-box';
  const ownerLabel = chromeUnitById(owner).label;
  return <InheritedChromeControls owner={owner} ownerLabel={ownerLabel} onJumpUnit={onJumpUnit} infoControls={infoControls} />;
}

function ChromeLabUnitThumbnail({ unitId }: { unitId: ChromeUnitId }): ReactElement {
  const unit = chromeUnitById(unitId);
  return (
    <span className={`tileset-studio-card-image chrome-unit-card-image is-${unit.id}`} aria-hidden="true">
      <span className="chrome-unit-card-stage level-editor-screen">
        <ChromeUnitSpecimen unit={unit} dims={chromeUnitThumbnailDims(unit)} interactive={false} />
      </span>
    </span>
  );
}

function ChromeUnitPathStack({ path }: { path: string }): ReactElement {
  return (
    <code className="chrome-unit-path-stack">
      {path.split('.').map((segment, index) => (
        <span
          key={`${segment}-${index}`}
          style={{ '--chrome-unit-path-depth': index } as CSSProperties}
        >
          {index === 0 ? segment : `.${segment}`}
        </span>
      ))}
    </code>
  );
}

export function ChromeLabCatalog({
  search,
  selected,
  onSelect,
  onOpen,
}: {
  search: string;
  selected?: string;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}): ReactElement {
  const installedChromeCss = useInstalledChromeCss();
  const q = search.trim().toLowerCase();
  const visible = CHROME_LAB_TARGETS.filter((target) => {
    const haystack = target.kind === 'page'
      ? [target.label, target.route, target.badge]
      : [
        target.label,
        target.unitId,
        chromeUnitById(target.unitId).name,
        target.badge,
        chromeUnitById(target.unitId).catalogKind,
        chromeUnitById(target.unitId).contentPolicy,
        chromeUnitById(target.unitId).tone,
        chromeUnitById(target.unitId).stateModel,
        ...(chromeUnitById(target.unitId).variants ?? []).flatMap((variant) => [
          variant.name,
          variant.label,
          variant.tone,
          variant.stateModel,
          variant.usage,
        ]),
        chromeUnitClassPath(chromeUnitById(target.unitId)),
        'audit specimen unit',
      ];
    return !q || haystack.join(' ').toLowerCase().includes(q);
  });
  return (
    <div className="tileset-studio-grid pages-grid" aria-label="Chrome Lab pages and units">
      {installedChromeCss ? <style data-chrome-unit-card-family dangerouslySetInnerHTML={{ __html: installedChromeCss }} /> : null}
      {visible.map((target) => (
        (() => {
          const unit = target.kind === 'unit' ? chromeUnitById(target.unitId) : null;
          const classPath = unit ? chromeUnitClassPath(unit) : '';
          return (
            <button
              key={target.id}
              type="button"
              className={`tileset-studio-card ${target.id === selected ? 'is-selected' : ''}`.trim()}
              onClick={() => { onSelect(target.id); onOpen(target.id); }}
              aria-pressed={target.id === selected}
              title={target.kind === 'page' ? `${target.label} - ${target.route}` : `${target.label} - ${target.badge}`}
            >
              {target.kind === 'page' ? (
                <span className="tileset-studio-card-image pages-card-image" aria-hidden="true">
                  <img src={target.thumb} alt="" loading="lazy" />
                </span>
              ) : (
                <ChromeLabUnitThumbnail unitId={target.unitId} />
              )}
              <span className="tileset-studio-card-meta">
                <span className="tileset-studio-card-text">
                  <strong>{target.label}</strong>
                  {unit ? (
                    <span className="chrome-unit-card-hierarchy">
                      <span><b>Name</b><code>{unit.name}</code></span>
                      <span><b>Class</b><ChromeUnitPathStack path={classPath} /></span>
                      <span><b>Kind</b><code>{target.badge}</code></span>
                      <span><b>Catalog</b><code>{unit.catalogKind}</code></span>
                      <span><b>Content</b><code>{unit.contentPolicy}</code></span>
                      <span><b>Tone</b><code>{unit.tone}</code></span>
                      <span><b>State</b><code>{unit.stateModel}</code></span>
                      {unit.variants?.length ? (
                        <span><b>Variants</b><code>{unit.variants.map((variant) => variant.name).join(' / ')}</code></span>
                      ) : null}
                    </span>
                  ) : (
                    <em>{target.badge}</em>
                  )}
                </span>
              </span>
            </button>
          );
        })()
      ))}
      {visible.length === 0 ? <p className="tileset-studio-empty">No page matches.</p> : null}
    </div>
  );
}

type ChromeAdminSourceState =
  | { status: 'loading'; count: 0; revision: null; error: null }
  | { status: 'error'; count: 0; revision: null; error: string }
  | { status: 'ready'; count: number; revision: number; error: null };

function useChromeAdminSources(): [ChromeAdminSourceState, () => void] {
  const [state, setState] = useState<ChromeAdminSourceState>({
    status: 'loading',
    count: 0,
    revision: null,
    error: null,
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const refresh = useCallback(() => {
    setState((current) => current.status === 'ready'
      ? current
      : { status: 'loading', count: 0, revision: null, error: null });
    void fetchAdminLiveMediaCatalog().then((catalog) => {
      if (!mounted.current) return;
      const count = installChromeAdminCatalog(catalog);
      setState({ status: 'ready', count, revision: catalog.revision, error: null });
    }).catch((error: unknown) => {
      if (mounted.current) setState({
        status: 'error',
        count: 0,
        revision: null,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return [state, refresh];
}

export function ChromeLabViewer(props: {
  targetId?: string;
  onTargetId: (id: string) => void;
  header?: ReactNode;
  zoomControl?: ReactNode;
  zoom?: number;
}): ReactElement {
  const [sourceState, refresh] = useChromeAdminSources();
  if (sourceState.status === 'loading') {
    return <div className="tileset-empty-state" role="status">Loading Chrome candidates from the backend...</div>;
  }
  if (sourceState.status === 'error') {
    return (
      <div className="tileset-empty-state" role="alert">
        <p>Chrome candidates could not be loaded: {sourceState.error}</p>
        <button type="button" className="tileset-view-action" onClick={refresh}>Retry backend catalog</button>
      </div>
    );
  }
  const sourceStatus = (
    <div className="chrome-lab-source-status" aria-live="polite">
      <span>{sourceState.count} backend candidate{sourceState.count === 1 ? '' : 's'} · catalog r{sourceState.revision}</span>
      <button type="button" className="tileset-view-action" onClick={refresh}>Refresh candidates</button>
    </div>
  );
  return (
    <ChromeLabReadyViewer
      {...props}
      header={<>{props.header}{sourceStatus}</>}
    />
  );
}

function ChromeLabReadyViewer({
  targetId,
  onTargetId,
  header,
  zoomControl,
  zoom = 1,
}: {
  targetId?: string;
  onTargetId: (id: string) => void;
  header?: ReactNode;
  zoomControl?: ReactNode;
  zoom?: number;
}): ReactElement {
  const target = CHROME_LAB_TARGETS.find((entry) => entry.id === targetId) ?? CHROME_LAB_TARGETS[0];
  if (target.kind === 'unit') {
    return <ChromeLabUnitViewer target={target} onTargetId={onTargetId} header={header} zoomControl={zoomControl} zoom={zoom} />;
  }
  return <ChromeLabPageViewer target={target} onTargetId={onTargetId} header={header} zoomControl={zoomControl} zoom={zoom} />;
}

function ChromeLabUnitViewer({
  target,
  onTargetId,
  header,
  zoomControl,
  zoom = 1,
}: {
  target: ChromeLabUnitTarget;
  onTargetId: (id: string) => void;
  header?: ReactNode;
  zoomControl?: ReactNode;
  zoom?: number;
}): ReactElement {
  const [initialLabState] = useState<ChromeLabTuneState>(() => chromeLabStateFromStorage(chromeLabSharedTuningTargetId()));
  const [outerRoleTab, setOuterRoleTabState] = useState<RoleControlTab>(() => chromeLabRouteTab('chromeOuterTab', ROLE_CONTROL_TAB_IDS, initialLabState.outerRoleTab));
  const [innerRoleTab, setInnerRoleTabState] = useState<RoleControlTab>(() => chromeLabRouteTab('chromeInnerTab', ROLE_CONTROL_TAB_IDS, initialLabState.innerRoleTab));
  const [outerPreviewId, setOuterPreviewIdState] = useState(() => chromeLabRouteParam('chromePreview') ?? 'template');
  const [outer, setOuter] = useState<RoleTune>(initialLabState.outer);
  const [inner, setInner] = useState<RoleTune>(initialLabState.inner);
  const [dividers, setDividers] = useState<DividerTunes>(initialLabState.dividers);
  const [outerFrame, setOuterFrame] = useState<FrameRender>(EMPTY_FRAME);
  const [innerFrame, setInnerFrame] = useState<FrameRender>(EMPTY_FRAME);
  const [dividerRenders, setDividerRenders] = useState<DividerRenders>({
    outer: EMPTY_DIVIDER,
    inner: EMPTY_DIVIDER,
  });
  const [copied, setCopied] = useState(false);
  const [exportText, setExportText] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const setOuterRoleTab = (tab: RoleControlTab): void => {
    setOuterRoleTabState(tab);
    writeChromeLabRouteParam('chromeOuterTab', tab, initialLabState.outerRoleTab);
  };
  const setInnerRoleTab = (tab: RoleControlTab): void => {
    setInnerRoleTabState(tab);
    writeChromeLabRouteParam('chromeInnerTab', tab, initialLabState.innerRoleTab);
  };
  const setOuterPreviewId = (id: string): void => {
    setOuterPreviewIdState(id);
    writeChromeLabRouteParam('chromePreview', id, 'template');
  };

  useEffect(() => {
    saveChromeLabState(chromeLabSharedTuningTargetId(), {
      previewMode: initialLabState.previewMode,
      previewFocus: initialLabState.previewFocus,
      controlTab: initialLabState.controlTab,
      outerRoleTab,
      innerRoleTab,
      outer,
      inner,
      dividers,
    });
  }, [dividers, initialLabState.controlTab, initialLabState.previewFocus, initialLabState.previewMode, inner, innerRoleTab, outer, outerRoleTab]);

  useEffect(() => {
    let live = true;
    composeFrameDataUrl(outer).then((frame) => { if (live) setOuterFrame(frame); }).catch(() => { if (live) setOuterFrame(EMPTY_FRAME); });
    return () => { live = false; };
  }, [outer]);

  useEffect(() => {
    let live = true;
    composeFrameDataUrl(inner).then((frame) => { if (live) setInnerFrame(frame); }).catch(() => { if (live) setInnerFrame(EMPTY_FRAME); });
    return () => { live = false; };
  }, [inner]);

  useEffect(() => {
    let live = true;
    composeDividerRender(outer, dividers.outer)
      .then((frame) => { if (live) setDividerRenders((current) => ({ ...current, outer: frame })); })
      .catch(() => { if (live) setDividerRenders((current) => ({ ...current, outer: EMPTY_DIVIDER })); });
    return () => { live = false; };
  }, [dividers.outer, outer]);

  useEffect(() => {
    let live = true;
    composeDividerRender(inner, dividers.inner)
      .then((frame) => { if (live) setDividerRenders((current) => ({ ...current, inner: frame })); })
      .catch(() => { if (live) setDividerRenders((current) => ({ ...current, inner: EMPTY_DIVIDER })); });
    return () => { live = false; };
  }, [dividers.inner, inner]);

  const css = frameCss(outer, inner, outerFrame, innerFrame, dividerRenders);
  const copyJson = async (): Promise<void> => {
    const payload = JSON.stringify(installedChromeTuningPayload(chromeLabSharedTuningTargetId(), outer, inner, dividers), null, 2);
    setExportText(payload);
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked - preview remains live */
    }
  };
  const saveDefaults = async (): Promise<void> => {
    setSaveMsg('saving...');
    try {
      const path = await saveChromeLabDefaults(installedChromeTuningPayload(chromeLabSharedTuningTargetId(), outer, inner, dividers));
      setSaveMsg(`saved ${path}`);
    } catch (error) {
      setSaveMsg(`error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const chromeControls: ChromeUnitAuditInfoRenderer = (infoControls) => {
    const infoWithExport = (
      <>
        {infoControls}
        <div className="chrome-lab-export-block">
          <button type="button" className="tileset-view-action" onClick={saveDefaults}>Save defaults</button>
          <button type="button" className="tileset-view-action" onClick={copyJson}>{copied ? 'Copied tuning' : 'Copy tuning JSON'}</button>
          {saveMsg ? <p className={`chrome-lab-note ${saveMsg.startsWith('error') ? 'is-error' : 'is-success'}`}>{saveMsg}</p> : null}
          {exportText ? (
            <textarea
              className="chrome-lab-json-export"
              readOnly
              value={exportText}
              onFocus={(event) => event.currentTarget.select()}
              aria-label="Exported chrome tuning JSON"
            />
          ) : null}
        </div>
      </>
    );
    return (
      <ChromeLabUnitChromeControls
        unitId={target.unitId}
        outer={outer}
        inner={inner}
        dividers={dividers}
        outerFrame={outerFrame}
        innerFrame={innerFrame}
        dividerRenders={dividerRenders}
        outerRoleTab={outerRoleTab}
        innerRoleTab={innerRoleTab}
        onOuterRoleTab={setOuterRoleTab}
        onInnerRoleTab={setInnerRoleTab}
        onOuter={(patch) => setOuter((current) => ({ ...current, ...patch }))}
        onInner={(patch) => setInner((current) => ({ ...current, ...patch }))}
        onDivider={(role, patch) => setDividers((current) => ({
          ...current,
          [role]: { ...current[role], ...patch },
        }))}
        onJumpUnit={(id) => onTargetId(`unit-${id}`)}
        infoControls={infoWithExport}
      />
    );
  };

  return (
    <ChromeUnitAuditViewer
      unitId={target.unitId}
      onUnitId={(id) => onTargetId(`unit-${id}`)}
      header={header}
      postSelectionControls={zoomControl}
      zoom={zoom}
      chromeCss={css}
      chromeControls={chromeControls}
      outerPreviewId={outerPreviewId}
      onOuterPreviewId={setOuterPreviewId}
    />
  );
}

function ChromeLabPageViewer({
  target,
  onTargetId,
  header,
  zoomControl,
  zoom = 1,
}: {
  target: ChromeLabPageTarget;
  onTargetId: (id: string) => void;
  header?: ReactNode;
  zoomControl?: ReactNode;
  zoom?: number;
}): ReactElement {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const previewMetricsRef = useRef<PreviewScrollMetrics | null>(null);
  const { canvasStyle, frameStyle } = useWindowScaledPreview(zoom);
  const [initialLabState] = useState<ChromeLabTuneState>(() => chromeLabStateFromStorage(target.id));
  const legacyStandaloneDividerRoute = chromeLabRouteParam('chromeTab') === 'divider';
  const [loadedTargetId, setLoadedTargetId] = useState(target.id);
  const [previewMode, setPreviewModeState] = useState<PreviewMode>(() => chromeLabRouteTab('chromePointer', PREVIEW_MODE_IDS, initialLabState.previewMode));
  const [previewFocus, setPreviewFocusState] = useState<PreviewFocus>(() => chromeLabRouteTab('chromeFocus', PREVIEW_FOCUS_IDS, initialLabState.previewFocus));
  const [controlTab, setControlTabState] = useState<ChromeLabControlTab>(() => legacyStandaloneDividerRoute ? 'outer' : chromeLabRouteTab('chromeTab', CHROME_LAB_CONTROL_TAB_IDS, initialLabState.controlTab));
  const [outerRoleTab, setOuterRoleTabState] = useState<RoleControlTab>(() => legacyStandaloneDividerRoute ? 'divider' : chromeLabRouteTab('chromeOuterTab', ROLE_CONTROL_TAB_IDS, initialLabState.outerRoleTab));
  const [innerRoleTab, setInnerRoleTabState] = useState<RoleControlTab>(() => chromeLabRouteTab('chromeInnerTab', ROLE_CONTROL_TAB_IDS, initialLabState.innerRoleTab));
  const [outer, setOuter] = useState<RoleTune>(initialLabState.outer);
  const [inner, setInner] = useState<RoleTune>(initialLabState.inner);
  const [dividers, setDividers] = useState<DividerTunes>(initialLabState.dividers);
  const [outerFrame, setOuterFrame] = useState<FrameRender>(EMPTY_FRAME);
  const [innerFrame, setInnerFrame] = useState<FrameRender>(EMPTY_FRAME);
  const [dividerRenders, setDividerRenders] = useState<DividerRenders>({
    outer: EMPTY_DIVIDER,
    inner: EMPTY_DIVIDER,
  });
  const [copied, setCopied] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const setPreviewMode = (mode: PreviewMode): void => {
    setPreviewModeState(mode);
    writeChromeLabRouteParam('chromePointer', mode, initialLabState.previewMode);
  };
  const setPreviewFocus = (focus: PreviewFocus): void => {
    setPreviewFocusState(focus);
    writeChromeLabRouteParam('chromeFocus', focus, initialLabState.previewFocus);
  };
  const setControlTab = (tab: ChromeLabControlTab): void => {
    setControlTabState(tab);
    writeChromeLabRouteParam('chromeTab', tab, initialLabState.controlTab);
  };
  const setOuterRoleTab = (tab: RoleControlTab): void => {
    setOuterRoleTabState(tab);
    writeChromeLabRouteParam('chromeOuterTab', tab, initialLabState.outerRoleTab);
  };
  const setInnerRoleTab = (tab: RoleControlTab): void => {
    setInnerRoleTabState(tab);
    writeChromeLabRouteParam('chromeInnerTab', tab, initialLabState.innerRoleTab);
  };

  useEffect(() => {
    if (loadedTargetId === target.id) return;
    const next = chromeLabStateFromStorage(target.id);
    setPreviewModeState(chromeLabRouteTab('chromePointer', PREVIEW_MODE_IDS, next.previewMode));
    setPreviewFocusState(chromeLabRouteTab('chromeFocus', PREVIEW_FOCUS_IDS, next.previewFocus));
    const legacyDividerRoute = chromeLabRouteParam('chromeTab') === 'divider';
    setControlTabState(legacyDividerRoute ? 'outer' : chromeLabRouteTab('chromeTab', CHROME_LAB_CONTROL_TAB_IDS, next.controlTab));
    setOuterRoleTabState(legacyDividerRoute ? 'divider' : chromeLabRouteTab('chromeOuterTab', ROLE_CONTROL_TAB_IDS, next.outerRoleTab));
    setInnerRoleTabState(chromeLabRouteTab('chromeInnerTab', ROLE_CONTROL_TAB_IDS, next.innerRoleTab));
    setOuter(next.outer);
    setInner(next.inner);
    setDividers(next.dividers);
    setLoadedTargetId(target.id);
  }, [loadedTargetId, target.id]);

  useEffect(() => {
    if (loadedTargetId !== target.id) return;
    saveChromeLabState(target.id, {
      previewMode,
      previewFocus,
      controlTab,
      outerRoleTab,
      innerRoleTab,
      outer,
      inner,
      dividers,
    });
  }, [controlTab, dividers, inner, innerRoleTab, loadedTargetId, outer, outerRoleTab, previewFocus, previewMode, target.id]);

  useEffect(() => {
    let live = true;
    composeFrameDataUrl(outer).then((frame) => { if (live) setOuterFrame(frame); }).catch(() => { if (live) setOuterFrame(EMPTY_FRAME); });
    return () => { live = false; };
  }, [outer]);

  useEffect(() => {
    let live = true;
    composeFrameDataUrl(inner).then((frame) => { if (live) setInnerFrame(frame); }).catch(() => { if (live) setInnerFrame(EMPTY_FRAME); });
    return () => { live = false; };
  }, [inner]);

  useEffect(() => {
    let live = true;
    composeDividerRender(outer, dividers.outer)
      .then((frame) => { if (live) setDividerRenders((current) => ({ ...current, outer: frame })); })
      .catch(() => { if (live) setDividerRenders((current) => ({ ...current, outer: EMPTY_DIVIDER })); });
    return () => { live = false; };
  }, [dividers.outer, outer]);

  useEffect(() => {
    let live = true;
    composeDividerRender(inner, dividers.inner)
      .then((frame) => { if (live) setDividerRenders((current) => ({ ...current, inner: frame })); })
      .catch(() => { if (live) setDividerRenders((current) => ({ ...current, inner: EMPTY_DIVIDER })); });
    return () => { live = false; };
  }, [dividers.inner, inner]);

  const css = frameCss(outer, inner, outerFrame, innerFrame, dividerRenders);
  useInjectedStyle(iframeRef, 'chrome-lab-runtime', css);

  const readPreviewMetrics = (): PreviewScrollMetrics | null => {
    const preview = previewRef.current;
    if (!preview) return null;
    return {
      scrollLeft: preview.scrollLeft,
      scrollTop: preview.scrollTop,
      scrollWidth: preview.scrollWidth,
      scrollHeight: preview.scrollHeight,
      clientWidth: preview.clientWidth,
      clientHeight: preview.clientHeight,
    };
  };

  const rememberPreviewMetrics = (): void => {
    previewMetricsRef.current = readPreviewMetrics();
  };

  const scrollPreviewToFocus = (focus: PreviewFocus): void => {
    const preview = previewRef.current;
    if (!preview) return;
    const previous = previewMetricsRef.current ?? readPreviewMetrics();
    const maxLeft = Math.max(0, preview.scrollWidth - preview.clientWidth);
    const maxTop = Math.max(0, preview.scrollHeight - preview.clientHeight);
    const previousCenterX = previous ? (previous.scrollLeft + previous.clientWidth / 2) / Math.max(1, previous.scrollWidth) : 0;
    const previousCenterY = previous ? (previous.scrollTop + previous.clientHeight / 2) / Math.max(1, previous.scrollHeight) : 0;
    const focusedLeft = focus === 'controls'
      ? maxLeft
      : focus === 'board'
        ? 0
        : clamp(previousCenterX * preview.scrollWidth - preview.clientWidth / 2, 0, maxLeft);
    const focusedTop = focus === 'board'
      ? 0
      : clamp(previousCenterY * preview.scrollHeight - preview.clientHeight / 2, 0, maxTop);
    preview.scrollLeft = focusedLeft;
    preview.scrollTop = focusedTop;
    rememberPreviewMetrics();
  };

  useLayoutEffect(() => {
    const raf = window.requestAnimationFrame(() => scrollPreviewToFocus(previewFocus));
    return () => window.cancelAnimationFrame(raf);
  }, [canvasStyle.height, canvasStyle.width, previewFocus, target.id, zoom]);

  const startPan = (event: PointerEvent<HTMLDivElement>): void => {
    const preview = previewRef.current;
    if (!preview) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: preview.scrollLeft, top: preview.scrollTop };
  };
  const movePan = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    const preview = previewRef.current;
    if (!drag || drag.id !== event.pointerId || !preview) return;
    preview.scrollLeft = drag.left - (event.clientX - drag.x);
    preview.scrollTop = drag.top - (event.clientY - drag.y);
  };
  const endPan = (event: PointerEvent<HTMLDivElement>): void => {
    if (dragRef.current?.id === event.pointerId) dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const resetAll = (): void => {
    const defaults = chromeLabDefaultState();
    setPreviewMode(defaults.previewMode);
    setPreviewFocus(defaults.previewFocus);
    setControlTab(defaults.controlTab);
    setOuterRoleTab(defaults.outerRoleTab);
    setInnerRoleTab(defaults.innerRoleTab);
    setOuter(defaults.outer);
    setInner(defaults.inner);
    setDividers(defaults.dividers);
  };
  const copyJson = async (): Promise<void> => {
    const payload = JSON.stringify(installedChromeTuningPayload(target.id, outer, inner, dividers), null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked - preview remains live */
    }
  };
  const saveDefaults = async (): Promise<void> => {
    setSaveMsg('saving...');
    try {
      const path = await saveChromeLabDefaults(installedChromeTuningPayload(target.id, outer, inner, dividers));
      setSaveMsg(`saved ${path}`);
    } catch (error) {
      setSaveMsg(`error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const frameStyleWithMode: CSSProperties = previewMode === 'pan' ? { ...frameStyle, pointerEvents: 'none' } : frameStyle;
  const focusButton = (id: PreviewFocus, label: string): ReactElement => (
    <button
      type="button"
      className={previewFocus === id ? 'is-active' : ''}
      onClick={() => {
        rememberPreviewMetrics();
        setPreviewFocus(id);
      }}
    >
      {label}
    </button>
  );
  const tabButton = (id: ChromeLabControlTab, label: string): ReactElement => (
    <button
      type="button"
      id={`chrome-lab-tab-${id}`}
      className={`chrome-lab-tab ${controlTab === id ? 'is-active' : ''}`}
      role="tab"
      aria-selected={controlTab === id}
      aria-controls={`chrome-lab-panel-${id}`}
      onClick={() => setControlTab(id)}
    >
      {label}
    </button>
  );

  return (
    <>
      <section
        ref={previewRef}
        className={`surface-dressing-main is-window-zoom chrome-lab-main is-${previewMode}`}
        aria-label={`${target.label} chrome preview`}
        onScroll={rememberPreviewMetrics}
      >
        <div className="surface-dressing-canvas" style={canvasStyle}>
          <iframe
            ref={iframeRef}
            className="surface-dressing-frame"
            src={target.route}
            title={`${target.label} chrome preview`}
            style={frameStyleWithMode}
            onLoad={() => {
              window.requestAnimationFrame(() => scrollPreviewToFocus(previewFocus));
            }}
          />
          {previewMode === 'pan' ? (
            <div
              className="chrome-lab-pan-layer"
              onPointerDown={startPan}
              onPointerMove={movePan}
              onPointerUp={endPan}
              onPointerCancel={endPan}
              aria-hidden="true"
            />
          ) : null}
        </div>
      </section>
      <aside className="tileset-view-controls chrome-lab-controls" aria-label="Chrome Lab controls">
        <section className="tileset-inspector-section">
          <h2>Chrome Lab</h2>
          <div className="tileset-control-stack">
            {header}
            <div className="tileset-filter-field">
              <span>Focus</span>
              <div className="pages-ctl-row">
                <div className="tileset-tier-seg" aria-label="Preview focus">
                  {focusButton('controls', 'Controls')}
                  {focusButton('board', 'Board')}
                  {focusButton('current', 'Current')}
                </div>
                {ctlReset(() => setPreviewFocus(chromeLabDefaultState().previewFocus))}
              </div>
            </div>
            <div className="chrome-lab-tabs chrome-lab-main-tabs" role="tablist" aria-label="Chrome Lab controls">
              {tabButton('preview', 'Preview')}
              {tabButton('outer', 'Outer')}
              {tabButton('inner', 'Inner')}
            </div>

            <div className="chrome-lab-tabpanels">
              {controlTab === 'preview' ? (
                <section className="chrome-lab-section chrome-lab-pane" id="chrome-lab-panel-preview" role="tabpanel" aria-labelledby="chrome-lab-tab-preview">
                  <h3 className="chrome-lab-pane-title">Preview</h3>
                  <div className="chrome-lab-section-body">
                    <label className="tileset-category-select">
                      <span>Page</span>
                      <select value={target.id} onChange={(event) => onTargetId(event.target.value)}>
                        {CHROME_LAB_TARGETS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                      </select>
                    </label>
                    {zoomControl}
                    <div className="tileset-filter-field">
                      <span>Pointer</span>
                      <div className="pages-ctl-row">
                        <div className="tileset-tier-seg" aria-label="Preview pointer mode">
                          <button type="button" className={previewMode === 'interact' ? 'is-active' : ''} onClick={() => setPreviewMode('interact')}>Interact</button>
                          <button type="button" className={previewMode === 'pan' ? 'is-active' : ''} onClick={() => setPreviewMode('pan')}>Pan</button>
                        </div>
                        {ctlReset(() => setPreviewMode('interact'))}
                      </div>
                    </div>
                    <dl className="al-meta">
                      <div><dt>Route</dt><dd>{target.route}</dd></div>
                      <div><dt>Zoom</dt><dd>{Math.round(zoom * 100)}%</dd></div>
                    </dl>
                  </div>
                </section>
              ) : null}
              {controlTab === 'outer' ? (
                <div id="chrome-lab-panel-outer" role="tabpanel" aria-labelledby="chrome-lab-tab-outer">
                  <RoleChromeControls
                    role="outer"
                    tune={outer}
                    frame={outerFrame}
                    activeTab={outerRoleTab}
                    onActiveTab={setOuterRoleTab}
                    onTune={(patch) => setOuter((current) => ({ ...current, ...patch }))}
                    dividerControls={<DividerControls role="outer" tune={dividers.outer} render={dividerRenders.outer} railFit={outer.railFit} onTune={(patch) => setDividers((current) => ({ ...current, outer: { ...current.outer, ...patch } }))} />}
                    titleControls={<TitleTextControls tune={outer} onTune={(patch) => setOuter((current) => ({ ...current, ...patch }))} />}
                  />
                </div>
              ) : null}
              {controlTab === 'inner' ? (
                <div id="chrome-lab-panel-inner" role="tabpanel" aria-labelledby="chrome-lab-tab-inner">
                  <RoleChromeControls
                    role="inner"
                    tune={inner}
                    frame={innerFrame}
                    activeTab={innerRoleTab}
                    onActiveTab={setInnerRoleTab}
                    onTune={(patch) => setInner((current) => ({ ...current, ...patch }))}
                    dividerControls={<DividerControls role="inner" tune={dividers.inner} render={dividerRenders.inner} railFit={inner.railFit} onTune={(patch) => setDividers((current) => ({ ...current, inner: { ...current.inner, ...patch } }))} />}
                  />
                </div>
              ) : null}
            </div>

            <button type="button" className="tileset-view-action pages-reset" onClick={resetAll}>Reset chrome</button>
            <button type="button" className="tileset-view-action" onClick={saveDefaults}>Save defaults</button>
            <button type="button" className="tileset-view-action" onClick={copyJson}>{copied ? 'Copied tuning' : 'Copy tuning JSON'}</button>
            {saveMsg ? <p className={`chrome-lab-note ${saveMsg.startsWith('error') ? 'is-error' : 'is-success'}`}>{saveMsg}</p> : null}
          </div>
        </section>
      </aside>
    </>
  );
}
