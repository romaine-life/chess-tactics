import { useEffect, useMemo, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { SliderRow } from './dressing/SliderRow';
import {
  chromeUnitById,
  chromeUnitClassNames,
  chromeUnitClassPath,
  chromeUnitsInHierarchyOrder,
  type ChromeUnitId,
  type ChromeUnitSpec,
} from './chromeUnitRegistry';
import { useInstalledChromeCss } from './useInstalledChromeCss';
import { HouseSelect } from './shared/HouseSelect';
import { Toggle } from './shared/Toggle';
import { LevelEditorControlsPanel, LevelEditorEventsOverlay, type LevelEditorLayerOption } from './LevelEditorChromeConsumers';
import { SkirmishHud } from './SkirmishHud';
import { VictoryConditionsEditor, type FactionOption } from './VictoryConditionsEditor';
import type { VictoryRules } from '../core/level';

export type ChromeUnitAuditDims = {
  width: number;
  height: number;
  dividers: number;
};

export type ChromeUnitAuditInfoRenderer = (info: ReactNode) => ReactNode;

export function chromeUnitBaselineDims(unit: ChromeUnitSpec): ChromeUnitAuditDims {
  return {
    width: unit.defaultWidth ?? 220,
    height: unit.defaultHeight ?? 140,
    dividers: unit.defaultDividers ?? 0,
  };
}

export function chromeUnitThumbnailDims(unit: ChromeUnitSpec): ChromeUnitAuditDims {
  if (unit.id === 'outer-panel') return { width: 188, height: 114, dividers: 1 };
  if (unit.id === 'inner-dropdown') return { width: 150, height: 64, dividers: 0 };
  if (unit.id === 'inner-text-button') return { width: 138, height: 0, dividers: 0 };
  if (unit.id === 'inner-toggle') return { width: 138, height: 0, dividers: 0 };
  if (unit.id === 'inner-list-row') return { width: 180, height: 0, dividers: 0 };
  if (unit.id === 'inner-asset-swatch') return { width: 84, height: 78, dividers: 0 };
  if (unit.id === 'inner-box') return { width: 132, height: 86, dividers: 0 };
  if (unit.id === 'inner-locked-rectangle') return { width: 132, height: 58, dividers: 0 };
  return chromeUnitBaselineDims(unit);
}

const PLACEHOLDER_TEXT = 'placeholder';
const chromeAuditNoop = (): void => undefined;
const CHROME_AUDIT_LAYER_OPTIONS: readonly LevelEditorLayerOption[] = [
  { id: 'board', label: 'Board' },
  { id: 'tile', label: 'Tile' },
  { id: 'generate', label: 'Generate' },
  { id: 'paths', label: 'Paths' },
  { id: 'fence', label: 'Fence' },
  { id: 'wall', label: 'Wall' },
  { id: 'wallart', label: 'Wall Art' },
  { id: 'unit', label: 'Unit' },
  { id: 'doodad', label: 'Doodad' },
  { id: 'prop', label: 'Prop' },
  { id: 'cover', label: 'Cover' },
  { id: 'zone', label: 'Zone' },
  { id: 'rules', label: 'Rules' },
  { id: 'status', label: 'Status' },
];
const CHROME_AUDIT_FACTIONS: FactionOption[] = [
  { side: 'player', label: 'Navy' },
  { side: 'enemy', label: 'Crimson' },
];
const CHROME_AUDIT_VICTORY: VictoryRules = [
  {
    id: 'audit-capture-all',
    name: 'Capture all',
    if: [{ kind: 'eliminate', side: 'enemy' }],
    do: [{ kind: 'win', side: 'player' }],
  },
  {
    id: 'audit-king-falls',
    name: 'King falls',
    if: [{ kind: 'eliminate', side: 'player', filter: { type: 'king' } }],
    do: [{ kind: 'lose', side: 'player' }],
  },
];

type OuterPanelConsumerKind = 'level-editor-controls' | 'events-overlay' | 'skirmish-hud';
type OuterPanelPreviewOption = {
  id: string;
  label: string;
  selector?: string;
  kind?: OuterPanelConsumerKind;
};

function outerPanelConsumerKind(selector: string): OuterPanelConsumerKind | null {
  if (selector.includes('data-chrome-consumer="level-editor-controls"')) return 'level-editor-controls';
  if (selector.includes('data-chrome-consumer="events-overlay"')) return 'events-overlay';
  if (selector.includes('data-chrome-consumer="skirmish-hud"')) return 'skirmish-hud';
  return null;
}

function outerPanelConsumerLabel(kind: OuterPanelConsumerKind, selector: string): string {
  if (kind === 'level-editor-controls') return 'Level Editor controls';
  if (kind === 'events-overlay') return 'Rules/events overlay';
  if (kind === 'skirmish-hud') return 'Skirmish HUD';
  return selector;
}

function outerPanelPreviewOptions(unit: ChromeUnitSpec): OuterPanelPreviewOption[] {
  if (unit.id !== 'outer-panel' && unit.id !== 'inner-box') return [];
  const consumerSource = unit.id === 'outer-panel' ? unit : chromeUnitById('outer-panel');
  const seen = new Set<OuterPanelConsumerKind>();
  const consumers = consumerSource.selectors.flatMap((selector) => {
    const kind = outerPanelConsumerKind(selector);
    if (!kind || seen.has(kind)) return [];
    seen.add(kind);
    return [{
      id: `consumer:${kind}`,
      kind,
      selector,
      label: outerPanelConsumerLabel(kind, selector),
    }];
  });
  return [{ id: 'template', label: unit.id === 'inner-box' ? 'Inner template' : 'Empty template' }, ...consumers];
}

function outerPanelPreviewOption(unit: ChromeUnitSpec, id: string): OuterPanelPreviewOption {
  return outerPanelPreviewOptions(unit).find((option) => option.id === id) ?? { id: 'template', label: 'Empty template' };
}

function chromeUnitPreviewBaselineDims(unit: ChromeUnitSpec, preview: OuterPanelPreviewOption): ChromeUnitAuditDims {
  if (unit.id !== 'outer-panel' && unit.id !== 'inner-box') return chromeUnitBaselineDims(unit);
  const consumerBaseline = preview.kind ? chromeUnitBaselineDims(chromeUnitById('outer-panel')) : chromeUnitBaselineDims(unit);
  const baseline = unit.id === 'inner-box' ? consumerBaseline : chromeUnitBaselineDims(unit);
  if (preview.kind === 'level-editor-controls') return { ...baseline, height: 620 };
  if (preview.kind === 'events-overlay') return { ...baseline, height: 460 };
  if (preview.kind === 'skirmish-hud') return { ...baseline, height: 540 };
  return baseline;
}

function SelectVisual({ interactive, label, ariaLabel, className = '' }: { interactive: boolean; label: string; ariaLabel: string; className?: string }): ReactElement {
  const rootClassName = chromeUnitClassNames('inner-dropdown', className);
  if (interactive) {
    return (
      <HouseSelect
        ariaLabel={ariaLabel}
        className={rootClassName}
        value="board"
        options={[
          { value: 'board', label },
          { value: 'actions', label: 'Actions' },
          { value: 'long', label: 'Long option label' },
        ]}
        onChange={() => undefined}
      />
    );
  }
  return (
    <div data-chrome-unit="inner-dropdown" className={chromeUnitClassNames('inner-dropdown', 'house-select', 'le-select-wrap', className)}>
      <span className="house-select-trigger chrome-unit-inert-select">{label}</span>
    </div>
  );
}

function SegButtonVisual({
  interactive,
  unitId,
  className,
  label,
  children,
}: {
  interactive: boolean;
  unitId: ChromeUnitId;
  className: string;
  label: string;
  children: ReactNode;
}): ReactElement {
  if (interactive) {
    return (
      <button type="button" data-chrome-unit={unitId} className={className} aria-label={label}>
        {children}
      </button>
    );
  }
  return <span data-chrome-unit={unitId} className={className} aria-hidden="true">{children}</span>;
}

function toneClass(unit: ChromeUnitSpec): string {
  if (unit.tone === 'primary') return ' active';
  if (unit.tone === 'danger') return ' danger';
  return '';
}

function LevelEditorControlsConsumer({ dims }: { dims: ChromeUnitAuditDims }): ReactElement {
  return (
    <LevelEditorControlsPanel
      className="chrome-unit-outer-panel chrome-unit-consumer-panel"
      scrollClassName="chrome-unit-consumer-scroll"
      style={{ width: `${dims.width}px`, height: `${dims.height}px` }}
      layer="board"
      layerOptions={CHROME_AUDIT_LAYER_OPTIONS}
      onLayerChange={chromeAuditNoop}
      tool="select"
      onToolChange={chromeAuditNoop}
      canUndo
      canRedo
      onUndo={chromeAuditNoop}
      onRedo={chromeAuditNoop}
      playBoardEnabled={false}
    >
      <section className="skirmish-card chrome-unit-panel-section">
        <h2>Board</h2>
        <div className="le-board-actions">
          <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}>Randomize</button>
          <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'danger')}>Clear</button>
          <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}>Copy Link</button>
        </div>
      </section>
      <section className="skirmish-card le-level-settings chrome-unit-panel-section">
        <h2>Level Settings</h2>
        <div className="le-faction-control">
          <span className="le-settings-label">Player Faction</span>
          <div className="le-faction-assignments">
            <div className="le-faction-assignment">
              <span className="le-faction-name">
                <i className="le-faction-dot is-navy-blue" aria-hidden="true" />
                <span>Navy</span>
                <b>5</b>
              </span>
              <span className="le-faction-fields">
                <HouseSelect
                  ariaLabel="Specimen faction control"
                  value="player"
                  options={[
                    { value: 'player', label: 'Player' },
                    { value: 'cpu', label: 'CPU' },
                  ]}
                  onChange={chromeAuditNoop}
                />
                <button type="button" data-chrome-unit="inner-tool-square" className={chromeUnitClassNames('inner-tool-square', 'le-faction-select', 'le-direction-trigger')} aria-label="Specimen direction">N</button>
              </span>
            </div>
          </div>
        </div>
      </section>
    </LevelEditorControlsPanel>
  );
}

