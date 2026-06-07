const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
const frontendDir = process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend');
const staticFrontendDir = process.env.STATIC_FRONTEND_DIR || '';
const authBaseUrl = (process.env.AUTH_BASE_URL || 'https://auth.romaine.life').replace(/\/+$/, '');
const publicOrigin = (process.env.PUBLIC_ORIGIN || 'https://chess.romaine.life').replace(/\/+$/, '');

const COLS = 8;
const ROWS = 12;
const PIECE_CHOICES = ['knight', 'bishop', 'rook'];
const PIECES = {
  pawn: { mark: 'P', name: 'Pawn', role: 'Forward footman', sideName: 'Allies' },
  knight: { mark: 'N', name: 'Knight', role: 'L-shaped jumper', sideName: 'Allies' },
  bishop: { mark: 'B', name: 'Bishop', role: 'Diagonal runner', sideName: 'Allies' },
  rook: { mark: 'R', name: 'Rook', role: 'Straight-line tower', sideName: 'Allies' },
  queen: { mark: 'Q', name: 'Queen', role: 'Promoted raider', sideName: 'Allies' },
};

const lobbies = new Map();

app.use(express.json());

function randomToken(prefix = 'lob') {
  const entropy = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${entropy}`;
}

function safeReturnPath(raw) {
  if (!raw || typeof raw !== 'string') return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

function requestOrigin(req) {
  if (process.env.PUBLIC_ORIGIN) return publicOrigin;

  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('host');
  if (!host) return publicOrigin;
  return `${proto}://${host}`;
}

function callbackUrl(req) {
  const pathOnly = safeReturnPath(req.query.returnTo);
  return `${requestOrigin(req)}${pathOnly}`;
}

function publicUser(session) {
  const user = session && session.user;
  if (!user || !user.email) return { signed_in: false };
  return {
    signed_in: true,
    email: user.email,
    name: user.name || user.email,
    image: user.image || null,
    role: user.role || 'pending',
  };
}

function normalizeLobbyName(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  return trimmed.slice(0, 60);
}

function normalizeParty(input) {
  if (!Array.isArray(input)) return ['knight', 'bishop'];
  const cleaned = input
    .filter((item) => PIECE_CHOICES.includes(item))
    .slice(0, 2);
  while (cleaned.length < 2) {
    cleaned.push(cleaned.length === 0 ? 'knight' : 'bishop');
  }
  return cleaned;
}

function inBounds(x, y) {
  return x >= 0 && x < COLS && y >= 0 && y < ROWS;
}

function pieceName(side, type) {
  const base = PIECES[type];
  return {
    id: type,
    name: `${side === 'player' ? 'Allied' : 'Enemy'} ${base.name}`,
    role: base.role,
    mark: base.mark,
  };
}

function pieceAt(gameState, x, y) {
  return gameState.pieces.find((piece) => piece.alive && piece.x === x && piece.y === y) || null;
}

function isEnemy(piece, target) {
  return target && target.side !== piece.side;
}

function emptyBackCells(gameState, side) {
  const rows = side === 'player' ? [ROWS - 1, ROWS - 2] : [0, 1];
  const cells = [];
  rows.forEach((y) => {
    for (let x = 0; x < COLS; x += 1) {
      if (!pieceAt(gameState, x, y)) cells.push({ x, y });
    }
  });
  return cells;
}

function placeRandom(gameState, piece, side) {
  const cells = emptyBackCells(gameState, side);
  const cell = cells[Math.floor(Math.random() * cells.length)] || { x: 0, y: side === 'player' ? ROWS - 1 : 0 };
  piece.x = cell.x;
  piece.y = cell.y;
}

