import { useEffect, useMemo, useRef, useState } from 'react';
import { ensureCampaignsHydrated } from '../campaign/hydrate';
import { useCampaigns } from '../campaign/store';
import type { Level } from '../core/level';
import { fetchMe, goSignIn, isUnauthorized, type AuthUser } from '../net/auth';
import {
  createLobby,
  fetchLobbies,
  joinLobby,
  leaveLobby,
  setLobbyLevel,
  startLobby,
  subscribeLobbies,
  type Lobby,
  type LobbyList,
  type LobbyUser,
} from '../net/lobbies';
import { LevelThumbnail } from '../render/LevelThumbnail';
import { HomepageBackdrop } from './HomepageBackdrop';
import { levelObjectiveLine } from './LevelInfoCompact';
import { navigateApp } from './navigation';
import { ArtRouteChrome } from './shell/ArtRouteChrome';

function displayName(user: LobbyUser | null, fallback: string): string {
  return user?.name || user?.email || fallback;
}

function LobbySeat({ user, label }: { user: LobbyUser | null; label: string }) {
  const name = displayName(user, 'Open seat');
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className={`utility-seat ${user ? '' : 'is-empty'}`.trim()}>
      {user?.avatar_url ? <img className="utility-avatar" src={user.avatar_url} alt="" /> : <span className="utility-avatar" aria-hidden="true">{initial}</span>}
      <span>{name}</span>
      <small>{label}</small>
    </div>
  );
}

// The official tier only (ADR / spec): campaigns tagged origin==='official' → their
// level refs → the resolved Level docs. Sourced directly from useCampaigns (NOT
// skirmishMaps, which excludes campaign levels). Order-preserving (campaign order,
// then each campaign's own level order) and skips any ref whose level failed to
// resolve, so a missing id never crashes the picker.
function useOfficialLevels(): { levels: Level[]; loading: boolean } {
  const campaigns = useCampaigns((s) => s.campaigns);
  const levelsById = useCampaigns((s) => s.levels);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    ensureCampaignsHydrated()
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const levels = useMemo(() => {
    const out: Level[] = [];
    const seen = new Set<string>();
    for (const campaign of campaigns) {
      if (campaign.origin !== 'official') continue;
      for (const ref of campaign.levels.slice().sort((a, b) => a.ordinal - b.ordinal)) {
        const level = levelsById[ref.levelId];
        if (level && !seen.has(level.id)) { seen.add(level.id); out.push(level); }
      }
    }
    return out;
  }, [campaigns, levelsById]);

  return { levels, loading };
}

