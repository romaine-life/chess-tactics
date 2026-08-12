import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import {
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { useAdminLiveMediaCatalog } from './studio/useAdminLiveMediaCatalog';
import {
  BRUSH_ICON_EXPLORATION_OBJECT_ID,
  brushIconProductionCandidate,
  LEVEL_EDITOR_BRUSH_ICON_SLOT,
  LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_STAGE,
  levelEditorBrushIconReviewHref,
} from './brushIconLiveMedia';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { installedUiMedia } from './installedUiMedia';
import { ChromeButton, InnerTextNavButton } from './shared/ChromeButton';
import { StudioCatalogCard } from './studio/StudioCatalogCard';

/**
 * Owner review for the Level Editor's brush mark, as a Studio CATEGORY.
 *
 * It used to be its own screen hanging off `/studio?brushIconReview=1` — an address that
 * borrowed the Studio's path and then returned before the Studio rendered, so it had no
 * category rail, no Controls panel and no way in but a hand-passed URL. Every review surface
 * is a category now, and `check-studio-surfaces.mjs` fails the build on a screen that tries
 * the old trick (ADR-0588).
 *
 * Each candidate is mounted in the REGISTERED Level Editor tool button, so the mark is drawn
 * by the seat it ships in rather than in a contact sheet. Nothing here installs: the pencil
 * stays until an owner-selected brush completes its role-native production pass, and the
 * Controls panel links out to the real editor for that.
 */
function candidateIndex(version: AdminLiveMediaVersion): number {
  const value = Number(version.metadata.candidateIndex);
  return Number.isSafeInteger(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

export function brushMarkCandidates(catalog: AdminLiveMediaCatalog): AdminLiveMediaVersion[] {
  return catalog.versions
    .filter((version) => version.slot === LEVEL_EDITOR_BRUSH_ICON_SLOT
      && version.status === 'candidate'
      && version.provenance.pixelLabObjectId === BRUSH_ICON_EXPLORATION_OBJECT_ID
      && Boolean(version.media))
    .sort((left, right) => candidateIndex(left) - candidateIndex(right));
}

export function brushMarkLabel(version: AdminLiveMediaVersion): string {
  const index = candidateIndex(version);
  return index === Number.MAX_SAFE_INTEGER ? 'Option' : `Option ${String(index).padStart(2, '0')}`;
}

function conceptLabel(version: AdminLiveMediaVersion): string {
  return typeof version.metadata.concept === 'string' ? version.metadata.concept : 'Paintbrush glyph';
}

function brushGlyphStyle(url: string): CSSProperties {
  return { backgroundImage: `url(${JSON.stringify(url)})` };
}

/** The candidate in the real control: the registered Level Editor action toolbar, with the
 *  brush seat drawing the candidate and every neighbouring tool exactly as it ships. */
function EditorActionToolbar({
  brushIconUrl,
  label,
}: {
  brushIconUrl: string;
  label: string;
}): ReactElement {
  return (
    <section className="skirmish-card le-actions-dock brush-mark-toolbar-card" aria-label={label}>
      <h2>{label}</h2>
      <div className="le-seg le-seg-icons le-action-toolbar" role="toolbar" aria-label={`${label} editor tools`}>
        <ChromeButton unit="inner-select-tool" className={chromeUnitClassNames('inner-select-tool', 'le-seg-btn')} tabIndex={-1} aria-label="Select"><span className="le-ico ic-eyedropper" aria-hidden="true" /></ChromeButton>
        <ChromeButton unit="inner-brush-tool" className={chromeUnitClassNames('inner-brush-tool', 'le-seg-btn', 'active')} tabIndex={-1} aria-label="Brush"><span className="le-ico brush-mark-glyph" style={brushGlyphStyle(brushIconUrl)} aria-hidden="true" /></ChromeButton>
        <ChromeButton unit="inner-erase-tool" className={chromeUnitClassNames('inner-erase-tool', 'le-seg-btn')} tabIndex={-1} aria-label="Erase"><span className="le-ico ic-eraser" aria-hidden="true" /></ChromeButton>
        <ChromeButton unit="inner-move-tool" className={chromeUnitClassNames('inner-move-tool', 'le-seg-btn')} tabIndex={-1} aria-label="Move"><span className="le-ico ic-move" aria-hidden="true" /></ChromeButton>
        <span className="le-action-toolbar-divider" aria-hidden="true" />
        <ChromeButton unit="inner-undo-key" className={chromeUnitClassNames('inner-undo-key', 'le-seg-btn', 'le-icon-btn')} tabIndex={-1} aria-label="Undo"><span className="le-ico ic-undo" aria-hidden="true" /></ChromeButton>
        <ChromeButton unit="inner-redo-key" className={chromeUnitClassNames('inner-redo-key', 'le-seg-btn', 'le-icon-btn')} tabIndex={-1} aria-label="Redo"><span className="le-ico ic-redo" aria-hidden="true" /></ChromeButton>
      </div>
    </section>
  );
}

export interface BrushMarkState {
  catalog: AdminLiveMediaCatalog | null;
  selectedId: string;
  select: (id: string) => void;
  error: string;
}

export function useBrushMarks(): BrushMarkState {
  const { catalog, error } = useAdminLiveMediaCatalog();
  const [selectedId, setSelectedId] = useState('');
  const select = useCallback((id: string) => setSelectedId(id), []);
  return { catalog, selectedId, select, error };
}

export function BrushMarkCatalog({ state }: { state: BrushMarkState }): ReactElement {
  const { catalog, selectedId, select, error } = state;
  const candidates = useMemo(() => catalog ? brushMarkCandidates(catalog) : [], [catalog]);
  const productionCandidate = useMemo(() => catalog ? brushIconProductionCandidate(catalog) : null, [catalog]);
  const usesApprovedOption01Pixels = productionCandidate?.metadata.productionStage
    === LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_STAGE;
  const selected = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedId) ?? candidates[0] ?? null,
    [candidates, selectedId],
  );

  if (error) return <p role="alert">{error}</p>;
  if (!catalog) return <p role="status">Loading candidates…</p>;

  return (
    <div data-testid="brush-mark-catalog">
      <section className="brush-mark-section" aria-labelledby="brush-toolbar-comparison-title">
        <h3 id="brush-toolbar-comparison-title">Actual Level Editor toolbar seat</h3>
        <div className="brush-mark-toolbar-comparison" data-testid="brush-mark-toolbar-comparison">
          <EditorActionToolbar brushIconUrl={installedUiMedia('ui-kit-icons-pencil-png')} label="Current pencil" />
          {selected?.media
            ? <EditorActionToolbar brushIconUrl={selected.media.url} label={`${brushMarkLabel(selected)} brush`} />
            : <p><strong>No brush candidates are available.</strong></p>}
        </div>
      </section>
      {productionCandidate?.media ? (
        <section className="brush-mark-section" aria-labelledby="brush-production-title">
          <h3 id="brush-production-title">
            {usesApprovedOption01Pixels
              ? 'Owner-selected Option 01 · exact approved pixels'
              : 'Owner-selected Option 01 · revised native 18×18 production pass'}
          </h3>
          <p className="tileset-catalog-note">
            {usesApprovedOption01Pixels
              ? 'This is the original complete Option 01 image you selected, mounted directly in the registered 20×20 toolbar glyph box with no manufactured padding or crop.'
              : 'This replacement closes the broad bristle head with a dark contour and keeps two transparent pixels beyond it.'}
            {' '}The left toolbar is the installed Pencil baseline; the right toolbar consumes the private candidate.
          </p>
          <div className="brush-mark-toolbar-comparison" data-testid="brush-mark-production-comparison">
            <EditorActionToolbar brushIconUrl={installedUiMedia('ui-kit-icons-pencil-png')} label="Current pencil" />
            <EditorActionToolbar brushIconUrl={productionCandidate.media.url} label="Option 01 native brush" />
          </div>
          <div className="brush-mark-production-actions">
            <figure>
              <img src={productionCandidate.media.url} width="144" height="144" alt="" draggable={false} />
              <figcaption>
                <strong>Inspection zoom</strong>
                <small>{usesApprovedOption01Pixels ? 'original 64×64 · runtime box 20×20' : 'runtime remains exact 18×18'}</small>
              </figcaption>
            </figure>
          </div>
        </section>
      ) : null}
      {candidates.length ? (
        <section className="brush-mark-section" aria-labelledby="brush-options-title">
          <h3 id="brush-options-title">{candidates.length} private candidates</h3>
          <div className="tileset-studio-grid studio-seat-grid" data-testid="brush-mark-choice-grid">
            {candidates.map((version) => (
              <StudioCatalogCard
                key={version.id}
                className="studio-seat-card"
                title={brushMarkLabel(version)}
                badge={`${version.media!.width}×${version.media!.height}`}
                textExtra={<small>{conceptLabel(version)}</small>}
                selected={selected?.id === version.id}
                onSelect={() => select(version.id)}
                media={(
                  <span className="le-action-toolbar">
                    <ChromeButton
                      unit="inner-brush-tool"
                      selected={selected?.id === version.id}
                      className={chromeUnitClassNames('inner-brush-tool', 'le-seg-btn')}
                      tabIndex={-1}
                      aria-hidden="true"
                    ><span className="le-ico brush-mark-glyph" style={brushGlyphStyle(version.media!.url)} aria-hidden="true" /></ChromeButton>
                  </span>
                )}
              />
            ))}
          </div>
        </section>
      ) : <p>No brush candidates are uploaded.</p>}
    </div>
  );
}

export function BrushMarkControls({ state }: { state: BrushMarkState }): ReactElement {
  const { catalog, selectedId } = state;
  const candidates = useMemo(() => catalog ? brushMarkCandidates(catalog) : [], [catalog]);
  const productionCandidate = useMemo(() => catalog ? brushIconProductionCandidate(catalog) : null, [catalog]);
  const selected = candidates.find((candidate) => candidate.id === selectedId) ?? candidates[0] ?? null;
  return (
    <>
      <p className="tileset-catalog-note">
        Exact private PixelLab candidates in the registered Level Editor tool button and at native
        64×64. Selecting an option changes only this preview; the pencil stays installed until an
        owner-selected brush completes its role-native production pass and typed acceptance.
      </p>
      {productionCandidate ? (
        <InnerTextNavButton
          className="le-seg-btn"
          to={levelEditorBrushIconReviewHref(productionCandidate.id)}
        >Review exact pixels in the real Level Editor</InnerTextNavButton>
      ) : null}
      {selected ? <p className="tileset-catalog-note">Previewing {brushMarkLabel(selected)}.</p> : null}
    </>
  );
}