function createPiece(side, type, index) {
  const definition = pieceName(side, type);
  return {
    id: `${side}-${index}-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    side,
    type,
    mark: definition.mark,
    name: definition.name,
    role: definition.role,
    x: 0,
    y: 0,
    alive: true,
    startY: side === 'player' ? ROWS - 1 : 0,
  };
}

function rayMoves(gameState, piece, dirs) {
  const moves = [];
  dirs.forEach(([dx, dy]) => {
    for (let step = 1; ; step += 1) {
      const x = piece.x + dx * step;
      const y = piece.y + dy * step;
      if (!inBounds(x, y)) break;
      const occupant = pieceAt(gameState, x, y);
      if (occupant) {
        if (isEnemy(piece, occupant)) moves.push({ x, y, capture: occupant.id });
        break;
      }
      moves.push({ x, y });
    }
  });
  return moves;
}

function stepMoves(gameState, piece, deltas) {
  return deltas
    .map(([dx, dy]) => ({ x: piece.x + dx, y: piece.y + dy }))
    .filter((move) => {
      if (!inBounds(move.x, move.y)) return false;
      const occupant = pieceAt(gameState, move.x, move.y);
      if (!occupant) return true;
      if (!isEnemy(piece, occupant)) return false;
      move.capture = occupant.id;
      return true;
    });
}

function pawnMoves(gameState, piece) {
  const dir = piece.side === 'player' ? -1 : 1;
  const moves = [];
  const one = { x: piece.x, y: piece.y + dir };
  if (inBounds(one.x, one.y) && !pieceAt(gameState, one.x, one.y)) {
    moves.push(one);
    const two = { x: piece.x, y: piece.y + dir * 2 };
    if (piece.y === piece.startY && inBounds(two.x, two.y) && !pieceAt(gameState, two.x, two.y)) moves.push(two);
  }
  [-1, 1].forEach((dx) => {
    const x = piece.x + dx;
    const y = piece.y + dir;
    const occupant = inBounds(x, y) && pieceAt(gameState, x, y);
    if (isEnemy(piece, occupant)) moves.push({ x, y, capture: occupant.id });
  });
  return moves;
}

function legalMoves(gameState, piece) {
  if (!piece || !piece.alive || !gameState) return [];
  if (piece.type === 'pawn') return pawnMoves(gameState, piece);
  if (piece.type === 'knight') {
    return stepMoves(gameState, piece, [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]);
  }
  if (piece.type === 'bishop') return rayMoves(gameState, piece, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
  if (piece.type === 'rook') return rayMoves(gameState, piece, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
  return rayMoves(gameState, piece, [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
}

function promoteIfNeeded(gameState, piece) {
  if (piece.type !== 'pawn') return;
  if ((piece.side === 'player' && piece.y === 0) || (piece.side === 'enemy' && piece.y === ROWS - 1)) {
    piece.type = 'queen';
    piece.mark = PIECES.queen.mark;
    piece.name = `${piece.side === 'player' ? 'Allied' : 'Enemy'} Queen`;
    piece.role = PIECES.queen.role;
  }
}

function movePiece(gameState, piece, move) {
  const captured = move.capture ? gameState.pieces.find((target) => target.id === move.capture) : pieceAt(gameState, move.x, move.y);
  if (captured && captured.side !== piece.side) {
    captured.alive = false;
    gameState.log.unshift(`${piece.name} captures ${captured.name}.`);
  } else {
    gameState.log.unshift(`${piece.name} advances.`);
  }
  piece.x = move.x;
  piece.y = move.y;
  promoteIfNeeded(gameState, piece);
}

function checkVictory(gameState) {
  const playerCount = gameState.pieces.filter((piece) => piece.alive && piece.side === 'player').length;
  const enemyCount = gameState.pieces.filter((piece) => piece.alive && piece.side === 'enemy').length;
  if (!playerCount || !enemyCount) {
    gameState.winner = playerCount ? 'player' : 'enemy';
    gameState.turn = 'done';
    gameState.log.unshift(playerCount ? 'Victory. The last enemy piece falls.' : 'Defeat. No allied pieces remain.');
    return true;
  }
  return false;
}

function buildGameState(lobby) {
  const playerParty = normalizeParty(lobby.players.find((player) => player.side === 'player')?.party);
  const enemyParty = normalizeParty(lobby.players.find((player) => player.side === 'enemy')?.party);

  const gameState = {
    turn: 'player',
    winner: null,
    log: [
      `Enemy fields ${enemyParty.map((type) => PIECES[type].name).join(', ')}.`,
      'Pick a piece and move or capture. Last side standing wins.',
    ],
    pieces: [],
  };

  const playerTypes = ['pawn', ...playerParty];
  const enemyTypes = ['pawn', ...enemyParty];

  playerTypes.forEach((type, index) => {
    const piece = createPiece('player', type, index);
    placeRandom(gameState, piece, 'player');
    gameState.pieces.push(piece);
  });
  enemyTypes.forEach((type, index) => {
    const piece = createPiece('enemy', type, index);
    placeRandom(gameState, piece, 'enemy');
    gameState.pieces.push(piece);
  });

  gameState.status = 'in_progress';
  return gameState;
}

async function getAuthedUser(req) {
  const cookie = req.get('cookie');
  if (!cookie) return null;

  try {
    const upstream = await fetch(`${authBaseUrl}/api/auth/get-session`, {
      headers: {
        accept: 'application/json',
        cookie,
      },
    });
    if (!upstream.ok) return null;
    const session = await upstream.json();
    if (!session || !session.user || !session.user.email) return null;
    return {
      id: session.user.id || session.user.email,
      email: session.user.email,
      name: session.user.name || session.user.email,
      role: session.user.role || 'pending',
    };
  } catch (_error) {
    return null;
  }
}

function requireAuth(handler) {
  return async (req, res) => {
    const user = await getAuthedUser(req);
    if (!user) {
      res.status(401).json({ error: 'auth_required' });
      return;
    }
    req.authUser = user;
    await handler(req, res);
  };
}

function findLobby(id) {
  if (!lobbies.has(id)) return null;
  return lobbies.get(id);
}

function snapshotLobby(lobby, viewerEmail) {
  const players = lobby.players.map((player) => ({
    email: player.user.email,
    name: player.user.name,
    side: player.side,
    isHost: player.isHost,
    party: player.party,
  }));

  return {
    id: lobby.id,
    name: lobby.name,
    status: lobby.status,
    createdAt: lobby.createdAt,
    updatedAt: lobby.updatedAt,
    players,
    game: lobby.game ? snapshotGame(lobby.game) : null,
    winner: lobby.winner || null,
    you_side: viewerEmail ? lobby.players.find((p) => p.user.email === viewerEmail)?.side || null : null,
    can_start: lobby.status === 'open' && lobby.players.length === 2,
    can_join: lobby.status === 'open' && lobby.players.length < 2,
    is_host: viewerEmail ? lobby.players.some((p) => p.user.email === viewerEmail && p.isHost) : false,
    version: lobby.version,
  };
}

function snapshotGame(gameState) {
  return {
    turn: gameState.turn,
    winner: gameState.winner,
    log: gameState.log,
    pieces: gameState.pieces,
  };
}

function getParticipant(lobby, userEmail) {
  return lobby.players.find((player) => player.user.email === userEmail) || null;
}

function ensurePartyValues(lobby, side) {
  const player = lobby.players.find((item) => item.side === side);
  if (!player || !Array.isArray(player.party) || player.party.length < 2) {
    player.party = ['knight', 'bishop'];
  }
}

function createLobby(owner) {
  const now = Date.now();
  return {
    id: randomToken('lobby'),
    name: `${owner.name || owner.email}'s Lobby`,
    status: 'open',
    createdAt: now,
    updatedAt: now,
    version: 1,
    winner: null,
    game: null,
    players: [
      {
        user: owner,
        side: 'player',
        isHost: true,
        party: ['knight', 'bishop'],
        joinedAt: now,
      },
    ],
  };
}

