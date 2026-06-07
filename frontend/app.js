(function () {
  const COLS = 8;
  const ROWS = 12;
  const PIECE_CHOICES = ['knight', 'bishop', 'rook'];
  const PIECES = {
    pawn: { mark: 'P', name: 'Pawn', role: 'Forward footman' },
    knight: { mark: 'N', name: 'Knight', role: 'L-shaped jumper' },
    bishop: { mark: 'B', name: 'Bishop', role: 'Diagonal runner' },
    rook: { mark: 'R', name: 'Rook', role: 'Straight-line tower' },
    queen: { mark: 'Q', name: 'Queen', role: 'Promoted raider' },
  };

  const boardEl = document.getElementById('board');
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
  const endButton = document.getElementById('endButton');
  const menuLayer = document.getElementById('menuLayer');
  const accountNameEl = document.getElementById('accountName');
  const signInButton = document.getElementById('signInButton');
  const signOutButton = document.getElementById('signOutButton');

  const TW = 72;
  const TH = 36;
  const CLIFF = 34;
  const ORIGIN_X = boardEl.width / 2 + 54;
  const ORIGIN_Y = 54;

  const state = {
    phase: 'main',
    account: { signed_in: false },
    lobbyId: null,
    lobby: null,
    side: null,
    game: null,
    turn: null,
    selected: null,
    hoverTile: null,
    log: ['Sign in and host/join a lobby to play.'],
    lobbySearch: '',
    openLobbies: [],
    pollHandle: null,
  };

  function returnTo() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function showGuest() {
    state.account = { signed_in: false };
    accountNameEl.textContent = 'Guest';
    signInButton.hidden = false;
    signOutButton.hidden = true;
  }

  async function apiRequest(path, options = {}) {
    const init = {
      method: options.method || 'GET',
      credentials: 'include',
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
      },
    };
    if (options.body) init.body = JSON.stringify(options.body);

    const response = await fetch(path, init);
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (_error) {
      payload = null;
    }

    if (!response.ok) {
      const message = payload && payload.error ? payload.error : text || `HTTP ${response.status}`;
      throw new Error(message);
    }

    return payload;
  }

  async function initAuth() {
    showGuest();
    try {
      const response = await apiRequest('/api/auth/me');
      if (!response || !response.signed_in) return;
      state.account = response;
      accountNameEl.textContent = response.name || response.email;
      signInButton.hidden = true;
      signOutButton.hidden = false;
      state.phase = 'main';
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
      await apiRequest('/api/auth/sign-out', { method: 'POST' });
    } finally {
      window.location.reload();
    }
  });

  function inBounds(x, y) {
    return x >= 0 && x < COLS && y >= 0 && y < ROWS;
  }

  function pieceAt(x, y) {
    if (!state.game) return null;
    return state.game.pieces.find((piece) => piece.alive && piece.x === x && piece.y === y) || null;
  }

  function selectedPiece() {
    if (!state.game) return null;
    return state.game.pieces.find((piece) => piece.id === state.selected && piece.alive) || null;
  }

  function livingPieces(side) {
    if (!state.game) return [];
    return state.game.pieces.filter((piece) => piece.side === side && piece.alive);
  }

  function isEnemy(piece, target) {
    return target && target.side !== piece.side;
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
        if (occupant.side === piece.side) return false;
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
      if (piece.y === (piece.side === 'player' ? ROWS - 1 : 0) && inBounds(two.x, two.y) && !pieceAt(two.x, two.y)) {
        moves.push(two);
      }
    }

    [-1, 1].forEach((dx) => {
      const x = piece.x + dx;
      const y = piece.y + dir;
      const occupant = inBounds(x, y) && pieceAt(x, y);
      if (occupant && occupant.side !== piece.side) moves.push({ x, y, capture: occupant.id });
    });

    return moves;
  }

  function legalMoves(piece) {
    if (!piece || !piece.alive || !state.game || state.phase !== 'game') return [];
    if (piece.type === 'pawn') return pawnMoves(piece);
    if (piece.type === 'knight') {
      return stepMoves(piece, [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]);
    }
    if (piece.type === 'bishop') return rayMoves(piece, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
    if (piece.type === 'rook') return rayMoves(piece, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
    return rayMoves(piece, [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
  }

  function addLog(message, tone) {
    const line = tone ? `<span class="${tone}">${message}</span>` : message;
    state.log.unshift(line);
    state.log = state.log.slice(0, 8);
  }

  function isoCenter(c, r) {
    return {
      x: ORIGIN_X + (c - r) * (TW / 2),
      y: ORIGIN_Y + (c + r) * (TH / 2),
    };
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

  function drawCliff() {
    const left = { x: isoCenter(0, ROWS - 1).x - TW / 2, y: isoCenter(0, ROWS - 1).y };
    const right = { x: isoCenter(COLS - 1, 0).x + TW / 2, y: isoCenter(COLS - 1, 0).y };
    const bottom = { x: isoCenter(COLS - 1, ROWS - 1).x, y: isoCenter(COLS - 1, ROWS - 1).y + TH / 2 };

    ctx.fillStyle = '#5a4226';
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(bottom.x, bottom.y + CLIFF);
    ctx.lineTo(left.x, left.y + CLIFF);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#45331d';
    ctx.beginPath();
    ctx.moveTo(bottom.x, bottom.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(right.x, right.y + CLIFF);
    ctx.lineTo(bottom.x, bottom.y + CLIFF);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#56753b';
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(right.x, right.y);
    ctx.lineTo(right.x, right.y + 3);
    ctx.lineTo(bottom.x, bottom.y + 3);
    ctx.lineTo(left.x, left.y + 3);
    ctx.closePath();
    ctx.fill();
  }

  function drawTile(c, r) {
    const { x: cx, y: cy } = isoCenter(c, r);
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

  function drawDiamondFill(x, y, fill, stroke) {
    const center = isoCenter(x, y);
    diamond(center.x, center.y);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawPiece(piece) {
    const { x, y } = isoCenter(piece.x, piece.y);
    const base = piece.side === 'player' ? '#dceaf2' : '#7a3f2a';
    const shade = piece.side === 'player' ? '#8fa6b4' : '#4b2419';
    const accent = piece.side === 'player' ? '#8fe6ff' : '#ff8b52';
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y - 18));
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(-17, 24, 34, 6);
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
    ctx.restore();
  }

  function pointToTile(clientX, clientY) {
    const rect = boardEl.getBoundingClientRect();
    const px = (clientX - rect.left) * (boardEl.width / rect.width);
    const py = (clientY - rect.top) * (boardEl.height / rect.height);
    const a = (px - ORIGIN_X) / (TW / 2);
    const b = (py - ORIGIN_Y) / (TH / 2);
    const x = Math.floor((a + b) / 2 + 0.5);
    const y = Math.floor((b - a) / 2 + 0.5);
    if (!inBounds(x, y)) return null;
    return { x, y };
  }

  function drawBoard() {
    ctx.clearRect(0, 0, boardEl.width, boardEl.height);
    ctx.imageSmoothingEnabled = false;
    drawCliff();

    for (let s = 0; s <= COLS + ROWS - 2; s += 1) {
      for (let c = 0; c < COLS; c += 1) {
        const r = s - c;
        if (r >= 0 && r < ROWS) drawTile(c, r);
      }
    }

    if (!state.game) {
      for (let x = 0; x < COLS; x += 1) {
        drawDiamondFill(x, 0, 'rgba(255,106,82,0.08)', null);
        drawDiamondFill(x, 1, 'rgba(255,106,82,0.05)', null);
        drawDiamondFill(x, ROWS - 1, 'rgba(174,230,255,0.08)', null);
        drawDiamondFill(x, ROWS - 2, 'rgba(174,230,255,0.05)', null);
      }
      return;
    }

    for (let x = 0; x < COLS; x += 1) {
      drawDiamondFill(x, 0, 'rgba(255,106,82,0.13)', null);
      drawDiamondFill(x, 1, 'rgba(255,106,82,0.08)', null);
      drawDiamondFill(x, ROWS - 1, 'rgba(174,230,255,0.14)', null);
      drawDiamondFill(x, ROWS - 2, 'rgba(174,230,255,0.08)', null);
    }

    const selected = selectedPiece();
    const moves = state.turn === state.side ? legalMoves(selected) : [];
    moves.forEach((move) => {
      drawDiamondFill(move.x, move.y, move.capture ? 'rgba(255,210,74,0.32)' : 'rgba(174,230,255,0.24)', move.capture ? '#ffd24a' : '#aee6ff');
    });

    if (selected) drawDiamondFill(selected.x, selected.y, 'rgba(255,255,255,0.18)', '#ffffff');
    if (state.hoverTile) drawDiamondFill(state.hoverTile.x, state.hoverTile.y, 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.55)');

    state.game.pieces
      .filter((piece) => piece.alive)
      .sort((a, b) => (a.x + a.y) - (b.x + b.y))
      .forEach(drawPiece);
  }

  function renderMenu() {
    if (state.phase === 'game' && (!state.game)) {
      state.phase = state.lobby ? 'lobby' : 'main';
    }

    if (state.phase === 'game') {
      menuLayer.hidden = true;
      return;
    }

    let menuHtml = '';

    if (state.phase === 'search') {
      const rows = state.openLobbies
        .map(
          (lobby) => `
            <div class="menu-copy" style="border-bottom:1px solid var(--line); padding:10px 0;">
              <strong>${lobby.name}</strong>
              <div>${lobby.players.map((player) => `${player.name} (${player.side === 'player' ? 'Blue' : 'Red'})`).join(' & ')}</div>
              <div>Players ${lobby.players.length}/2</div>
              <div style="margin-top:8px;"><button type="button" data-action="join" data-lobby-id="${lobby.id}">Join</button></div>
            </div>
          `,
        )
        .join('');

      menuHtml = `
        <div class="game-menu">
          <p class="eyebrow">Search</p>
          <h2>Find Lobby</h2>
          <div class="menu-row">
            <input id="searchInput" class="menu-input" value="${state.lobbySearch}" placeholder="Search name">
            <button type="button" data-action="search">Search</button>
          </div>
          ${rows || '<p class="menu-copy">No open lobbies.</p>'}
          <div class="menu-row">
            <button type="button" data-action="refresh-search">Refresh</button>
            <button type="button" data-action="main">Back</button>
          </div>
        </div>
      `;
    } else if (state.phase === 'lobby') {
      const lobby = state.lobby;
      const isHost = lobby ? lobby.is_host : false;
      const canStart = lobby ? lobby.status === 'open' && lobby.can_start : false;
      const myParty = state.side
        ? (lobby && lobby.players.find((player) => player.side === state.side)?.party) || ['knight', 'bishop']
        : ['knight', 'bishop'];
      const status = lobby ? (lobby.status === 'open' ? 'Open' : lobby.status === 'in_progress' ? 'In progress' : 'Finished') : 'No lobby';
      const startBlock = lobby.status === 'open'
        ? `<div class="menu-row">
            <button type="button" data-action="start" ${canStart ? '' : 'disabled'}>Start Match</button>
            <button type="button" data-action="refresh">Refresh</button>
          </div>`
        : `<div class="menu-row">
            ${isHost && lobby.status === 'finished' ? '<button type="button" data-action="start">Rematch</button>' : ''}
            <button type="button" data-action="refresh">Refresh</button>
          </div>`;

      const partyPicker = lobby && lobby.status === 'open'
        ? `<p class="menu-copy">Your squad picks:</p>
          ${[0, 1]
            .map(
              (slot) => `
                <div class="piece-picker" data-slot="${slot}">
                  ${PIECE_CHOICES.map(
                    (type) => `
                      <button type="button" class="${myParty[slot] === type ? 'active' : ''}" data-piece="${type}">
                        <span>${PIECES[type].mark}</span>${PIECES[type].name}
                      </button>
                    `,
                  ).join('')}
                </div>`,
            )
            .join('')}`
        : '';

      menuHtml = `
        <div class="game-menu">
          <p class="eyebrow">Lobby</p>
          <h2>${lobby ? lobby.name : 'Lobby'}</h2>
          <p class="menu-copy">${status}</p>
          <div class="menu-copy">${lobby ? lobby.players.map((player) => `${player.name} (${player.isHost ? 'host' : 'guest'})`).join('<br>') : 'No players'}</div>
          ${partyPicker}
          ${startBlock}
          <div class="menu-row">
            <button type="button" data-action="leave">Leave</button>
            <button type="button" data-action="main">Main</button>
          </div>
        </div>
      `;
    } else if (state.phase === 'victory') {
      const winner = state.game && state.game.winner
        ? state.game.winner === 'disconnect'
          ? 'Opponent disconnected'
          : state.game.winner === state.side
            ? 'You won'
            : 'Opponent won'
        : 'Match ended';
      const host = state.lobby ? state.lobby.is_host : false;
      menuHtml = `
        <div class="game-menu">
          <p class="eyebrow">Match Finished</p>
          <h2>${winner}</h2>
          <div class="menu-row">
            ${host ? '<button type="button" data-action="start">Rematch</button>' : ''}
            <button type="button" data-action="leave">Leave Lobby</button>
          </div>
          <button type="button" data-action="main">Main Menu</button>
        </div>
      `;
    } else {
      if (!state.account.signed_in) {
        menuHtml = `
          <div class="game-menu">
            <p class="eyebrow">Guest</p>
            <h2>Chess Tactics</h2>
            <p class="menu-copy">Sign in to host or join a lobby.</p>
            <button type="button" data-action="signIn">Sign in</button>
          </div>
        `;
      } else {
        const activeLobby = state.lobby ? `<button type="button" data-action="lobby">Return to Lobby</button>` : '';
        menuHtml = `
          <div class="game-menu">
            <p class="eyebrow">Lobby</p>
            <h2>Chess Tactics</h2>
            <div class="menu-row">
              <input id="hostInput" class="menu-input" value="${state.account.name}'s Lobby" placeholder="Lobby name">
              <button type="button" data-action="host">Host</button>
            </div>
            <button type="button" data-action="search">Search & Join</button>
            ${activeLobby}
          </div>
        `;
      }
    }

    menuLayer.hidden = false;
    menuLayer.innerHTML = menuHtml;
  }

  function renderPanel() {
    const playerCount = livingPieces('player').length;
    const enemyCount = livingPieces('enemy').length;
    const piece = selectedPiece();

    if (state.phase === 'game' && state.game) {
      anchorMeter.textContent = `Allies ${playerCount}`;
      enemyMeter.textContent = `Enemies ${enemyCount}`;
      statusLine.textContent = `Turn: ${state.turn === state.side ? 'Your move' : 'Opponent move'}`;
      selectedName.textContent = piece ? piece.name : 'Select a piece';
      selectedMeta.textContent = piece
        ? `${piece.role} | ${piece.mark} | moves ${legalMoves(piece).length}`
        : state.turn === state.side
          ? 'Tap a piece to move.'
          : 'Waiting for opponent.';
      moveButton.textContent = 'Lobby';
      powerButton.textContent = 'Refresh';
      endButton.textContent = 'Wait';
      moveButton.disabled = false;
      powerButton.disabled = false;
      endButton.disabled = true;
    } else {
      anchorMeter.textContent = `Allies ${playerCount}`;
      enemyMeter.textContent = `Enemies ${enemyCount}`;
      selectedMeta.textContent = 'Use the board menu to host or join lobbies.';
      selectedName.textContent = 'Command Menu';
      moveButton.textContent = 'Menu';
      powerButton.textContent = 'Refresh';
      endButton.textContent = 'Leave Lobby';
      statusLine.textContent = state.phase === 'search' ? 'Search lobbies' : 'Menu';
      moveButton.disabled = false;
      powerButton.disabled = false;
      endButton.disabled = !state.lobbyId;
    }

    moveButton.classList.remove('active');
    powerButton.classList.remove('active');

    if (state.phase === 'game') {
      rosterEl.innerHTML = ['player', 'enemy'].map((side) => `
        <div class="roster-title">${side === 'player' ? 'Allies' : 'Enemies'}</div>
        ${livingPieces(side)
          .map(
            (unit) => `
              <button class="unit-row ${unit.id === state.selected ? 'active' : ''}" type="button" data-unit="${unit.id}" ${side !== state.side || state.turn !== state.side ? 'disabled' : ''}>
                <span class="badge ${side === 'player' ? 'player' : 'enemy'}">${unit.mark}</span>
                <span><strong>${unit.name}</strong><span>${unit.role}</span></span>
                <span>${unit.x + 1},${unit.y + 1}</span>
              </button>
            `,
          )
          .join('')}
      `).join('');
    } else {
      rosterEl.innerHTML = '<div class="roster-title">No active game.</div>';
    }

    rosterEl.querySelectorAll('button[data-unit]').forEach((button) => {
      button.addEventListener('click', () => {
        const unit = state.game.pieces.find((item) => item.id === button.dataset.unit);
        if (unit && unit.side === state.side && state.turn === state.side) {
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
    updatePoller();
  }

  function updatePoller() {
    const needsPoll = state.lobbyId || state.phase === 'search';
    if (!needsPoll) {
      if (state.pollHandle) {
        clearInterval(state.pollHandle);
        state.pollHandle = null;
      }
      return;
    }

    if (state.pollHandle) return;
    state.pollHandle = setInterval(() => {
      if (state.phase === 'search') {
        loadOpenLobbies().then(() => render()).catch(() => {});
      } else if (state.lobbyId) {
        refreshLobby().catch(() => {});
      }
    }, 1500);
  }

  function getMyParty() {
    if (!state.lobby || !state.side) return ['knight', 'bishop'];
    const mine = state.lobby.players.find((player) => player.side === state.side);
    return mine && mine.party ? mine.party : ['knight', 'bishop'];
  }

  function ensureTurnFromGame() {
    state.turn = state.game ? state.game.turn : null;
  }

  function applyLobby(snapshot) {
    state.lobby = snapshot;
    state.lobbyId = snapshot.id;
    state.side = snapshot.you_side;
    state.game = snapshot.game;
    ensureTurnFromGame();

    if (state.game) {
      state.log = (snapshot.game.log || ['Match started.']).slice(0, 8);
      if (snapshot.game.winner) {
        state.phase = 'victory';
      } else {
        state.phase = 'game';
      }
    } else {
      state.log = ['Lobby open, waiting for match start.'];
      state.phase = snapshot.status === 'open' ? 'lobby' : snapshot.status === 'finished' ? 'victory' : 'lobby';
    }
    render();
  }

  async function clearLobbyState() {
    state.lobby = null;
    state.lobbyId = null;
    state.side = null;
    state.game = null;
    state.turn = null;
    state.log = ['Lobby cleared.'];
    state.phase = 'main';
    render();
  }

  async function loadOpenLobbies() {
    const query = state.lobbySearch ? `&q=${encodeURIComponent(state.lobbySearch)}` : '';
    const data = await apiRequest(`/api/lobbies?status=open${query}`);
    state.openLobbies = data.lobbies || [];
  }

  async function refreshLobby() {
    if (!state.lobbyId) return;
    const snapshot = await apiRequest(`/api/lobbies/${state.lobbyId}`);
    applyLobby(snapshot);
  }

  async function hostLobby(name) {
    const payload = await apiRequest('/api/lobbies', {
      method: 'POST',
      body: {
        name,
        party: ['knight', 'bishop'],
      },
    });
    applyLobby(payload.lobby);
  }

  async function joinLobby(id) {
    const payload = await apiRequest(`/api/lobbies/${id}/join`, { method: 'POST' });
    applyLobby(payload.lobby);
  }

  async function leaveLobby() {
    if (!state.lobbyId) return;
    try {
      await apiRequest(`/api/lobbies/${state.lobbyId}/leave`, { method: 'POST' });
    } catch (_error) {
      // ignore for client UX.
    }
    await clearLobbyState();
  }

  async function startMatch() {
    if (!state.lobbyId) return;
    const payload = await apiRequest(`/api/lobbies/${state.lobbyId}/start`, { method: 'POST' });
    applyLobby(payload.lobby);
  }

  async function updateParty(slot, type) {
    const party = getMyParty();
    party[slot] = type;
    await apiRequest(`/api/lobbies/${state.lobbyId}/party`, {
      method: 'POST',
      body: { party },
    });
    await refreshLobby();
  }

  async function submitMove(pieceId, target) {
    const payload = await apiRequest(`/api/lobbies/${state.lobbyId}/move`, {
      method: 'POST',
      body: { pieceId, x: target.x, y: target.y },
    });
    applyLobby(payload.lobby);
  }

  menuLayer.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    const picker = button.closest('.piece-picker');
    if (picker && button.dataset.piece) {
      const slot = Number(picker.dataset.slot);
      updateParty(slot, button.dataset.piece).catch((error) => {
        addLog(`Party update failed: ${error.message}`, 'danger');
        render();
      });
      return;
    }

    const action = button.dataset.action;
    if (!action) return;

    if (action === 'signIn') {
      window.location.href = `/api/auth/sign-in?returnTo=${encodeURIComponent(returnTo())}`;
      return;
    }

    if (action === 'main') {
      state.phase = 'main';
      render();
      return;
    }

    if (action === 'lobby') {
      if (state.lobby) state.phase = 'lobby';
      render();
      return;
    }

    if (action === 'search') {
      const input = menuLayer.querySelector('#searchInput');
      if (input) state.lobbySearch = input.value || '';
      state.phase = 'search';
      loadOpenLobbies().then(() => render()).catch((error) => {
        addLog(`Search failed: ${error.message}`, 'danger');
        render();
      });
      return;
    }

    if (action === 'host') {
      const input = menuLayer.querySelector('#hostInput');
      const value = input ? input.value : `${state.account.name}'s Lobby`;
      hostLobby(value).catch((error) => {
        addLog(`Host failed: ${error.message}`, 'danger');
        render();
      });
      return;
    }

    if (action === 'refresh-search') {
      state.phase = 'search';
      loadOpenLobbies().then(() => render()).catch((error) => {
        addLog(`Refresh failed: ${error.message}`, 'danger');
        render();
      });
      return;
    }

    if (action === 'join') {
      const id = button.dataset.lobbyId;
      if (!id) return;
      joinLobby(id).catch((error) => {
        addLog(`Join failed: ${error.message}`, 'danger');
        render();
      });
      return;
    }

    if (action === 'start') {
      startMatch().catch((error) => {
        addLog(`Start failed: ${error.message}`, 'danger');
        render();
      });
      return;
    }

    if (action === 'refresh') {
      if (state.lobbyId) {
        refreshLobby().catch((error) => {
          addLog(`Refresh failed: ${error.message}`, 'danger');
          render();
        });
      }
      return;
    }

    if (action === 'leave') {
      leaveLobby();
      return;
    }
  });

  boardEl.addEventListener('click', (event) => {
    if (state.phase !== 'game' || !state.game || state.turn !== state.side || !state.lobbyId) return;
    const tile = pointToTile(event.clientX, event.clientY);
    if (!tile) return;

    const clicked = pieceAt(tile.x, tile.y);
    if (clicked && clicked.side === state.side) {
      state.selected = clicked.id;
      render();
      return;
    }

    const moving = selectedPiece();
    const move = legalMoves(moving).find((item) => item.x === tile.x && item.y === tile.y);
    if (!moving || !move) return;

    submitMove(moving.id, move).catch((error) => {
      addLog(`Move failed: ${error.message}`, 'danger');
      render();
    });
  });

  boardEl.addEventListener('mousemove', (event) => {
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
    if (state.lobby) {
      state.phase = 'lobby';
    } else {
      state.phase = 'main';
    }
    render();
  });

  powerButton.addEventListener('click', () => {
    if (state.lobbyId && state.phase !== 'main') {
      refreshLobby().catch((error) => {
        addLog(`Refresh failed: ${error.message}`, 'danger');
        render();
      });
    }
  });

  endButton.addEventListener('click', () => {
    if (state.lobbyId) {
      leaveLobby();
    }
  });

  initAuth().finally(() => {
    render();
  });
}());
