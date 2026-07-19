// The Studio's Assets catalog. Media membership, active pointers, dimensions,
// status, and runtime metadata come from one hydrated backend catalog snapshot.
// Git contributes only taxonomy and editable nine-slice/structure geometry.
import { type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { structureArtAsset } from '../../core/structureArt';
import { nineSliceCatalogAssets } from '../nineSliceCatalog';
import {
  mediaDimensions,
  studioProductionLabel,
  type StudioAssetLibrary,
  type StudioAssetRecord,
} from './studioLiveMediaLibrary';

export type AssetTypeFacet = 'all' | 'settings' | 'game' | 'shields' | 'frames' | 'structure';
export type AssetStatusFacet = 'all' | 'accepted' | 'bridge';
export interface AssetFilters { type: AssetTypeFacet; status: AssetStatusFacet }

export const ASSET_TYPE_FACETS: { value: AssetTypeFacet; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'settings', label: 'Settings' },
  { value: 'game', label: 'Skirmish' },
  { value: 'shields', label: 'Campaign' },
  { value: 'frames', label: 'Chrome' },
  { value: 'structure', label: 'Structure Art' },
];

function editorAssetForSlot(slot: string): string | undefined {
  return nineSliceCatalogAssets().find((asset) => asset.kind === 'frame'
    && Object.values(asset.record.media).some((binding) => binding.slot === slot))?.id;
}

function runtimeSummary(item: StudioAssetRecord): string[] {
  return ['component', 'variant', 'state', 'nativeRole']
    .map((key) => item.runtime[key])
    .filter((value): value is string => typeof value === 'string' && !!value.trim());
}

function Card({ item, sub, selected, onSelect }: {
  item: StudioAssetRecord;
  sub: string;
  selected: boolean;
  onSelect: (id: string) => void;
}): ReactElement {
  return (
    <button
      type="button"
      className={`tileset-studio-card is-asset ${selected ? 'is-selected' : ''}`}
      onClick={() => onSelect(item.id)}
      aria-pressed={selected}
      title={`Select ${item.label}`}
    >
      <span className="tileset-studio-card-image asset-card-image"><img src={item.immutableUrl} alt="" draggable={false} /></span>
      <span className="tileset-studio-card-meta">
        <span className="tileset-studio-card-text"><strong>{item.label}</strong><em>{sub}</em></span>
        <span className="asset-card-chips">
          <span className={`asset-prov ${item.productionEligible ? 'is-forged' : 'is-original'}`}>{studioProductionLabel(item.productionStatus)}</span>
        </span>
      </span>
    </button>
  );
}

interface AssetSectionItem { item: StudioAssetRecord; sub: string }
interface AssetSection { key: string; label: string; items: AssetSectionItem[] }

function itemSub(item: StudioAssetRecord, prefix?: string): string {
  const runtime = runtimeSummary(item);
  return [prefix, ...runtime, mediaDimensions(item)].filter(Boolean).join(' · ');
}

function buildSections(items: StudioAssetRecord[]): AssetSection[] {
  const simpleGroups: { type: StudioAssetRecord['type']; key: string; label: string }[] = [
    { type: 'settings', key: 'settings', label: 'Settings' },
    { type: 'game', key: 'game', label: 'Skirmish' },
    { type: 'shields', key: 'shields', label: 'Campaign' },
  ];
  const sections = simpleGroups.map((group) => ({
    key: group.key,
    label: group.label,
    items: items.filter((item) => item.type === group.type).map((item) => ({ item, sub: itemSub(item) })),
  }));

  const frameItems = items.filter((item) => item.type === 'frames');
  const claimed = new Set<string>();
  for (const asset of nineSliceCatalogAssets()) {
    const variants = Object.entries(asset.record.media).flatMap(([role, binding]) => {
      const slot = binding.slot;
      const item = frameItems.find((candidate) => candidate.primary.slot === slot);
      if (!item) return [];
      claimed.add(item.id);
      return [{ item, sub: itemSub(item, role === 'target' ? 'default' : role) }];
    });
    if (variants.length) sections.push({ key: `frame-${asset.id}`, label: asset.label, items: variants });
  }
  const otherFrames = frameItems
    .filter((item) => !claimed.has(item.id))
    .map((item) => ({ item, sub: itemSub(item, item.name.includes('/') ? item.name.split('/').slice(0, -1).join(' / ') : 'chrome') }));
  if (otherFrames.length) sections.push({ key: 'frame-other', label: 'Other Chrome', items: otherFrames });

  const structures = items.filter((item) => item.type === 'structure').map((item) => {
    const geometry = item.structureId ? structureArtAsset(item.structureId) : undefined;
    return { item, sub: itemSub(item, geometry?.kind ?? 'structure') };
  });
  if (structures.length) sections.push({ key: 'structure-art', label: 'Structure Art', items: structures });
  return sections.filter((section) => section.items.length);
}

