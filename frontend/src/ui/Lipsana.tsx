import { drawableAssets } from '@chess-tactics/board-render';
import type { ReactElement } from 'react';
import { LIPSANON_BY_ID, type LipsanonId } from '../run/model';
import { RunSceneViewport } from './RunWorkspace';
import { InnerChromeBox } from './shared/ChromeBox';
import { Tooltip } from './shared/InfoTip';

export interface LipsanonArtwork {
  src: string;
  width: number;
  height: number;
}

export function installedLipsanonArtwork(lipsanonId: LipsanonId): LipsanonArtwork | null {
  const matches = drawableAssets('run-lipsanon').filter((asset) => asset.behavior.lipsanonId === lipsanonId);
  if (matches.length > 1) {
    throw new Error(`drawable catalog has ${matches.length} installed icons for Run lipsanon ${lipsanonId}`);
  }
  const asset = matches[0];
  if (!asset) return null;
  const icon = asset.media.icon?.media;
  if (!icon || icon.mediaType !== 'image/png' || icon.width !== 64 || icon.height !== 64) {
    throw new Error(`installed Run lipsanon ${lipsanonId} does not have one 64x64 PNG icon`);
  }
  return { src: icon.immutableUrl, width: icon.width, height: icon.height };
}

export function LipsanonIcon({
  lipsanonId,
  className = '',
}: {
  lipsanonId: LipsanonId;
  className?: string;
}): ReactElement {
  const artwork = installedLipsanonArtwork(lipsanonId);
  return (
    <span
      className={`run-lipsanon-icon${artwork ? '' : ' is-unavailable'} ${className}`.trim()}
      data-lipsanon-id={lipsanonId}
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

/** One canonical held-lipsanon record in the persistent inventory strip. */
export function LipsanonInventoryItem({
  lipsanonId,
}: {
  lipsanonId: LipsanonId;
}): ReactElement {
  const lipsanon = LIPSANON_BY_ID[lipsanonId];
  return (
    <Tooltip
      className="run-lipsanon-inventory-item"
      triggerClassName="run-lipsanon-inventory-trigger"
      popupMaxInlineSize={288}
      label={`${lipsanon.name}. ${lipsanon.description}`}
      title={lipsanon.name}
      trigger={<LipsanonIcon lipsanonId={lipsanonId} />}
    >
      <span>{lipsanon.description}</span>
    </Tooltip>
  );
}

export function LipsanonStrip({
  lipsanonIds,
}: {
  lipsanonIds: readonly LipsanonId[];
}): ReactElement | null {
  const knownLipsanonIds = lipsanonIds.filter((lipsanonId) => Boolean(LIPSANON_BY_ID[lipsanonId]));
  if (knownLipsanonIds.length === 0) return null;
  return (
    <section
      className="run-lipsanon-strip"
      aria-label="Held lipsana"
      data-testid="run-lipsanon-strip"
    >
      <div className="run-lipsanon-inventory-list">
        {knownLipsanonIds.map((lipsanonId) => (
          <LipsanonInventoryItem lipsanonId={lipsanonId} key={lipsanonId} />
        ))}
      </div>
    </section>
  );
}

export function LipsanaWorkspace({
  lipsanonIds,
}: {
  lipsanonIds: readonly LipsanonId[];
}): ReactElement {
  const knownLipsanonIds = lipsanonIds.filter((lipsanonId) => Boolean(LIPSANON_BY_ID[lipsanonId]));
  return (
    <RunSceneViewport
      scene={{
        view: 'lipsana',
        className: 'run-self-inspection-workspace run-lipsana-workspace',
        contentClassName: 'run-self-inspection-content',
        testId: 'run-lipsana-workspace',
        ariaLabelledBy: 'run-lipsana-workspace-title',
      }}
    >
      <header className="run-self-inspection-head">
        <h2 id="run-lipsana-workspace-title">Lipsana</h2>
        <span>{knownLipsanonIds.length} held</span>
      </header>
      {knownLipsanonIds.length > 0 ? (
        <div className="run-lipsana-ledger" role="list" aria-label="Held lipsana">
          {knownLipsanonIds.map((lipsanonId, index) => {
            const lipsanon = LIPSANON_BY_ID[lipsanonId];
            return (
              <InnerChromeBox
                className="run-lipsana-ledger-row"
                role="listitem"
                key={`${lipsanonId}-${index}`}
              >
                <LipsanonIcon lipsanonId={lipsanonId} />
                <span className="run-lipsana-ledger-copy">
                  <strong>{lipsanon.name}</strong>
                  <span>{lipsanon.description}</span>
                </span>
              </InnerChromeBox>
            );
          })}
        </div>
      ) : (
        <p className="run-self-inspection-empty" role="status">
          No lipsana held. Lipsana acquired during this Run will appear here.
        </p>
      )}
    </RunSceneViewport>
  );
}