function LevelPicker({ current, selectedId, onPick }: { current: Lobby; selectedId: string | null; onPick: (levelId: string) => void }) {
  const { levels, loading } = useOfficialLevels();
  return (
    <section className="utility-level-picker" aria-label="Choose a level">
      <span className="utility-level-picker-head">{current.level_id ? 'Change level' : 'Choose a level'}</span>
      {loading ? (
        <span className="utility-empty-row">Loading levels.</span>
      ) : levels.length === 0 ? (
        <span className="utility-empty-row">No levels available.</span>
      ) : (
        <div className="utility-level-grid">
          {levels.map((level) => (
            <button
              key={level.id}
              type="button"
              className={`utility-level-card ${selectedId === level.id ? 'is-selected' : ''}`.trim()}
              aria-pressed={selectedId === level.id}
              onClick={() => onPick(level.id)}
            >
              <span className="utility-level-thumb" aria-hidden="true">
                <LevelThumbnail level={level} width={180} height={100} />
              </span>
              <strong>{level.name}</strong>
              <small>{levelObjectiveLine(level)}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// Multiplayer lobby browser (ported from legacy app.js). Talks to the in-memory
// /api/lobbies endpoints via net/lobbies; sign-in gated like the editors. Wears the
// shared standard title bar (ADR-0004/0023) as a settings-twin: full-bleed bar +
// BrandLockup + account cluster over the menu backdrop, with the lobby list below.
//
// Live: a subscribeLobbies SSE stream re-runs refresh() on any lobby mutation, so
// the host sees the guest join without hitting Refresh (the manual button stays too).
export function Lobbies({ embedded = false }: { embedded?: boolean } = {}) {
  const [me, setMe] = useState<AuthUser | null>(null);
  const [data, setData] = useState<LobbyList | null>(null);
  const [status, setStatus] = useState('');

  // Latest lobby data, read inside stable callbacks (SSE handler) without re-subscribing.
  const dataRef = useRef<LobbyList | null>(null);
  dataRef.current = data;
  // Guard so the guest auto-launch fires exactly once even as refresh() re-runs.
  const launchedRef = useRef(false);

  useEffect(() => {
    if (embedded) return; // the persistent menu shell (MainMenu) owns the shell host class + backdrop
    const shell = document.querySelector('.shell');
    shell?.classList.add('settings-art-active');
    return () => shell?.classList.remove('settings-art-active');
  }, [embedded]);

  const refresh = async () => {
    try { setData(await fetchLobbies()); setStatus(''); }
    catch (e) { if (isUnauthorized(e)) setData(null); else setStatus(`Error: ${(e as Error).message}`); }
  };

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;
    fetchMe().then((u) => {
      if (!active) return;
      setMe(u);
      if (u.signed_in) {
        refresh();
        // Live list: refetch on every server-side lobby mutation (create/join/leave/
        // start/level) and on every (re)connect. THIS is the fix for "host doesn't see
        // the guest join".
        unsubscribe = subscribeLobbies(refresh);
        // The subscription is created AFTER an async round-trip, so the effect's cleanup
        // may already have run (fast unmount/remount, StrictMode). If so, close it now —
        // otherwise the cleanup closed over a still-null ref and the stream would leak.
        if (!active) { unsubscribe(); unsubscribe = null; }
      }
    });
    return () => { active = false; unsubscribe?.(); };
  }, []);

  // Guest auto-launch: once the host starts, the current lobby flips to phase
  // 'started'; the guest jumps to the board. Guarded to fire only once.
  useEffect(() => {
    const current = data?.current;
    if (!current || launchedRef.current) return;
    if (current.phase === 'started' && current.viewer_role === 'guest') {
      launchedRef.current = true;
      navigateApp(`/play?lobby=${encodeURIComponent(current.id)}`, { replace: true });
    }
  }, [data]);

  const act = (fn: () => Promise<unknown>) => async () => {
    try { await fn(); await refresh(); }
    catch (e) { if (isUnauthorized(e)) { goSignIn(); return; } setStatus(`Error: ${(e as Error).message}`); }
  };

  const pickLevel = (levelId: string) => act(async () => {
    const id = dataRef.current?.current?.id;
    if (id) await setLobbyLevel(id, levelId);
  })();

  const startHere = act(async () => {
    const id = dataRef.current?.current?.id;
    if (!id) return;
    await startLobby(id);
    navigateApp(`/play?lobby=${encodeURIComponent(id)}`, { replace: true });
  });

  const current = data?.current ?? null;
  const isHost = current?.viewer_role === 'host';
  const canStart = Boolean(isHost && current?.guest && current?.level_id);
  const chosenLevel = useCampaigns((s) => (current?.level_id ? s.levels[current.level_id] : undefined));

  // The lobbies content — one utility column (host/join + the lobby list, or a sign-in prompt).
  const content = me && !me.signed_in ? (
            <section className="utility-panel utility-empty-panel">
              <button type="button" data-testid="lobbies-sign-in" className="utility-button utility-button-primary" onClick={() => goSignIn()}>Sign in to host or join</button>
            </section>
          ) : (
            <div className="utility-stack">
              <div className="utility-toolbar">
                <button type="button" data-testid="host-lobby" className="utility-button utility-button-primary" onClick={act(() => createLobby())}>
                  <span className="utility-button-icon icon-players" aria-hidden="true" />
                  Host a lobby
                </button>
                <button type="button" className="utility-button utility-button-neutral" onClick={refresh}>
                  <span className="utility-button-icon icon-refresh" aria-hidden="true" />
                  Refresh
                </button>
              </div>
              {status ? <div className="utility-status">{status}</div> : null}
              {current ? (
                <section className="utility-lobby-card is-current">
                  <div className="utility-lobby-main">
                    <span className="utility-row-icon icon-players" aria-hidden="true" />
                    <div className="utility-lobby-copy">
                      <strong>{current.name}</strong>
                      <span>
                        {current.phase} / {current.seats.filled}/{current.seats.total}
                        {chosenLevel ? ` · ${chosenLevel.name}` : ''}
                      </span>
                      {chosenLevel ? <span>{levelObjectiveLine(chosenLevel)}</span> : null}
                    </div>
                  </div>
                  <div className="utility-lobby-seats">
                    <LobbySeat user={current.host} label="Host" />
                    <LobbySeat user={current.guest} label="Guest" />
                  </div>
                  {isHost && current.phase !== 'started' ? (
                    <LevelPicker current={current} selectedId={current.level_id} onPick={pickLevel} />
                  ) : null}
                  <div className="utility-actions">
                    {isHost ? (
                      <button
                        type="button"
                        className="utility-button utility-button-primary"
                        disabled={!canStart}
                        onClick={canStart ? startHere : undefined}
                      >
                        <span className="utility-button-icon icon-start" aria-hidden="true" />
                        Start
                      </button>
                    ) : null}
                    <button type="button" className="utility-button utility-button-danger" onClick={act(() => leaveLobby(current.id))}>
                      <span className="utility-button-icon icon-leave" aria-hidden="true" />
                      Leave
                    </button>
                  </div>
                </section>
              ) : null}
              <div className="utility-lobby-list">
                {(data?.lobbies ?? []).filter((l) => !current || l.id !== current.id).map((l) => (
                  <div key={l.id} className="utility-lobby-row">
                    <span className="utility-row-icon icon-players" aria-hidden="true" />
                    <div className="utility-lobby-copy">
                      <strong>{l.name}</strong>
                      <span>{displayName(l.host, 'host')} / {l.seats.filled}/{l.seats.total}</span>
                    </div>
                    {l.phase === 'waiting' && !l.guest ? (
                      <button type="button" className="utility-button utility-button-primary" onClick={act(() => joinLobby(l.id))}>Join</button>
                    ) : <span className="utility-phase">{l.phase}</span>}
                  </div>
                ))}
                {data && !data.lobbies.length && !current ? <span className="utility-empty-row">No open lobbies. Host one.</span> : null}
              </div>
            </div>
  );

  // Embedded in the persistent menu shell (MainMenu's second column): the lobbies content IS the one
  // action column (tab → action). The shell owns the backdrop, screen wrapper, and zoom-safe placement.
  if (embedded) return <div className="menu-dest-col menu-dest-action utility-screen utility-lobbies">{content}</div>;

  return (
    <section className="settings-art-route" aria-label="Lobbies" data-testid="lobbies">
      {/* One continuous HomepageBackdrop (scene + synced rain), shared across the menu family. */}
      <HomepageBackdrop />
      <div className="settings-screen utility-twin-screen app-shell-bar-pad">
        <ArtRouteChrome className="utility-screen utility-lobbies">
          {content}
        </ArtRouteChrome>
      </div>
    </section>
  );
}
