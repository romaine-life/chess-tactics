import { useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { RUN_CARD_BY_ID } from '../run/model';
import { RunCard } from './RunCard';
import { StudioCatalogCard } from './studio/StudioCatalogCard';
import type { RunCardOutlineRendering } from './RunCardFace';

// Studio → Card Outline. The card's formation diagram is the one part of the face that is drawn
// rather than painted, and the whole question about it is a rasterization one: at the size the
// game prints it, does the boundary read better antialiased or hard-edged?
//
// That is not answerable in words, and it is not answerable from a screenshot either — a capture
// is one machine's rasterizer at one device pixel ratio. Both renderings are mounted here on real
// cards at the size the Run prints them, so the answer comes off the same screen the game runs on.

const RENDERINGS: readonly Readonly<{
  id: RunCardOutlineRendering;
  label: string;
  detail: string;
}>[] = Object.freeze([
  Object.freeze({
    id: 'soft',
    label: 'Soft',
    detail: 'Antialiased, as the game prints it. The diagonal fades across two pixel rows, which reads as a drawn line.',
  }),
  Object.freeze({
    id: 'crisp',
    label: 'Crisp',
    detail: 'shape-rendering: crispEdges. Every pixel is fully on or fully off, so the diagonal becomes even stair steps.',
  }),
]);

/**
 * One card per footprint the outline has to cope with. A straight run and a square are the easy
 * cases; the step and the corner are where a boundary either closes or does not, and the lone seat
 * is the smallest possible ring.
 */
const SPECIMENS: readonly Readonly<{ id: string; shape: string }>[] = Object.freeze([
  Object.freeze({ id: 'f-00011011-bbpp', shape: 'Square' }),
  Object.freeze({ id: 'f-00102021-kppp', shape: 'Step' }),
  Object.freeze({ id: 'f-011011-kpp', shape: 'Corner' }),
  Object.freeze({ id: 'f-01112131-kppp', shape: 'Straight run' }),
  Object.freeze({ id: 'p', shape: 'Single seat' }),
]);

const CARD_WIDTHS: readonly Readonly<{ id: string; label: string; width: string }>[] = Object.freeze([
  Object.freeze({ id: 'shipped', label: 'As the Run prints it', width: '196px' }),
  Object.freeze({ id: 'double', label: '2x', width: '392px' }),
  Object.freeze({ id: 'quadruple', label: '4x', width: '784px' }),
]);

export function RunCardOutlineCatalog({ onOpen }: { onOpen: () => void }): ReactElement {
  return (
    <div
      className="tileset-studio-grid pages-grid run-card-outline-catalog"
      aria-label="Card outline instruments"
      data-testid="run-card-outline-catalog"
    >
      <StudioCatalogCard
        title="Card Outline"
        badge="Live card faces"
        selected
        onSelect={onOpen}
        onOpen={onOpen}
        titleText="Compare how the formation outline rasterizes, on real cards at printed size"
        imageClassName="run-card-outline-catalog-image"
        // The band is shorter than a 5:7 face at catalog width, so both are stated here rather
        // than left to a class the band's own rules outrank.
        imageStyle={{ minHeight: 152 }}
        media={(
          <span className="run-card-outline-catalog-specimen" style={{ inlineSize: 132 }}>
            {RENDERINGS.map((rendering) => (
              <RunCard
                key={rendering.id}
                card={RUN_CARD_BY_ID['f-00011011-bbpp']}
                mode="reference"
                outlineRendering={rendering.id}
              />
            ))}
          </span>
        )}
        textExtra={<span>Soft against crisp, on every footprint the boundary has to close.</span>}
      />
    </div>
  );
}

export function RunCardOutlineViewer({ header }: { header: ReactNode }): ReactElement {
  const [widthId, setWidthId] = useState(CARD_WIDTHS[0].id);
  const width = CARD_WIDTHS.find((candidate) => candidate.id === widthId) ?? CARD_WIDTHS[0];

  return (
    <div className="run-card-outline-viewer" data-testid="run-card-outline-viewer">
      {header}
      <p className="run-card-outline-note">
        The formation outline is drawn, not painted. At the size the Run prints a card its edges are
        about one pixel wide, so how they rasterize is the whole of how they read. Both are live
        below — the same cards, the same line colour and weight, differing only in antialiasing.
      </p>
      <div className="run-card-outline-widths" role="group" aria-label="Card size">
        {CARD_WIDTHS.map((candidate) => (
          <button
            type="button"
            key={candidate.id}
            className={`tileset-view-action${candidate.id === widthId ? ' is-active' : ''}`}
            aria-pressed={candidate.id === widthId}
            onClick={() => setWidthId(candidate.id)}
          >
            {candidate.label}
          </button>
        ))}
      </div>
      <div className="run-card-outline-columns">
        {RENDERINGS.map((rendering) => (
          <section className="run-card-outline-column" key={rendering.id} aria-label={rendering.label}>
            <h3>{rendering.label}</h3>
            <p>{rendering.detail}</p>
            <div className="run-card-outline-specimens">
              {SPECIMENS.map((specimen) => (
                <figure className="run-card-outline-specimen" key={specimen.id}>
                  <span
                    className="run-card-outline-face"
                    style={{ '--run-card-outline-face-width': width.width } as CSSProperties}
                  >
                    <RunCard
                      card={RUN_CARD_BY_ID[specimen.id]}
                      mode="reference"
                      outlineRendering={rendering.id}
                    />
                  </span>
                  <figcaption>{specimen.shape}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
