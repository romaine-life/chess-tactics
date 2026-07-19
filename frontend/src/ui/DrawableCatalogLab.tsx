import { useEffect, useState, type ReactElement } from 'react';
import { fetchAdminDrawableCatalog, saveDrawableAsset, type AdminDrawableAsset } from '../net/drawableCatalogAdmin';

const emptyDraft = { id: '', kind: 'subterrain', label: '', role: 'surface', slot: '', sortOrder: 0 };

export function DrawableCatalogLab(): ReactElement {
  const [assets, setAssets] = useState<AdminDrawableAsset[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [batch, setBatch] = useState('');

  const refresh = async (): Promise<void> => {
    try {
      const catalog = await fetchAdminDrawableCatalog();
      setAssets(catalog.assets);
      setState('ready');
      setMessage('');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => { void refresh(); }, []);

  const save = async (): Promise<void> => {
    const current = assets.find((asset) => asset.id === draft.id);
    setState('saving');
    try {
      await saveDrawableAsset({
        id: draft.id.trim(),
        kind: draft.kind.trim(),
        label: draft.label.trim(),
        sortOrder: draft.sortOrder,
        lifecycleState: 'active',
        behavior: {},
        metadata: {},
        media: { [draft.role.trim()]: draft.slot.trim() },
        expectedRevision: current?.rowRevision ?? 0,
      });
      setDraft(emptyDraft);
      await refresh();
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const saveBatch = async (): Promise<void> => {
    setState('saving');
    try {
      const records = JSON.parse(batch) as Array<Omit<Parameters<typeof saveDrawableAsset>[0], 'expectedRevision'>>;
      if (!Array.isArray(records) || records.length === 0) throw new Error('Batch must be a non-empty JSON array.');
      for (const record of records) {
        const current = assets.find((asset) => asset.id === record.id);
        await saveDrawableAsset({ ...record, expectedRevision: current?.rowRevision ?? 0 });
      }
      setBatch('');
      await refresh();
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <main className="settings-page" data-testid="drawable-catalog-lab">
      <section className="skirmish-card" style={{ maxWidth: 900, margin: '32px auto', padding: 24 }}>
        <h1>Drawable Catalog</h1>
        <p>Installed content records. Every media role references an existing live semantic slot.</p>
        {state === 'error' ? <p role="alert">{message}</p> : null}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label>ID<input data-testid="drawable-id" value={draft.id} onChange={(event) => setDraft((current) => ({ ...current, id: event.target.value }))} /></label>
          <label>Kind<input data-testid="drawable-kind" value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value }))} /></label>
          <label>Label<input data-testid="drawable-label" value={draft.label} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} /></label>
          <label>Sort order<input data-testid="drawable-order" type="number" value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: Number(event.target.value) }))} /></label>
          <label>Media role<input data-testid="drawable-role" value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))} /></label>
          <label>Semantic slot<input data-testid="drawable-slot" value={draft.slot} onChange={(event) => setDraft((current) => ({ ...current, slot: event.target.value }))} /></label>
        </div>
        <button data-testid="drawable-save" type="button" disabled={state === 'saving' || !draft.id || !draft.label || !draft.slot} onClick={() => void save()}>
          {state === 'saving' ? 'Saving…' : 'Save drawable'}
        </button>
        <h2>Bulk edit</h2>
        <p>Paste a JSON array of complete drawable records. Existing IDs use their current database revision automatically.</p>
        <textarea data-testid="drawable-batch" rows={10} value={batch} onChange={(event) => setBatch(event.target.value)} style={{ width: '100%', fontFamily: 'monospace' }} />
        <button data-testid="drawable-batch-save" type="button" disabled={state === 'saving' || !batch.trim()} onClick={() => void saveBatch()}>
          {state === 'saving' ? 'Saving…' : 'Save batch'}
        </button>
        <h2>Installed</h2>
        <ul data-testid="drawable-list">
          {assets.map((asset) => <li key={asset.id}><strong>{asset.label}</strong> · {asset.kind} · {asset.id}</li>)}
        </ul>
      </section>
    </main>
  );
}
