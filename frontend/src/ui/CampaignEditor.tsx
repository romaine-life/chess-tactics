import { useEffect, useState, type CSSProperties } from 'react';
import { useCampaigns } from '../campaign/store';
import type { ObjectiveType } from '../core/level';
import { loadWorkspace, saveWorkspace } from '../net/campaignWorkspace';
import { fetchMe, goSignIn, isUnauthorized, signInHref, type AuthUser } from '../net/auth';

const OBJECTIVES: ObjectiveType[] = ['capture-all', 'capture-king', 'survive', 'reach'];
const DIFFICULTIES = ['easy', 'normal', 'hard'];

const panel: CSSProperties = { background: 'var(--ds-surface)', border: '1px solid var(--ds-line)', borderRadius: 'var(--ds-radius-md)', padding: '12px 14px' };
const eyebrow: CSSProperties = { fontSize: 'var(--ds-text-xs)', letterSpacing: '.08em', color: 'var(--ds-ink-3)', textTransform: 'uppercase', marginBottom: 8 };
const btn: CSSProperties = { border: '1px solid var(--ds-line-2)', background: 'var(--ds-accent-soft)', color: 'var(--ds-ink)', borderRadius: 'var(--ds-radius-sm)', padding: '6px 10px', cursor: 'pointer', fontSize: 'var(--ds-text-sm)' };
const field: CSSProperties = { width: '100%', background: 'var(--ds-canvas)', color: 'var(--ds-ink)', border: '1px solid var(--ds-line-2)', borderRadius: 'var(--ds-radius-sm)', padding: '6px 8px', marginTop: 4 };
function rowStyle(active: boolean): CSSProperties {
  return { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 'var(--ds-radius-sm)', cursor: 'pointer', border: `1px solid ${active ? 'var(--ds-accent)' : 'transparent'}`, background: active ? 'var(--ds-accent-soft)' : 'transparent' };
}