export function AssetLibraryStudio({ library, filters, search, zoom, selected, onSelect }: {
  library: StudioAssetLibrary;
  filters: AssetFilters;
  search: string;
  zoom: number;
  selected: string;
  onSelect: (id: string) => void;
}): ReactElement {
  const query = search.trim().toLowerCase();
  const visible = library.items.filter((item) => {
    if (filters.type !== 'all' && item.type !== filters.type) return false;
    if (filters.status === 'accepted' && !item.productionEligible) return false;
    if (filters.status === 'bridge' && item.productionEligible) return false;
    if (!query) return true;
    return [item.id, item.name, item.label, item.primary.slot, ...runtimeSummary(item)]
      .join(' ').toLowerCase().includes(query);
  });
  const sections = buildSections(visible);

  return (
    <section className="tileset-studio-main is-headless">
      <section className="tileset-studio-tab-panel">
        <div className="tileset-asset-sections" style={{ '--tile-zoom': zoom } as CSSProperties}>
          {sections.map((section) => (
            <section className="tileset-asset-section" aria-label={section.label} key={section.key}>
              <h3>{section.label}</h3>
              <div className="tileset-studio-grid">
                {section.items.map(({ item, sub }) => (
                  <Card key={item.id} item={item} sub={sub} selected={selected === item.id} onSelect={onSelect} />
                ))}
              </div>
            </section>
          ))}
          {!sections.length ? <p className="tileset-catalog-note">No assets match these filters.</p> : null}
        </div>
      </section>
    </section>
  );
}

function findAsset(library: StudioAssetLibrary, id: string): StudioAssetRecord | null {
  return library.items.find((item) => item.id === id)
    ?? library.items.find((item) => item.name === id)
    ?? null;
}

function runtimeValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function runtimeSlice(item: StudioAssetRecord): { top: number; right: number; bottom: number; left: number } | null {
  const value = item.runtime.slice;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const slice = value as Record<string, unknown>;
  if (!['top', 'right', 'bottom', 'left'].every((key) => Number.isInteger(slice[key]) && Number(slice[key]) >= 0)) return null;
  return { top: Number(slice.top), right: Number(slice.right), bottom: Number(slice.bottom), left: Number(slice.left) };
}

function dividerAssetIdForItem(item: StudioAssetRecord): string | undefined {
  const slots = new Set(item.slots.map((slot) => slot.slot));
  return nineSliceCatalogAssets().find((asset) => (
    asset.kind === 'bar'
    && Object.values(asset.record.media).some((binding) => slots.has(binding.slot))
  ))?.id;
}