function forwardSetCookie(upstream, res) {
  const cookies = typeof upstream.headers.getSetCookie === 'function'
    ? upstream.headers.getSetCookie()
    : [upstream.headers.get('set-cookie')].filter(Boolean);
  cookies.forEach((cookie) => res.append('set-cookie', cookie));
}

function frontendIndexFile() {
  if (staticFrontendDir) {
    const overrideIndex = path.join(staticFrontendDir, 'index.html');
    if (fs.existsSync(overrideIndex)) return overrideIndex;
  }
  return path.join(frontendDir, 'index.html');
}

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

app.get('/api/auth/me', async (req, res) => {
  const cookie = req.get('cookie');
  if (!cookie) {
    res.status(200).json({ signed_in: false });
    return;
  }

  let upstream;
  try {
    upstream = await fetch(`${authBaseUrl}/api/auth/get-session`, {
      headers: {
        accept: 'application/json',
        cookie,
      },
    });
  } catch (error) {
    console.error('auth session check failed:', error);
    res.status(502).json({ signed_in: false, error: 'auth_unavailable' });
    return;
  }

  if (!upstream.ok) {
    res.status(502).json({ signed_in: false, error: 'auth_unavailable' });
    return;
  }

  const session = await upstream.json();
  res.status(200).json(publicUser(session));
});

