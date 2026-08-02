import { drawableAssets } from '@chess-tactics/board-render';
import type { ReactElement } from 'react';
import { RUN_RELIC_BY_ID, type RunRelicId } from '../run/model';
import { RunWorkspace } from './RunWorkspace';
import { InnerChromeBox } from './shared/ChromeBox';
import { Tooltip } from './shared/InfoTip';

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
    throw new Error(`installed Run relic ${relicId} does not have one 64x64 PNG icon`);
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

export function RunRelicStrip({
  relicIds,
}: {
  relicIds: readonly RunRelicId[];
}): ReactElement | null {
  const knownRelicIds = relicIds.filter((relicId) => Boolean(RUN_RELIC_BY_ID[relicId]));
  if (knownRelicIds.length === 0) return null;
  return (
    <section
      className="run-relic-strip"
      aria-label="Held relics"
      data-testid="run-relic-strip"
    >
      <div className="run-relic-inventory-list">
        {knownRelicIds.map((relicId) => {
          const relic = RUN_RELIC_BY_ID[relicId];
          return (
            <Tooltip
              className="run-relic-inventory-item"
              key={relicId}
              triggerClassName="run-relic-inventory-trigger"
              popupClassName="run-relic-tooltip-pop"
              popupMaxInlineSize={288}
              label={`${relic.name}. ${relic.description}`}
              trigger={<RunRelicIcon relicId={relicId} />}
            >
              <strong className="run-relic-tooltip-name">{relic.name}</strong>
              <span className="run-relic-tooltip-description">{relic.description}</span>
            </Tooltip>
          );
        })}
      </div>
    </section>
  );
}

export function RunRelicsWorkspace({
  relicIds,
}: {
  relicIds: readonly RunRelicId[];
}): ReactElement {
  const knownRelicIds = relicIds.filter((relicId) => Boolean(RUN_RELIC_BY_ID[relicId]));
  return (
    <RunWorkspace
      className="run-self-inspection-workspace run-relics-workspace"
      contentClassName="run-self-inspection-content"
      data-testid="run-relics-workspace"
      aria-labelledby="run-relics-workspace-title"
    >
      <header className="run-self-inspection-head">
        <h2 id="run-relics-workspace-title">Relics</h2>
        <span>{knownRelicIds.length} held</span>
      </header>
      {knownRelicIds.length > 0 ? (
        <div className="run-relics-ledger" role="list" aria-label="Held relics">
          {knownRelicIds.map((relicId, index) => {
            const relic = RUN_RELIC_BY_ID[relicId];
            return (
              <InnerChromeBox
                className="run-relics-ledger-row"
                role="listitem"
                key={`${relicId}-${index}`}
              >
                <RunRelicIcon relicId={relicId} />
                <span className="run-relics-ledger-copy">
                  <strong>{relic.name}</strong>
                  <span>{relic.description}</span>
                </span>
              </InnerChromeBox>
            );
          })}
        </div>
      ) : (
        <p className="run-self-inspection-empty" role="status">
          No relics held. Relics acquired during this Run will appear here.
        </p>
      )}
    </RunWorkspace>
  );
}
