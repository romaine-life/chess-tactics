import type { ReactElement } from 'react';
import { RUN_CARD_CATALOG } from '../run/model';
import { runCardName } from '../run/cardNames';
import { RunCard } from './RunCard';
import { StudioCatalogCard } from './studio/StudioCatalogCard';

/**
 * Formation placement review. Live Run deployment remains the executable source of
 * truth; this lab gives every authored footprint a compact, inspectable inventory.
 */
export function DeploymentLabCatalog({ onOpen }: { onOpen: () => void }): ReactElement {
  return (
    <div className="tileset-studio-grid deployment-lab-catalog" aria-label="Deployment instruments">
      <StudioCatalogCard
        title="Formation Lab"
        badge="Authored placement footprints"
        titleText="Formation Lab — authored placement footprints"
        onSelect={onOpen}
        onOpen={onOpen}
        media={<span className="deployment-lab-card-media" aria-hidden="true">♙ ♘ ♗ ♖ ♕ ♔</span>}
        textExtra={<span>Review the exact 1–3 unit shapes used by live deployment.</span>}
      />
    </div>
  );
}

export function DeploymentLabViewer(): ReactElement {
  return (
    <section className="deployment-lab" aria-label="Formation placement review">
      <header className="deployment-lab-header">
        <div>
          <span className="tileset-eyebrow">Run deployment</span>
          <h2>Formation Lab</h2>
          <p>The diagram is the card’s footprint. Deployment tries the complete shape first, then uses a seeded legal-square fallback when the board cannot fit it.</p>
        </div>
      </header>
      <div className="deployment-lab-cards">
        {RUN_CARD_CATALOG.map((card) => (
          <article className="deployment-lab-card" key={card.id}>
            <RunCard card={card} mode="reference" />
            <strong>{runCardName(card)}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}
