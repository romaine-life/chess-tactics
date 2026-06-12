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
const lobbies = new Map();
const campaigns = new Map();

app.use(express.json({ limit: '64kb' }));

const LEVEL_ROLES = new Set(['player', 'enemy', 'terrain']);
const LEVEL_PIECES = new Set(['pawn', 'knight', 'bishop', 'rook', 'queen']);
const LEVEL_TERRAIN = new Set(['rock']);

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

function gravatarUrl(email, size = 96) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  const hash = crypto.createHash('md5').update(normalized).digest('hex');
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=${size}`;
}

function publicUser(session) {
  const user = session && session.user;
  if (!user || !user.email) return { signed_in: false };
  const gravatar = gravatarUrl(user.email);
  return {
    signed_in: true,
    email: user.email,
    name: user.name || user.email,
    image: user.image || null,
    gravatar_url: gravatar,
    avatar_url: user.image || gravatar,
    role: user.role || 'pending',
  };
}

function publicLobbyUser(user) {
  if (!user || !user.email) return null;
  return {
    email: user.email,
    name: user.name || user.email,
    avatar_url: user.avatar_url || gravatarUrl(user.email),
  };
}

function publicLobby(lobby, viewerEmail) {
  return {
    id: lobby.id,
    name: lobby.name,
    phase: lobby.phase,
    created_at: lobby.createdAt,
    updated_at: lobby.updatedAt,
    host: publicLobbyUser(lobby.host),
    guest: publicLobbyUser(lobby.guest),
    seats: {
      filled: lobby.guest ? 2 : 1,
      total: 2,
    },
    viewer_role: viewerEmail === lobby.host.email ? 'host' : (lobby.guest && viewerEmail === lobby.guest.email ? 'guest' : 'observer'),
  };
}

function clampText(value, fallback, maxLength) {
  const text = String(value || '').trim();
  return (text || fallback).slice(0, maxLength);
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function campaignSummary(campaign) {
  return {
    id: campaign.id,
    title: campaign.title,
    description: campaign.description,
    created_at: campaign.createdAt,
    updated_at: campaign.updatedAt,
    owner_email: campaign.owner.email,
    level_count: campaign.levels.length,
    levels: campaign.levels.map(publicLevel),
  };
}

function publicLevel(level) {
  return {
    id: level.id,
    name: level.name,
    objective: level.objective,
    difficulty: level.difficulty,
    width: level.width,
    height: level.height,
    enemy_budget: level.enemyBudget,
    notes: level.notes,
    layout: level.layout.map(publicLevelCell),
  };
}

function publicLevelCell(cell) {
  return {
    x: cell.x,
    y: cell.y,
    role: cell.role,
    type: cell.type,
  };
}

function userCampaigns(email) {
  return Array.from(campaigns.values())
    .filter((campaign) => campaign.owner.email === email)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function campaignForUser(id, email) {
  const campaign = campaigns.get(id);
  if (!campaign || campaign.owner.email !== email) return null;
  return campaign;
}

function defaultLevelLayout(width, height) {
  return [
    { x: Math.floor(width / 2), y: height - 1, role: 'player', type: 'pawn' },
    { x: Math.floor(width / 2), y: 0, role: 'enemy', type: 'pawn' },
    { x: Math.max(0, Math.floor(width / 2) - 1), y: Math.max(0, Math.floor(height / 2) - 1), role: 'terrain', type: 'rock' },
  ];
}

function normalizeCoordinate(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const rounded = Math.round(number);
  if (rounded < 0 || rounded >= max) return null;
  return rounded;
}

function normalizeLevelCell(raw, width, height) {
  if (!raw || typeof raw !== 'object') return null;
  const role = String(raw.role || '').trim().toLowerCase();
  const type = String(raw.type || '').trim().toLowerCase();
  const x = normalizeCoordinate(raw.x, width);
  const y = normalizeCoordinate(raw.y, height);
  if (x === null || y === null || !LEVEL_ROLES.has(role)) return null;
  if (role === 'terrain') {
    if (!LEVEL_TERRAIN.has(type)) return null;
  } else if (!LEVEL_PIECES.has(type)) {
    return null;
  }
  return { x, y, role, type };
}

function normalizeLevelLayout(rawLayout, width, height) {
  const cells = Array.isArray(rawLayout) ? rawLayout : defaultLevelLayout(width, height);
  const byCoord = new Map();
  cells.forEach((raw) => {
    const cell = normalizeLevelCell(raw, width, height);
    if (cell) byCoord.set(`${cell.x},${cell.y}`, cell);
  });
  return Array.from(byCoord.values()).sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

function buildLevel(raw, index) {
  const width = clampNumber(raw && raw.width, 8, 4, 16);
  const height = clampNumber(raw && raw.height, 12, 4, 20);
  return {
    id: crypto.randomUUID(),
    name: clampText(raw && raw.name, `Level ${index + 1}`, 48),
    objective: clampText(raw && raw.objective, 'Defeat all enemies', 96),
    difficulty: clampText(raw && raw.difficulty, 'normal', 20),
    width,
    height,
    enemyBudget: clampNumber(raw && (raw.enemy_budget ?? raw.enemyBudget), 3, 1, 24),
    notes: clampText(raw && raw.notes, '', 400),
    layout: normalizeLevelLayout(raw && raw.layout, width, height),
  };
}

function applyLevelPatch(level, raw) {
  if (!raw || typeof raw !== 'object') return;
  if (Object.hasOwn(raw, 'name')) level.name = clampText(raw.name, level.name, 48);
  if (Object.hasOwn(raw, 'objective')) level.objective = clampText(raw.objective, level.objective, 96);
  if (Object.hasOwn(raw, 'difficulty')) level.difficulty = clampText(raw.difficulty, level.difficulty, 20);
  if (Object.hasOwn(raw, 'width')) level.width = clampNumber(raw.width, level.width, 4, 16);
  if (Object.hasOwn(raw, 'height')) level.height = clampNumber(raw.height, level.height, 4, 20);
  if (Object.hasOwn(raw, 'enemy_budget') || Object.hasOwn(raw, 'enemyBudget')) {
    level.enemyBudget = clampNumber(raw.enemy_budget ?? raw.enemyBudget, level.enemyBudget, 1, 24);
  }
  if (Object.hasOwn(raw, 'notes')) level.notes = clampText(raw.notes, level.notes, 400);
  if (Object.hasOwn(raw, 'width') || Object.hasOwn(raw, 'height')) {
    level.layout = normalizeLevelLayout(level.layout, level.width, level.height);
  }
  if (Object.hasOwn(raw, 'layout')) {
    level.layout = normalizeLevelLayout(raw.layout, level.width, level.height);
  }
}

async function readSession(req) {
  const cookie = req.get('cookie');
  if (!cookie) return null;
  const upstream = await fetch(`${authBaseUrl}/api/auth/get-session`, {
    headers: {
      accept: 'application/json',
      cookie,
    },
  });
  if (!upstream.ok) {
    const error = new Error('auth_unavailable');
    error.statusCode = 502;
    throw error;
  }
  return upstream.json();
}

async function requireUser(req, res) {
  let session;
  try {
    session = await readSession(req);
  } catch (error) {
    console.error('auth session check failed:', error);
    res.status(error.statusCode || 502).json({ error: 'auth_unavailable' });
    return null;
  }
  const user = publicUser(session);
  if (!user.signed_in) {
    res.status(401).json({ error: 'sign_in_required' });
    return null;
  }
  return user;
}

function activeLobbies() {
  return Array.from(lobbies.values())
    .filter((lobby) => lobby.phase !== 'closed')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function userActiveLobby(email) {
  return activeLobbies().find((lobby) => lobby.host.email === email || (lobby.guest && lobby.guest.email === email)) || null;
}

function lobbyNameFor(user) {
  const base = (user.name || user.email || 'Player').split('@')[0].trim();
  return `${base}'s lobby`;
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
  try {
    const session = await readSession(req);
    res.status(200).json(publicUser(session));
  } catch (error) {
    console.error('auth session check failed:', error);
    res.status(502).json({ signed_in: false, error: 'auth_unavailable' });
  }
});