function EventsOverlayConsumer({ dims }: { dims: ChromeUnitAuditDims }): ReactElement {
  const [tab, setTab] = useState<'victory' | 'other'>('victory');
  const [victory, setVictory] = useState<VictoryRules>(CHROME_AUDIT_VICTORY);
  return (
    <LevelEditorEventsOverlay
      className="chrome-unit-events-overlay"
      style={{ width: `${dims.width}px`, minHeight: `${dims.height}px` }}
      tab={tab}
      onTabChange={setTab}
      onDone={chromeAuditNoop}
      victoryContent={(
        <VictoryConditionsEditor
          value={victory}
          factions={CHROME_AUDIT_FACTIONS}
          onChange={setVictory}
          templates={(
            <div className="le-events-templates">
              <h3 className="le-victory-head">Template</h3>
              <p className="le-board-note">Audit fixture using the same victory editor component as the level editor.</p>
              <div className="le-template-apply">
                <HouseSelect
                  className="le-template-select-wrap"
                  ariaLabel="Victory template"
                  value="capture"
                  options={[
                    { value: 'capture', label: 'Capture all' },
                    { value: 'survive', label: 'Survive' },
                  ]}
                  onChange={chromeAuditNoop}
                />
                <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}>Add template</button>
                <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'danger')}>Clear rules</button>
              </div>
            </div>
          )}
        />
      )}
      otherContent={(
        <div className="le-md le-events-other chrome-unit-events-body">
          <div className="le-md-list">
            <div className="le-events-templates">
              <h3 className="le-victory-head">Template</h3>
              <p className="le-board-note">Other-event fixture inside the shared overlay shell.</p>
            </div>
            <h3 className="le-victory-head">Events</h3>
            <div className="le-md-rules">
              <button type="button" data-chrome-unit="inner-list-row" className={chromeUnitClassNames('inner-list-row', 'le-md-item', 'active')}>
                <span className="le-md-item-name">Setup spawn</span>
                <span className="le-md-item-out">spawn</span>
              </button>
            </div>
          </div>
          <div className="le-md-detail">
            <div className="le-rule">
              <div className="le-ctrlrow">
                <span className="le-ctrllabel">Faction</span>
                <HouseSelect
                  ariaLabel="Specimen event faction"
                  value="player"
                  options={[
                    { value: 'player', label: 'Player' },
                    { value: 'enemy', label: 'Enemy' },
                  ]}
                  onChange={chromeAuditNoop}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    />
  );
}