export function CampaignEditor() {
  const campaigns = useCampaigns((s) => s.campaigns);
  const levels = useCampaigns((s) => s.levels);
  const selectedCampaignId = useCampaigns((s) => s.selectedCampaignId);
  const selectedLevelId = useCampaigns((s) => s.selectedLevelId);
  const [status, setStatus] = useState('');
  const [me, setMe] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;
    fetchMe().then((user) => { if (active) setMe(user); });
    loadWorkspace()
      .then((ws) => { if (ws.campaigns.length) useCampaigns.getState().hydrate(ws); })
      .catch((e) => { if (isUnauthorized(e)) setStatus('Sign in to load and save your campaigns.'); });
    return () => { active = false; };
  }, []);

  const saveWorkspaceNow = async () => {
    try {
      await saveWorkspace({ campaigns: useCampaigns.getState().campaigns, levels: useCampaigns.getState().levels });
      setStatus('Saved to server');
    } catch (e) {
      if (isUnauthorized(e)) { goSignIn(); return; }
      setStatus(`Save failed: ${(e as Error).message}`);
    }
  };

  const camp = campaigns.find((c) => c.id === selectedCampaignId) ?? null;
  const orderedLevels = camp ? camp.levels.slice().sort((a, b) => a.ordinal - b.ordinal) : [];
  const levelDoc = selectedLevelId ? levels[selectedLevelId] : null;
  const levelRef = camp && selectedLevelId ? camp.levels.find((r) => r.levelId === selectedLevelId) : null;

  return (
    <div data-testid="campaign-editor" style={{ display: 'flex', gap: 14, padding: 14, alignItems: 'flex-start', position: 'relative', zIndex: 5, pointerEvents: 'auto', color: 'var(--ds-ink-2)', fontFamily: 'var(--ds-font-sans)' }}>
      {/* campaigns */}
      <div style={{ ...panel, width: 230 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={eyebrow}>Campaigns</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button type="button" data-testid="save-workspace" style={btn} onClick={saveWorkspaceNow}>Save</button>
            <button type="button" data-testid="new-campaign" style={btn} onClick={() => useCampaigns.getState().newCampaign()}>+ New</button>
          </span>
        </div>
        {status ? <div data-testid="workspace-status" style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-ink-3)', marginTop: 6 }}>{status}</div> : null}
        {me && !me.signed_in ? (
          <a href={signInHref()} data-testid="campaign-sign-in" style={{ ...btn, display: 'inline-block', marginTop: 6, textDecoration: 'none' }}>Sign in to save</a>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          {campaigns.length === 0 && <span style={{ color: 'var(--ds-ink-3)', fontSize: 'var(--ds-text-sm)' }}>No campaigns yet.</span>}
          {campaigns.map((c) => (
            <div key={c.id} style={rowStyle(c.id === selectedCampaignId)} onClick={() => useCampaigns.getState().selectCampaign(c.id)}>
              <span style={{ color: 'var(--ds-ink)' }}>{c.name}</span>
              <span style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-ink-3)' }}>{c.levels.length} lv</span>
            </div>
          ))}
        </div>
      </div>

      {/* campaign details + levels */}
      <div style={{ ...panel, width: 300 }}>
        {camp ? (
          <>
            <div style={eyebrow}>Campaign</div>
            <input style={field} value={camp.name} data-testid="campaign-name" onChange={(e) => useCampaigns.getState().renameCampaign(camp.id, e.target.value)} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 6px' }}>
              <span style={eyebrow}>Levels</span>
              <button type="button" data-testid="add-level" style={btn} onClick={() => useCampaigns.getState().addLevel()}>+ Add level</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {orderedLevels.map((r, i) => (
                <div key={r.levelId} style={rowStyle(r.levelId === selectedLevelId)} onClick={() => useCampaigns.getState().selectLevel(r.levelId)}>
                  <span style={{ color: 'var(--ds-ink)' }}>{i + 1}. {levels[r.levelId]?.name ?? r.levelId}</span>
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button type="button" style={btn} onClick={(e) => { e.stopPropagation(); useCampaigns.getState().moveLevel(r.levelId, -1); }}>↑</button>
                    <button type="button" style={btn} onClick={(e) => { e.stopPropagation(); useCampaigns.getState().moveLevel(r.levelId, 1); }}>↓</button>
                    <button type="button" style={btn} onClick={(e) => { e.stopPropagation(); useCampaigns.getState().deleteLevel(r.levelId); }}>✕</button>
                  </span>
                </div>
              ))}
              {orderedLevels.length === 0 && <span style={{ color: 'var(--ds-ink-3)', fontSize: 'var(--ds-text-sm)' }}>No levels — add one.</span>}
            </div>
            <button type="button" style={{ ...btn, marginTop: 12, borderColor: 'var(--ds-reject)' }} onClick={() => useCampaigns.getState().deleteCampaign(camp.id)}>Delete campaign</button>
          </>
        ) : (
          <span style={{ color: 'var(--ds-ink-3)', fontSize: 'var(--ds-text-sm)' }}>Select or create a campaign.</span>
        )}
      </div>

      {/* selected level settings */}
      <div style={{ ...panel, width: 240 }}>
        <div style={eyebrow}>Level settings</div>
        {levelDoc && levelRef ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 'var(--ds-text-sm)' }}>
            <label>Objective
              <select style={field} data-testid="level-objective" value={levelRef.objective ?? levelDoc.objective} onChange={(e) => useCampaigns.getState().setLevelObjective(levelDoc.id, e.target.value as ObjectiveType)}>
                {OBJECTIVES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label>Difficulty
              <select style={field} value={levelDoc.difficulty} onChange={(e) => useCampaigns.getState().setLevelDifficulty(levelDoc.id, e.target.value)}>
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label>Starting funds
              <input type="number" style={field} value={levelDoc.economy.startingFunds} onChange={(e) => useCampaigns.getState().setLevelEconomy(levelDoc.id, Number(e.target.value), levelDoc.economy.incomePerTurn)} />
            </label>
            <label>Income / turn
              <input type="number" style={field} value={levelDoc.economy.incomePerTurn} onChange={(e) => useCampaigns.getState().setLevelEconomy(levelDoc.id, levelDoc.economy.startingFunds, Number(e.target.value))} />
            </label>
            <a href="/edit" style={{ ...btn, textAlign: 'center', textDecoration: 'none', marginTop: 4 }}>Open board editor →</a>
          </div>
        ) : (
          <span style={{ color: 'var(--ds-ink-3)', fontSize: 'var(--ds-text-sm)' }}>Select a level.</span>
        )}
      </div>
    </div>
  );
}