app.get('/api/lobbies', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.status(200).json({
    lobbies: activeLobbies().map((lobby) => publicLobby(lobby, user.email)),
    current: userActiveLobby(user.email) ? publicLobby(userActiveLobby(user.email), user.email) : null,
  });
});

app.post('/api/lobbies', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const existing = userActiveLobby(user.email);
  if (existing) {
    res.status(200).json({ lobby: publicLobby(existing, user.email) });
    return;
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const lobby = {
    id,
    name: lobbyNameFor(user),
    phase: 'waiting',
    createdAt: now,
    updatedAt: now,
    host: user,
    guest: null,
  };
  lobbies.set(id, lobby);
  res.status(201).json({ lobby: publicLobby(lobby, user.email) });
});

app.get('/api/lobbies/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbies.get(req.params.id);
  if (!lobby || lobby.phase === 'closed') {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }
  res.status(200).json({ lobby: publicLobby(lobby, user.email) });
});

app.post('/api/lobbies/:id/join', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbies.get(req.params.id);
  if (!lobby || lobby.phase === 'closed') {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }
  if (lobby.host.email === user.email) {
    res.status(409).json({ error: 'host_cannot_join_own_lobby' });
    return;
  }
  const existing = userActiveLobby(user.email);
  if (existing && existing.id !== lobby.id) {
    res.status(409).json({ error: 'already_in_lobby', lobby: publicLobby(existing, user.email) });
    return;
  }
  if (lobby.phase !== 'waiting' || lobby.guest) {
    res.status(409).json({ error: 'lobby_unavailable' });
    return;
  }
  lobby.guest = user;
  lobby.phase = 'ready';
  lobby.updatedAt = new Date().toISOString();
  res.status(200).json({ lobby: publicLobby(lobby, user.email) });
});

