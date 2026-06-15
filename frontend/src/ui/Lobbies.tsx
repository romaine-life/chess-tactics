import { useEffect, useState, type CSSProperties } from 'react';
import { fetchMe, goSignIn, isUnauthorized, signInHref, type AuthUser } from '../net/auth';
import { HttpError } from '../net/http';

interface LobbyUser { name?: string; email?: string; avatar_url?: string | null }
interface Lobby {
  id: string; name: string; phase: string;
  host: LobbyUser; guest: LobbyUser | null;
  seats: { filled: number; total: number };
  viewer_role: 'host' | 'guest' | 'observer';
}
interface LobbyList { lobbies: Lobby[]; current: Lobby | null }

async function api<T>(method: string, path: string): Promise<T> {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json' }, credentials: 'include', body: method === 'GET' ? undefined : '{}' });
  if (!res.ok) throw new HttpError(`${method} ${path}`, res.status);
  return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>);
}

const panel: CSSProperties = { background: 'var(--ds-surface)', border: '1px solid var(--ds-line)', borderRadius: 'var(--ds-radius-md)', padding: '14px 16px' };
const btn: CSSProperties = { border: '1px solid var(--ds-line-2)', background: 'var(--ds-accent-soft)', color: 'var(--ds-ink)', borderRadius: 'var(--ds-radius-sm)', padding: '6px 12px', cursor: 'pointer', fontSize: 'var(--ds-text-sm)' };

// Multiplayer lobby browser (ported from legacy app.js). Talks to the existing
// in-memory /api/lobbies endpoints; sign-in gated like the editors.
export function Lobbies() {
  const [me, setMe] = useState<AuthUser | null>(null);
  const [data, setData] = useState<LobbyList | null>(null);
  const [status, setStatus] = useState('');

  const refresh = async () => {
    try { setData(await api<LobbyList>('GET', '/api/lobbies')); }
    catch (e) { if (isUnauthorized(e)) setData(null); else setStatus(`Error: ${(e as Error).message}`); }
  };
  useEffect(() => {
    let active = true;
    fetchMe().then((u) => { if (!active) return; setMe(u); if (u.signed_in) refresh(); });
    return () => { active = false; };
  }, []);

  const act = (fn: () => Promise<unknown>) => async () => {
    try { await fn(); await refresh(); }
    catch (e) { if (isUnauthorized(e)) { goSignIn(); return; } setStatus(`Error: ${(e as Error).message}`); }
  };

  return (
    <div data-testid="lobbies" style={{ padding: '32px clamp(20px,6vw,80px)', color: 'var(--ds-ink-2)', fontFamily: 'var(--ds-font-sans)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontFamily: 'var(--ds-font-serif)', color: 'var(--ds-ink)', margin: 0 }}>Lobbies</h1>
        <a href="/" style={{ ...btn, textDecoration: 'none' }}>← Menu</a>
      </div>
      {me && !me.signed_in ? (
        <div style={panel}><a href={signInHref()} data-testid="lobbies-sign-in" style={{ ...btn, display: 'inline-block', textDecoration: 'none' }}>Sign in to host or join</a></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" data-testid="host-lobby" style={btn} onClick={act(() => api('POST', '/api/lobbies'))}>Host a lobby</button>
            <button type="button" style={btn} onClick={refresh}>Refresh</button>
          </div>
          {status ? <div style={{ color: 'var(--ds-ink-3)', fontSize: 'var(--ds-text-sm)' }}>{status}</div> : null}
          {data?.current ? (
            <div style={{ ...panel, borderColor: 'var(--ds-accent)' }}>
              <div style={{ color: 'var(--ds-ink)' }}>Your lobby: {data.current.name} · {data.current.phase} · {data.current.seats.filled}/{data.current.seats.total}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {data.current.viewer_role === 'host' && data.current.guest ? <button type="button" style={btn} onClick={act(() => api('POST', `/api/lobbies/${data.current!.id}/start`))}>Start</button> : null}
                <button type="button" style={btn} onClick={act(() => api('POST', `/api/lobbies/${data.current!.id}/leave`))}>Leave</button>
              </div>
            </div>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(data?.lobbies ?? []).filter((l) => !data?.current || l.id !== data.current.id).map((l) => (
              <div key={l.id} style={{ ...panel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--ds-ink)' }}>{l.name} · {l.host.name ?? 'host'} · {l.seats.filled}/{l.seats.total}</span>
                {l.phase === 'waiting' && !l.guest ? <button type="button" style={btn} onClick={act(() => api('POST', `/api/lobbies/${l.id}/join`))}>Join</button> : <span style={{ color: 'var(--ds-ink-3)', fontSize: 'var(--ds-text-xs)' }}>{l.phase}</span>}
              </div>
            ))}
            {data && !data.lobbies.length && !data.current ? <span style={{ color: 'var(--ds-ink-3)', fontSize: 'var(--ds-text-sm)' }}>No open lobbies. Host one.</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}
