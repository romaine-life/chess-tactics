import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactElement,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  runCardArtPromptPlans,
  runCardPromptComposition,
  type RunCardArtPromptPlan,
} from '../run/cardArtPrompts';
import {
  fetchAdminLiveMediaCatalog,
  updateLiveMediaVersion,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { StudioCatalogCard } from './studio/StudioCatalogCard';

const ANCHOR_LABEL: Readonly<Record<string, string>> = Object.freeze({
  'jerusalem-second-temple-70-ce': 'After the Sanctuary · 70 CE',
  'dissolution-of-the-monasteries': 'Stone After Prayer · 1536–1541',
  'year-without-a-summer-1816': 'The Summer That Failed · 1816',
  'lijssenthoek-remy-farm-wwi': 'The Farm Behind the Line · 1914–1918',
});

interface PromptDraft {
  sceneDirection: string;
  unitIdentity: string;
  prompt: string;
}

function promptDraft(plan: RunCardArtPromptPlan): PromptDraft {
  return {
    sceneDirection: plan.sceneDirection,
    unitIdentity: plan.unitIdentity,
    prompt: plan.prompt,
  };
}

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  }
}

function usePromptCatalog(): {
  catalog: AdminLiveMediaCatalog | null;
  setCatalog: Dispatch<SetStateAction<AdminLiveMediaCatalog | null>>;
  plans: readonly RunCardArtPromptPlan[];
  error: string;
} {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void fetchAdminLiveMediaCatalog()
      .then((next) => { if (active) setCatalog(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);
  const plans = useMemo(() => catalog ? runCardArtPromptPlans(catalog) : [], [catalog]);
  return { catalog, setCatalog, plans, error };
}

export function RunCardPromptCatalog({
  search,
  selected,
  onOpen,
}: {
  search: string;
  selected?: string;
  onOpen: (id: string) => void;
}): ReactElement {
  const { plans, error } = usePromptCatalog();
  const query = search.trim().toLowerCase();
  const visible = plans.filter((plan) => !query || [
    plan.title,
    plan.id,
    runCardPromptComposition(plan),
    ANCHOR_LABEL[plan.historicalAnchor] ?? plan.historicalAnchor,
  ].join(' ').toLowerCase().includes(query));

  if (error) return <p className="tileset-studio-empty" role="alert">Card prompts unavailable: {error}</p>;
  if (!plans.length) return <p className="tileset-studio-empty" role="status">Loading the live prompt catalog…</p>;
  return (
    <div className="tileset-studio-grid pages-grid" aria-label="Run card art prompts">
      {visible.map((plan) => (
        <StudioCatalogCard
          key={plan.id}
          title={plan.title}
          badge={`${runCardPromptComposition(plan)} · ${plan.version.media ? `PixelLab ${plan.version.status}` : 'prompt ready'}`}
          selected={plan.id === selected}
          onSelect={() => onOpen(plan.id)}
          titleText={`Open ${plan.title} art prompt`}
          imageClassName="pages-card-image run-card-art-catalog-image"
          media={plan.version.media ? (
              <img
                src={plan.version.media.immutableUrl ?? plan.version.media.url}
                alt=""
                data-run-card-art-candidate={plan.id}
              />
            ) : <span>{plan.baseCost}</span>}
        />
      ))}
      {!visible.length ? <p className="tileset-studio-empty">No card prompt matches.</p> : null}
    </div>
  );
}

export function RunCardPromptViewer({
  cardId,
  onCardId,
  header,
}: {
  cardId?: string;
  onCardId: (id: string) => void;
  header?: ReactNode;
}): ReactElement {
  const { catalog, setCatalog, plans, error } = usePromptCatalog();
  const selected = plans.find((plan) => plan.id === cardId) ?? plans[0] ?? null;
  const [draft, setDraft] = useState<PromptDraft | null>(null);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selected) return;
    if (selected.id !== cardId) onCardId(selected.id);
    setDraft(promptDraft(selected));
    setStatus('');
  }, [cardId, onCardId, selected?.id, selected?.version.rowRevision]);

  const locked = Boolean(selected?.version.media);
  const dirty = Boolean(selected && draft && (
    draft.sceneDirection !== selected.sceneDirection
    || draft.unitIdentity !== selected.unitIdentity
    || draft.prompt !== selected.prompt
  ));

  const save = async (): Promise<void> => {
    if (!catalog || !selected || !draft || !dirty || locked || saving) return;
    setSaving(true);
    setStatus('Saving…');
    try {
      const promptSha256 = await sha256(draft.prompt.trim());
      const updated = await updateLiveMediaVersion({
        id: selected.version.id,
        expectedRevision: selected.version.rowRevision,
        provenance: {
          ...selected.version.provenance,
          sceneDirection: draft.sceneDirection.trim(),
          unitIdentity: draft.unitIdentity.trim(),
          prompt: draft.prompt.trim(),
          promptSha256,
        },
      });
      setCatalog((current) => current ? {
        ...current,
        versions: current.versions.map((version): AdminLiveMediaVersion => version.id === updated.id ? updated : version),
      } : current);
      setStatus(`Saved database revision ${updated.rowRevision}.`);
    } catch (reason) {
      const code = reason && typeof reason === 'object' && 'status' in reason ? Number(reason.status) : 0;
      setStatus(code === 409
        ? 'Save conflict: reload the live prompt before editing further.'
        : code === 403
          ? 'Admin access is required to revise prompt provenance.'
          : 'Save failed; the unsaved draft remains on screen.');
    } finally {
      setSaving(false);
    }
  };

  const copy = async (): Promise<void> => {
    if (!draft) return;
    const copied = await copyText(draft.prompt);
    setStatus(copied ? 'Exact prompt copied.' : 'Prompt copy failed.');
  };

  return (
    <>
      <section className="al-lab-main run-card-prompt-main" aria-label="Run card art prompt editor">
        {error ? <p role="alert">Card prompts unavailable: {error}</p> : null}
        {!error && !selected ? <p role="status">Loading the live prompt catalog…</p> : null}
        {selected && draft ? (
          <div className="run-card-prompt-editor">
            <header className="run-card-prompt-heading">
              <div>
                <p>{selected.baseCost} gold · Units · {runCardPromptComposition(selected)}</p>
                <h2>{selected.title}</h2>
              </div>
              <p>{ANCHOR_LABEL[selected.historicalAnchor] ?? selected.historicalAnchor}</p>
            </header>
            {selected.version.media ? (
              <img
                className="run-card-prompt-candidate"
                src={selected.version.media.immutableUrl ?? selected.version.media.url}
                alt={`${selected.title} PixelLab card illustration candidate`}
              />
            ) : null}
            <label className="run-card-prompt-field">
              <span>Scene direction</span>
              <textarea
                value={draft.sceneDirection}
                disabled={locked}
                onChange={(event) => setDraft({ ...draft, sceneDirection: event.target.value })}
              />
            </label>
            <label className="run-card-prompt-field">
              <span>Unit identity</span>
              <textarea
                value={draft.unitIdentity}
                disabled={locked}
                onChange={(event) => setDraft({ ...draft, unitIdentity: event.target.value })}
              />
            </label>
            <label className="run-card-prompt-field is-exact">
              <span>Exact generation prompt</span>
              <textarea
                value={draft.prompt}
                disabled={locked}
                onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
              />
            </label>
          </div>
        ) : null}
      </section>

      <aside className="tileset-view-controls" aria-label="Card prompt controls">
        <section className="tileset-inspector-section">
          <h2>Card Prompts</h2>
          <div className="tileset-control-stack">
            {header}
            <label className="tileset-category-select">
              <span>Card</span>
              <select
                value={selected?.id ?? ''}
                onChange={(event) => onCardId(event.target.value)}
                aria-label="Card prompt"
              >
                {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.baseCost} · {plan.title}</option>)}
              </select>
            </label>
            <p className="run-card-prototype-note">Live PixelLab provenance. Generated candidates lock their exact prompt.</p>
            <button type="button" className="tileset-view-action" disabled={!draft} onClick={() => { void copy(); }}>Copy exact prompt</button>
            <button type="button" className="tileset-view-action" disabled={!dirty || locked || saving} onClick={() => { void save(); }}>
              {saving ? 'Saving…' : 'Save prompt revision'}
            </button>
            <button
              type="button"
              className="tileset-view-action"
              disabled={!dirty || !selected}
              onClick={() => { if (selected) setDraft(promptDraft(selected)); setStatus('Draft reset to the live database.'); }}
            >Reset draft</button>
            {selected ? (
              <dl className="run-card-prototype-source-readout">
                <div><dt>State</dt><dd>{selected.version.media ? selected.version.status : 'prompt ready'}</dd></div>
                <div><dt>Prompt</dt><dd>{selected.promptSha256.slice(0, 12)}</dd></div>
                <div><dt>PixelLab</dt><dd>{selected.pixelLabJobId.slice(0, 12)}</dd></div>
                <div><dt>Revision</dt><dd>{selected.version.rowRevision}</dd></div>
              </dl>
            ) : null}
            {status ? <p role="status">{status}</p> : null}
          </div>
        </section>
      </aside>
    </>
  );
}
