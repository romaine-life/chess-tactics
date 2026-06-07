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
    } else {
      top = '#f5af95';
      left = '#b3664d';
      right = '#7a3f2a';
      deep = '#471e11';
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
      enemy: new Image()
    };
    IMAGES[type].player.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(getPieceSvg(type, 'player'));
    IMAGES[type].enemy.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(getPieceSvg(type, 'enemy'));
  });

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
  const accountEl = document.getElementById('account');
  const accountNameEl = document.getElementById('accountName');
  const signInButton = document.getElementById('signInButton');
  const signOutButton = document.getElementById('signOutButton');

  function returnTo() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function showGuest() {
    accountNameEl.textContent = 'Guest';
    signInButton.hidden = false;
    signOutButton.hidden = true;
  }

  async function initAuth() {
    showGuest();
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) return;
      const user = await res.json();
      if (!user.signed_in) return;
      accountNameEl.textContent = user.name || user.email;
      signInButton.hidden = true;
      signOutButton.hidden = false;
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
  const ORIGIN_X = boardEl.width / 2 + 54;
  const ORIGIN_Y = 54;

  const state = {
    screen: 'main',
    turn: 'player',
    selected: null,
    hoverTile: null,
    party: ['knight', 'bishop'],
    pieces: [],
    winner: null,
    log: ['Choose your squad. One pawn is always fielded.'],
  };

  function rand(max) {
    return Math.floor(Math.random() * max);
  }

  function choice(items) {
    return items[rand(items.length)];
  }

  function inBounds(x, y) {
    return x >= 0 && x < COLS && y >= 0 && y < ROWS;
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
    return target && target.side !== piece.side;
  }

  function addLog(message, tone) {
    state.log.unshift(tone ? `<span class="${tone}">${message}</span>` : message);
    state.log = state.log.slice(0, 8);
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
    return {
      id: `${side}-${index}-${Date.now()}-${rand(9999)}`,
      side,
      type,
      mark: base.mark,
      name: `${side === 'player' ? 'Allied' : 'Enemy'} ${base.name}`,
      role: base.role,
      x: 0,
      y: 0,
      alive: true,
      startY: side === 'player' ? ROWS - 1 : 0,
    };
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
    state.turn = 'player';
    state.selected = livingPieces('player')[0].id;
    state.winner = null;
    state.screen = 'game';
    state.log = [
      `Enemy fields ${enemyTypes.map((type) => PIECES[type].name).join(', ')}.`,
      'Pick one piece and move or capture. Last side standing wins.',
    ];
    render();
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
    if (!piece || !piece.alive || state.screen !== 'game') return [];
    if (piece.type === 'pawn') return pawnMoves(piece);
    if (piece.type === 'knight') {
      return stepMoves(piece, [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]);
    }
    if (piece.type === 'bishop') return rayMoves(piece, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
    if (piece.type === 'rook') return rayMoves(piece, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
    return rayMoves(piece, [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
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

  function movePiece(piece, move) {
    const captured = move.capture ? state.pieces.find((target) => target.id === move.capture) : pieceAt(move.x, move.y);
    if (captured && captured.side !== piece.side) {
      captured.alive = false;
      addLog(`${piece.name} captures ${captured.name}.`, piece.side === 'player' ? 'victory' : 'danger');
    } else {
      addLog(`${piece.name} advances.`);
    }
    piece.x = move.x;
    piece.y = move.y;
    promoteIfNeeded(piece);
    checkVictory();
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
    movePiece(piece, move);
    if (state.winner) {
      render();
      return;
    }
    state.turn = 'enemy';
    state.selected = null;
    render();
    window.setTimeout(enemyTurn, 380);
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
    movePiece(entry.piece, choice(entry.moves));
    if (!state.winner) {
      state.turn = 'player';
      state.selected = livingPieces('player')[0] && livingPieces('player')[0].id;
    }
    render();
  }

  function handleTile(x, y) {
    if (state.screen !== 'game' || state.turn !== 'player') return;
    const clicked = pieceAt(x, y);
    if (clicked && clicked.side === 'player') {
      state.selected = clicked.id;
      render();
      return;
    }
    const piece = selectedPiece();
    const move = legalMoves(piece).find((item) => item.x === x && item.y === y);
    if (piece && move) completePlayerMove(piece, move);
  }

  function isoCenter(c, r) {
    return { x: ORIGIN_X + (c - r) * (TW / 2), y: ORIGIN_Y + (c + r) * (TH / 2) };
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
    for (let x = 0; x < COLS; x += 1) {
      drawDiamondFill(x, 0, 'rgba(255,106,82,0.13)', null);
      drawDiamondFill(x, 1, 'rgba(255,106,82,0.08)', null);
      drawDiamondFill(x, ROWS - 1, 'rgba(174,230,255,0.14)', null);
      drawDiamondFill(x, ROWS - 2, 'rgba(174,230,255,0.08)', null);
    }
    const selected = selectedPiece();
    const moves = state.turn === 'player' ? legalMoves(selected) : [];
    moves.forEach((move) => {
      drawDiamondFill(move.x, move.y, move.capture ? 'rgba(255,210,74,0.32)' : 'rgba(174,230,255,0.24)', move.capture ? '#ffd24a' : '#aee6ff');
    });
    if (selected) drawDiamondFill(selected.x, selected.y, 'rgba(255,255,255,0.18)', '#ffffff');
    if (state.hoverTile) drawDiamondFill(state.hoverTile.x, state.hoverTile.y, 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.55)');
    state.pieces
      .filter((piece) => piece.alive)
      .sort((a, b) => (a.x + a.y) - (b.x + b.y))
      .forEach(drawPiece);
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

    const img = IMAGES[piece.type] ? (piece.side === 'player' ? IMAGES[piece.type].player : IMAGES[piece.type].enemy) : null;
    if (img) {
      ctx.drawImage(img, -24, -15, 48, 48);
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

  function setScreen(screen) {
    state.screen = screen;
    render();
  }

  function renderMenu() {
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
          <button type="button" data-action="party">Start Game</button>
          <button type="button" data-action="settings">Settings</button>
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
    statusLine.textContent = state.screen === 'game' ? `${state.turn === 'player' ? 'Player' : 'Enemy'} turn` : 'Menu';
    anchorMeter.textContent = `Allies ${playerCount}`;
    enemyMeter.textContent = `Enemies ${enemyCount}`;
    selectedName.textContent = piece ? piece.name : (state.screen === 'game' ? 'Select a piece' : 'Command Menu');
    selectedMeta.textContent = piece ? `${piece.role} | ${piece.mark} | ${legalMoves(piece).length} legal` : 'Start a skirmish from the board menu.';
    moveButton.textContent = 'Menu';
    powerButton.textContent = 'Restart';
    endButton.textContent = state.turn === 'enemy' ? 'Enemy Moving' : 'Wait';
    moveButton.classList.toggle('active', state.screen !== 'game');
    powerButton.classList.remove('active');
    endButton.disabled = state.screen !== 'game' || state.turn !== 'player';
    rosterEl.innerHTML = ['player', 'enemy'].map((side) => `
      <div class="roster-title">${side === 'player' ? 'Allies' : 'Enemies'}</div>
      ${livingPieces(side).map((unit) => `
        <button class="unit-row ${unit.id === state.selected ? 'active' : ''}" type="button" data-unit="${unit.id}" ${side !== 'player' || state.turn !== 'player' ? 'disabled' : ''}>
          <span class="badge ${side === 'player' ? 'player' : 'enemy'}">
            ${getPieceSvg(unit.type, side)}
          </span>
          <span><strong>${unit.name}</strong><span>${unit.role}</span></span>
          <span>${unit.x + 1},${unit.y + 1}</span>
        </button>
      `).join('')}`).join('');
    rosterEl.querySelectorAll('button[data-unit]').forEach((button) => {
      button.addEventListener('click', () => {
        const unit = state.pieces.find((item) => item.id === button.dataset.unit);
        if (unit && unit.side === 'player' && state.turn === 'player') {
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
    if (button.dataset.action === 'settings') setScreen('settings');
    if (button.dataset.action === 'main') setScreen('main');
    if (button.dataset.action === 'start') startGame();
  });

  boardEl.addEventListener('click', (event) => {
    const tile = pointToTile(event.clientX, event.clientY);
    if (tile) handleTile(tile.x, tile.y);
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

  moveButton.addEventListener('click', () => setScreen('main'));
  powerButton.addEventListener('click', () => startGame());
  endButton.addEventListener('click', () => {
    if (state.screen === 'game' && state.turn === 'player') {
      state.turn = 'enemy';
      state.selected = null;
      render();
      window.setTimeout(enemyTurn, 280);
    }
  });

  initAuth();
  render();
}());