app.get('/api/auth/sign-in', (req, res) => {
  const next = encodeURIComponent(callbackUrl(req));
  res.redirect(302, `${authBaseUrl}/sign-in/microsoft?callbackURL=${next}`);
});

app.post('/api/auth/sign-out', async (req, res) => {
  const cookie = req.get('cookie');
  if (cookie) {
    try {
      const upstream = await fetch(`${authBaseUrl}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          cookie,
          origin: requestOrigin(req),
        },
        body: '{}',
      });
      forwardSetCookie(upstream, res);
      if (!upstream.ok) {
        res.status(502).json({ error: 'sign_out_failed' });
        return;
      }
    } catch (error) {
      console.error('auth sign-out failed:', error);
      res.status(502).json({ error: 'auth_unavailable' });
      return;
    }
  }
  res.status(204).end();
});

app.get('/api/lobbies', requireAuth, async (req, res) => {
  const user = req.authUser;
  const status = req.query.status || 'open';
  const q = String(req.query.q || '').trim().toLowerCase();
  const includeFinished = req.query.include_finished === '1';

  const listed = [...lobbies.values()]
    .filter((lobby) => {
      if (status === 'all') return true;
      if (status === 'open') return lobby.status === 'open';
      if (status === 'in_progress') return lobby.status === 'in_progress';
      if (status === 'finished') return lobby.status === 'finished';
      return lobby.status === status;
    })
    .filter((lobby) => {
      if (!includeFinished && lobby.status === 'finished') return false;
      if (!q) return true;
      const tokens = [lobby.name, ...lobby.players.map((player) => player.user.name), ...lobby.players.map((player) => player.user.email)];
      return tokens.join(' ').toLowerCase().includes(q);
    })
    .map((lobby) => snapshotLobby(lobby, user.email));

  listed.sort((a, b) => a.createdAt - b.createdAt);
  res.status(200).json({ lobbies: listed });
});

app.post('/api/lobbies', requireAuth, async (req, res) => {
  const user = req.authUser;
  const name = normalizeLobbyName(req.body && req.body.name) || `${user.name}'s Lobby`;
  const party = normalizeParty(req.body && req.body.party);
  const lobby = createLobby(user);
  lobby.name = name;
  lobby.players[0].party = party;

  lobbies.set(lobby.id, lobby);
  res.status(201).json({ lobby: snapshotLobby(lobby, user.email) });
});

app.post('/api/lobbies/:id/join', requireAuth, async (req, res) => {
  const user = req.authUser;
  const lobby = findLobby(req.params.id);
  if (!lobby) {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }

  if (getParticipant(lobby, user.email)) {
    res.status(200).json({ lobby: snapshotLobby(lobby, user.email) });
    return;
  }

  if (lobby.status !== 'open') {
    res.status(409).json({ error: 'lobby_not_joinable' });
    return;
  }

  if (lobby.players.length >= 2) {
    res.status(409).json({ error: 'lobby_full' });
    return;
  }

  const side = lobby.players.some((player) => player.side === 'player') ? 'enemy' : 'player';
  lobby.players.push({
    user,
    side,
    isHost: false,
    party: normalizeParty(req.body && req.body.party),
    joinedAt: Date.now(),
  });
  lobby.updatedAt = Date.now();
  lobby.version += 1;

  res.status(201).json({ lobby: snapshotLobby(lobby, user.email) });
});

app.post('/api/lobbies/:id/party', requireAuth, async (req, res) => {
  const user = req.authUser;
  const lobby = findLobby(req.params.id);
  if (!lobby) {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }

  const participant = getParticipant(lobby, user.email);
  if (!participant) {
    res.status(403).json({ error: 'not_in_lobby' });
    return;
  }

  if (lobby.status !== 'open') {
    res.status(409).json({ error: 'party_locked' });
    return;
  }

  participant.party = normalizeParty(req.body && req.body.party);
  lobby.updatedAt = Date.now();
  lobby.version += 1;

  res.status(200).json({ lobby: snapshotLobby(lobby, user.email) });
});

app.post('/api/lobbies/:id/start', requireAuth, async (req, res) => {
  const user = req.authUser;
  const lobby = findLobby(req.params.id);
  if (!lobby) {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }

  const host = lobby.players.find((player) => player.isHost);
  if (!host || host.user.email !== user.email) {
    res.status(403).json({ error: 'host_only' });
    return;
  }
  if (lobby.players.length < 2) {
    res.status(409).json({ error: 'lobby_not_full' });
    return;
  }

  if (lobby.status !== 'open' && lobby.status !== 'finished') {
    res.status(409).json({ error: 'already_started' });
    return;
  }

  lobby.status = 'in_progress';
  lobby.winner = null;
  lobby.game = buildGameState(lobby);
  lobby.updatedAt = Date.now();
  lobby.version += 1;

  lobby.players.forEach((player) => ensurePartyValues(lobby, player.side));

  res.status(200).json({ lobby: snapshotLobby(lobby, user.email) });
});

app.get('/api/lobbies/:id', requireAuth, async (req, res) => {
  const user = req.authUser;
  const lobby = findLobby(req.params.id);
  if (!lobby) {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }
  res.status(200).json(snapshotLobby(lobby, user.email));
});

app.post('/api/lobbies/:id/leave', requireAuth, async (req, res) => {
  const user = req.authUser;
  const lobby = findLobby(req.params.id);
  if (!lobby) {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }

  const index = lobby.players.findIndex((player) => player.user.email === user.email);
  if (index < 0) {
    res.status(403).json({ error: 'not_in_lobby' });
    return;
  }

  lobby.players.splice(index, 1);
  if (!lobby.players.length) {
    lobbies.delete(req.params.id);
    res.status(204).end();
    return;
  }

  if (!lobby.players.find((player) => player.isHost)) {
    lobby.players[0].isHost = true;
  }
  if (lobby.status === 'in_progress') {
    lobby.status = 'finished';
    lobby.winner = 'disconnect';
    lobby.game = lobby.game ? { ...lobby.game, winner: 'disconnect', turn: 'done', log: ['Opponent disconnected.', ...lobby.game.log] } : null;
  }
  lobby.updatedAt = Date.now();
  lobby.version += 1;

  res.status(200).json({ lobby: snapshotLobby(lobby, user.email) });
});

app.post('/api/lobbies/:id/move', requireAuth, async (req, res) => {
  const user = req.authUser;
  const lobby = findLobby(req.params.id);
  if (!lobby || lobby.status !== 'in_progress' || !lobby.game) {
    res.status(409).json({ error: 'game_not_active' });
    return;
  }

  const participant = getParticipant(lobby, user.email);
  if (!participant) {
    res.status(403).json({ error: 'not_in_lobby' });
    return;
  }

  if (lobby.game.winner) {
    res.status(409).json({ error: 'game_over' });
    return;
  }

  const side = participant.side;
  if (lobby.game.turn !== side) {
    res.status(409).json({ error: 'not_your_turn' });
    return;
  }

  const game = lobby.game;
  const pieceId = req.body && (req.body.pieceId || req.body.piece_id);
  const targetX = req.body && (req.body.x !== undefined ? Number(req.body.x) : NaN);
  const targetY = req.body && (req.body.y !== undefined ? Number(req.body.y) : NaN);

  if (pieceId === undefined || Number.isNaN(targetX) || Number.isNaN(targetY)) {
    res.status(400).json({ error: 'bad_move_payload' });
    return;
  }

  const moving = game.pieces.find((item) => item.id === pieceId);
  if (!moving || !moving.alive || moving.side !== side) {
    res.status(400).json({ error: 'invalid_piece' });
    return;
  }

  const legal = legalMoves(game, moving);
  const selected = legal.find((item) => item.x === targetX && item.y === targetY);
  if (!selected) {
    res.status(400).json({ error: 'invalid_move' });
    return;
  }

  movePiece(game, moving, selected);
  if (!checkVictory(game)) {
    game.turn = game.turn === 'player' ? 'enemy' : 'player';
  }

  if (game.winner) {
    lobby.status = 'finished';
    lobby.winner = game.winner;
  }

  lobby.updatedAt = Date.now();
  lobby.version += 1;

  res.status(200).json({ lobby: snapshotLobby(lobby, user.email) });
});

if (staticFrontendDir) {
  app.use(express.static(staticFrontendDir));
}
app.use(express.static(frontendDir));

app.use((_req, res) => {
  res.sendFile(frontendIndexFile());
});

app.listen(port, () => {
  console.log(`chess-tactics listening on :${port}`);
});
