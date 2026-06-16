import { useEffect, useState, type CSSProperties } from 'react';
import { loadAssetCatalog, bakedCatalogFallback, type AssetCatalog, type AssetCatalogEntry } from '../render/assetCatalog';

// In-app asset catalog viewer (/design/catalog). Reads the DB-backed catalog
// (GET /api/design-assets) and renders each asset's live image + metadata, so we
// can review the assets and track which main-page elements still need work.
// Falls back to the baked catalog if the API is unavailable.

const STATUS_COLOR: Record<string, string> = {
  promoted: 'var(--ds-accepted)',
  accepted: 'var(--ds-accepted)',
  review: 'var(--ds-review)',
  'needs-review': 'var(--ds-review)',
  rejected: 'var(--ds-reject)',
};

// Transparency checkerboard so keyed-out PNG backgrounds read clearly.
const checker: CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #2a2a2a 25%, transparent 25%), linear-gradient(-45deg, #2a2a2a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2a2a 75%), linear-gradient(-45deg, transparent 75%, #2a2a2a 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
  backgroundColor: '#1a1a1a',
};

function StatusPill({ status }: { status: string | null }) {
  const color = (status && STATUS_COLOR[status]) || 'var(--ds-ink-3)';
  return (
    <span style={{ fontSize: 'var(--ds-text-xs)', color, border: `1px solid ${color}`, borderRadius: 'var(--ds-radius-pill)', padding: '1px 8px', textTransform: 'uppercase', letterSpacing: '.08em' }}>
      {status || 'unset'}
    </span>
  );
}

function slotSummary(slots: Record<string, unknown>): string {
  const keys = Object.keys(slots || {});
  if (!keys.length) return 'no slots';
  return keys
    .map((k) => {
      const v = slots[k] as Record<string, unknown> | undefined;
      if (v && typeof v === 'object' && 'w' in v && 'h' in v) return `${k} ${v.w}×${v.h}`;
      if (k === 'sheet' && v && 'width' in v) return `sheet ${(v as { width: number }).width}×${(v as { height: number }).height}`;
      return k;
    })
    .join(' · ');
}

function AssetCard({ entry }: { entry: AssetCatalogEntry }) {
  return (
    <div style={{ background: 'var(--ds-surface)', border: '1px solid var(--ds-line)', borderRadius: 'var(--ds-radius-md)', overflow: 'hidden' }}>
      <div style={{ ...checker, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140, padding: 12 }}>
        <img src={entry.image} alt={entry.id} style={{ maxWidth: '100%', maxHeight: 180, imageRendering: 'pixelated' }} />
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <code style={{ color: 'var(--ds-ink)', fontSize: 'var(--ds-text-sm)' }}>{entry.id}</code>
          <StatusPill status={entry.status} />
        </div>
        <div style={{ color: 'var(--ds-ink-3)', fontSize: 'var(--ds-text-xs)', marginTop: 6 }}>{slotSummary(entry.slots)}</div>
        <div style={{ color: 'var(--ds-ink-3)', fontSize: 'var(--ds-text-xs)', marginTop: 2 }}>rev {entry.revision}</div>
      </div>
    </div>
  );
}

export function CatalogViewer() {
  const [catalog, setCatalog] = useState<AssetCatalog | null>(null);
  const [source, setSource] = useState<'db' | 'baked' | 'loading'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const live = await loadAssetCatalog();
      if (cancelled) return;
      if (live && live.entries.length) { setCatalog(live); setSource('db'); return; }
      const baked = await bakedCatalogFallback();
      if (cancelled) return;
      setCatalog(baked); setSource('baked');
    })();
    return () => { cancelled = true; };
  }, []);

  const entries = catalog?.entries ?? [];
  return (
    <div data-testid="catalog-viewer" style={{ padding: '32px clamp(20px,6vw,80px)', color: 'var(--ds-ink-2)', fontFamily: 'var(--ds-font-sans)', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontFamily: 'var(--ds-font-serif)', color: 'var(--ds-ink)', margin: 0 }}>Asset Catalog</h1>
        <a href="/design" style={{ color: 'var(--ds-accent)', textDecoration: 'none' }}>← Design</a>
      </div>
      <p style={{ color: 'var(--ds-ink-3)', maxWidth: 640, fontSize: 'var(--ds-text-sm)' }}>
        DB-backed assets from <code>/api/design-assets</code> ({entries.length} asset{entries.length === 1 ? '' : 's'},
        {' '}source: <strong>{source === 'db' ? 'database' : source === 'baked' ? 'baked fallback' : '…'}</strong>).
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, marginTop: 16 }}>
        {entries.map((e) => <AssetCard key={e.id} entry={e} />)}
      </div>
    </div>
  );
}
