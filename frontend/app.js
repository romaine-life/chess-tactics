(function () {
  const SIZE = 8;
  const MAX_BREACH = 6;
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
  const accountEl = document.getElementById('account');
  const accountNameEl = document.getElementById('accountName');
  const signOutButton = document.getElementById('signOutButton');
  const authGate = document.getElementById('authGate');
  const authStatus = document.getElementById('authStatus');
  const signInButton = document.getElementById('signInButton');

  function returnTo() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function showSignIn(message) {
    authStatus.textContent = message;
    signInButton.hidden = false;
    authGate.hidden = false;
  }

  async function initAuth() {
    signInButton.hidden = true;
    authGate.hidden = false;
    authStatus.textContent = 'Checking session...';
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) {
        showSignIn('Sign in to play.');
        return;
      }
      const user = await res.json();
      if (!user.signed_in) {
        showSignIn('Sign in to play.');
        return;
      }
      accountNameEl.textContent = user.name || user.email;
      accountEl.hidden = false;
      authGate.hidden = true;
    } catch (_error) {
      showSignIn('Sign-in check failed.');
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

  const state = {
    breach: 1,
    mode: 'move',
    selected: 'crown',
    over: false,
    log: ['Enemy intent is visible. Break the line before it lands.'],
    units: [
      {
        id: 'crown',
        mark: 'K',
        name: 'Crown Lancer',
        role: 'King plus knight',
        x: 2,
        y: 6,
        hp: 3,
        maxHp: 3,
        acted: false,
      },
      {
        id: 'rookhook',
        mark: 'R',
        name: 'Rookhook Duelist',
        role: 'Short rook pull',
        x: 4,
        y: 6,
        hp: 3,
        maxHp: 3,
        acted: false,
      },
      {
        id: 'vesper',
        mark: 'B',
        name: 'Vesper Bishop',
        role: 'Diagonal mend',
        x: 5,
        y: 5,
        hp: 2,
        maxHp: 2,
        acted: false,
      },
    ],
    enemies: [
      { id: 'e1', mark: 'P', name: 'Break Pawn', x: 2, y: 1, hp: 2, maxHp: 2 },
      { id: 'e2', mark: 'L', name: 'File Lance', x: 5, y: 1, hp: 2, maxHp: 2 },
      { id: 'e3', mark: 'P', name: 'Break Pawn', x: 6, y: 2, hp: 2, maxHp: 2 },
    ],
    anchors: [
      { id: 'a1', x: 1, y: 7, hp: 2, maxHp: 2 },
      { id: 'a2', x: 3, y: 7, hp: 2, maxHp: 2 },
      { id: 'a3', x: 6, y: 7, hp: 2, maxHp: 2 },
    ],
  };

  function key(x, y) {
    return `${x},${y}`;
  }

  function inBounds(x, y) {
    return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
  }

  function occupantAt(x, y) {
    return state.units.find((u) => u.hp > 0 && u.x === x && u.y === y) ||
      state.enemies.find((e) => e.hp > 0 && e.x === x && e.y === y);
  }

  function anchorAt(x, y) {
    return state.anchors.find((a) => a.hp > 0 && a.x === x && a.y === y);
  }

  function emptyAt(x, y) {
    return inBounds(x, y) && !occupantAt(x, y) && !anchorAt(x, y);
  }

  function selectedUnit() {
    return state.units.find((u) => u.id === state.selected && u.hp > 0) || state.units.find((u) => u.hp > 0);
  }

  function distance(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function lineClear(from, to) {
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    let x = from.x + dx;
    let y = from.y + dy;
    while (x !== to.x || y !== to.y) {
      if (occupantAt(x, y) || anchorAt(x, y)) return false;
      x += dx;
      y += dy;
    }
    return true;
  }

  function moveTargets(unit) {
    if (!unit || unit.acted || state.over) return [];
    if (unit.id === 'crown') {
      const deltas = [
        [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
        [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1],
      ];
      return deltas.map(([dx, dy]) => ({ x: unit.x + dx, y: unit.y + dy })).filter((p) => emptyAt(p.x, p.y));
    }
    if (unit.id === 'rookhook') {
      return rayTargets(unit, [[1, 0], [-1, 0], [0, 1], [0, -1]], 3);
    }
    return rayTargets(unit, [[1, 1], [1, -1], [-1, 1], [-1, -1]], 3);
  }

  function rayTargets(unit, dirs, maxRange) {
    const out = [];
    dirs.forEach(([dx, dy]) => {
      for (let step = 1; step <= maxRange; step += 1) {
        const x = unit.x + dx * step;
        const y = unit.y + dy * step;
        if (!inBounds(x, y) || occupantAt(x, y) || anchorAt(x, y)) break;
        out.push({ x, y });
      }
    });
    return out;
  }

  function powerTargets(unit) {
    if (!unit || unit.acted || state.over) return [];
    if (unit.id === 'crown') {
      return state.enemies.filter((e) => e.hp > 0 && distance(unit, e) === 1).map((e) => ({ x: e.x, y: e.y }));
    }
    if (unit.id === 'rookhook') {
      return state.enemies
        .filter((e) => e.hp > 0 && (e.x === unit.x || e.y === unit.y) && distance(unit, e) <= 4 && lineClear(unit, e))
        .map((e) => ({ x: e.x, y: e.y }));
    }
    return [...state.units, ...state.anchors, ...state.enemies]
      .filter((t) => t.hp > 0 && Math.abs(t.x - unit.x) === Math.abs(t.y - unit.y) && distance(unit, t) <= 6 && lineClear(unit, t))
      .map((t) => ({ x: t.x, y: t.y }));
  }

  function enemyThreats() {
    const threats = [];
    state.enemies.filter((e) => e.hp > 0).forEach((enemy) => {
      const targets = [...state.units.filter((u) => u.hp > 0), ...state.anchors.filter((a) => a.hp > 0)];
      const target = targets.sort((a, b) => distance(enemy, a) - distance(enemy, b))[0];
      if (!target) return;

      if (enemy.mark === 'L') {
        const dx = Math.sign(target.x - enemy.x);
        const dy = target.y === enemy.y ? 0 : Math.sign(target.y - enemy.y);
        for (let step = 1; step <= 2; step += 1) {
          const x = enemy.x + dx * step;
          const y = enemy.y + dy * step;
          if (inBounds(x, y)) threats.push({ x, y, source: enemy.id });
        }
        return;
      }

      const dx = Math.abs(target.x - enemy.x) >= Math.abs(target.y - enemy.y) ? Math.sign(target.x - enemy.x) : 0;
      const dy = dx === 0 ? Math.sign(target.y - enemy.y) : 0;
      const x = enemy.x + dx;
      const y = enemy.y + dy;
      if (inBounds(x, y)) threats.push({ x, y, source: enemy.id });
    });
    return threats;
  }

  function spawnCells() {
    if (state.breach >= MAX_BREACH) return [];
    const pattern = [
      [{ x: 0, y: 0 }, { x: 7, y: 1 }],
      [{ x: 3, y: 0 }],
      [{ x: 7, y: 0 }, { x: 0, y: 2 }],
      [{ x: 4, y: 0 }],
      [{ x: 1, y: 0 }, { x: 6, y: 0 }],
    ];
    return pattern[(state.breach - 1) % pattern.length].filter((p) => emptyAt(p.x, p.y));
  }

  function addLog(message, tone) {
    state.log.unshift(tone ? `<span class="${tone}">${message}</span>` : message);
    state.log = state.log.slice(0, 7);
  }

  function usePower(unit, x, y) {
    if (unit.id === 'crown') {
      const enemy = state.enemies.find((e) => e.hp > 0 && e.x === x && e.y === y);
      if (!enemy) return;
      const dx = Math.sign(enemy.x - unit.x);
      const dy = Math.sign(enemy.y - unit.y);
      damage(enemy, 1);
      push(enemy, dx, dy);
      addLog(`${unit.name} skewers and shoves ${enemy.name}.`);
    } else if (unit.id === 'rookhook') {
      const enemy = state.enemies.find((e) => e.hp > 0 && e.x === x && e.y === y);
      if (!enemy) return;
      damage(enemy, 1);
      push(enemy, Math.sign(unit.x - enemy.x), Math.sign(unit.y - enemy.y));
      addLog(`${unit.name} drags a target off its file.`);
    } else {
      const enemy = state.enemies.find((e) => e.hp > 0 && e.x === x && e.y === y);
      const ally = state.units.find((u) => u.hp > 0 && u.x === x && u.y === y);
      const anchor = anchorAt(x, y);
      if (enemy) {
        damage(enemy, 1);
        addLog(`${unit.name} cuts the diagonal.`);
      } else if (ally || anchor) {
        const target = ally || anchor;
        target.hp = Math.min(target.maxHp, target.hp + 1);
        addLog(`${unit.name} restores one shell.`);
      }
    }
    unit.acted = true;
    selectNextUnit();
    cleanup();
    render();
  }

  function damage(target, amount) {
    target.hp -= amount;
  }

  function push(target, dx, dy) {
    const x = target.x + dx;
    const y = target.y + dy;
    if (emptyAt(x, y)) {
      target.x = x;
      target.y = y;
    } else if (!inBounds(x, y)) {
      damage(target, 1);
    }
  }

  function cleanup() {
    const fallen = state.enemies.filter((e) => e.hp <= 0);
    if (fallen.length) addLog(`${fallen.length} threat${fallen.length > 1 ? 's' : ''} removed.`, 'victory');
    state.enemies = state.enemies.filter((e) => e.hp > 0);
    state.units = state.units.filter((u) => u.hp > 0);
    state.anchors = state.anchors.filter((a) => a.hp > 0);
    if (!state.units.length || !state.anchors.length) {
      state.over = true;
      addLog('The board collapses.', 'danger');
    }
    if (state.breach > MAX_BREACH && state.units.length && state.anchors.length) {
      state.over = true;
      addLog('The squad seals the last breach.', 'victory');
    }
  }

  function selectNextUnit() {
    const next = state.units.find((u) => !u.acted && u.hp > 0);
    if (next) state.selected = next.id;
  }

  function endTurn() {
    if (state.over) return;
    enemyThreats().forEach((threat) => {
      const unit = occupantAt(threat.x, threat.y);
      const anchor = anchorAt(threat.x, threat.y);
      if (unit) damage(unit, 1);
      if (anchor) damage(anchor, 1);
    });
    cleanup();
    if (state.over) {
      render();
      return;
    }

    state.enemies.forEach((enemy) => {
      const targets = [...state.units, ...state.anchors].filter((t) => t.hp > 0);
      const target = targets.sort((a, b) => distance(enemy, a) - distance(enemy, b))[0];
      if (!target) return;
      const choices = [
        { x: enemy.x + Math.sign(target.x - enemy.x), y: enemy.y },
        { x: enemy.x, y: enemy.y + Math.sign(target.y - enemy.y) },
      ].filter((p) => emptyAt(p.x, p.y));
      if (choices[0]) {
        enemy.x = choices[0].x;
        enemy.y = choices[0].y;
      }
    });

    spawnCells().forEach((p, index) => {
      state.enemies.push({
        id: `e${Date.now()}-${index}`,
        mark: index % 2 ? 'L' : 'P',
        name: index % 2 ? 'File Lance' : 'Break Pawn',
        x: p.x,
        y: p.y,
        hp: 2,
        maxHp: 2,
      });
    });

    state.breach += 1;
    state.units.forEach((u) => {
      u.acted = false;
    });
    state.selected = state.units[0] && state.units[0].id;
    addLog(`Breach ${Math.min(state.breach, MAX_BREACH)} opens.`);
    cleanup();
    render();
  }

  function handleCell(x, y) {
    if (state.over) return;
    const unit = selectedUnit();
    const clickedUnit = state.units.find((u) => u.hp > 0 && u.x === x && u.y === y);
    if (state.mode === 'move' && clickedUnit) {
      state.selected = clickedUnit.id;
      render();
      return;
    }
    if (!unit || unit.acted) return;

    const targets = state.mode === 'move' ? moveTargets(unit) : powerTargets(unit);
    if (!targets.some((p) => p.x === x && p.y === y)) {
      if (clickedUnit) {
        state.selected = clickedUnit.id;
        render();
      }
      return;
    }

    if (state.mode === 'move') {
      unit.x = x;
      unit.y = y;
      unit.acted = true;
      addLog(`${unit.name} takes position.`);
      selectNextUnit();
      render();
      return;
    }
    usePower(unit, x, y);
  }

  // ===== Isometric pixel board (canvas, orthographic 2:1, Into-the-Breach style) =====
  const TW = 72;           // tile width  (2 : 1 dimetric)
  const TH = 36;           // tile height
  const CLIFF = 32;        // floating-island thickness
  const ORIGIN_X = boardEl.width / 2;
  const ORIGIN_Y = 54;
  let hoverTile = null;

  function isoCenter(c, r) {
    return { x: ORIGIN_X + (c - r) * (TW / 2), y: ORIGIN_Y + (c + r) * (TH / 2) };
  }

  // Deterministic per-coordinate noise so the grass texture is stable across redraws.
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
    const left = { x: isoCenter(0, SIZE - 1).x - TW / 2, y: isoCenter(0, SIZE - 1).y };
    const right = { x: isoCenter(SIZE - 1, 0).x + TW / 2, y: isoCenter(SIZE - 1, 0).y };
    const bottom = { x: ORIGIN_X, y: isoCenter(SIZE - 1, SIZE - 1).y + TH / 2 };
    // left (lit) and right (shaded) earth faces
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
    // dirt speckle
    for (let i = 0; i < 140; i += 1) {
      const t = prand(i, 3, 5);
      const onLeft = t < 0.5;
      const fx = onLeft ? left.x + (bottom.x - left.x) * (t * 2) : bottom.x + (right.x - bottom.x) * ((t - 0.5) * 2);
      const fy = (onLeft ? left.y + (bottom.y - left.y) * (t * 2) : bottom.y + (right.y - bottom.y) * ((t - 0.5) * 2)) + prand(i, 7, 9) * CLIFF;
      ctx.fillStyle = prand(i, 11, 2) > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.14)';
      ctx.fillRect(Math.round(fx), Math.round(fy), 2, 2);
    }
    // grass lip along the top of the cliff
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
    ctx.fillStyle = prand(c, r, 1) > 0.5 ? '#6e9350' : '#6a8e4c';
    ctx.fill();
    ctx.clip();
    // grass texture — keyed by absolute pixel position so it flows across tiles
    const PIX = 2;
    for (let py = cy - TH / 2; py < cy + TH / 2; py += PIX) {
      for (let px = cx - TW / 2; px < cx + TW / 2; px += PIX) {
        const t = prand(Math.round(px), Math.round(py), 7);
        if (t > 0.88) ctx.fillStyle = '#587a3e';
        else if (t < 0.10) ctx.fillStyle = '#84aa63';
        else continue;
        ctx.fillRect(px, py, PIX, PIX);
      }
    }
    // a few grass blades
    for (let i = 0; i < 5; i += 1) {
      const bx = Math.round(cx + (prand(c, r, 10 + i) - 0.5) * TW * 0.66);
      const by = Math.round(cy + (prand(c, r, 30 + i) - 0.5) * TH * 0.6);
      ctx.fillStyle = '#4d6a35';
      ctx.fillRect(bx, by - 3, 1, 4);
      ctx.fillStyle = '#a6c977';
      ctx.fillRect(bx, by - 4, 1, 1);
    }
    ctx.restore();
    // grid line
    diamond(cx, cy);
    ctx.strokeStyle = 'rgba(33,50,22,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (hoverTile && hoverTile.c === c && hoverTile.r === r) {
      diamond(cx, cy);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawBoard() {
    ctx.clearRect(0, 0, boardEl.width, boardEl.height);
    ctx.imageSmoothingEnabled = false;
    drawCliff();
    for (let s = 0; s <= 2 * (SIZE - 1); s += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        const r = s - c;
        if (r >= 0 && r < SIZE) drawTile(c, r);
      }
    }
    // outer island rim
    const top = isoCenter(0, 0);
    const right = isoCenter(SIZE - 1, 0);
    const bottom = isoCenter(SIZE - 1, SIZE - 1);
    const left = isoCenter(0, SIZE - 1);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y - TH / 2);
    ctx.lineTo(right.x + TW / 2, right.y);
    ctx.lineTo(bottom.x, bottom.y + TH / 2);
    ctx.lineTo(left.x - TW / 2, left.y);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(20,30,14,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function pointToTile(clientX, clientY) {
    const rect = boardEl.getBoundingClientRect();
    const px = (clientX - rect.left) * (boardEl.width / rect.width);
    const py = (clientY - rect.top) * (boardEl.height / rect.height);
    const a = (px - ORIGIN_X) / (TW / 2);
    const b = (py - ORIGIN_Y) / (TH / 2);
    const c = Math.floor((a + b) / 2 + 0.5);
    const r = Math.floor((b - a) / 2 + 0.5);
    if (c < 0 || c >= SIZE || r < 0 || r >= SIZE) return null;
    return { c, r };
  }

  boardEl.addEventListener('mousemove', (e) => {
    const t = pointToTile(e.clientX, e.clientY);
    const changed = (!!t !== !!hoverTile) || (t && hoverTile && (t.c !== hoverTile.c || t.r !== hoverTile.r));
    if (changed) { hoverTile = t; drawBoard(); }
  });
  boardEl.addEventListener('mouseleave', () => { if (hoverTile) { hoverTile = null; drawBoard(); } });

  function render() {
    const unit = selectedUnit();
    drawBoard();

    statusLine.textContent = state.over ? 'Run complete' : `Breach ${Math.min(state.breach, MAX_BREACH)} / ${MAX_BREACH}`;
    anchorMeter.textContent = `Anchors ${state.anchors.reduce((sum, a) => sum + a.hp, 0)}`;
    enemyMeter.textContent = `Threats ${state.enemies.length}`;
    selectedName.textContent = unit ? unit.name : 'No squad';
    selectedMeta.textContent = unit ? `${unit.role} | ${unit.hp}/${unit.maxHp} hull${unit.acted ? ' | spent' : ''}` : 'Defeat';
    moveButton.classList.toggle('active', state.mode === 'move');
    powerButton.classList.toggle('active', state.mode === 'power');
    rosterEl.innerHTML = state.units.map((u) => `
      <button class="unit-row" type="button" data-unit="${u.id}">
        <span class="badge player">${u.mark}</span>
        <span><strong>${u.name}</strong><span>${u.role}</span></span>
        <span>${u.hp}/${u.maxHp}${u.acted ? ' done' : ''}</span>
      </button>
    `).join('');
    rosterEl.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => {
        state.selected = button.dataset.unit;
        render();
      });
    });
    logEl.innerHTML = state.log.map((line) => `<p>${line}</p>`).join('');
  }

  // Cosmetic terrain (does not affect rules) — drawn only on empty tiles so a
  // unit moving onto the tile cleanly replaces it.
  const TERRAIN = {
    '0,0': 'mountain', '1,0': 'mountain', '0,1': 'mountain',
    '7,6': 'mountain', '7,7': 'mountain',
    '0,4': 'forest', '1,4': 'forest', '6,4': 'forest', '5,3': 'forest', '0,6': 'forest',
    '3,3': 'water', '4,3': 'water', '3,4': 'water',
  };

  function decal(cls) {
    const el = document.createElement('div');
    el.className = `decal ${cls}`;
    return el;
  }

  function hpbar(hp, maxHp) {
    const cap = Math.max(hp, maxHp || hp);
    let s = '';
    for (let i = 0; i < cap; i += 1) s += `<i class="seg${i < hp ? '' : ' empty'}"></i>`;
    return `<div class="hpbar">${s}</div>`;
  }

  function makeToken(cls, svg, hp, maxHp) {
    const el = document.createElement('div');
    el.className = `token ${cls}`;
    const bar = hp != null ? hpbar(hp, maxHp) : '';
    el.innerHTML = `${bar}<div class="sprite-wrap">${svg}</div>`;
    return el;
  }

  function unitToken(u) {
    const accents = { crown: '#f2c14e', rookhook: '#e0584f', vesper: '#3fb8a6' };
    const t = makeToken('player', mechSprite(accents[u.id] || '#cfe0ee'), u.hp, u.maxHp);
    t.setAttribute('aria-label', `${u.name}, ${u.hp} of ${u.maxHp} health`);
    return t;
  }

  function enemyToken(e) {
    return makeToken('enemy', vekSprite(e.mark === 'L' ? '#7a3f2a' : '#8a5a30'), e.hp, e.maxHp);
  }

  function buildingToken(a) {
    return makeToken('building', buildingSprite(a.hp, a.maxHp), a.hp, a.maxHp);
  }

  function terrainToken(type) {
    return makeToken(`terrain ${type}`, type === 'mountain' ? mountainSprite() : treeSprite(), null, null);
  }

  function mechSprite(accent) {
    return `<svg class="sprite" viewBox="0 0 32 40">
      <rect x="9" y="27" width="5" height="11" fill="#2f3a47"/>
      <rect x="18" y="27" width="5" height="11" fill="#2f3a47"/>
      <rect x="7" y="37" width="8" height="3" fill="#222a33"/>
      <rect x="17" y="37" width="8" height="3" fill="#222a33"/>
      <rect x="6" y="13" width="20" height="16" fill="#c6d3de"/>
      <rect x="6" y="13" width="20" height="4" fill="#eef5fa"/>
      <rect x="6" y="25" width="20" height="4" fill="#9fb0bd"/>
      <rect x="10" y="19" width="12" height="6" fill="${accent}"/>
      <rect x="1" y="14" width="6" height="6" fill="#5a6a78"/>
      <rect x="0" y="15" width="2" height="4" fill="#2f3a47"/>
      <rect x="25" y="15" width="5" height="11" fill="#9fb0bd"/>
      <rect x="12" y="6" width="8" height="8" fill="#39424e"/>
      <rect x="13" y="8" width="6" height="2" fill="#8fe6ff"/>
    </svg>`;
  }

  function vekSprite(body) {
    return `<svg class="sprite" viewBox="0 0 38 30">
      <rect x="7" y="19" width="3" height="8" fill="#5e3c20"/>
      <rect x="13" y="21" width="3" height="8" fill="#5e3c20"/>
      <rect x="22" y="21" width="3" height="8" fill="#5e3c20"/>
      <rect x="28" y="19" width="3" height="8" fill="#5e3c20"/>
      <rect x="8" y="10" width="21" height="11" fill="${body}"/>
      <rect x="8" y="10" width="21" height="3" fill="#a8743e"/>
      <rect x="12" y="14" width="13" height="3" fill="#5e3c20"/>
      <rect x="25" y="9" width="9" height="9" fill="#9a6636"/>
      <rect x="32" y="11" width="4" height="2" fill="#ffae57"/>
      <rect x="32" y="15" width="4" height="2" fill="#ffae57"/>
      <rect x="27" y="11" width="2" height="2" fill="#ff5b33"/>
      <rect x="3" y="5" width="5" height="7" fill="${body}"/>
      <rect x="2" y="2" width="4" height="4" fill="#ff5b33"/>
    </svg>`;
  }

  function buildingSprite(hp, maxHp) {
    const cap = Math.max(hp, maxHp || hp);
    const litCount = Math.round((cap ? hp / cap : 0) * 15);
    let windows = '';
    let idx = 0;
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        windows += `<rect x="${8 + col * 5}" y="${13 + row * 5}" width="3" height="3" fill="${idx < litCount ? '#ffd24a' : '#39434f'}"/>`;
        idx += 1;
      }
    }
    return `<svg class="sprite" viewBox="0 0 34 46">
      <rect x="23" y="9" width="8" height="33" fill="#5a636e"/>
      <rect x="6" y="9" width="17" height="33" fill="#828c98"/>
      <rect x="6" y="6" width="17" height="4" fill="#9aa4af"/>
      ${windows}
    </svg>`;
  }

  function treeSprite() {
    return `<svg class="sprite" viewBox="0 0 24 30">
      <rect x="10" y="20" width="4" height="8" fill="#5b3f24"/>
      <polygon points="12,2 21,16 3,16" fill="#3f7a3a"/>
      <polygon points="12,8 19,20 5,20" fill="#4f9147"/>
    </svg>`;
  }

  function mountainSprite() {
    return `<svg class="sprite" viewBox="0 0 34 28">
      <polygon points="17,3 31,26 3,26" fill="#6b6f78"/>
      <polygon points="17,3 17,26 3,26" fill="#5a5e66"/>
      <polygon points="17,3 22,11 12,11" fill="#e8ecf2"/>
    </svg>`;
  }

  moveButton.addEventListener('click', () => {
    state.mode = 'move';
    render();
  });

  powerButton.addEventListener('click', () => {
    state.mode = 'power';
    render();
  });

  endButton.addEventListener('click', endTurn);

  initAuth();
  render();
}());
