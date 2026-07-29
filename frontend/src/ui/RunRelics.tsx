import { drawableAssets } from '@chess-tactics/board-render';
import type { ReactElement } from 'react';
import { RUN_RELIC_BY_ID, type RunRelicId } from '../run/model';
import { chromeUnitClassNames } from './chromeUnitRegistry';

export interface RunRelicArtwork {
  src: string;
  width: number;
  height: number;
}

export function installedRunRelicArtwork(relicId: RunRelicId): RunRelicArtwork | null {
  const matches = drawableAssets('run-relic').filter((asset) => asset.behavior.relicId === relicId);
  if (matches.length > 1) {
    throw new Error(`drawable catalog has ${matches.length} installed icons for Run relic ${relicId}`);
  }
  const asset = matches[0];
  if (!asset) return null;
  const icon = asset.media.icon?.media;
  if (!icon || icon.mediaType !== 'image/png' || icon.width !== 64 || icon.height !== 64) {
    throw new Error(`installed Run relic ${relicId} does not have one native 64x64 PNG icon`);
  }
  return { src: icon.immutableUrl, width: icon.width, height: icon.height };
}

export function RunRelicIcon({
  relicId,
  className = '',
}: {
  relicId: RunRelicId;
  className?: string;
}): ReactElement {
  const artwork = installedRunRelicArtwork(relicId);
  return (
    <span
      className={`run-relic-icon${artwork ? '' : ' is-unavailable'} ${className}`.trim()}
      data-relic-id={relicId}
      aria-hidden="true"
    >
      {artwork ? (
        <img
          src={artwork.src}
          width={artwork.width}
          height={artwork.height}
          alt=""
          draggable={false}
        />
      ) : <span>Art unavailable</span>}
    </span>
  );
}

export function RunRelicInventory({
  relicIds,
  placement,
}: {
  relicIds: readonly RunRelicId[];
  placement: 'workspace' | 'hud';
}): ReactElement | null {
  if (relicIds.length === 0) return null;
  return (
    <section
      data-chrome-unit="inner-box"
      className={chromeUnitClassNames('inner-box', 'run-relic-inventory', `run-relic-inventory--${placement}`)}
      aria-label="Held relics"
      data-testid={`run-relic-inventory-${placement}`}
    >
      <strong>Relics</strong>
      <div className="run-relic-inventory-list">
        {relicIds.map((relicId) => {
          const relic = RUN_RELIC_BY_ID[relicId];
          return (
            <span
              className="run-relic-inventory-item"
              key={relicId}
              tabIndex={0}
              title={`${relic.name} — ${relic.description}`}
              aria-label={`${relic.name}. ${relic.description}`}
            >
              <RunRelicIcon relicId={relicId} />
            </span>
          );
        })}
      </div>
    </section>
  );
}
