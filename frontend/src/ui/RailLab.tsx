import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { SliderRow } from './dressing/SliderRow';
import { ViewPane } from './shared/ViewPane';
import {
  NATIVE_RAIL_FAMILIES,
  normalizeNativeRailFamilyId,
  type NativeRailCandidateSource,
  type NativeRailFamily,
  type NativeRailOrientation,
} from './nativeRailCandidateSources';

const RAIL_FAMILIES = NATIVE_RAIL_FAMILIES;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${src}`));
    image.src = src;
  });
}

function drawChecker(context: CanvasRenderingContext2D, w: number, h: number): void {
  context.fillStyle = '#07121b';
  context.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 12) {
    for (let x = 0; x < w; x += 12) {
      if (((x + y) / 12) % 2 === 0) {
        context.fillStyle = 'rgba(255,255,255,.055)';
        context.fillRect(x, y, 12, 12);
      }
    }
  }
}

function drawRailRun(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  orientation: NativeRailOrientation,
  x: number,
  y: number,
  length: number,
  seamTrim = 0,
): void {
  const horizontal = orientation === 'horizontal';
  const rawPeriod = horizontal ? image.naturalWidth : image.naturalHeight;
  const thickness = horizontal ? image.naturalHeight : image.naturalWidth;
  const trim = Math.max(0, Math.min(seamTrim, Math.floor((rawPeriod - 1) / 2)));
  const period = Math.max(1, rawPeriod - trim * 2);
  context.save();
  context.beginPath();
  context.rect(x, y, horizontal ? length : thickness, horizontal ? thickness : length);
  context.clip();
  for (let position = 0; position < length; position += period) {
    if (horizontal) {
      context.drawImage(image, trim, 0, period, thickness, x + position, y, period, thickness);
    } else {
      context.drawImage(image, 0, trim, thickness, period, x, y + position, thickness, period);
    }
  }
  context.restore();
}

function RailFamilyCanvas({
  horizontal,
  vertical,
  boxWidth,
  boxHeight,
  seamTrim,
}: {
  horizontal: NativeRailCandidateSource;
  vertical: NativeRailCandidateSource;
  boxWidth: number;
  boxHeight: number;
  seamTrim: number;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([loadImage(horizontal.src), loadImage(vertical.src)]).then(([horizontalImage, verticalImage]) => {
      if (!live) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.max(boxWidth, verticalImage.naturalWidth * 2);
      canvas.height = Math.max(boxHeight, horizontalImage.naturalHeight * 2);
      const context = canvas.getContext('2d')!;
      context.imageSmoothingEnabled = false;
      drawChecker(context, canvas.width, canvas.height);

      drawRailRun(context, horizontalImage, 'horizontal', 0, 0, canvas.width, seamTrim);
      drawRailRun(context, horizontalImage, 'horizontal', 0, canvas.height - horizontalImage.naturalHeight, canvas.width, seamTrim);
      drawRailRun(context, verticalImage, 'vertical', 0, 0, canvas.height, seamTrim);
      drawRailRun(context, verticalImage, 'vertical', canvas.width - verticalImage.naturalWidth, 0, canvas.height, seamTrim);
    }).catch(() => {});
    return () => { live = false; };
  }, [boxHeight, boxWidth, horizontal, seamTrim, vertical]);

  return <canvas ref={canvasRef} className="rail-lab-canvas rail-lab-family-canvas" />;
}

function NativeMemberCanvas({ source }: { source: NativeRailCandidateSource }): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let live = true;
    loadImage(source.src).then((image) => {
      if (!live) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const inset = 12;
      canvas.width = image.naturalWidth + inset * 2;
      canvas.height = image.naturalHeight + inset * 2;
      const context = canvas.getContext('2d')!;
      context.imageSmoothingEnabled = false;
      drawChecker(context, canvas.width, canvas.height);
      context.drawImage(image, inset, inset);
    }).catch(() => {});
    return () => { live = false; };
  }, [source]);

  return <canvas ref={canvasRef} className="rail-lab-canvas" />;
}

function SeamPreviewCanvas({
  source,
  seamTrim,
}: {
  source: NativeRailCandidateSource;
  seamTrim: number;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let live = true;
    loadImage(source.src).then((image) => {
      if (!live) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const inset = 12;
      const period = Math.max(1, image.naturalWidth - seamTrim * 2);
      const runLength = source.width * 6;
      canvas.width = runLength + inset * 2;
      canvas.height = image.naturalHeight + inset * 2;
      const context = canvas.getContext('2d')!;
      context.imageSmoothingEnabled = false;
      drawChecker(context, canvas.width, canvas.height);
      drawRailRun(context, image, 'horizontal', inset, inset, runLength, seamTrim);
      context.fillStyle = 'rgba(91, 200, 255, .45)';
      for (let x = inset + period; x < inset + runLength; x += period) {
        context.fillRect(x, inset - 4, 1, image.naturalHeight + 8);
      }
    }).catch(() => {});
    return () => { live = false; };
  }, [seamTrim, source]);

  return <canvas ref={canvasRef} className="rail-lab-canvas rail-lab-seam-canvas" />;
}

function ProofBlock({ title, note, children }: { title: string; note: string; children: ReactNode }): ReactElement {
  return (
    <section className="rail-lab-proof">
      <div className="rail-lab-proof-head">
        <h3>{title}</h3>
        <span>{note}</span>
      </div>
      <div className="rail-lab-proof-body">{children}</div>
    </section>
  );
}

function seamLabel(source: NativeRailCandidateSource): string {
  return source.seam ? source.seam.averageDelta.toFixed(1) : 'n/a';
}

function memberLabel(source: NativeRailCandidateSource, index: number): string {
  return `${String(index + 1).padStart(2, '0')} / ${source.sourceFile} / seam ${seamLabel(source)}`;
}

function RailMemberPicker({
  label,
  orientation,
  sources,
  sourceId,
  onSourceId,
}: {
  label: string;
  orientation: NativeRailOrientation;
  sources: NativeRailCandidateSource[];
  sourceId: string;
  onSourceId: (id: string) => void;
}): ReactElement {
  const cycle = (delta: -1 | 1): void => {
    const currentIndex = sources.findIndex((source) => source.id === sourceId);
    const nextIndex = (Math.max(0, currentIndex) + delta + sources.length) % sources.length;
    onSourceId(sources[nextIndex].id);
  };

  return (
    <div className="tileset-category-select rail-lab-source-control">
      <span>{label}</span>
      <div className="rail-lab-source-picker">
        <button type="button" className="tileset-view-action rail-lab-source-step" onClick={() => cycle(-1)} aria-label={`Previous ${orientation} variant`} title={`Previous ${orientation} variant`}>&lt;</button>
        <select value={sourceId} onChange={(event) => onSourceId(event.target.value)} aria-label={`${label} source`}>
          {sources.map((source, index) => <option key={source.id} value={source.id}>{memberLabel(source, index)}</option>)}
        </select>
        <button type="button" className="tileset-view-action rail-lab-source-step" onClick={() => cycle(1)} aria-label={`Next ${orientation} variant`} title={`Next ${orientation} variant`}>&gt;</button>
      </div>
    </div>
  );
}

type FamilyMemberSelections = Record<string, Partial<Record<NativeRailOrientation, string>>>;

function selectedMember(
  family: NativeRailFamily,
  orientation: NativeRailOrientation,
  selections: FamilyMemberSelections,
): NativeRailCandidateSource {
  const sources = family[orientation];
  const selectedId = selections[family.id]?.[orientation];
  return sources.find((source) => source.id === selectedId) ?? sources[0];
}

export function RailLab({
  familyId,
  onFamilyId,
  header,
  zoomControl,
  zoom,
  onZoomChange,
}: {
  familyId?: string;
  onFamilyId?: (id: string) => void;
  header?: ReactNode;
  zoomControl?: ReactNode;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}): ReactElement {
  const [ownFamilyId, setOwnFamilyId] = useState(normalizeNativeRailFamilyId(familyId));
  const selectedFamilyId = familyId ? normalizeNativeRailFamilyId(familyId) : ownFamilyId;
  const family = RAIL_FAMILIES.find((entry) => entry.id === selectedFamilyId) ?? RAIL_FAMILIES[0];
  const [memberSelections, setMemberSelections] = useState<FamilyMemberSelections>({});
  const [boxWidth, setBoxWidth] = useState(480);
  const [boxHeight, setBoxHeight] = useState(280);
  const [seamTrim, setSeamTrim] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  if (!family || !family.horizontal.length || !family.vertical.length) {
    return <div className="tileset-empty-state">No complete native-size rail families have passed admission.</div>;
  }

  const horizontal = selectedMember(family, 'horizontal', memberSelections);
  const vertical = selectedMember(family, 'vertical', memberSelections);
  const maxSeamTrim = Math.min(
    Math.floor((horizontal.width - 1) / 2),
    Math.floor((vertical.height - 1) / 2),
    24,
  );

  const selectFamily = (id: string): void => {
    setSeamTrim(0);
    if (onFamilyId) onFamilyId(id);
    else setOwnFamilyId(id);
  };

  const cycleFamily = (delta: -1 | 1): void => {
    const currentIndex = RAIL_FAMILIES.findIndex((entry) => entry.id === family.id);
    const nextIndex = (Math.max(0, currentIndex) + delta + RAIL_FAMILIES.length) % RAIL_FAMILIES.length;
    selectFamily(RAIL_FAMILIES[nextIndex].id);
  };

  const selectFamilyMember = (orientation: NativeRailOrientation, id: string): void => {
    setSeamTrim(0);
    setMemberSelections((current) => ({
      ...current,
      [family.id]: {
        ...current[family.id],
        [orientation]: id,
      },
    }));
  };

  const resetView = (): void => {
    onZoomChange(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <>
      <ViewPane kind="board" ariaLabel="Rail family inspection preview" zoom={zoom} pan={pan} minZoom={0.25} maxZoom={2} onZoomChange={onZoomChange} onPanChange={setPan}>
        <div className="tileset-view-board-content is-board rail-lab-stage">
          <div className="rail-lab-stack" style={{ transform: 'translate(var(--view-pan-x, 0px), var(--view-pan-y, 0px)) scale(var(--view-zoom, 1))' }}>
            <ProofBlock title="Family in action" note="native 1:1 rails; corner atom seats intentionally empty">
              <RailFamilyCanvas horizontal={horizontal} vertical={vertical} boxWidth={boxWidth} boxHeight={boxHeight} seamTrim={seamTrim} />
            </ProofBlock>
            <ProofBlock title="Seam tuning" note={`${seamTrim}px removed from both ends before repeat`}>
              <SeamPreviewCanvas source={horizontal} seamTrim={seamTrim} />
            </ProofBlock>
            <div className="rail-lab-member-proofs">
              <ProofBlock title="Horizontal member" note={`${horizontal.width} x ${horizontal.height}px source at 100%`}>
                <NativeMemberCanvas source={horizontal} />
              </ProofBlock>
              <ProofBlock title="Vertical member" note={`${vertical.width} x ${vertical.height}px source at 100%`}>
                <NativeMemberCanvas source={vertical} />
              </ProofBlock>
            </div>
          </div>
        </div>
      </ViewPane>
      <aside className="tileset-view-controls rail-lab-controls" aria-label="Rail Lab controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <div className="tileset-category-select rail-lab-source-control">
              <span>Rail family</span>
              <div className="rail-lab-source-picker">
                <button type="button" className="tileset-view-action rail-lab-source-step" onClick={() => cycleFamily(-1)} aria-label="Previous rail family" title="Previous rail family">&lt;</button>
                <select value={family.id} onChange={(event) => selectFamily(event.target.value)} aria-label="Rail family">
                  {RAIL_FAMILIES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                </select>
                <button type="button" className="tileset-view-action rail-lab-source-step" onClick={() => cycleFamily(1)} aria-label="Next rail family" title="Next rail family">&gt;</button>
              </div>
            </div>
            {zoomControl}
            <RailMemberPicker label="Horizontal variant" orientation="horizontal" sources={family.horizontal} sourceId={horizontal.id} onSourceId={(id) => selectFamilyMember('horizontal', id)} />
            <RailMemberPicker label="Vertical variant" orientation="vertical" sources={family.vertical} sourceId={vertical.id} onSourceId={(id) => selectFamilyMember('vertical', id)} />
            <SliderRow label={<>Seam trim - {seamTrim}px each side</>} value={seamTrim} set={setSeamTrim} min={0} max={maxSeamTrim} nudge={1} step={1} dflt={0} />
            <SliderRow label={<>Box width - {boxWidth}px</>} value={boxWidth} set={setBoxWidth} min={160} max={1200} nudge={20} step={10} dflt={480} />
            <SliderRow label={<>Box height - {boxHeight}px</>} value={boxHeight} set={setBoxHeight} min={120} max={900} nudge={20} step={10} dflt={280} />
            <button type="button" className="tileset-view-action pages-reset" onClick={resetView}>Reset view</button>
            <dl className="al-meta">
              <div><dt>Family</dt><dd>{family.id}</dd></div>
              <div><dt>Role</dt><dd>{family.role}</dd></div>
              <div><dt>Fit</dt><dd>{family.fit}</dd></div>
              <div><dt>Native scale</dt><dd>100%</dd></div>
              <div><dt>Seam trim</dt><dd>{seamTrim}px each end</dd></div>
              <div><dt>Horizontal</dt><dd>{horizontal.sourceFile}</dd></div>
              <div><dt>Horizontal period</dt><dd>{horizontal.width}px</dd></div>
              <div><dt>Horizontal seam</dt><dd>{seamLabel(horizontal)}</dd></div>
              <div><dt>Vertical</dt><dd>{vertical.sourceFile}</dd></div>
              <div><dt>Vertical period</dt><dd>{vertical.height}px</dd></div>
              <div><dt>Vertical seam</dt><dd>{seamLabel(vertical)}</dd></div>
            </dl>
          </div>
        </section>
      </aside>
    </>
  );
}
