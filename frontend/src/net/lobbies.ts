// Client for the multiplayer-lobby + netplay API (/api/lobbies). Modeled on
// net/levels.ts: fetch + credentials:'include' + HttpError from ./http, so the
// same-origin session cookie carries auth on every request (including the SSE
// EventSource streams, which send the cookie automatically). The wire shapes here
// are the shared contract with backend/server.js — keep them in lockstep.

import { HttpError } from './http';
import type { Level, ObjectiveType } from '../core/level';

export interface LobbyUser {
  name?: string;
  email?: string;
  avatar_url?: string | null;
}

export interface Lobby {
  id: string;
  name: string;
  phase: 'waiting' | 'ready' | 'started' | 'closed';
  host: LobbyUser;
  guest: LobbyUser | null;
  seats: { filled: number; total: number };
  viewer_role: 'host' | 'guest' | 'observer';
  level_id: string | null;
  /** Eligibility resolved by the server from canonical level content. Null means the
   *  selection is unavailable; true is blocked until shared clocks ship. */
  level_timed: boolean | null;
  level_name: string | null;
  level_objective: ObjectiveType | null;
  /** Present on participant/detail projections after Start. This immutable canonical
   *  snapshot—not the mutable campaign store—is the simulation input for reconnect. */
  level_snapshot?: Level | null;
  level_fingerprint?: string | null;
  seed: number | null;
  move_count: number;
  your_side: 'player' | 'enemy' | null;
  // Durable terminal outcome in board terms. Deterministic gameplay results are reported
  // at an exact relay count; resignations originate on the server.
  result: LobbyResult | null;
  /** One seat has reported a deterministic terminal position and the server is retaining
   *  the match while it waits for the other seat's independent matching report. */
  result_pending: boolean;
  /** Both seats reported different terminal states for the same frozen prefix. */
  result_disputed: boolean;
}

export type LobbyGameResultReason = 'victory-rule' | 'checkmate' | 'stalemate' | 'fifty-move' | 'threefold';
export interface LobbyResult {
  winner: 'player' | 'enemy' | 'draw';
  reason: 'resign' | LobbyGameResultReason;
}
export interface ReportedLobbyResult extends LobbyResult {
  reason: LobbyGameResultReason;
  expectedMoveCount: number;
}

export interface LobbyList {
  lobbies: Lobby[];
  current: Lobby | null;
  /** Closed participant-owned tombstones still awaiting this seat's acknowledgement. */
  recoverable: Lobby[];
}

// One relayed applyMove. `i` is its 0-based position in the lobby's move log —
// clients use it for ordering/dedupe (a mover's own echo has i < local moveCount).
// The wire move is the RelayMove contract (game/store.ts): destination cell plus the
// one detail rules cannot infer (promotion choice). Capture / en-passant / a castle's
// rook hop are RE-DERIVED on each board from its own legalMoves, never relayed.
export interface MoveEvent {
  i: number;
  intentId: string;
  side: 'player' | 'enemy';
  pieceId: string;
  move: { x: number; y: number; promotion?: 'queen' | 'rook' | 'bishop' | 'knight' };
}

// Shared request core. GET sends no body; every mutating verb posts JSON (an empty
// object when the endpoint takes no payload), matching the backend's json() parse.
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw await HttpError.fromResponse(`${method} ${path}`, res);
  return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>);
}

export function fetchLobbies(): Promise<LobbyList> {
  return request<LobbyList>('GET', '/api/lobbies');
}

export function fetchLobby(id: string): Promise<{ lobby: Lobby }> {
  return request<{ lobby: Lobby }>('GET', `/api/lobbies/${encodeURIComponent(id)}`);
}

export function createLobby(): Promise<{ lobby: Lobby }> {
  return request<{ lobby: Lobby }>('POST', '/api/lobbies');
}

export function joinLobby(id: string): Promise<{ lobby: Lobby }> {
  return request<{ lobby: Lobby }>('POST', `/api/lobbies/${encodeURIComponent(id)}/join`);
}

export function leaveLobby(id: string, completion?: ReportedLobbyResult): Promise<void> {
  return request<void>('POST', `/api/lobbies/${encodeURIComponent(id)}/leave`, completion);
}

export function startLobby(id: string): Promise<{ lobby: Lobby }> {
  return request<{ lobby: Lobby }>('POST', `/api/lobbies/${encodeURIComponent(id)}/start`);
}

