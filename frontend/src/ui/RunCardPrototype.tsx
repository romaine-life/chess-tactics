import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { RUN_CARD_CATALOG } from '../run/model';
import { runCardName } from '../run/cardNames';
import { RunCard } from './RunCard';
import { StudioCatalogCard } from './studio/StudioCatalogCard';

/** The Studio's live formation-card review surface. */
export function RunCardPrototypeViewer({
  header,
  viewerZoom,
}: {
  header: ReactNode;
  viewerZoom: number;
}): ReactElement {
  return (
    <section className="run-card-prototype-workspace" aria-label="Formation card gallery">
      {header}
      <div
        className="run-card-prototype-study-grid"
        style={{ '--run-card-gallery-zoom': viewerZoom } as CSSProperties}
      >
        {RUN_CARD_CATALOG.map((card) => (
          <article className="run-card-prototype-study" key={card.id}>
            <RunCard card={card} mode="reference" />
            <small>{runCardName(card)} · {card.pieces.length} unit{card.pieces.length === 1 ? '' : 's'}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

export function RunCardPrototypeCatalog({ onOpen }: { onOpen: () => void }): ReactElement {
  return (
    <div className="tileset-studio-grid pages-grid" aria-label="Card layout prototypes">
      <StudioCatalogCard
        title="Formation Cards"
        badge={`${RUN_CARD_CATALOG.length} authored layouts`}
        selected
        onSelect={onOpen}
        titleText="Open the formation card gallery"
        imageClassName="pages-card-image run-card-prototype-catalog-image"
        media={<span>1–3</span>}
      />
    </div>
  );
}
