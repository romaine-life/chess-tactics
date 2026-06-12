(function () {
  const COLS = 8;
  const ROWS = 12;
  const LEVEL_WIDTH_MIN = 4;
  const LEVEL_WIDTH_MAX = 16;
  const LEVEL_HEIGHT_MIN = 4;
  const LEVEL_HEIGHT_MAX = 20;
  const PIECE_CHOICES = ['knight', 'bishop', 'rook'];
  const LEVEL_BRUSHES = [
    { id: 'empty', label: 'Empty', role: '', type: '', mark: '.' },
    { id: 'player:pawn', label: 'P Pawn', role: 'player', type: 'pawn', mark: 'P' },
    { id: 'player:knight', label: 'P Knight', role: 'player', type: 'knight', mark: 'N' },
    { id: 'player:bishop', label: 'P Bishop', role: 'player', type: 'bishop', mark: 'B' },
    { id: 'player:rook', label: 'P Rook', role: 'player', type: 'rook', mark: 'R' },
    { id: 'enemy:pawn', label: 'E Pawn', role: 'enemy', type: 'pawn', mark: 'P' },
    { id: 'enemy:knight', label: 'E Knight', role: 'enemy', type: 'knight', mark: 'N' },
    { id: 'enemy:bishop', label: 'E Bishop', role: 'enemy', type: 'bishop', mark: 'B' },
    { id: 'enemy:rook', label: 'E Rook', role: 'enemy', type: 'rook', mark: 'R' },
    { id: 'terrain:rock', label: 'Rock', role: 'terrain', type: 'rock', mark: 'O' },
  ];
  const PIECES = {
    pawn: { mark: 'P', name: 'Pawn', role: 'Forward footman' },
    knight: { mark: 'N', name: 'Knight', role: 'L-shaped jumper' },
    bishop: { mark: 'B', name: 'Bishop', role: 'Diagonal runner' },
    rook: { mark: 'R', name: 'Rook', role: 'Straight-line tower' },
    queen: { mark: 'Q', name: 'Queen', role: 'Promoted raider' },
    rock: { mark: 'O', name: 'Rock', role: 'Impassable obstacle' },
  };

  const GEOMETRIES = {
    pawn: [
      { type: 'top', d: 'M 16,46 L 32,54 L 48,46 L 32,38 Z' },
      { type: 'left', d: 'M 16,52 L 32,60 L 32,54 L 16,46 Z' },
      { type: 'right', d: 'M 32,60 L 48,52 L 48,46 L 32,54 Z' },
      { type: 'top', d: 'M 22,39 L 32,44 L 42,39 L 32,34 Z' },
      { type: 'left', d: 'M 22,42 L 32,47 L 32,44 L 22,39 Z' },
      { type: 'right', d: 'M 32,47 L 42,42 L 42,39 L 32,44 Z' },
      { type: 'left', d: 'M 24,37 L 32,41 L 32,32 L 24,28 Z' },
      { type: 'right', d: 'M 32,41 L 40,37 L 40,28 L 32,32 Z' },
      { type: 'top', d: 'M 22,17 L 32,22 L 42,17 L 32,12 Z' },
      { type: 'left', d: 'M 22,29 L 32,34 L 32,22 L 22,17 Z' },
      { type: 'right', d: 'M 32,34 L 42,29 L 42,17 L 32,22 Z' }
    ],
    rook: [
      { type: 'top', d: 'M 16,46 L 32,54 L 48,46 L 32,38 Z' },
      { type: 'left', d: 'M 16,52 L 32,60 L 32,54 L 16,46 Z' },
      { type: 'right', d: 'M 32,60 L 48,52 L 48,46 L 32,54 Z' },
      { type: 'top', d: 'M 20,21 L 32,27 L 44,21 L 32,15 Z' },
      { type: 'left', d: 'M 20,43 L 32,49 L 32,27 L 20,21 Z' },
      { type: 'right', d: 'M 32,49 L 44,43 L 44,21 L 32,27 Z' },
      { type: 'top', d: 'M 28,19 L 32,21 L 36,19 L 32,17 Z' },
      { type: 'left', d: 'M 28,23 L 32,25 L 32,21 L 28,19 Z' },
      { type: 'right', d: 'M 32,25 L 36,23 L 36,19 L 32,21 Z' },
      { type: 'top', d: 'M 20,15 L 24,17 L 28,15 L 24,13 Z' },
      { type: 'left', d: 'M 20,19 L 24,21 L 24,17 L 20,15 Z' },
      { type: 'right', d: 'M 24,21 L 28,19 L 28,15 L 24,17 Z' },
      { type: 'top', d: 'M 36,15 L 40,17 L 44,15 L 40,13 Z' },
      { type: 'left', d: 'M 36,19 L 40,21 L 40,17 L 36,15 Z' },
      { type: 'right', d: 'M 40,21 L 44,19 L 44,15 L 40,17 Z' },
      { type: 'top', d: 'M 28,11 L 32,13 L 36,11 L 32,9 Z' },
      { type: 'left', d: 'M 28,15 L 32,17 L 32,13 L 28,11 Z' },
      { type: 'right', d: 'M 32,17 L 36,15 L 36,11 L 32,13 Z' }
    ],
    bishop: [
      { type: 'top', d: 'M 16,46 L 32,54 L 48,46 L 32,38 Z' },
      { type: 'left', d: 'M 16,52 L 32,60 L 32,54 L 16,46 Z' },
      { type: 'right', d: 'M 32,60 L 48,52 L 48,46 L 32,54 Z' },
      { type: 'left', d: 'M 22,42 L 32,47 L 32,29 L 22,24 Z' },
      { type: 'right', d: 'M 32,47 L 42,42 L 42,24 L 32,29 Z' },
      { type: 'top', d: 'M 20,24 L 32,29 L 44,24 L 32,19 Z' },
      { type: 'left', d: 'M 20,27 L 32,32 L 32,29 L 20,24 Z' },
      { type: 'right', d: 'M 32,32 L 44,27 L 44,24 L 32,29 Z' },
      { type: 'left', d: 'M 23,21 L 32,25 L 32,11 L 23,15 Z' },
      { type: 'right', d: 'M 32,25 L 41,21 L 41,15 L 32,11 Z' },
      { type: 'accent', d: 'M 26,18 L 29,19 L 29,15 L 26,14 Z' },
      { type: 'top', d: 'M 30,6 L 32,7 L 34,6 L 32,5 Z' },
      { type: 'left', d: 'M 30,9 L 32,10 L 32,7 L 30,6 Z' },
      { type: 'right', d: 'M 32,10 L 34,9 L 34,6 L 32,7 Z' }
    ],
    knight: [
      { type: 'top', d: 'M 16,46 L 32,54 L 48,46 L 32,38 Z' },
      { type: 'left', d: 'M 16,52 L 32,60 L 32,54 L 16,46 Z' },
      { type: 'right', d: 'M 32,60 L 48,52 L 48,46 L 32,54 Z' },
      { type: 'left', d: 'M 20,38 L 32,44 L 32,25 L 20,19 Z' },
      { type: 'right', d: 'M 32,44 L 44,38 L 44,20 L 32,26 Z' },
      { type: 'top', d: 'M 20,19 L 32,25 L 44,20 L 32,14 Z' },
      { type: 'left', d: 'M 14,31 L 22,35 L 22,25 L 14,21 Z' },
      { type: 'top', d: 'M 14,21 L 22,25 L 32,20 L 24,16 Z' },
      { type: 'left', d: 'M 24,20 L 32,24 L 32,20 L 24,16 Z' },
      { type: 'left', d: 'M 26,17 L 29,18 L 29,11 L 26,12 Z' },
      { type: 'right', d: 'M 29,18 L 32,17 L 32,10 L 29,11 Z' },
      { type: 'top', d: 'M 26,12 L 29,11 L 32,10 L 29,9 Z' }
    ],
    queen: [
      { type: 'top', d: 'M 16,46 L 32,54 L 48,46 L 32,38 Z' },
      { type: 'left', d: 'M 16,52 L 32,60 L 32,54 L 16,46 Z' },
      { type: 'right', d: 'M 32,60 L 48,52 L 48,46 L 32,54 Z' },
      { type: 'top', d: 'M 18,22 L 32,28 L 46,22 L 32,16 Z' },
      { type: 'left', d: 'M 18,44 L 32,50 L 32,28 L 18,22 Z' },
      { type: 'right', d: 'M 32,50 L 46,44 L 46,22 L 32,28 Z' },
      { type: 'top', d: 'M 18,16 L 22,20 L 26,16 L 22,12 Z' },
      { type: 'left', d: 'M 18,22 L 22,24 L 22,20 L 18,16 Z' },
      { type: 'right', d: 'M 22,24 L 26,22 L 26,16 L 22,20 Z' },
      { type: 'top', d: 'M 38,16 L 42,20 L 46,16 L 42,12 Z' },
      { type: 'left', d: 'M 38,22 L 42,24 L 42,20 L 38,16 Z' },
      { type: 'right', d: 'M 42,24 L 46,22 L 46,16 L 42,20 Z' },
      { type: 'top', d: 'M 28,10 L 32,12 L 36,10 L 32,8 Z' },
      { type: 'left', d: 'M 28,16 L 32,18 L 32,12 L 28,10 Z' },
      { type: 'right', d: 'M 32,18 L 36,16 L 36,10 L 32,12 Z' }
    ],
    rock: [
      { type: 'left', d: 'M 16,44 L 32,52 L 30,36 L 12,32 Z' },
      { type: 'right', d: 'M 32,52 L 48,44 L 52,30 L 30,36 Z' },
      { type: 'left', d: 'M 12,32 L 30,36 L 31,20 L 18,18 Z' },
      { type: 'right', d: 'M 30,36 L 52,30 L 44,18 L 31,20 Z' },
      { type: 'top', d: 'M 18,18 L 31,20 L 32,10 L 22,12 Z' },
      { type: 'top', d: 'M 31,20 L 44,18 L 40,11 L 32,10 Z' }
    ]
  };

  function getPieceSvg(type, side) {
    const paths = GEOMETRIES[type] || GEOMETRIES.pawn;
    let top, left, right, deep;
    if (side === 'player') {
      top = '#eef6fc';
      left = '#b9cad6';
      right = '#8fa6b4';
      deep = '#405866';
    } else if (side === 'enemy') {
      top = '#f5af95';
      left = '#b3664d';
      right = '#7a3f2a';
      deep = '#471e11';
    } else {
      top = '#a8a8a8';
      left = '#7a7a7a';
      right = '#545454';
      deep = '#303030';
    }
    const fillColors = { top, left, right, accent: deep };

    const pathStrings = paths.map((path) => `<path d="${path.d}"></path>`).join('');
    const fillStrings = paths.map((path) => {
      const fillVal = fillColors[path.type] || left;
      return `<path d="${path.d}" fill="${fillVal}"></path>`;
    }).join('');

    return `<svg width="100%" height="100%" viewBox="0 0 64 64" style="shape-rendering: crispedges;" class="cursor-pointer transition-transform hover:-translate-y-1.5 active:translate-y-0" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <mask id="outline-mask-${type}-${side}">
          <rect width="100%" height="100%" fill="white"></rect>
          <g fill="black" stroke="black" stroke-width="0.5">
            ${pathStrings}
          </g>
        </mask>
      </defs>
      <g mask="url(#outline-mask-${type}-${side})">
        <g fill="none" stroke="rgb(0,0,0)" stroke-width="1" stroke-linejoin="miter" stroke-linecap="square">
          ${pathStrings}
        </g>
      </g>
      <g opacity="0.95" stroke="none">
        ${fillStrings}
      </g>
    </svg>`;
  }

  const IMAGES = {};
  Object.keys(GEOMETRIES).forEach((type) => {
    IMAGES[type] = {
      player: new Image(),
      enemy: new Image(),
      neutral: new Image()
    };
    IMAGES[type].player.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(getPieceSvg(type, 'player'));
    IMAGES[type].enemy.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(getPieceSvg(type, 'enemy'));
    IMAGES[type].neutral.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(getPieceSvg(type, 'neutral'));
  });

  const boardEl = document.getElementById('board');
  const boardWrapEl = boardEl.closest('.board-wrap');
  const boardScrollEl = document.getElementById('boardScroll');
  const ctx = boardEl.getContext('2d');
  const rosterEl = document.getElementById('roster');
  const logEl = document.getElementById('log');
  const statusLine = document.getElementById('statusLine');
  const anchorMeter = document.getElementById('anchorMeter');
  const enemyMeter = document.getElementById('enemyMeter');
  const selectedName = document.getElementById('selectedName');
  const selectedMeta = document.getElementById('selectedMeta');
  const moveButton = document.getElementById('moveButton');
  const powerButton = document.getElementById('powerButton');
  const threatButton = document.getElementById('threatButton');
  const endButton = document.getElementById('endButton');
  const menuLayer = document.getElementById('menuLayer');
  const accountEl = document.getElementById('account');
  const accountAvatarEl = document.getElementById('accountAvatar');
  const accountNameEl = document.getElementById('accountName');
  const signInButton = document.getElementById('signInButton');
  const signOutButton = document.getElementById('signOutButton');
  let currentUser = null;
  let lobbyPollTimer = null;
  let battleAnimFrameId = null;

  function returnTo() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function showGuest() {
    currentUser = null;
    accountAvatarEl.hidden = true;
    accountAvatarEl.removeAttribute('src');
    accountNameEl.textContent = 'Guest';
    signInButton.hidden = false;
    signOutButton.hidden = true;
  }

  function showUser(user) {
    currentUser = user;
    accountNameEl.textContent = user.name || user.email;
    if (user.avatar_url) {
      accountAvatarEl.src = user.avatar_url;
      accountAvatarEl.alt = `${user.name || user.email} avatar`;
      accountAvatarEl.hidden = false;
    } else {
      accountAvatarEl.hidden = true;
      accountAvatarEl.removeAttribute('src');
    }
    signInButton.hidden = true;
    signOutButton.hidden = false;
  }

  async function initAuth() {
    showGuest();
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) return;
      const user = await res.json();
      if (!user.signed_in) return;
      showUser(user);
      if (state.screen === 'lobbies') void loadLobbies();
      if (state.screen === 'campaigns') void loadCampaigns();
    } catch (_error) {
      showGuest();
    }
  }

  signInButton.addEventListener('click', () => {
    window.location.href = `/api/auth/sign-in?returnTo=${encodeURIComponent(returnTo())}`;
  });

  signOutButton.addEventListener('click', async () => {
    signOutButton.disabled = true;
    try {
      await fetch('/api/auth/sign-out', {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      window.location.reload();
    }
  });

  const TW = 72;
  const TH = 36;
  const CLIFF = 34;
  const DEFAULT_BOARD_METRICS = {
    cols: COLS,
    rows: ROWS,
    width: boardEl.width,
    height: boardEl.height,
    originX: boardEl.width / 2 + 54,
    originY: 54,
  };

  const state = {
    screen: 'main',
    turn: 'player',
    selected: null,
    hoverTile: null,
    lobby: null,
    lobbies: [],
    lobbyMessage: '',
    lobbyLoading: false,
    campaigns: [],
    selectedCampaignId: null,
    selectedLevelId: null,
    selectedLevelBrush: 'enemy:pawn',
    levelEditorCollapsed: false,
    campaignMessage: '',
    campaignLoading: false,
    party: ['knight', 'bishop'],
    pieces: [],
    winner: null,
    showThreats: false,
    animating: false,
    log: ['Choose your squad. One pawn is always fielded.'],
    battleAnimating: false,
    battleAnimStartTime: 0,
  };

  function rand(max) {
    return Math.floor(Math.random() * max);
  }

  function choice(items) {
    return items[rand(items.length)];
  }

  function clampBoardNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
  }

  function activeLevelSize() {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    return {
      cols: clampBoardNumber(level && level.width, COLS, LEVEL_WIDTH_MIN, LEVEL_WIDTH_MAX),
      rows: clampBoardNumber(level && level.height, ROWS, LEVEL_HEIGHT_MIN, LEVEL_HEIGHT_MAX),
    };
  }

  function currentBoardSize() {
    return state.screen === 'level-editor' ? activeLevelSize() : { cols: COLS, rows: ROWS };
  }

  function boardRows() {
    return currentBoardSize().rows;
  }

  function editorBoardMetrics(size) {
    const cols = size.cols;
    const rows = size.rows;
    const spanWidth = (cols + rows) * (TW / 2);
    const width = Math.max(DEFAULT_BOARD_METRICS.width, Math.ceil(spanWidth + 128));
    const height = Math.max(DEFAULT_BOARD_METRICS.height, Math.ceil(64 + (cols + rows) * (TH / 2) + CLIFF + 96));
    const sideMargin = (width - spanWidth) / 2;
    return {
      cols,
      rows,
      width,
      height,
      originX: sideMargin + rows * (TW / 2),
      originY: 64 + TH / 2,
    };
  }

  function boardMetrics() {
    return state.screen === 'level-editor' ? editorBoardMetrics(activeLevelSize()) : DEFAULT_BOARD_METRICS;
  }

  function syncCanvasSize(metrics) {
    if (boardEl.width !== metrics.width) boardEl.width = metrics.width;
    if (boardEl.height !== metrics.height) boardEl.height = metrics.height;
  }

  function inBounds(x, y, size) {
    const bounds = size || currentBoardSize();
    return x >= 0 && x < bounds.cols && y >= 0 && y < bounds.rows;
  }

  function livingPieces(side) {
    return state.pieces.filter((piece) => piece.side === side && piece.alive);
  }

  function pieceAt(x, y) {
    return state.pieces.find((piece) => piece.alive && piece.x === x && piece.y === y) || null;
  }

  function selectedPiece() {
    return state.pieces.find((piece) => piece.id === state.selected && piece.alive) || null;
  }

  function isEnemy(piece, target) {
    if (target && (target.type === 'rock' || target.side === 'neutral')) return false;
    return target && target.side !== piece.side;
  }

  function addLog(message, tone) {
    state.log.unshift(tone ? `<span class="${tone}">${message}</span>` : message);
    state.log = state.log.slice(0, 8);
  }

  function escapeText(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function lobbyDisplayName(user) {
    return user ? escapeText(user.name || user.email) : 'Open seat';
  }

  function lobbyAvatar(user) {
    if (!user || !user.avatar_url) {
      return '<span class="lobby-avatar fallback" aria-hidden="true">?</span>';
    }
    return `<img class="lobby-avatar" src="${escapeText(user.avatar_url)}" alt="">`;
  }

  async function apiRequest(path, options) {
    const res = await fetch(path, {
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      ...options,
    });
    let body = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch (_error) {
        body = { error: text };
      }
    }
    if (!res.ok) {
      const error = new Error((body && body.error) || 'lobby_request_failed');
      error.statusCode = res.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  function lobbyRequest(path, options) {
    return apiRequest(path, options);
  }

  function setLobbyMessage(message, danger) {
    state.lobbyMessage = danger ? `<span class="danger">${escapeText(message)}</span>` : escapeText(message);
  }

  async function loadLobbies(silent) {
    if (!currentUser) {
      state.lobby = null;
      state.lobbies = [];
      setLobbyMessage('Sign in to host or join lobbies.');
      render();
      return;
    }
    if (!silent) state.lobbyLoading = true;
    render();
    try {
      const body = await lobbyRequest('/api/lobbies');
      state.lobby = body.current || null;
      state.lobbies = body.lobbies || [];
      if (!silent) setLobbyMessage(state.lobby ? 'Lobby synced.' : 'Choose a lobby or host one.');
      if (state.lobby && state.lobby.phase === 'started' && state.screen === 'lobby') {
        setLobbyMessage('Match is ready. Deploy when you are set.');
      }
    } catch (error) {
      setLobbyMessage(error.message === 'sign_in_required' ? 'Sign in to use lobbies.' : 'Could not load lobbies.', true);
    } finally {
      state.lobbyLoading = false;
      render();
    }
  }

  async function hostLobby() {
    state.lobbyLoading = true;
    setLobbyMessage('Opening lobby...');
    render();
    try {
      const body = await lobbyRequest('/api/lobbies', { method: 'POST', body: '{}' });
      state.lobby = body.lobby;
      state.screen = 'lobby';
      setLobbyMessage('Lobby open. Waiting for an opponent.');
      await loadLobbies(true);
    } catch (error) {
      setLobbyMessage(error.message || 'Could not host lobby.', true);
    } finally {
      state.lobbyLoading = false;
      render();
    }
  }

  async function joinLobby(id) {
    state.lobbyLoading = true;
    setLobbyMessage('Joining lobby...');
    render();
    try {
      const body = await lobbyRequest(`/api/lobbies/${encodeURIComponent(id)}/join`, { method: 'POST', body: '{}' });
      state.lobby = body.lobby;
      state.screen = 'lobby';
      setLobbyMessage('Joined. Waiting for the host to start.');
      await loadLobbies(true);
    } catch (error) {
      setLobbyMessage(error.message || 'Could not join lobby.', true);
    } finally {
      state.lobbyLoading = false;
      render();
    }
  }

  async function startLobbyMatch() {
    if (!state.lobby) return;
    state.lobbyLoading = true;
    setLobbyMessage('Starting match...');
    render();
    try {
      const body = await lobbyRequest(`/api/lobbies/${encodeURIComponent(state.lobby.id)}/start`, { method: 'POST', body: '{}' });
      state.lobby = body.lobby;
      setLobbyMessage('Match started. Deploy your squad.');
    } catch (error) {
      setLobbyMessage(error.message || 'Could not start lobby.', true);
    } finally {
      state.lobbyLoading = false;
      render();
    }
  }

  async function leaveLobby() {
    if (!state.lobby) return;
    const id = state.lobby.id;
    state.lobbyLoading = true;
    setLobbyMessage('Leaving lobby...');
    render();
    try {
      await lobbyRequest(`/api/lobbies/${encodeURIComponent(id)}/leave`, { method: 'POST', body: '{}' });
      state.lobby = null;
      state.screen = 'lobbies';
      setLobbyMessage('Lobby closed.');
      await loadLobbies(true);
    } catch (error) {
      setLobbyMessage(error.message || 'Could not leave lobby.', true);
    } finally {
      state.lobbyLoading = false;
      render();
    }
  }

  function campaignRequest(path, options) {
    return apiRequest(path, options);
  }

  function selectedCampaign() {
    return state.campaigns.find((campaign) => campaign.id === state.selectedCampaignId) || state.campaigns[0] || null;
  }

  function selectedLevel(campaign) {
    if (!campaign || !campaign.levels || !campaign.levels.length) return null;
    return campaign.levels.find((level) => level.id === state.selectedLevelId) || campaign.levels[0];
  }

  function setCampaignMessage(message, danger) {
    state.campaignMessage = danger ? `<span class="danger">${escapeText(message)}</span>` : escapeText(message);
  }

  function syncCampaign(campaign) {
    if (!campaign) return;
    const index = state.campaigns.findIndex((item) => item.id === campaign.id);
    if (index === -1) {
      state.campaigns.unshift(campaign);
    } else {
      state.campaigns[index] = campaign;
    }
    state.selectedCampaignId = campaign.id;
    if (!campaign.levels.some((level) => level.id === state.selectedLevelId)) {
      state.selectedLevelId = campaign.levels[0] && campaign.levels[0].id;
    }
  }

  async function loadCampaigns(silent) {
    if (!currentUser) {
      state.campaigns = [];
      state.selectedCampaignId = null;
      state.selectedLevelId = null;
      setCampaignMessage('Sign in to edit campaigns.');
      render();
      return;
    }
    if (!silent) state.campaignLoading = true;
    render();
    try {
      const body = await campaignRequest('/api/campaigns');
      state.campaigns = body.campaigns || [];
      if (!state.campaigns.some((campaign) => campaign.id === state.selectedCampaignId)) {
        state.selectedCampaignId = state.campaigns[0] && state.campaigns[0].id;
      }
      const campaign = selectedCampaign();
      if (!campaign || !campaign.levels.some((level) => level.id === state.selectedLevelId)) {
        state.selectedLevelId = campaign && campaign.levels[0] && campaign.levels[0].id;
      }
      if (!silent) setCampaignMessage(campaign ? 'Campaigns synced.' : 'Create a campaign draft.');
    } catch (error) {
      setCampaignMessage(error.message === 'sign_in_required' ? 'Sign in to edit campaigns.' : 'Could not load campaigns.', true);
    } finally {
      state.campaignLoading = false;
      render();
    }
  }

  async function createCampaign() {
    state.campaignLoading = true;
    setCampaignMessage('Creating campaign...');
    render();
    try {
      const body = await campaignRequest('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          title: `${currentUser && currentUser.name ? currentUser.name.split('@')[0] : 'Player'} Campaign`,
          description: 'Draft campaign',
          level: { name: 'Level 1', objective: 'Defeat all enemies' },
        }),
      });
      syncCampaign(body.campaign);
      setCampaignMessage('Campaign created.');
    } catch (error) {
      setCampaignMessage(error.message || 'Could not create campaign.', true);
    } finally {
      state.campaignLoading = false;
      render();
    }
  }

  function campaignFormData() {
    return {
      title: document.getElementById('campaignTitle') && document.getElementById('campaignTitle').value,
      description: document.getElementById('campaignDescription') && document.getElementById('campaignDescription').value,
    };
  }

  function levelFormData() {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    return {
      name: (document.getElementById('levelName') && document.getElementById('levelName').value) || (level && level.name),
      objective: (document.getElementById('levelObjective') && document.getElementById('levelObjective').value) || (level && level.objective),
      difficulty: (document.getElementById('levelDifficulty') && document.getElementById('levelDifficulty').value) || (level && level.difficulty),
      width: (document.getElementById('levelWidth') && document.getElementById('levelWidth').value) || (level && level.width),
      height: (document.getElementById('levelHeight') && document.getElementById('levelHeight').value) || (level && level.height),
      enemy_budget: (document.getElementById('levelEnemyBudget') && document.getElementById('levelEnemyBudget').value) || (level && level.enemy_budget),
      notes: (document.getElementById('levelNotes') && document.getElementById('levelNotes').value) || (level && level.notes),
      layout: level ? (level.layout || []) : [],
    };
  }

  function applyLevelFormDraft(level) {
    if (!level) return;
    const widthInput = document.getElementById('levelWidth');
    const heightInput = document.getElementById('levelHeight');
    if (widthInput) level.width = clampBoardNumber(widthInput.value, level.width, LEVEL_WIDTH_MIN, LEVEL_WIDTH_MAX);
    if (heightInput) level.height = clampBoardNumber(heightInput.value, level.height, LEVEL_HEIGHT_MIN, LEVEL_HEIGHT_MAX);
    const cols = clampBoardNumber(level.width, COLS, LEVEL_WIDTH_MIN, LEVEL_WIDTH_MAX);
    const rows = clampBoardNumber(level.height, ROWS, LEVEL_HEIGHT_MIN, LEVEL_HEIGHT_MAX);
    level.width = cols;
    level.height = rows;
    level.layout = levelLayout(level).filter((cell) => (
      inBounds(Number(cell.x), Number(cell.y), { cols, rows })
    ));
  }

  function selectedLevelBrush() {
    return LEVEL_BRUSHES.find((brush) => brush.id === state.selectedLevelBrush) || LEVEL_BRUSHES[0];
  }

  function levelLayout(level) {
    if (!level || !Array.isArray(level.layout)) return [];
    return level.layout;
  }

  function levelCellAt(level, x, y) {
    return levelLayout(level).find((cell) => Number(cell.x) === x && Number(cell.y) === y) || null;
  }

  function brushForCell(cell) {
    if (!cell) return LEVEL_BRUSHES[0];
    return LEVEL_BRUSHES.find((brush) => brush.role === cell.role && brush.type === cell.type) || LEVEL_BRUSHES[0];
  }

  function paintLevelCell(level, x, y) {
    const brush = selectedLevelBrush();
    const layout = levelLayout(level).filter((cell) => Number(cell.x) !== x || Number(cell.y) !== y);
    if (brush.id !== 'empty') {
      layout.push({ x, y, role: brush.role, type: brush.type });
    }
    level.layout = layout.sort((a, b) => (Number(a.y) - Number(b.y)) || (Number(a.x) - Number(b.x)));
  }

  function levelCellToPiece(cell, index) {
    const side = cell.role === 'terrain' ? 'neutral' : cell.role;
    const type = cell.type === 'rock' ? 'rock' : cell.type;
    const base = PIECES[type] || PIECES.pawn;
    const rows = boardRows();
    return {
      id: `editor-${index}-${cell.x}-${cell.y}-${cell.role}-${cell.type}`,
      side,
      type,
      mark: base.mark,
      name: `${side === 'player' ? 'Allied' : (side === 'enemy' ? 'Enemy' : 'Terrain')} ${base.name}`,
      role: base.role,
      x: Number(cell.x),
      y: Number(cell.y),
      alive: true,
      startY: side === 'player' ? rows - 1 : (side === 'enemy' ? 0 : -1),
      offsetY: 0,
    };
  }

  function syncLevelEditorPieces() {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    state.pieces = levelLayout(level)
      .filter((cell) => inBounds(Number(cell.x), Number(cell.y)))
      .map(levelCellToPiece);
    state.selected = null;
    state.turn = 'editor';
  }

  function editorPiecesToLayout() {
    return state.pieces
      .filter((piece) => piece.alive)
      .map((piece) => ({
        x: piece.x,
        y: piece.y,
        role: piece.side === 'neutral' ? 'terrain' : piece.side,
        type: piece.type,
      }))
      .sort((a, b) => (Number(a.y) - Number(b.y)) || (Number(a.x) - Number(b.x)));
  }

  function enterLevelEditor() {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    if (!campaign || !level) return;
    applyLevelFormDraft(level);
    state.screen = 'level-editor';
    state.hoverTile = null;
    syncLevelEditorPieces();
    setCampaignMessage(`Editing ${level.name}.`);
    render();
  }

  function exitLevelEditor() {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    if (level) level.layout = editorPiecesToLayout();
    state.screen = 'campaigns';
    state.hoverTile = null;
    state.selected = null;
    render();
  }

  function paintEditorTile(x, y) {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    if (!level) return;
    level.layout = editorPiecesToLayout();
    paintLevelCell(level, x, y);
    syncLevelEditorPieces();
    setCampaignMessage('Board changed. Save the level to persist it.');
    render();
  }

  async function saveLevelEditor() {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    if (!level) return;
    level.layout = editorPiecesToLayout();
    await saveCampaignLevel();
    if (selectedLevel(selectedCampaign())) syncLevelEditorPieces();
    state.screen = 'level-editor';
    render();
  }

  function clearLevelLayout() {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    if (!level) return;
    level.layout = [];
    if (state.screen === 'level-editor') syncLevelEditorPieces();
    setCampaignMessage('Level board cleared. Save the level to persist it.');
    render();
  }

  function seededLevelLayout(width, height) {
    return [
      { x: Math.floor(width / 2), y: height - 1, role: 'player', type: 'pawn' },
      { x: Math.floor(width / 2), y: 0, role: 'enemy', type: 'pawn' },
      { x: Math.max(0, Math.floor(width / 2) - 1), y: Math.max(0, Math.floor(height / 2) - 1), role: 'terrain', type: 'rock' },
    ];
  }

  function seedLevelLayout() {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    if (!level) return;
    level.layout = seededLevelLayout(Number(level.width) || 8, Number(level.height) || 12);
    if (state.screen === 'level-editor') syncLevelEditorPieces();
    setCampaignMessage('Level board seeded. Save the level to persist it.');
    render();
  }

  async function saveCampaignDetails() {
    const campaign = selectedCampaign();
    if (!campaign) return;
    const patch = campaignFormData();
    state.campaignLoading = true;
    setCampaignMessage('Saving campaign...');
    render();
    try {
      const body = await campaignRequest(`/api/campaigns/${encodeURIComponent(campaign.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      syncCampaign(body.campaign);
      setCampaignMessage('Campaign saved.');
    } catch (error) {
      setCampaignMessage(error.message || 'Could not save campaign.', true);
    } finally {
      state.campaignLoading = false;
      render();
    }
  }

  async function deleteCampaign() {
    const campaign = selectedCampaign();
    if (!campaign) return;
    state.campaignLoading = true;
    setCampaignMessage('Deleting campaign...');
    render();
    try {
      await campaignRequest(`/api/campaigns/${encodeURIComponent(campaign.id)}`, { method: 'DELETE' });
      state.campaigns = state.campaigns.filter((item) => item.id !== campaign.id);
      state.selectedCampaignId = state.campaigns[0] && state.campaigns[0].id;
      const nextCampaign = selectedCampaign();
      state.selectedLevelId = nextCampaign && nextCampaign.levels[0] && nextCampaign.levels[0].id;
      setCampaignMessage('Campaign deleted.');
    } catch (error) {
      setCampaignMessage(error.message || 'Could not delete campaign.', true);
    } finally {
      state.campaignLoading = false;
      render();
    }
  }

  async function addCampaignLevel() {
    const campaign = selectedCampaign();
    if (!campaign) return;
    state.campaignLoading = true;
    setCampaignMessage('Adding level...');
    render();
    try {
      const body = await campaignRequest(`/api/campaigns/${encodeURIComponent(campaign.id)}/levels`, {
        method: 'POST',
        body: JSON.stringify({ name: `Level ${campaign.levels.length + 1}`, objective: 'Defeat all enemies' }),
      });
      syncCampaign(body.campaign);
      state.selectedLevelId = body.level.id;
      setCampaignMessage('Level added.');
      state.screen = 'level-editor';
      syncLevelEditorPieces();
    } catch (error) {
      setCampaignMessage(error.message || 'Could not add level.', true);
    } finally {
      state.campaignLoading = false;
      render();
    }
  }

  async function saveCampaignLevel() {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    if (!campaign || !level) return;
    const patch = levelFormData();
    state.campaignLoading = true;
    setCampaignMessage('Saving level...');
    render();
    try {
      const body = await campaignRequest(`/api/campaigns/${encodeURIComponent(campaign.id)}/levels/${encodeURIComponent(level.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      syncCampaign(body.campaign);
      state.selectedLevelId = body.level.id;
      setCampaignMessage('Level saved.');
    } catch (error) {
      setCampaignMessage(error.message || 'Could not save level.', true);
    } finally {
      state.campaignLoading = false;
      render();
    }
  }

  async function deleteCampaignLevel() {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    if (!campaign || !level) return;
    state.campaignLoading = true;
    setCampaignMessage('Deleting level...');
    render();
    try {
      const body = await campaignRequest(`/api/campaigns/${encodeURIComponent(campaign.id)}/levels/${encodeURIComponent(level.id)}`, {
        method: 'DELETE',
      });
      syncCampaign(body.campaign);
      setCampaignMessage('Level deleted.');
    } catch (error) {
      setCampaignMessage(error.message === 'campaign_needs_level' ? 'Campaigns need at least one level.' : (error.message || 'Could not delete level.'), true);
    } finally {
      state.campaignLoading = false;
      render();
    }
  }

  function emptyBackCells(side) {
    const rows = side === 'player' ? [ROWS - 1, ROWS - 2] : [0, 1];
    const cells = [];
    rows.forEach((y) => {
      for (let x = 0; x < COLS; x += 1) {
        if (!pieceAt(x, y)) cells.push({ x, y });
      }
    });
    return cells;
  }

  function placeRandom(piece, side) {
    const cells = emptyBackCells(side);
    const spot = cells.splice(rand(cells.length), 1)[0];
    piece.x = spot.x;
    piece.y = spot.y;
  }

  function createPiece(side, type, index) {
    const base = PIECES[type];
    let namePrefix = '';
    if (side === 'player') namePrefix = 'Allied ';
    else if (side === 'enemy') namePrefix = 'Enemy ';
    return {
      id: `${side}-${index}-${Date.now()}-${rand(9999)}`,
      side,
      type,
      mark: base.mark,
      name: `${namePrefix}${base.name}`,
      role: base.role,
      x: 0,
      y: 0,
      alive: true,
      startY: side === 'player' ? ROWS - 1 : (side === 'enemy' ? 0 : -1),
    };
  }

  function easeOutBounce(x) {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (x < 1 / d1) {
      return n1 * x * x;
    } else if (x < 2 / d1) {
      return n1 * (x -= 1.5 / d1) * x + 0.75;
    } else if (x < 2.5 / d1) {
      return n1 * (x -= 2.25 / d1) * x + 0.9375;
    } else {
      return n1 * (x -= 2.625 / d1) * x + 0.984375;
    }
  }

  function animate() {
    if (!state.battleAnimating || state.screen !== 'game') {
      state.battleAnimating = false;
      battleAnimFrameId = null;
      return;
    }
    const now = performance.now();
    const elapsed = now - state.battleAnimStartTime;
    let allDone = true;
    const startHeight = 400;
    const duration = 700;

    state.pieces.forEach((piece) => {
      const delay = piece.dropDelay || 0;
      if (elapsed < delay) {
        piece.offsetY = startHeight;
        allDone = false;
      } else if (elapsed < delay + duration) {
        const t = (elapsed - delay) / duration;
        piece.offsetY = startHeight * (1 - easeOutBounce(t));
        allDone = false;
      } else {
        piece.offsetY = 0;
      }
    });

    render();

    if (allDone) {
      state.battleAnimating = false;
      battleAnimFrameId = null;
      render();
    } else {
      battleAnimFrameId = requestAnimationFrame(animate);
    }
  }

  function startGame() {
    const playerTypes = ['pawn', ...state.party];
    const enemyTypes = ['pawn', choice(PIECE_CHOICES), choice(PIECE_CHOICES)];
    state.pieces = [];
    playerTypes.forEach((type, index) => {
      const piece = createPiece('player', type, index);
      placeRandom(piece, 'player');
      state.pieces.push(piece);
    });
    enemyTypes.forEach((type, index) => {
      const piece = createPiece('enemy', type, index);
      placeRandom(piece, 'enemy');
      state.pieces.push(piece);
    });

    // Generate rocks (3 to 6) row 3 to row 9 (y: 2 to 8)
    const numRocks = 3 + rand(4);
    const possibleSquares = [];
    for (let y = 2; y <= 8; y++) {
      for (let x = 0; x < COLS; x++) {
        possibleSquares.push({ x, y });
      }
    }
    for (let i = 0; i < numRocks; i++) {
      if (possibleSquares.length === 0) break;
      const index = rand(possibleSquares.length);
      const spot = possibleSquares.splice(index, 1)[0];
      const rock = createPiece('neutral', 'rock', i);
      rock.x = spot.x;
      rock.y = spot.y;
      state.pieces.push(rock);
    }

    // Assign stagger delays and starting height to pieces
    state.pieces.forEach((piece, index) => {
      piece.dropDelay = index * 100;
      piece.offsetY = 400;
    });

    state.turn = 'player';
    state.selected = livingPieces('player')[0].id;
    state.winner = null;
    state.screen = 'game';
    if (state.lobby) {
      const opponent = state.lobby.viewer_role === 'host' ? state.lobby.guest : state.lobby.host;
      const opponentName = opponent ? escapeText(opponent.name || opponent.email || 'opponent') : 'opponent';
      state.log = [
        `${numRocks} rocks fall on the board!`,
        `Lobby match started against ${opponentName}.`,
        `Enemy fields ${enemyTypes.map((type) => PIECES[type].name).join(', ')}.`,
        'Pick one piece and move or capture. Last side standing wins.',
      ];
    } else {
      state.log = [
        `${numRocks} rocks fall on the board!`,
        `Enemy fields ${enemyTypes.map((type) => PIECES[type].name).join(', ')}.`,
        'Pick one piece and move or capture. Last side standing wins.',
      ];
    }

    if (battleAnimFrameId) {
      cancelAnimationFrame(battleAnimFrameId);
      battleAnimFrameId = null;
    }

    state.battleAnimating = true;
    state.battleAnimStartTime = performance.now();
    battleAnimFrameId = requestAnimationFrame(animate);
  }

  function rayMoves(piece, dirs) {
    const moves = [];
    dirs.forEach(([dx, dy]) => {
      for (let step = 1; ; step += 1) {
        const x = piece.x + dx * step;
        const y = piece.y + dy * step;
        if (!inBounds(x, y)) break;
        const occupant = pieceAt(x, y);
        if (occupant) {
          if (isEnemy(piece, occupant)) moves.push({ x, y, capture: occupant.id });
          break;
        }
        moves.push({ x, y });
      }
    });
    return moves;
  }

  function stepMoves(piece, deltas) {
    return deltas
      .map(([dx, dy]) => ({ x: piece.x + dx, y: piece.y + dy }))
      .filter((move) => {
        if (!inBounds(move.x, move.y)) return false;
        const occupant = pieceAt(move.x, move.y);
        if (!occupant) return true;
        if (!isEnemy(piece, occupant)) return false;
        move.capture = occupant.id;
        return true;
      });
  }

  function pawnMoves(piece) {
    const dir = piece.side === 'player' ? -1 : 1;
    const moves = [];
    const one = { x: piece.x, y: piece.y + dir };
    if (inBounds(one.x, one.y) && !pieceAt(one.x, one.y)) {
      moves.push(one);
      const two = { x: piece.x, y: piece.y + dir * 2 };
      if (piece.y === piece.startY && inBounds(two.x, two.y) && !pieceAt(two.x, two.y)) moves.push(two);
    }
    [-1, 1].forEach((dx) => {
      const x = piece.x + dx;
      const y = piece.y + dir;
      const occupant = inBounds(x, y) && pieceAt(x, y);
      if (isEnemy(piece, occupant)) moves.push({ x, y, capture: occupant.id });
    });
    return moves;
  }

  function legalMoves(piece) {
    if (!piece || !piece.alive || piece.type === 'rock' || state.screen !== 'game') return [];
    if (piece.type === 'pawn') return pawnMoves(piece);
    if (piece.type === 'knight') {
      return stepMoves(piece, [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]);
    }
    if (piece.type === 'bishop') return rayMoves(piece, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
    if (piece.type === 'rook') return rayMoves(piece, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
    return rayMoves(piece, [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
  }

  function attackedSquares(piece) {
    if (!piece || !piece.alive || piece.type === 'rock') return [];
    if (piece.type === 'pawn') {
      const dir = piece.side === 'player' ? -1 : 1;
      const squares = [];
      [-1, 1].forEach((dx) => {
        const x = piece.x + dx;
        const y = piece.y + dir;
        if (inBounds(x, y)) {
          squares.push({ x, y });
        }
      });
      return squares;
    }
    if (piece.type === 'knight') {
      const deltas = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
      return deltas
        .map(([dx, dy]) => ({ x: piece.x + dx, y: piece.y + dy }))
        .filter((pos) => inBounds(pos.x, pos.y));
    }
    const dirs = piece.type === 'bishop'
      ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
      : piece.type === 'rook'
        ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
        : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    
    const squares = [];
    dirs.forEach(([dx, dy]) => {
      for (let step = 1; ; step += 1) {
        const x = piece.x + dx * step;
        const y = piece.y + dy * step;
        if (!inBounds(x, y)) break;
        squares.push({ x, y });
        if (pieceAt(x, y)) break;
      }
    });
    return squares;
  }

  function getEnemyThreats() {
    const threats = new Map();
    livingPieces('enemy').forEach((piece) => {
      attackedSquares(piece).forEach((sq) => {
        const key = `${sq.x},${sq.y}`;
        threats.set(key, sq);
      });
    });
    return Array.from(threats.values());
  }

  function promoteIfNeeded(piece) {
    if (piece.type !== 'pawn') return;
    if ((piece.side === 'player' && piece.y === 0) || (piece.side === 'enemy' && piece.y === ROWS - 1)) {
      piece.type = 'queen';
      piece.mark = PIECES.queen.mark;
      piece.name = `${piece.side === 'player' ? 'Allied' : 'Enemy'} Queen`;
      piece.role = PIECES.queen.role;
      addLog(`${piece.name} rises from a pawn.`, piece.side === 'player' ? 'victory' : 'danger');
    }
  }

  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function getPieceRenderPos(piece) {
    if (piece.anim) {
      const now = performance.now();
      const elapsed = now - piece.anim.startTime;
      const t = Math.min(1, elapsed / piece.anim.duration);
      const easeT = easeInOutQuad(t);
      const px = piece.anim.startX + (piece.anim.endX - piece.anim.startX) * easeT;
      const py = piece.anim.startY + (piece.anim.endY - piece.anim.startY) * easeT;
      return { x: px, y: py };
    }
    return { x: piece.x, y: piece.y };
  }

  let animFrameId = null;
  function updateAnimations() {
    let active = false;
    const now = performance.now();
    const callbacks = [];
    state.pieces.forEach((piece) => {
      if (piece.anim) {
        const elapsed = now - piece.anim.startTime;
        if (elapsed >= piece.anim.duration) {
          const cb = piece.anim.callback;
          piece.anim = null;
          if (cb) callbacks.push(cb);
        } else {
          active = true;
        }
      }
    });

    drawBoard();

    if (active) {
      animFrameId = requestAnimationFrame(updateAnimations);
    } else {
      animFrameId = null;
      render();
    }

    callbacks.forEach((cb) => cb());
  }

  function startAnimationLoop() {
    if (!animFrameId) {
      animFrameId = requestAnimationFrame(updateAnimations);
    }
  }

  function movePiece(piece, move, onComplete) {
    const startX = piece.x;
    const startY = piece.y;
    const endX = move.x;
    const endY = move.y;

    state.animating = true;

    piece.anim = {
      startX,
      startY,
      endX,
      endY,
      startTime: performance.now(),
      duration: 350,
      callback: () => {
        const captured = move.capture ? state.pieces.find((target) => target.id === move.capture) : pieceAt(endX, endY);
        if (captured && captured.side !== piece.side) {
          captured.alive = false;
          addLog(`${piece.name} captures ${captured.name}.`, piece.side === 'player' ? 'victory' : 'danger');
        } else {
          addLog(`${piece.name} advances.`);
        }
        piece.x = endX;
        piece.y = endY;
        promoteIfNeeded(piece);
        checkVictory();

        state.animating = false;
        if (onComplete) onComplete();
      }
    };
    startAnimationLoop();
  }

  function checkVictory() {
    const playerCount = livingPieces('player').length;
    const enemyCount = livingPieces('enemy').length;
    if (!playerCount || !enemyCount) {
      state.winner = playerCount ? 'player' : 'enemy';
      state.screen = 'victory';
      state.turn = 'done';
      state.selected = null;
      addLog(playerCount ? 'Victory. The last enemy piece falls.' : 'Defeat. No allied pieces remain.', playerCount ? 'victory' : 'danger');
    }
  }

  function completePlayerMove(piece, move) {
    movePiece(piece, move, () => {
      if (state.winner) {
        render();
        return;
      }
      state.turn = 'enemy';
      state.selected = null;
      render();
      window.setTimeout(enemyTurn, 380);
    });
  }

  function enemyTurn() {
    if (state.screen !== 'game' || state.turn !== 'enemy') return;
    const candidates = livingPieces('enemy')
      .map((piece) => ({ piece, moves: legalMoves(piece) }))
      .filter((entry) => entry.moves.length);
    if (!candidates.length) {
      addLog('Enemy has no legal move.');
      state.turn = 'player';
      state.selected = livingPieces('player')[0] && livingPieces('player')[0].id;
      render();
      return;
    }
    const captureEntries = candidates
      .map((entry) => ({ piece: entry.piece, moves: entry.moves.filter((move) => move.capture) }))
      .filter((entry) => entry.moves.length);
    const entry = choice(captureEntries.length ? captureEntries : candidates);
    movePiece(entry.piece, choice(entry.moves), () => {
      if (!state.winner) {
        state.turn = 'player';
        state.selected = livingPieces('player')[0] && livingPieces('player')[0].id;
      }
      render();
    });
  }

  function handleTile(x, y) {
    if (state.screen === 'level-editor') {
      paintEditorTile(x, y);
      return;
    }
    if (state.screen !== 'game' || state.turn !== 'player' || state.battleAnimating || state.animating) return;
    const clicked = pieceAt(x, y);
    if (clicked && clicked.side === 'player') {
      state.selected = clicked.id;
      render();
      return;
    }
    const piece = selectedPiece();
    if (piece && piece.side === 'player') {
      const move = legalMoves(piece).find((item) => item.x === x && item.y === y);
      if (move) {
        completePlayerMove(piece, move);
        return;
      }
    }
    if (clicked && clicked.side === 'enemy') {
      state.selected = clicked.id;
      render();
      return;
    }
  }

  function isoCenter(c, r, metrics) {
    const board = metrics || boardMetrics();
    return { x: board.originX + (c - r) * (TW / 2), y: board.originY + (c + r) * (TH / 2) };
  }

  function prand(a, b, salt) {
    let h = (a * 73856093) ^ (b * 19349663) ^ (salt * 83492791);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function diamond(cx, cy) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - TH / 2);
    ctx.lineTo(cx + TW / 2, cy);
    ctx.lineTo(cx, cy + TH / 2);
    ctx.lineTo(cx - TW / 2, cy);
    ctx.closePath();
  }

  function drawCliff(metrics) {
    const leftCenter = isoCenter(0, metrics.rows - 1, metrics);
    const rightCenter = isoCenter(metrics.cols - 1, 0, metrics);
    const bottomCenter = isoCenter(metrics.cols - 1, metrics.rows - 1, metrics);
    const left = { x: leftCenter.x - TW / 2, y: leftCenter.y };
    const right = { x: rightCenter.x + TW / 2, y: rightCenter.y };
    const bottom = { x: bottomCenter.x, y: bottomCenter.y + TH / 2 };
    ctx.fillStyle = '#5a4226';
    ctx.beginPath();
    ctx.moveTo(left.x, left.y); ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(bottom.x, bottom.y + CLIFF); ctx.lineTo(left.x, left.y + CLIFF);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#45331d';
    ctx.beginPath();
    ctx.moveTo(bottom.x, bottom.y); ctx.lineTo(right.x, right.y);
    ctx.lineTo(right.x, right.y + CLIFF); ctx.lineTo(bottom.x, bottom.y + CLIFF);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#56753b';
    ctx.beginPath();
    ctx.moveTo(left.x, left.y); ctx.lineTo(bottom.x, bottom.y); ctx.lineTo(right.x, right.y);
    ctx.lineTo(right.x, right.y + 3); ctx.lineTo(bottom.x, bottom.y + 3); ctx.lineTo(left.x, left.y + 3);
    ctx.closePath(); ctx.fill();
  }

  function drawTile(c, r, metrics) {
    const { x: cx, y: cy } = isoCenter(c, r, metrics);
    ctx.save();
    diamond(cx, cy);
    ctx.fillStyle = (c + r) % 2 ? '#6a8e4c' : '#789d59';
    ctx.fill();
    ctx.clip();
    for (let i = 0; i < 7; i += 1) {
      const bx = Math.round(cx + (prand(c, r, i) - 0.5) * TW * 0.64);
      const by = Math.round(cy + (prand(c, r, i + 20) - 0.5) * TH * 0.58);
      ctx.fillStyle = prand(c, r, i + 40) > 0.5 ? '#587a3e' : '#87ad66';
      ctx.fillRect(bx, by, 2, 2);
    }
    ctx.restore();
    diamond(cx, cy);
    ctx.strokeStyle = 'rgba(28,42,18,0.62)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawDiamondFill(x, y, fill, stroke, metrics) {
    const center = isoCenter(x, y, metrics);
    diamond(center.x, center.y);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawTacticalIndicators(x, y, isMove, isAttack, isEnemy, metrics) {
    const { x: cx, y: cy } = isoCenter(x, y, metrics);
    
    // 1. Draw tile-wide background/shading
    if (isMove && isAttack) {
      drawDiamondFill(x, y, isEnemy ? 'rgba(168,85,247,0.12)' : 'rgba(14,165,233,0.12)', null, metrics);
    } else if (isMove) {
      drawDiamondFill(x, y, isEnemy ? 'rgba(168,85,247,0.08)' : 'rgba(14,165,233,0.08)', null, metrics);
    } else if (isAttack) {
      drawDiamondFill(x, y, isEnemy ? 'rgba(239,68,68,0.06)' : 'rgba(249,115,22,0.06)', null, metrics);
    }
    
    // 2. Draw Attack Indicator (Dashed border around the tile)
    if (isAttack) {
      ctx.save();
      diamond(cx, cy);
      ctx.strokeStyle = isEnemy ? '#ef4444' : '#f97316'; // Red for enemy attacks, Orange for player attacks
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.restore();
    }
    
    // 3. Draw Move Indicator (Isometric disk/ring in the center of the tile)
    if (isMove) {
      ctx.save();
      ctx.beginPath();
      // An isometric ellipse: horizontal radius = 9, vertical radius = 4.5
      ctx.ellipse(cx, cy, 9, 4.5, 0, 0, 2 * Math.PI);
      
      const strokeColor = isEnemy ? '#a855f7' : '#0ea5e9'; // Purple for enemy moves, Cyan for player moves
      const fillColor = isEnemy ? 'rgba(168,85,247,0.45)' : 'rgba(14,165,233,0.45)';
      
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBoard() {
    const metrics = boardMetrics();
    syncCanvasSize(metrics);
    ctx.clearRect(0, 0, boardEl.width, boardEl.height);
    ctx.imageSmoothingEnabled = false;
    drawCliff(metrics);
    for (let s = 0; s <= metrics.cols + metrics.rows - 2; s += 1) {
      for (let c = 0; c < metrics.cols; c += 1) {
        const r = s - c;
        if (r >= 0 && r < metrics.rows) drawTile(c, r, metrics);
      }
    }
    for (let x = 0; x < metrics.cols; x += 1) {
      drawDiamondFill(x, 0, 'rgba(255,106,82,0.13)', null, metrics);
      if (metrics.rows > 1) drawDiamondFill(x, 1, 'rgba(255,106,82,0.08)', null, metrics);
      drawDiamondFill(x, metrics.rows - 1, 'rgba(174,230,255,0.14)', null, metrics);
      if (metrics.rows > 1) drawDiamondFill(x, metrics.rows - 2, 'rgba(174,230,255,0.08)', null, metrics);
    }
    const selected = state.battleAnimating ? null : selectedPiece();
    if (state.screen === 'game' && state.showThreats) {
      getEnemyThreats().forEach((sq) => {
        drawDiamondFill(sq.x, sq.y, 'rgba(255,106,82,0.28)', 'rgba(255,106,82,0.7)', metrics);
      });
    }
    if (selected && state.turn === 'player' && !state.battleAnimating && !state.animating) {
      const moves = legalMoves(selected);
      const attacks = attackedSquares(selected);
      const tileMap = new Map();
      const tileKey = (x, y) => `${x},${y}`;
      moves.forEach((m) => {
        tileMap.set(tileKey(m.x, m.y), { x: m.x, y: m.y, isMove: true, isAttack: false });
      });
      attacks.forEach((a) => {
        const key = tileKey(a.x, a.y);
        if (tileMap.has(key)) {
          tileMap.get(key).isAttack = true;
        } else {
          tileMap.set(key, { x: a.x, y: a.y, isMove: false, isAttack: true });
        }
      });
      tileMap.forEach((tile) => {
        drawTacticalIndicators(tile.x, tile.y, tile.isMove, tile.isAttack, selected.side === 'enemy', metrics);
      });
    }
    if (selected && !state.animating && !state.battleAnimating) drawDiamondFill(selected.x, selected.y, 'rgba(255,255,255,0.18)', '#ffffff', metrics);
    if (state.hoverTile && !state.animating && !state.battleAnimating) {
      if (state.screen === 'level-editor') {
        const brush = selectedLevelBrush();
        const fill = brush.role === 'player'
          ? 'rgba(174,230,255,0.25)'
          : (brush.role === 'enemy' ? 'rgba(255,106,82,0.25)' : (brush.role === 'terrain' ? 'rgba(180,180,180,0.24)' : 'rgba(255,255,255,0.12)'));
        drawDiamondFill(state.hoverTile.x, state.hoverTile.y, fill, brush.id === 'empty' ? '#ffffff' : '#ffd24a', metrics);
      } else {
        drawDiamondFill(state.hoverTile.x, state.hoverTile.y, 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.55)', metrics);
      }
    }
    
    const activePieces = state.pieces
      .filter((piece) => piece.alive)
      .sort((a, b) => {
        const posA = getPieceRenderPos(a);
        const posB = getPieceRenderPos(b);
        return (posA.x + posA.y) - (posB.x + posB.y);
      });

    activePieces.forEach(drawPieceShadow);
    activePieces.forEach(drawPiece);
  }

  function drawPieceShadow(piece) {
    const renderPos = getPieceRenderPos(piece);
    const { x, y } = isoCenter(renderPos.x, renderPos.y);
    const offsetY = piece.offsetY || 0;
    const startHeight = 400;
    const ratio = Math.max(0, Math.min(1, offsetY / startHeight));
    
    const scale = 1 - ratio * 0.5;
    const opacity = 0.3 * (1 - ratio * 0.85);
    
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y, (TW / 3.2) * scale, (TH / 3.2) * scale, 0, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(10, 15, 25, ${opacity})`;
    ctx.fill();
    ctx.restore();
  }

  function drawPiece(piece) {
    const renderPos = getPieceRenderPos(piece);
    const { x, y } = isoCenter(renderPos.x, renderPos.y);
    const base = piece.side === 'player' ? '#dceaf2' : (piece.side === 'enemy' ? '#7a3f2a' : '#a8a8a8');
    const shade = piece.side === 'player' ? '#8fa6b4' : (piece.side === 'enemy' ? '#4b2419' : '#545454');
    const accent = piece.side === 'player' ? '#8fe6ff' : (piece.side === 'enemy' ? '#ff8b52' : '#7a7a7a');
    ctx.save();
    const offsetY = piece.offsetY || 0;
    ctx.translate(Math.round(x), Math.round(y - 24 - offsetY));

    const img = IMAGES[piece.type] 
      ? (piece.side === 'player' 
          ? IMAGES[piece.type].player 
          : (piece.side === 'enemy' ? IMAGES[piece.type].enemy : IMAGES[piece.type].neutral))
      : null;
    if (img) {
      ctx.drawImage(img, -24, -15, 48, 48);
    } else {
      if (piece.type === 'rock') {
        ctx.fillStyle = '#545454';
        ctx.fillRect(-15, 2, 30, 30);
        ctx.fillStyle = '#7a7a7a';
        ctx.fillRect(-12, -2, 24, 28);
      } else {
        ctx.fillStyle = shade;
        ctx.fillRect(-15, 2, 30, 30);
        ctx.fillStyle = base;
        ctx.fillRect(-12, -2, 24, 28);
        ctx.fillStyle = accent;
        ctx.fillRect(-8, 6, 16, 5);
        ctx.fillStyle = '#101522';
        ctx.fillRect(-10, 21, 20, 5);
        ctx.font = '16px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = piece.side === 'player' ? '#101522' : '#f5e0c8';
        ctx.fillText(piece.mark, 0, 14);
      }
    }
    ctx.restore();
  }

  function pointToTile(clientX, clientY) {
    const metrics = boardMetrics();
    const rect = boardEl.getBoundingClientRect();
    const px = (clientX - rect.left) * (boardEl.width / rect.width);
    const py = (clientY - rect.top) * (boardEl.height / rect.height);
    const a = (px - metrics.originX) / (TW / 2);
    const b = (py - metrics.originY) / (TH / 2);
    const x = Math.floor((a + b) / 2 + 0.5);
    const y = Math.floor((b - a) / 2 + 0.5);
    if (!inBounds(x, y, metrics)) return null;
    return { x, y };
  }

  function setScreen(screen) {
    state.screen = screen;
    render();
  }

  function renderLobbyCard(lobby, compact) {
    const host = lobby.host;
    const guest = lobby.guest;
    const canJoin = currentUser && lobby.phase === 'waiting' && lobby.viewer_role === 'observer';
    const phaseText = lobby.phase === 'waiting'
      ? 'Waiting'
      : (lobby.phase === 'ready' ? 'Ready' : 'Started');
    return `
      <div class="lobby-card ${compact ? 'compact' : ''}">
        <div class="lobby-card-head">
          <div>
            <strong>${escapeText(lobby.name)}</strong>
            <span>${phaseText} · ${lobby.seats.filled}/${lobby.seats.total}</span>
          </div>
          ${canJoin ? `<button type="button" data-action="join-lobby" data-lobby-id="${escapeText(lobby.id)}">Join</button>` : ''}
        </div>
        <div class="lobby-seats">
          <div class="lobby-seat">${lobbyAvatar(host)}<span>${lobbyDisplayName(host)}</span><small>Host</small></div>
          <div class="lobby-seat ${guest ? '' : 'empty'}">${lobbyAvatar(guest)}<span>${lobbyDisplayName(guest)}</span><small>${guest ? 'Opponent' : 'Waiting'}</small></div>
        </div>
      </div>`;
  }

  function renderCampaignCard(campaign) {
    const active = campaign.id === state.selectedCampaignId;
    return `
      <button class="campaign-card ${active ? 'active' : ''}" type="button" data-action="select-campaign" data-campaign-id="${escapeText(campaign.id)}">
        <strong>${escapeText(campaign.title)}</strong>
        <span>${campaign.level_count} ${campaign.level_count === 1 ? 'level' : 'levels'}</span>
      </button>`;
  }

  function renderLevelTabs(campaign) {
    return `
      <div class="level-tabs">
        ${campaign.levels.map((level, index) => `
          <button type="button" class="${level.id === state.selectedLevelId ? 'active' : ''}" data-action="select-level" data-level-id="${escapeText(level.id)}">
            ${index + 1}
          </button>`).join('')}
      </div>`;
  }

  function renderCampaignEditor() {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    if (!currentUser) {
      return `
        <div class="game-menu campaign-menu">
          <p class="eyebrow">Dev tools</p>
          <h2>Campaign Editor</h2>
          <p class="menu-copy">Sign in to create and edit campaigns.</p>
          <div class="menu-row">
            <button type="button" data-action="sign-in">Sign In</button>
            <button type="button" data-action="main">Back</button>
          </div>
        </div>`;
    }
    return `
      <div class="game-menu campaign-menu">
        <p class="eyebrow">Dev tools</p>
        <h2>Campaign Editor</h2>
        <p class="menu-copy">${state.campaignMessage || 'Draft campaigns and levels.'}</p>
        <div class="campaign-shell">
          <div class="campaign-list" aria-label="Campaigns">
            ${state.campaigns.length ? state.campaigns.map(renderCampaignCard).join('') : '<p class="empty-lobbies">No campaigns yet.</p>'}
            <button type="button" data-action="new-campaign" ${state.campaignLoading ? 'disabled' : ''}>New Campaign</button>
          </div>
          <div class="campaign-editor">
            ${campaign ? `
              <div class="editor-grid two">
                <label>Title<input id="campaignTitle" maxlength="64" value="${escapeText(campaign.title)}"></label>
                <label>Description<input id="campaignDescription" maxlength="220" value="${escapeText(campaign.description)}"></label>
              </div>
              <div class="menu-row">
                <button type="button" data-action="save-campaign" ${state.campaignLoading ? 'disabled' : ''}>Save Campaign</button>
                <button type="button" data-action="delete-campaign" ${state.campaignLoading ? 'disabled' : ''}>Delete Campaign</button>
              </div>
              <div class="campaign-levels">
                <div class="campaign-levels-head">
                  <span>Levels</span>
                  <button type="button" data-action="add-level" ${state.campaignLoading ? 'disabled' : ''}>Add Level</button>
                </div>
                ${renderLevelTabs(campaign)}
                ${level ? `
                  <div class="editor-grid">
                    <label>Name<input id="levelName" maxlength="48" value="${escapeText(level.name)}"></label>
                    <label>Objective<input id="levelObjective" maxlength="96" value="${escapeText(level.objective)}"></label>
                    <label>Difficulty
                      <select id="levelDifficulty">
                        ${['easy', 'normal', 'hard', 'boss'].map((difficulty) => `
                          <option value="${difficulty}" ${level.difficulty === difficulty ? 'selected' : ''}>${difficulty}</option>`).join('')}
                      </select>
                    </label>
                    <label>Width<input id="levelWidth" type="number" min="4" max="16" value="${escapeText(level.width)}"></label>
                    <label>Height<input id="levelHeight" type="number" min="4" max="20" value="${escapeText(level.height)}"></label>
                    <label>Enemy Budget<input id="levelEnemyBudget" type="number" min="1" max="24" value="${escapeText(level.enemy_budget)}"></label>
                    <label class="wide">Notes<textarea id="levelNotes" maxlength="400">${escapeText(level.notes)}</textarea></label>
                  </div>
                  <div class="menu-row">
                    <button type="button" data-action="save-level" ${state.campaignLoading ? 'disabled' : ''}>Save Level</button>
                    <button type="button" data-action="edit-level-board" ${state.campaignLoading ? 'disabled' : ''}>Edit Board</button>
                  </div>
                  <div class="menu-row">
                    <button type="button" data-action="seed-level-layout" ${state.campaignLoading ? 'disabled' : ''}>Seed Board</button>
                    <button type="button" data-action="delete-level" ${campaign.levels.length <= 1 || state.campaignLoading ? 'disabled' : ''}>Delete Level</button>
                  </div>` : ''}
              </div>
            ` : '<p class="empty-lobbies">Create a campaign to begin.</p>'}
          </div>
        </div>
        <button type="button" data-action="main">Back</button>
      </div>`;
  }

  function renderMenu() {
    if (boardWrapEl) boardWrapEl.classList.toggle('level-editor-active', state.screen === 'level-editor');
    if (boardScrollEl) boardScrollEl.classList.toggle('level-editor-scroll', state.screen === 'level-editor');
    menuLayer.classList.toggle('level-editor-layer', state.screen === 'level-editor');
    if (state.screen === 'game') {
      menuLayer.innerHTML = '';
      menuLayer.hidden = true;
      return;
    }
    menuLayer.hidden = false;
    if (state.screen === 'main') {
      menuLayer.innerHTML = `
        <div class="game-menu">
          <p class="eyebrow">12 x 8 chess skirmish</p>
          <h2>Chess Tactics</h2>
          <button type="button" data-action="party">Solo Skirmish</button>
          <button type="button" data-action="lobbies">Lobbies</button>
          <button type="button" data-action="campaigns">Campaign Editor</button>
          <button type="button" data-action="settings">Settings</button>
        </div>`;
    } else if (state.screen === 'lobbies') {
      const visibleLobbies = state.lobbies.filter((lobby) => !state.lobby || lobby.id !== state.lobby.id);
      menuLayer.innerHTML = `
        <div class="game-menu lobby-menu">
          <p class="eyebrow">Online rooms</p>
          <h2>Lobbies</h2>
          ${currentUser ? `
            <p class="menu-copy">${state.lobbyMessage || 'Host a lobby or join an active table.'}</p>
            ${state.lobby ? renderLobbyCard(state.lobby, true) : ''}
            <div class="lobby-list">
              ${visibleLobbies.length ? visibleLobbies.map((lobby) => renderLobbyCard(lobby, true)).join('') : '<p class="empty-lobbies">No other active lobbies.</p>'}
            </div>
            <div class="menu-row">
              <button type="button" data-action="host-lobby" ${state.lobby || state.lobbyLoading ? 'disabled' : ''}>Host Lobby</button>
              <button type="button" data-action="refresh-lobbies" ${state.lobbyLoading ? 'disabled' : ''}>Refresh</button>
            </div>
            <button type="button" data-action="main">Back</button>
          ` : `
            <p class="menu-copy">Sign in to host, search, and join lobbies.</p>
            <div class="menu-row">
              <button type="button" data-action="sign-in">Sign In</button>
              <button type="button" data-action="main">Back</button>
            </div>
          `}
        </div>`;
    } else if (state.screen === 'lobby') {
      const lobby = state.lobby;
      const isHost = lobby && lobby.viewer_role === 'host';
      const canStart = lobby && isHost && lobby.phase === 'ready';
      const canDeploy = lobby && lobby.phase === 'started';
      menuLayer.innerHTML = `
        <div class="game-menu lobby-menu">
          <p class="eyebrow">Match lobby</p>
          <h2>${lobby ? escapeText(lobby.name) : 'Lobby'}</h2>
          <p class="menu-copy">${state.lobbyMessage || (lobby && lobby.phase === 'waiting' ? 'Waiting for an opponent.' : 'Ready up.')}</p>
          ${lobby ? renderLobbyCard(lobby, false) : '<p class="empty-lobbies">Lobby not found.</p>'}
          <div class="menu-row">
            <button type="button" data-action="start-lobby" ${canStart && !state.lobbyLoading ? '' : 'disabled'}>Start Game</button>
            <button type="button" data-action="begin-lobby-game" ${canDeploy ? '' : 'disabled'}>Deploy</button>
          </div>
          <div class="menu-row">
            <button type="button" data-action="refresh-lobbies" ${state.lobbyLoading ? 'disabled' : ''}>Refresh</button>
            <button type="button" data-action="leave-lobby" ${lobby && !state.lobbyLoading ? '' : 'disabled'}>${isHost ? 'Close Lobby' : 'Leave Lobby'}</button>
          </div>
          <button type="button" data-action="lobbies">Browse Lobbies</button>
        </div>`;
    } else if (state.screen === 'party') {
      menuLayer.innerHTML = `
        <div class="game-menu party-menu">
          <p class="eyebrow">Choose two pieces</p>
          <h2>Pick Party</h2>
          <div class="locked-piece"><span class="badge player">${getPieceSvg('pawn', 'player')}</span><span>Pawn locked in</span></div>
          ${[0, 1].map((slot) => `
            <div class="piece-picker" data-slot="${slot}">
              ${PIECE_CHOICES.map((type) => `
                <button type="button" class="${state.party[slot] === type ? 'active' : ''}" data-piece="${type}">
                  <span>${getPieceSvg(type, 'player')}</span>${PIECES[type].name}
                </button>`).join('')}
            </div>`).join('')}
          <div class="menu-row">
            <button type="button" data-action="start">Deploy</button>
            <button type="button" data-action="main">Back</button>
          </div>
        </div>`;
    } else if (state.screen === 'settings') {
      menuLayer.innerHTML = `
        <div class="game-menu">
          <p class="eyebrow">Settings</p>
          <h2>Empty Bay</h2>
          <p class="menu-copy">No tuning controls are wired yet.</p>
          <button type="button" data-action="main">Back</button>
        </div>`;
    } else if (state.screen === 'campaigns') {
      menuLayer.innerHTML = renderCampaignEditor();
    } else if (state.screen === 'level-editor') {
      const campaign = selectedCampaign();
      const level = selectedLevel(campaign);
      const brush = selectedLevelBrush();
      const collapsed = state.levelEditorCollapsed;
      menuLayer.innerHTML = `
        <div class="level-editor-hud ${collapsed ? 'collapsed' : ''}">
          <div class="level-editor-title">
            <p class="eyebrow">Level editor</p>
            <h2>${level ? escapeText(level.name) : 'Level'}</h2>
            ${collapsed ? '' : `<p class="menu-copy">${state.campaignMessage || 'Paint the board, then save the level.'}</p>`}
          </div>
          <div class="level-editor-actions">
            <button type="button" data-action="save-level-editor" ${state.campaignLoading ? 'disabled' : ''}>Save</button>
            ${collapsed ? '' : `
              <button type="button" data-action="seed-level-layout">Seed</button>
              <button type="button" data-action="clear-level-layout">Clear</button>
            `}
            <button type="button" data-action="toggle-level-editor-panel">${collapsed ? 'Expand' : 'Collapse'}</button>
            <button type="button" data-action="back-to-campaigns">Back</button>
          </div>
          ${collapsed ? '' : `<div class="level-palette canvas-palette" aria-label="Level editor brushes">
            ${LEVEL_BRUSHES.map((item) => `
              <button type="button" class="${brush.id === item.id ? 'active' : ''} ${item.role || 'empty'}" data-action="select-level-brush" data-brush="${item.id}">
                <span>${escapeText(item.mark)}</span>${escapeText(item.label)}
              </button>`).join('')}
          </div>`}
        </div>`;
    } else {
      menuLayer.innerHTML = `
        <div class="game-menu">
          <p class="eyebrow">${state.winner === 'player' ? 'Victory' : 'Defeat'}</p>
          <h2>${state.winner === 'player' ? 'Last Piece Standing' : 'Squad Lost'}</h2>
          <button type="button" data-action="party">New Game</button>
          <button type="button" data-action="main">Main Menu</button>
        </div>`;
    }
  }

  function renderPanel() {
    const piece = selectedPiece();
    const playerCount = livingPieces('player').length;
    const enemyCount = livingPieces('enemy').length;
    statusLine.textContent = state.screen === 'game'
      ? `${state.turn === 'player' ? 'Player' : 'Enemy'} turn`
      : (state.screen === 'lobbies' || state.screen === 'lobby' ? 'Lobbies' : (state.screen === 'campaigns' || state.screen === 'level-editor' ? 'Campaigns' : 'Menu'));
    anchorMeter.textContent = `Allies ${playerCount}`;
    enemyMeter.textContent = `Enemies ${enemyCount}`;
    selectedName.textContent = piece ? piece.name : (state.screen === 'game' ? 'Select a piece' : (state.screen === 'lobby' ? 'Lobby Ready Room' : (state.screen === 'campaigns' ? 'Campaign Editor' : (state.screen === 'level-editor' ? 'Level Board' : 'Command Menu'))));
    selectedMeta.textContent = piece
      ? `${piece.role} | ${piece.mark} | ${legalMoves(piece).length} legal`
      : (state.screen === 'lobby' || state.screen === 'lobbies' ? 'Host a lobby, join one, then start the match.' : (state.screen === 'campaigns' ? 'Create campaigns and basic level drafts.' : (state.screen === 'level-editor' ? 'Paint pieces and terrain directly on the board.' : 'Start a skirmish from the board menu.')));
    moveButton.textContent = 'Menu';
    powerButton.textContent = state.screen === 'level-editor' ? 'Seed' : 'Restart';
    endButton.textContent = state.screen === 'level-editor' ? 'Save' : (state.turn === 'enemy' ? 'Enemy Moving' : 'Wait');
    moveButton.classList.toggle('active', state.screen !== 'game');
    powerButton.classList.remove('active');
    endButton.disabled = state.screen !== 'level-editor' && (state.screen !== 'game' || state.turn !== 'player' || state.battleAnimating || state.animating);
    threatButton.textContent = state.showThreats ? 'Threats: On' : 'Threats: Off';
    threatButton.classList.toggle('active', state.showThreats);
    threatButton.disabled = state.screen !== 'game';
    rosterEl.innerHTML = ['player', 'enemy'].map((side) => `
      <div class="roster-title">${side === 'player' ? 'Allies' : 'Enemies'}</div>
      ${livingPieces(side).map((unit) => `
        <button class="unit-row ${unit.id === state.selected ? 'active' : ''}" type="button" data-unit="${unit.id}" ${state.turn !== 'player' || state.battleAnimating || state.animating ? 'disabled' : ''}>
          <span class="badge ${side === 'player' ? 'player' : 'enemy'}">
            ${getPieceSvg(unit.type, side)}
          </span>
          <span><strong>${unit.name}</strong><span>${unit.role}</span></span>
          <span>${unit.x + 1},${unit.y + 1}</span>
        </button>
      `).join('')}`).join('');
    rosterEl.querySelectorAll('button[data-unit]').forEach((button) => {
      button.addEventListener('click', () => {
        if (state.animating) return;
        const unit = state.pieces.find((item) => item.id === button.dataset.unit);
        if (unit) {
          state.selected = unit.id;
          render();
        }
      });
    });
    logEl.innerHTML = state.log.map((line) => `<p>${line}</p>`).join('');
  }

  function render() {
    drawBoard();
    renderMenu();
    renderPanel();
  }

  menuLayer.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const picker = button.closest('.piece-picker');
    if (picker && button.dataset.piece) {
      state.party[Number(picker.dataset.slot)] = button.dataset.piece;
      render();
      return;
    }
    if (button.dataset.action === 'party') setScreen('party');
    if (button.dataset.action === 'lobbies') {
      setScreen('lobbies');
      void loadLobbies();
    }
    if (button.dataset.action === 'campaigns') {
      setScreen('campaigns');
      void loadCampaigns();
    }
    if (button.dataset.action === 'new-campaign') void createCampaign();
    if (button.dataset.action === 'select-campaign' && button.dataset.campaignId) {
      state.selectedCampaignId = button.dataset.campaignId;
      const campaign = selectedCampaign();
      state.selectedLevelId = campaign && campaign.levels[0] && campaign.levels[0].id;
      render();
    }
    if (button.dataset.action === 'save-campaign') void saveCampaignDetails();
    if (button.dataset.action === 'delete-campaign') void deleteCampaign();
    if (button.dataset.action === 'add-level') void addCampaignLevel();
    if (button.dataset.action === 'select-level' && button.dataset.levelId) {
      state.selectedLevelId = button.dataset.levelId;
      render();
    }
    if (button.dataset.action === 'select-level-brush' && button.dataset.brush) {
      state.selectedLevelBrush = button.dataset.brush;
      render();
      return;
    }
    if (button.dataset.action === 'seed-level-layout') {
      seedLevelLayout();
      return;
    }
    if (button.dataset.action === 'clear-level-layout') {
      clearLevelLayout();
      return;
    }
    if (button.dataset.action === 'save-level') void saveCampaignLevel();
    if (button.dataset.action === 'edit-level-board') enterLevelEditor();
    if (button.dataset.action === 'save-level-editor') void saveLevelEditor();
    if (button.dataset.action === 'toggle-level-editor-panel') {
      state.levelEditorCollapsed = !state.levelEditorCollapsed;
      render();
    }
    if (button.dataset.action === 'back-to-campaigns') exitLevelEditor();
    if (button.dataset.action === 'delete-level') void deleteCampaignLevel();
    if (button.dataset.action === 'host-lobby') void hostLobby();
    if (button.dataset.action === 'refresh-lobbies') void loadLobbies();
    if (button.dataset.action === 'join-lobby' && button.dataset.lobbyId) void joinLobby(button.dataset.lobbyId);
    if (button.dataset.action === 'start-lobby') void startLobbyMatch();
    if (button.dataset.action === 'leave-lobby') void leaveLobby();
    if (button.dataset.action === 'begin-lobby-game') setScreen('party');
    if (button.dataset.action === 'sign-in') {
      window.location.href = `/api/auth/sign-in?returnTo=${encodeURIComponent(returnTo())}`;
    }
    if (button.dataset.action === 'settings') setScreen('settings');
    if (button.dataset.action === 'main') setScreen('main');
    if (button.dataset.action === 'start') startGame();
  });

  menuLayer.addEventListener('wheel', (event) => {
    if (state.screen !== 'level-editor' || !boardScrollEl) return;
    boardScrollEl.scrollTop += event.deltaY;
    event.preventDefault();
  }, { passive: false });

  boardEl.addEventListener('click', (event) => {
    const tile = pointToTile(event.clientX, event.clientY);
    if (tile) handleTile(tile.x, tile.y);
  });

  boardEl.addEventListener('mousemove', (event) => {
    if (state.battleAnimating || state.animating) {
      if (state.hoverTile) {
        state.hoverTile = null;
        render();
      }
      return;
    }
    const tile = pointToTile(event.clientX, event.clientY);
    const changed = (!tile && state.hoverTile) || (tile && (!state.hoverTile || tile.x !== state.hoverTile.x || tile.y !== state.hoverTile.y));
    if (changed) {
      state.hoverTile = tile;
      render();
    }
  });

  boardEl.addEventListener('mouseleave', () => {
    if (state.hoverTile) {
      state.hoverTile = null;
      render();
    }
  });

  moveButton.addEventListener('click', () => {
    if (state.animating) return;
    if (state.screen === 'level-editor') {
      exitLevelEditor();
      return;
    }
    setScreen('main');
  });
  powerButton.addEventListener('click', () => {
    if (state.animating) return;
    if (state.screen === 'level-editor') {
      seedLevelLayout();
      return;
    }
    startGame();
  });
  endButton.addEventListener('click', () => {
    if (state.animating) return;
    if (state.screen === 'level-editor') {
      void saveLevelEditor();
      return;
    }
    if (state.screen === 'game' && state.turn === 'player') {
      state.turn = 'enemy';
      state.selected = null;
      render();
      window.setTimeout(enemyTurn, 280);
    }
  });

  threatButton.addEventListener('click', () => {
    if (state.animating) return;
    if (state.screen === 'game') {
      state.showThreats = !state.showThreats;
      render();
    }
  });

  initAuth();
  lobbyPollTimer = window.setInterval(() => {
    if (currentUser && (state.screen === 'lobbies' || state.screen === 'lobby')) {
      void loadLobbies(true);
    }
  }, 3500);
  window.addEventListener('beforeunload', () => {
    if (lobbyPollTimer) window.clearInterval(lobbyPollTimer);
  });
  render();
}());
