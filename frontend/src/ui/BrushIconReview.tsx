import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import {
  fetchAdminLiveMediaCatalog,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { defaultBackgroundSet } from '../art/backgroundSets';
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
import { InnerChromeBox, OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import { useSceneParticipant } from './shell/SceneBoundary';

function candidateIndex(version: AdminLiveMediaVersion): number {
  const value = Number(version.metadata.candidateIndex);
  return Number.isSafeInteger(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

export function brushIconReviewCandidates(catalog: AdminLiveMediaCatalog): AdminLiveMediaVersion[] {
  return catalog.versions
    .filter((version) => version.slot === LEVEL_EDITOR_BRUSH_ICON_SLOT
      && version.status === 'candidate'
      && version.provenance.pixelLabObjectId === BRUSH_ICON_EXPLORATION_OBJECT_ID
      && Boolean(version.media))
    .sort((left, right) => candidateIndex(left) - candidateIndex(right));
}

function optionLabel(version: AdminLiveMediaVersion): string {
  const index = candidateIndex(version);
  return index === Number.MAX_SAFE_INTEGER ? 'Option' : `Option ${String(index).padStart(2, '0')}`;
}

function conceptLabel(version: AdminLiveMediaVersion): string {
  return typeof version.metadata.concept === 'string' ? version.metadata.concept : 'Paintbrush glyph';
}

function brushGlyphStyle(url: string): CSSProperties {
  return { backgroundImage: `url(${JSON.stringify(url)})` };
}

function EditorActionToolbar({
  brushIconUrl,
  label,
}: {
  brushIconUrl: string;
  label: string;
}): ReactElement {
  return (
    <section className="skirmish-card le-actions-dock brush-icon-review-toolbar-card" aria-label={label}>
      <h2>{label}</h2>
      <div className="le-seg le-seg-icons le-action-toolbar" role="toolbar" aria-label={`${label} editor tools`}>
        <ChromeButton unit="inner-select-tool" className={chromeUnitClassNames('inner-select-tool', 'le-seg-btn')} tabIndex={-1} aria-label="Select"><span className="le-ico ic-eyedropper" aria-hidden="true" /></ChromeButton>
        <ChromeButton unit="inner-brush-tool" className={chromeUnitClassNames('inner-brush-tool', 'le-seg-btn', 'active')} tabIndex={-1} aria-label="Brush"><span className="le-ico brush-icon-review-glyph" style={brushGlyphStyle(brushIconUrl)} aria-hidden="true" /></ChromeButton>
        <ChromeButton unit="inner-erase-tool" className={chromeUnitClassNames('inner-erase-tool', 'le-seg-btn')} tabIndex={-1} aria-label="Erase"><span className="le-ico ic-eraser" aria-hidden="true" /></ChromeButton>
        <ChromeButton unit="inner-move-tool" className={chromeUnitClassNames('inner-move-tool', 'le-seg-btn')} tabIndex={-1} aria-label="Move"><span className="le-ico ic-move" aria-hidden="true" /></ChromeButton>
        <span className="le-action-toolbar-divider" aria-hidden="true" />
        <ChromeButton unit="inner-undo-key" className={chromeUnitClassNames('inner-undo-key', 'le-seg-btn', 'le-icon-btn')} tabIndex={-1} aria-label="Undo"><span className="le-ico ic-undo" aria-hidden="true" /></ChromeButton>
        <ChromeButton unit="inner-redo-key" className={chromeUnitClassNames('inner-redo-key', 'le-seg-btn', 'le-icon-btn')} tabIndex={-1} aria-label="Redo"><span className="le-ico ic-redo" aria-hidden="true" /></ChromeButton>
      </div>
    </section>
  );
}

export function BrushIconReview(): ReactElement {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  useEffect(() => {
    let active = true;
    void fetchAdminLiveMediaCatalog()
      .then((next) => { if (active) setCatalog(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);
  const candidates = useMemo(() => catalog ? brushIconReviewCandidates(catalog) : [], [catalog]);
  const productionCandidate = useMemo(() => catalog ? brushIconProductionCandidate(catalog) : null, [catalog]);
  const usesApprovedOption01Pixels = productionCandidate?.metadata.productionStage
    === LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_STAGE;
  const selected = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedId) ?? candidates[0] ?? null,
    [candidates, selectedId],
  );
  const sceneError = useMemo(() => error ? new Error(error) : null, [error]);
  useSceneParticipant('studio', sceneError ? 'error' : catalog ? 'painted' : 'loading', sceneError);

  return (
    <main
      className="run-lipsanon-review-screen brush-icon-review-screen skirmish-screen"
      style={{ ['--skirmish-world-bg' as string]: `url("${defaultBackgroundSet().world}")` }}
    >
      <OuterChromeBox chromeConsumer="brush-icon-review" titled className="run-lipsanon-review-panel brush-icon-review-panel">
        <OuterChromeHeader title="Level Editor Brush Icon Review" />
        <p>
          Exact private PixelLab candidates in the registered Level Editor tool button and at native 64×64.
          Clicking an option changes only this preview; the pencil stays installed until an owner-selected brush
          completes its role-native production pass and typed acceptance.
        </p>
        {error ? <p role="alert">{error}</p> : null}
        {!catalog && !error ? <p role="status">Loading candidates…</p> : null}
        {catalog ? (
          <>
            <section className="brush-icon-review-section" aria-labelledby="brush-toolbar-comparison-title">
              <h2 id="brush-toolbar-comparison-title">Actual Level Editor toolbar seat</h2>
              <div className="brush-icon-review-toolbar-comparison" data-testid="brush-icon-toolbar-comparison">
                <EditorActionToolbar brushIconUrl={installedUiMedia('ui-kit-icons-pencil-png')} label="Current pencil" />
                {selected?.media
                  ? <EditorActionToolbar brushIconUrl={selected.media.url} label={`${optionLabel(selected)} brush`} />
                  : <p><strong>No brush candidates are available.</strong></p>}
              </div>
            </section>
            {productionCandidate?.media ? (
              <section className="brush-icon-review-section" aria-labelledby="brush-production-title">
                <h2 id="brush-production-title">
                  {usesApprovedOption01Pixels
                    ? 'Owner-selected Option 01 · exact approved pixels'
                    : 'Owner-selected Option 01 · revised native 18×18 production pass'}
                </h2>
                <p>
                  {usesApprovedOption01Pixels
                    ? 'This is the original complete Option 01 image you selected, mounted directly in the registered 20×20 toolbar glyph box with no manufactured padding or crop.'
                    : 'This replacement closes the broad bristle head with a dark contour and keeps two transparent pixels beyond it.'}
                  {' '}The left toolbar is the installed Pencil baseline; the right toolbar consumes the private candidate.
                </p>
                <div className="brush-icon-review-toolbar-comparison" data-testid="brush-icon-production-comparison">
                  <EditorActionToolbar brushIconUrl={installedUiMedia('ui-kit-icons-pencil-png')} label="Current pencil" />
                  <EditorActionToolbar brushIconUrl={productionCandidate.media.url} label="Option 01 native brush" />
                </div>
                <div className="brush-icon-review-production-actions">
                  <figure>
                    <img
                      src={productionCandidate.media.url}
                      width="144"
                      height="144"
                      alt=""
                      draggable={false}
                    />
                    <figcaption>
                      <strong>Inspection zoom</strong>
                      <small>{usesApprovedOption01Pixels ? 'original 64×64 · runtime box 20×20' : 'runtime remains exact 18×18'}</small>
                    </figcaption>
                  </figure>
                  <InnerTextNavButton
                    className="le-seg-btn"
                    to={levelEditorBrushIconReviewHref(productionCandidate.id)}
                  >Review exact pixels in the real Level Editor</InnerTextNavButton>
                </div>
              </section>
            ) : null}
            {candidates.length ? (
              <>
                <section className="brush-icon-review-section" aria-labelledby="brush-options-title">
                  <h2 id="brush-options-title">Choose a toolbar preview · {candidates.length} private candidates</h2>
                  <div className="brush-icon-review-choice-grid" data-testid="brush-icon-choice-grid">
                    {candidates.map((version) => (
                      <InnerChromeBox
                        className="brush-icon-review-choice"
                        data-version-id={version.id}
                        key={`choice-${version.id}`}
                      >
                        <div className="le-action-toolbar">
                          <ChromeButton
                            unit="inner-brush-tool"
                            selected={selected?.id === version.id}
                            className={chromeUnitClassNames('inner-brush-tool', 'le-seg-btn')}
                            aria-label={`Preview ${optionLabel(version)}`}
                            onClick={() => setSelectedId(version.id)}
                          ><span className="le-ico brush-icon-review-glyph" style={brushGlyphStyle(version.media!.url)} aria-hidden="true" /></ChromeButton>
                        </div>
                        <span>
                          <strong>{optionLabel(version)}</strong>
                          <small>{conceptLabel(version)}</small>
                        </span>
                      </InnerChromeBox>
                    ))}
                  </div>
                </section>
                <section className="brush-icon-review-section" aria-labelledby="brush-native-title">
                  <h2 id="brush-native-title">Native pixel work</h2>
                  <div className="run-lipsanon-review-grid brush-icon-review-native-grid" data-testid="brush-icon-native-grid">
                    {candidates.map((version) => (
                      <figure data-version-id={version.id} key={`native-${version.id}`}>
                        <img src={version.media!.url} width="64" height="64" alt="" draggable={false} />
                        <figcaption>
                          <strong>{optionLabel(version)}</strong>
                          <small>native 64×64 · private candidate</small>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              </>
            ) : null}
          </>
        ) : null}
      </OuterChromeBox>
    </main>
  );
}