export function AssetLab({ library, name, header, onEditFrame, onOpenDivider }: {
  library: StudioAssetLibrary;
  name: string;
  header?: ReactNode;
  onEditFrame?: (editorAssetId: string) => void;
  onOpenDivider?: (dividerAssetId: string) => void;
}): ReactElement {
  const item = name ? findAsset(library, name) : null;
  const geometry = item?.structureId ? structureArtAsset(item.structureId) : undefined;
  const editableFrameId = item ? editorAssetForSlot(item.primary.slot) : undefined;
  const dividerAssetId = item ? dividerAssetIdForItem(item) : undefined;
  const slice = item ? runtimeSlice(item) : null;
  const fallbackSlice = item ? Math.max(2, Math.floor(Math.min(item.width ?? 1, item.height ?? 1) / 3)) : 2;
  const sliceCss = slice ? `${slice.top} ${slice.right} ${slice.bottom} ${slice.left} fill` : `${fallbackSlice} fill`;
  return (
    <>
      <section className="al-lab-main" aria-label="Asset preview">
        {!item ? (
          <p className="al-lab-empty">No asset selected — pick a card in the Assets catalog.</p>
        ) : (
          <div className="al-lab-stages">
            {item.kind === 'glyph' ? (
              <>
                <figure className="al-stage"><span className="al-checker"><img src={item.immutableUrl} alt={item.label} className="al-glyph-lg" /></span><figcaption>default · transparency</figcaption></figure>
                <figure className="al-stage"><span className="al-in-button"><img src={item.immutableUrl} alt="" className="al-glyph-md" /></span><figcaption>in a button</figcaption></figure>
                <figure className="al-stage"><span className="al-on-panel"><img src={item.immutableUrl} alt="" className="al-glyph-md" /></span><figcaption>on a panel</figcaption></figure>
              </>
            ) : item.kind === 'structure' ? (
              <>
                {item.back ? <figure className="al-stage"><span className="al-checker"><img src={item.back.media.immutableUrl} alt="" className="al-frame-native" /></span><figcaption>back half</figcaption></figure> : null}
                {item.front ? <figure className="al-stage"><span className="al-checker"><img src={item.front.media.immutableUrl} alt={item.label} className="al-frame-native" /></span><figcaption>front half</figcaption></figure> : null}
              </>
            ) : (
              <>
                <figure className="al-stage"><span className="al-checker"><img src={item.immutableUrl} alt={item.label} className="al-frame-native" /></span><figcaption>native</figcaption></figure>
                <figure className="al-stage"><span className="al-frame-stretch" style={{ borderImageSource: `url(${item.immutableUrl})`, borderImageSlice: sliceCss, borderImageWidth: `${Math.max(8, fallbackSlice)}px` }} /><figcaption>stretched (9-slice)</figcaption></figure>
              </>
            )}
          </div>
        )}
      </section>
      <aside className="tileset-view-controls" aria-label="Asset details">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            {editableFrameId && onEditFrame ? (
              <button
                type="button"
                onClick={() => onEditFrame(editableFrameId)}
                style={{ display: 'block', width: '100%', padding: '9px 12px', textAlign: 'center', background: '#1d5f9e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
              >✎ Edit in 9-slice editor</button>
            ) : dividerAssetId && onOpenDivider ? (
              // A divider is a junction, not a box — it only reads assembled. Its interactive,
              // inspectable home is the divider Viewer (DividerLab), not this read-only card (ADR-0063).
              <button
                type="button"
                onClick={() => onOpenDivider(dividerAssetId)}
                style={{ display: 'block', width: '100%', padding: '9px 12px', textAlign: 'center', background: '#6b4f1d', color: '#fff2c4', border: '1px solid #d5a34a', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
              >◫ Open divider viewer</button>
            ) : item?.kind === 'frame' ? (
              <div style={{ padding: '9px 12px', textAlign: 'center', background: '#3a1c22', color: '#ff9aa8', border: '1px solid #7a2a36', borderRadius: 4, fontWeight: 700, fontSize: 12 }}>
                ⚠ No editable four-corner geometry registered
              </div>
            ) : null}
            {item ? (
              <dl className="al-meta">
                <div><dt>Type</dt><dd>{item.kind}{geometry ? ` · ${geometry.kind}` : ''}</dd></div>
                <div><dt>Size</dt><dd>{mediaDimensions(item)}</dd></div>
                <div><dt>Slot</dt><dd>{item.slots.map((slot) => slot.slot).join(' · ')}</dd></div>
                <div><dt>Active URL</dt><dd>{item.slots.map((slot) => slot.media.immutableUrl).join(' · ')}</dd></div>
                <div><dt>Status</dt><dd className={item.productionEligible ? 'al-ok' : ''}>{studioProductionLabel(item.productionStatus)}</dd></div>
                <div><dt>Production</dt><dd>{item.productionEligible ? 'eligible' : 'bridge only'}</dd></div>
                <div><dt>Revision</dt><dd>{item.slots.map((slot) => slot.rowRevision).join(' · ')}</dd></div>
                <div><dt>SHA-256</dt><dd>{item.slots.map((slot) => slot.media.sha256).join(' · ')}</dd></div>
                {geometry ? <div><dt>Terrain</dt><dd>{geometry.terrains.join(', ') || 'none'}</dd></div> : null}
                {Object.entries(item.runtime).map(([key, value]) => (
                  <div key={key}><dt>{key}</dt><dd>{runtimeValue(value)}</dd></div>
                ))}
              </dl>
            ) : (
              <p className="tileset-catalog-note">No asset selected — pick a card in the Assets catalog.</p>
            )}
          </div>
        </section>
      </aside>
    </>
  );
}