function SkirmishHudConsumer({ dims }: { dims: ChromeUnitAuditDims }): ReactElement {
  return (
    <SkirmishHud
      className="chrome-unit-outer-panel chrome-unit-consumer-panel chrome-unit-skirmish-hud"
      style={{ width: `${dims.width}px`, height: `${dims.height}px` }}
      canStartNewSkirmish={false}
      showClockControl={false}
      enableGlobalShortcuts={false}
    />
  );
}

function OuterPanelSpecimen({ dims, preview }: { dims: ChromeUnitAuditDims; preview: OuterPanelPreviewOption }): ReactElement {
  if (preview.kind === 'level-editor-controls') return <LevelEditorControlsConsumer dims={dims} />;
  if (preview.kind === 'events-overlay') return <EventsOverlayConsumer dims={dims} />;
  if (preview.kind === 'skirmish-hud') return <SkirmishHudConsumer dims={dims} />;
  const dividerCount = Math.max(0, Math.round(dims.dividers));
  return (
    <div
      data-chrome-unit="outer-panel"
      className={chromeUnitClassNames('outer-panel', 'skirmish-hud', 'le-outer-panel', 'chrome-unit-outer-panel')}
      style={{ width: `${dims.width}px`, minHeight: `${dims.height}px` }}
    >
      <span className="le-outer-panel-fill" aria-hidden="true" />
      <div className="le-outer-panel-content le-outer-panel-content--titled">
        <section className="skirmish-card le-layer-card chrome-unit-panel-card">
          <h2 className="kit-panel-title"><span className="kit-panel-title-text">{PLACEHOLDER_TEXT}</span></h2>
        </section>
        {Array.from({ length: dividerCount }, (_, index) => (
          <div className="le-control-divider-host chrome-unit-divider-host" key={`divider-${index}`}>
            <div className="kit-divider" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SquareSpecimen({ unit, interactive }: { unit: ChromeUnitSpec; interactive: boolean }): ReactElement {
  if (unit.id === 'inner-tool-square') {
    return (
      <div className="le-seg le-seg-icons chrome-unit-inline-seat">
        <SegButtonVisual interactive={false} unitId="inner-tool-square" className={chromeUnitClassNames('inner-tool-square', 'le-seg-btn')} label="Tool square slot">
          <span className="chrome-unit-slot-marker" aria-hidden="true" />
        </SegButtonVisual>
      </div>
    );
  }
  if (unit.id === 'inner-plus-key' || unit.id === 'inner-minus-key') {
    const keyLabel = unit.id === 'inner-plus-key' ? 'Increase' : 'Decrease';
    const keyContents = <span><span className={`stepper-glyph ${unit.id === 'inner-plus-key' ? 'stepper-plus' : 'stepper-minus'}`} aria-hidden="true" /></span>;
    return (
      <div className="settings-stepper chrome-unit-key-only">
        {interactive ? (
          <button type="button" data-chrome-unit={unit.id} className={chromeUnitClassNames(unit.id, 'settings-chrome-button', 'settings-chrome-button-neutral')} aria-label={keyLabel}>{keyContents}</button>
        ) : (
          <span data-chrome-unit={unit.id} className={chromeUnitClassNames(unit.id, 'settings-chrome-button', 'settings-chrome-button-neutral')} aria-hidden="true">{keyContents}</span>
        )}
      </div>
    );
  }
  if (unit.iconClass) {
    const isHistoryKey = unit.id === 'inner-undo-key' || unit.id === 'inner-redo-key';
    const className = chromeUnitClassNames(unit.id, 'le-seg-btn', isHistoryKey && 'le-icon-btn', toneClass(unit).trim());
    return (
      <div className="le-seg le-seg-icons chrome-unit-inline-seat">
        <SegButtonVisual interactive={interactive && unit.catalogKind === 'implementation'} unitId={unit.id} className={className} label={unit.label}>
          <span className={`le-ico ${unit.iconClass}`} aria-hidden="true" />
        </SegButtonVisual>
      </div>
    );
  }
  return (
    <div className="le-seg chrome-unit-inline-seat">
      <SegButtonVisual interactive={interactive} unitId="inner-tool-square" className={chromeUnitClassNames('inner-tool-square', 'le-seg-btn', 'le-icon-btn')} label="Undo">
        <span className="le-ico ic-undo" aria-hidden="true" />
      </SegButtonVisual>
    </div>
  );
}

function FreeBoxSpecimen({ dims }: { dims: ChromeUnitAuditDims }): ReactElement {
  return (
    <div
      data-chrome-unit="inner-box"
      className={chromeUnitClassNames('inner-box', 'chrome-unit-rect', 'chrome-unit-empty-template')}
      style={{ width: `${dims.width}px`, minHeight: `${dims.height}px` }}
      aria-hidden="true"
    />
  );
}

function RectangleSpecimen({ unit, dims, interactive }: { unit: ChromeUnitSpec; dims: ChromeUnitAuditDims; interactive: boolean }): ReactElement {
  if (unit.variants?.length) {
    return (
      <div className="chrome-unit-variant-stack" style={{ width: `${dims.width}px` }}>
        {unit.variants.map((variant) => {
          const className = chromeUnitClassNames(unit.id, 'le-seg-btn', 'chrome-unit-rect', variant.className);
          const contents = <span>{variant.specimenText}</span>;
          return interactive ? (
            <button type="button" data-chrome-unit={unit.id} className={className} key={variant.name}>
              {contents}
            </button>
          ) : (
            <span data-chrome-unit={unit.id} className={className} aria-hidden="true" key={variant.name}>{contents}</span>
          );
        })}
      </div>
    );
  }
  const contents = <span>{unit.contentPolicy === 'slot' ? PLACEHOLDER_TEXT : unit.specimenText ?? 'Play Test'}</span>;
  const isInteractive = interactive && unit.catalogKind === 'implementation';
  const className = chromeUnitClassNames(unit.id, 'le-seg-btn', 'chrome-unit-rect', toneClass(unit).trim());
  return isInteractive ? (
    <button
      type="button"
      data-chrome-unit={unit.id}
      className={className}
      style={{ width: `${dims.width}px` }}
    >
      {contents}
    </button>
  ) : (
    <span data-chrome-unit={unit.id} className={className} style={{ width: `${dims.width}px` }} aria-hidden="true">{contents}</span>
  );
}

function ToggleSpecimen({ interactive }: { interactive: boolean }): ReactElement {
  const [checked, setChecked] = useState(false);
  if (interactive) {
    return <Toggle checked={checked} label="Toggle specimen" onChange={setChecked} />;
  }
  return (
    <span
      data-chrome-unit="inner-toggle"
      className={chromeUnitClassNames('inner-toggle', 'settings-toggle', 'is-off')}
      aria-hidden="true"
    >
      <span className="settings-toggle-opt" data-state="off">Off</span>
      <span className="settings-toggle-opt" data-state="on">On</span>
    </span>
  );
}

function ListRowSpecimen({ interactive }: { interactive: boolean }): ReactElement {
  const contents = (
    <>
      <span className="le-md-item-name">Setup spawn</span>
      <span className="le-md-item-out">spawn</span>
    </>
  );
  const className = chromeUnitClassNames('inner-list-row', 'le-md-item', 'active');
  return interactive ? (
    <button type="button" data-chrome-unit="inner-list-row" className={className}>{contents}</button>
  ) : (
    <span data-chrome-unit="inner-list-row" className={className} aria-hidden="true">{contents}</span>
  );
}

function AssetSwatchSpecimen({ interactive }: { interactive: boolean }): ReactElement {
  const contents = (
    <>
      <span className="chrome-unit-slot-marker" aria-hidden="true" />
      <small>Asset</small>
    </>
  );
  const className = chromeUnitClassNames('inner-asset-swatch', 'le-swatch', 'active');
  return interactive ? (
    <button type="button" data-chrome-unit="inner-asset-swatch" className={className}>{contents}</button>
  ) : (
    <span data-chrome-unit="inner-asset-swatch" className={className} aria-hidden="true">{contents}</span>
  );
}

function DropdownSpecimen({ dims, interactive, unit }: { dims: ChromeUnitAuditDims; interactive: boolean; unit: ChromeUnitSpec }): ReactElement {
  const isInteractive = interactive && unit.catalogKind === 'implementation';
  return (
    <div style={{ width: `${dims.width}px` }}>
      <SelectVisual interactive={isInteractive} label={unit.contentPolicy === 'slot' ? PLACEHOLDER_TEXT : 'Board'} ariaLabel="Specimen dropdown" className="chrome-unit-dropdown" />
    </div>
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

function ChromeUnitAuditInfo({ unit }: { unit: ChromeUnitSpec }): ReactElement {
  return (
    <>
      <dl className="al-meta">
        <div><dt>Role</dt><dd>{unit.role}</dd></div>
        <div><dt>Name</dt><dd><code>{unit.name}</code></dd></div>
        <div><dt>Class</dt><dd><ChromeUnitPathStack path={chromeUnitClassPath(unit)} /></dd></div>
        <div><dt>Catalog</dt><dd>{unit.catalogKind}</dd></div>
        <div><dt>Content</dt><dd>{unit.contentPolicy}</dd></div>
        <div><dt>Tone</dt><dd>{unit.tone}</dd></div>
        <div><dt>State</dt><dd>{unit.stateModel}</dd></div>
        <div><dt>Policy</dt><dd>{unit.dimensionPolicy}</dd></div>
        <div><dt>Token</dt><dd>{unit.token}</dd></div>
      </dl>
      {unit.variants?.length ? (
        <div className="chrome-unit-audit-list">
          <h3>Variants</h3>
          <ul>
            {unit.variants.map((variant) => (
              <li key={variant.name}>
                <code>{variant.name}</code> - {variant.usage}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="chrome-unit-audit-list">
        <h3>Selectors</h3>
        <ul>
          {unit.selectors.map((selector) => <li key={selector}><code>{selector}</code></li>)}
        </ul>
      </div>
      <div className="chrome-unit-audit-list">
        <h3>Usage</h3>
        <ul>
          {unit.usage.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>
    </>
  );
}

export function ChromeUnitSpecimen({
  unit,
  dims,
  interactive = true,
  outerPreview,
}: {
  unit: ChromeUnitSpec;
  dims: ChromeUnitAuditDims;
  interactive?: boolean;
  outerPreview?: OuterPanelPreviewOption;
}): ReactElement {
  if (unit.id === 'outer-panel') return <OuterPanelSpecimen dims={dims} preview={outerPreview ?? { id: 'template', label: 'Empty template' }} />;
  if (unit.id === 'inner-box' && outerPreview?.kind === 'level-editor-controls') return <LevelEditorControlsConsumer dims={dims} />;
  if (unit.id === 'inner-box' && outerPreview?.kind === 'events-overlay') return <EventsOverlayConsumer dims={dims} />;
  if (unit.id === 'inner-box' && outerPreview?.kind === 'skirmish-hud') return <SkirmishHudConsumer dims={dims} />;
  if (unit.id === 'inner-box') return <FreeBoxSpecimen dims={dims} />;
  if (unit.id === 'inner-asset-swatch') return <AssetSwatchSpecimen interactive={interactive} />;
  if (unit.id === 'inner-toggle') return <ToggleSpecimen interactive={interactive} />;
  if (unit.id === 'inner-list-row') return <ListRowSpecimen interactive={interactive} />;
  if (unit.dimensionPolicy === 'locked-square') return <SquareSpecimen unit={unit} interactive={interactive} />;
  if (unit.id === 'inner-dropdown') return <DropdownSpecimen unit={unit} dims={dims} interactive={interactive} />;
  return <RectangleSpecimen unit={unit} dims={dims} interactive={interactive} />;
}

export function ChromeUnitAuditViewer({
  unitId,
  onUnitId,
  header,
  postSelectionControls,
  zoom = 1,
  chromeCss,
  chromeControls,
  outerPreviewId,
  onOuterPreviewId,
}: {
  unitId?: string;
  onUnitId: (id: string) => void;
  header?: ReactNode;
  postSelectionControls?: ReactNode;
  zoom?: number;
  chromeCss?: string;
  chromeControls?: ReactNode | ChromeUnitAuditInfoRenderer;
  outerPreviewId?: string;
  onOuterPreviewId?: (id: string) => void;
}): ReactElement {
  const unit = chromeUnitById(unitId);
  const unitBaseline = useMemo(() => chromeUnitBaselineDims(unit), [unit]);
  const [dims, setDims] = useState<ChromeUnitAuditDims>(unitBaseline);
  const previewOptions = useMemo(() => outerPanelPreviewOptions(unit), [unit]);
  const [localOuterPreviewId, setLocalOuterPreviewId] = useState('template');
  const resolvedOuterPreviewId = outerPreviewId ?? localOuterPreviewId;
  const outerPreview = useMemo(
    () => previewOptions.find((option) => option.id === resolvedOuterPreviewId) ?? { id: 'template', label: unit.id === 'inner-box' ? 'Inner template' : 'Empty template' },
    [previewOptions, resolvedOuterPreviewId, unit.id],
  );
  const baseline = useMemo(() => chromeUnitPreviewBaselineDims(unit, outerPreview), [outerPreview.kind, unit]);
  const installedChromeCss = useInstalledChromeCss();
  const activeChromeCss = chromeCss ?? installedChromeCss;

  useEffect(() => {
    setDims((current) => (
      current.width === baseline.width && current.height === baseline.height && current.dividers === baseline.dividers
        ? current
        : baseline
    ));
  }, [baseline]);

  useEffect(() => {
    if (previewOptions.length === 0 || previewOptions.some((option) => option.id === resolvedOuterPreviewId)) return;
    if (onOuterPreviewId) onOuterPreviewId('template');
    else setLocalOuterPreviewId('template');
  }, [onOuterPreviewId, previewOptions, resolvedOuterPreviewId]);

  const setWidth = (width: number): void => setDims((current) => ({ ...current, width }));
  const setHeight = (height: number): void => setDims((current) => ({ ...current, height }));
  const setDividers = (dividers: number): void => setDims((current) => ({ ...current, dividers }));
  const stageFootprint = useMemo(() => {
    const stagePad = 72;
    return {
      width: Math.ceil(Math.max(dims.width + stagePad, 520) * zoom),
      height: Math.ceil(Math.max((dims.height || baseline.height) + stagePad, 320) * zoom),
    };
  }, [baseline.height, dims.height, dims.width, zoom]);
  const scaleStyle = { width: `${stageFootprint.width}px`, height: `${stageFootprint.height}px` } as CSSProperties;
  const stageStyle = { transform: `scale(${zoom})` } as CSSProperties;
  const info = <ChromeUnitAuditInfo unit={unit} />;
  const resolvedChromeControls = typeof chromeControls === 'function' ? chromeControls(info) : chromeControls;

  return (
    <>
      <section className="al-lab-main chrome-unit-audit-main" aria-label={`${unit.label} audit specimen`}>
        <div className="chrome-unit-audit-scroll">
          <div className="chrome-unit-audit-scale" style={scaleStyle}>
            <div className="chrome-unit-audit-stage level-editor-screen" style={stageStyle}>
              {activeChromeCss ? <style data-chrome-unit-audit-family dangerouslySetInnerHTML={{ __html: activeChromeCss }} /> : null}
              <ChromeUnitSpecimen unit={unit} dims={dims} outerPreview={outerPreview} />
            </div>
          </div>
        </div>
      </section>
      <aside className="tileset-view-controls chrome-lab-controls chrome-unit-audit-controls" aria-label="Chrome unit audit controls">
        <section className="tileset-inspector-section">
          <h2>Chrome Audit</h2>
          <div className="tileset-control-stack">
            {header}
            <label className="tileset-category-select">
              <span>Unit</span>
              <select value={unit.id} onChange={(event) => onUnitId(event.target.value)}>
                {chromeUnitsInHierarchyOrder().map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
              </select>
            </label>
            {(unit.id === 'outer-panel' || unit.id === 'inner-box') && previewOptions.length > 1 ? (
              <label className="tileset-category-select">
                <span>Preview</span>
                <select
                  value={outerPreview.id}
                  onChange={(event) => {
                    if (onOuterPreviewId) onOuterPreviewId(event.target.value);
                    else setLocalOuterPreviewId(event.target.value);
                  }}
                >
                  {previewOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
            ) : null}
            {postSelectionControls}

            {unit.controlPolicy === 'width-height-dividers' || unit.controlPolicy === 'width-height' ? (
              <>
                <SliderRow label={<>Width - {dims.width}px</>} value={dims.width} set={setWidth} min={unit.minWidth ?? 120} max={unit.maxWidth ?? 1600} step={1} dflt={baseline.width} />
                <SliderRow label={<>Height - {dims.height}px</>} value={dims.height} set={setHeight} min={unit.minHeight ?? 120} max={unit.maxHeight ?? 680} step={1} dflt={baseline.height} />
                {unit.controlPolicy === 'width-height-dividers' ? (
                  <SliderRow label={<>Dividers - {dims.dividers}</>} value={dims.dividers} set={setDividers} min={0} max={unit.maxDividers ?? 5} step={1} dflt={baseline.dividers} />
                ) : null}
              </>
            ) : null}
            {unit.controlPolicy === 'width-only' ? (
              <SliderRow label={<>Width - {dims.width}px</>} value={dims.width} set={setWidth} min={unit.minWidth ?? 80} max={unit.maxWidth ?? 1600} step={1} dflt={baseline.width} />
            ) : null}
            {unit.controlPolicy === 'none' ? <p className="chrome-lab-note">This unit has no dimensional freedom in the audit surface.</p> : null}
            {resolvedChromeControls ?? (
              <section className="chrome-lab-section chrome-lab-pane" aria-label="Chrome audit info">
                <label className="tileset-category-select">
                  <span>Mode</span>
                  <select value="info" onChange={() => undefined}>
                    <option value="info">Info</option>
                  </select>
                </label>
                <div className="chrome-lab-section-body">
                  <section className="chrome-lab-subsection chrome-lab-subpane">
                    {info}
                  </section>
                </div>
              </section>
            )}
          </div>
        </section>
      </aside>
    </>
  );
}