export function setLobbyLevel(id: string, levelId: string): Promise<{ lobby: Lobby }> {
  return request<{ lobby: Lobby }>('POST', `/api/lobbies/${encodeURIComponent(id)}/level`, { levelId });
}

export function postMove(
  id: string,
  pieceId: string,
  move: MoveEvent['move'],
  expectedMoveCount: number,
  intentId: string,
): Promise<{ move: MoveEvent }> {
  return request<{ move: MoveEvent }>('POST', `/api/lobbies/${encodeURIComponent(id)}/moves`, {
    pieceId,
    move,
    expectedMoveCount,
    intentId,
  });
}

// Concede the match. The server records the terminal result (the other side wins) and
// pushes it to both clients over the lobby channel; this seat ends the game when that
// frame arrives (see Skirmish's onLobby), not optimistically — mirroring the move relay.
export function resignLobby(id: string): Promise<{ lobby: Lobby }> {
  return request<{ lobby: Lobby }>('POST', `/api/lobbies/${encodeURIComponent(id)}/resign`);
}

/** Persist the deterministic result both clients derive from one committed relay. */
export function reportLobbyResult(id: string, result: ReportedLobbyResult): Promise<{ lobby: Lobby }> {
  return request<{ lobby: Lobby }>('POST', `/api/lobbies/${encodeURIComponent(id)}/result`, result);
}

export function fetchMovesSince(id: string, since: number): Promise<{ moves: MoveEvent[] }> {
  return request<{ moves: MoveEvent[] }>('GET', `/api/lobbies/${encodeURIComponent(id)}/moves?since=${since}`);
}

// Parse one SSE frame's data payload as JSON, returning null on malformed data so a
// single bad frame never throws out of the message handler (EventSource keeps the
// stream open; we just skip the frame).
function parseFrame(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// GLOBAL lobby-list channel (GET /api/lobbies/events). The server pushes bare
// `{ type:'lobbies-changed' }` frames on any lobby mutation; the client refetches
// GET /api/lobbies on receipt. Returns an unsubscribe fn that closes the stream.
// EventSource auto-reconnects on transient errors, so onerror only logs.
export function subscribeLobbies(onChange: () => void): () => void {
  const source = new EventSource('/api/lobbies/events');
  // Resync on every (re)connect. EventSource silently auto-reconnects after any drop
  // (gateway timeout, network blip, sleep/wake); the server's mutation pings are
  // fire-and-forget, so a ping emitted during the gap is otherwise lost forever. An
  // onopen refetch makes every connection self-heal: whatever we missed, we re-read.
  // THIS (with the server-side connect snapshot) is what actually keeps the host's
  // list truthful — onmessage alone only ever caught live-while-connected pings.
  source.onopen = () => { onChange(); };
  source.onmessage = (event: MessageEvent<string>) => {
    const frame = parseFrame(event.data);
    if (frame && typeof frame === 'object' && (frame as { type?: string }).type === 'lobbies-changed') {
      onChange();
    }
  };
  source.onerror = () => {
    // Transient network blips: the browser reconnects automatically. Log for
    // visibility; do not close (closing would stop the auto-reconnect).
    console.warn('[lobbies] lobby-list stream error; awaiting auto-reconnect');
  };
  return () => source.close();
}

// PER-LOBBY game channel (GET /api/lobbies/:id/events). The server sends a
// `{ type:'lobby', lobby }` snapshot on connect, then `{ type:'move', move }` per
// relayed move and `{ type:'lobby', lobby }` on lobby-state changes. Returns an
// unsubscribe fn that closes the stream.
export function subscribeLobbyChannel(
  id: string,
  handlers: { onMove?: (move: MoveEvent) => void; onLobby?: (lobby: Lobby) => void },
): () => void {
  const source = new EventSource(`/api/lobbies/${encodeURIComponent(id)}/events`);
  source.onmessage = (event: MessageEvent<string>) => {
    const frame = parseFrame(event.data);
    if (!frame || typeof frame !== 'object') return;
    const typed = frame as { type?: string; move?: MoveEvent; lobby?: Lobby };
    if (typed.type === 'move' && typed.move) {
      handlers.onMove?.(typed.move);
    } else if (typed.type === 'lobby' && typed.lobby) {
      handlers.onLobby?.(typed.lobby);
    }
  };
  source.onerror = () => {
    console.warn(`[lobbies] lobby channel ${id} stream error; awaiting auto-reconnect`);
  };
  return () => source.close();
}
