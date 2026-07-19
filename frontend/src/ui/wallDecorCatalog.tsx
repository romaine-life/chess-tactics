import type { CSSProperties, ReactElement, ReactNode } from 'react';
import {
  WALL_DECOR_ASSETS,
  WALL_DECOR_KIND_LABELS,
  WALL_DECOR_KINDS,
  wallDecorAsset,
  type WallDecorAsset,
  type WallDecorFace,
  type WallDecorKind,
} from '../core/wallDecor';
import { wallMaterials } from '../core/featureAutotile';
import { wallFrameSrc } from '../art/tileset';

const previewWallSrc = (): string => {
  const material = wallMaterials()[0];
  if (!material) throw new Error('drawable catalog has no wall material for decoration preview');
  return wallFrameSrc(material, 9);
};

export {
  WALL_DECOR_ASSETS,
  WALL_DECOR_KIND_LABELS,
  WALL_DECOR_KINDS,
  wallDecorAsset,
  type WallDecorAsset,
  type WallDecorKind,
};

function wallDecorFaceStyle(face: WallDecorFace, scale: number, wallLeft: number, wallTop: number): CSSProperties {
  return {
    left: wallLeft + face.previewX * scale - face.mountX * scale,
    top: wallTop + face.previewY * scale - face.mountY * scale,
    width: face.width * scale,
    height: face.height * scale,
  };
}

export function WallDecorPreview({ asset, zoom = 1 }: { asset: WallDecorAsset; zoom?: number }): ReactElement {
  const scale = 0.72 * zoom;
  const wallW = 128 * scale;
  const wallH = 240 * scale;
  const wallLeft = 76 - wallW / 2;
  const wallTop = 10;
  return (
    <span className="wall-decor-preview" aria-hidden="true">
      <img className="wall-decor-preview-wall" src={previewWallSrc()} alt="" draggable={false} style={{ left: wallLeft, top: wallTop, width: wallW, height: wallH }} />
      <img className="wall-decor-preview-sprite" src={asset.faces.west.src} alt="" draggable={false} style={wallDecorFaceStyle(asset.faces.west, scale, wallLeft, wallTop)} />
      <img className="wall-decor-preview-sprite" src={asset.faces.north.src} alt="" draggable={false} style={wallDecorFaceStyle(asset.faces.north, scale, wallLeft, wallTop)} />
    </span>
  );
}

export function WallDecorLab({ assetId, header }: { assetId: string | undefined; header?: ReactNode }): ReactElement {
  const asset = wallDecorAsset(assetId);
  if (!asset) {
    return (
      <>
        <section className="al-lab-main" aria-label="Wall art source preview">
          <p className="tileset-catalog-note">The selected wall-decoration source is unavailable as a complete live catalog triplet.</p>
        </section>
        <aside className="tileset-view-controls" aria-label="Wall art source controls">
          <section className="tileset-inspector-section"><h2>Controls</h2>{header}</section>
        </aside>
      </>
    );
  }
  return (
    <>
      <section className="al-lab-main" aria-label="Wall art source preview">
        <div className="wall-decor-lab-stage">
          <figure className="al-stage">
            <span className="wall-decor-large-preview">
              <img className="wall-decor-large-wall" src={previewWallSrc()} alt="" draggable={false} />
              <img
                className="wall-decor-large-sprite"
                src={asset.faces.west.src}
                alt=""
                draggable={false}
                style={wallDecorFaceStyle(asset.faces.west, 1.5, 70, 20)}
              />
              <img
                className="wall-decor-large-sprite"
                src={asset.faces.north.src}
                alt={asset.label}
                draggable={false}
                style={wallDecorFaceStyle(asset.faces.north, 1.5, 70, 20)}
              />
            </span>
            <figcaption>{asset.label}</figcaption>
          </figure>
          <figure className="al-stage">
            <span className="al-checker wall-decor-checker">
              <img src={asset.src} alt={asset.label} className="wall-decor-standalone" draggable={false} />
            </span>
            <figcaption>transparent sprite</figcaption>
          </figure>
        </div>
      </section>
      <aside className="tileset-view-controls" aria-label="Wall art source controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <dl className="al-meta">
              <div><dt>Kind</dt><dd>{WALL_DECOR_KIND_LABELS[asset.kind]}</dd></div>
              <div><dt>Frame</dt><dd>{asset.width}x{asset.height}</dd></div>
              <div><dt>Faces</dt><dd>west {asset.faces.west.width}x{asset.faces.west.height} / north {asset.faces.north.width}x{asset.faces.north.height}</dd></div>
              <div><dt>Media</dt><dd>live catalog · immutable snapshot</dd></div>
            </dl>
          </div>
        </section>
      </aside>
    </>
  );
}