app.post('/api/lobbies/:id/start', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbies.get(req.params.id);
  if (!lobby || lobby.phase === 'closed') {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }
  if (lobby.host.email !== user.email) {
    res.status(403).json({ error: 'host_only' });
    return;
  }
  if (!lobby.guest) {
    res.status(409).json({ error: 'missing_opponent' });
    return;
  }
  lobby.phase = 'started';
  lobby.updatedAt = new Date().toISOString();
  res.status(200).json({ lobby: publicLobby(lobby, user.email) });
});

app.post('/api/lobbies/:id/leave', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const lobby = lobbies.get(req.params.id);
  if (!lobby || lobby.phase === 'closed') {
    res.status(404).json({ error: 'lobby_not_found' });
    return;
  }
  if (lobby.host.email === user.email) {
    lobby.phase = 'closed';
    lobby.updatedAt = new Date().toISOString();
    lobbies.delete(lobby.id);
    res.status(204).end();
    return;
  }
  if (lobby.guest && lobby.guest.email === user.email) {
    lobby.guest = null;
    lobby.phase = 'waiting';
    lobby.updatedAt = new Date().toISOString();
    res.status(200).json({ lobby: publicLobby(lobby, user.email) });
    return;
  }
  res.status(403).json({ error: 'not_in_lobby' });
});

app.get('/api/campaigns', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.status(200).json({ campaigns: userCampaigns(user.email).map(campaignSummary) });
});

app.post('/api/campaigns', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const now = new Date().toISOString();
  const raw = req.body && typeof req.body === 'object' ? req.body : {};
  const campaign = {
    id: crypto.randomUUID(),
    title: clampText(raw.title, 'Untitled Campaign', 64),
    description: clampText(raw.description, '', 220),
    createdAt: now,
    updatedAt: now,
    owner: user,
    levels: [buildLevel(raw.level, 0)],
  };
  campaigns.set(campaign.id, campaign);
  res.status(201).json({ campaign: campaignSummary(campaign) });
});

app.get('/api/campaigns/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const campaign = campaignForUser(req.params.id, user.email);
  if (!campaign) {
    res.status(404).json({ error: 'campaign_not_found' });
    return;
  }
  res.status(200).json({ campaign: campaignSummary(campaign) });
});

app.patch('/api/campaigns/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const campaign = campaignForUser(req.params.id, user.email);
  if (!campaign) {
    res.status(404).json({ error: 'campaign_not_found' });
    return;
  }
  const raw = req.body && typeof req.body === 'object' ? req.body : {};
  if (Object.hasOwn(raw, 'title')) campaign.title = clampText(raw.title, campaign.title, 64);
  if (Object.hasOwn(raw, 'description')) campaign.description = clampText(raw.description, campaign.description, 220);
  campaign.updatedAt = new Date().toISOString();
  res.status(200).json({ campaign: campaignSummary(campaign) });
});

app.delete('/api/campaigns/:id', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const campaign = campaignForUser(req.params.id, user.email);
  if (!campaign) {
    res.status(404).json({ error: 'campaign_not_found' });
    return;
  }
  campaigns.delete(campaign.id);
  res.status(204).end();
});

app.post('/api/campaigns/:id/levels', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const campaign = campaignForUser(req.params.id, user.email);
  if (!campaign) {
    res.status(404).json({ error: 'campaign_not_found' });
    return;
  }
  const level = buildLevel(req.body, campaign.levels.length);
  campaign.levels.push(level);
  campaign.updatedAt = new Date().toISOString();
  res.status(201).json({ campaign: campaignSummary(campaign), level: publicLevel(level) });
});

app.patch('/api/campaigns/:id/levels/:levelId', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const campaign = campaignForUser(req.params.id, user.email);
  if (!campaign) {
    res.status(404).json({ error: 'campaign_not_found' });
    return;
  }
  const level = campaign.levels.find((item) => item.id === req.params.levelId);
  if (!level) {
    res.status(404).json({ error: 'level_not_found' });
    return;
  }
  applyLevelPatch(level, req.body);
  campaign.updatedAt = new Date().toISOString();
  res.status(200).json({ campaign: campaignSummary(campaign), level: publicLevel(level) });
});

app.delete('/api/campaigns/:id/levels/:levelId', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const campaign = campaignForUser(req.params.id, user.email);
  if (!campaign) {
    res.status(404).json({ error: 'campaign_not_found' });
    return;
  }
  if (campaign.levels.length <= 1) {
    res.status(409).json({ error: 'campaign_needs_level' });
    return;
  }
  const index = campaign.levels.findIndex((level) => level.id === req.params.levelId);
  if (index === -1) {
    res.status(404).json({ error: 'level_not_found' });
    return;
  }
  campaign.levels.splice(index, 1);
  campaign.updatedAt = new Date().toISOString();
  res.status(200).json({ campaign: campaignSummary(campaign) });
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
