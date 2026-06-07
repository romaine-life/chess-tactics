(function () {
  const SIZE = 8;
  const MAX_BREACH = 6;
  const boardEl = document.getElementById('board');
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

  function render() {
    const unit = selectedUnit();
    const moves = new Set(moveTargets(unit).map((p) => key(p.x, p.y)));
    const powers = new Set(powerTargets(unit).map((p) => key(p.x, p.y)));
    const spawns = new Set(spawnCells().map((p) => key(p.x, p.y)));

    // Map each threatened tile to the direction the attack travels, so the
    // telegraph can paint a directional arrow toward the impact tile.
    const threatDir = new Map();
    enemyThreats().forEach((t) => {
      const src = state.enemies.find((e) => e.id === t.source);
      const dx = src ? Math.sign(t.x - src.x) : 0;
      const dy = src ? Math.sign(t.y - src.y) : 0;
      threatDir.set(key(t.x, t.y), { dx, dy });
    });

    boardEl.innerHTML = '';
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = `cell ${(x + y) % 2 ? 'dark' : 'light'}`;

        const isMove = state.mode === 'move' && moves.has(key(x, y));
        const isPower = state.mode === 'power' && powers.has(key(x, y));
        const isSpawn = spawns.has(key(x, y));
        const threat = threatDir.get(key(x, y));
        const isSelected = unit && unit.x === x && unit.y === y;

        if (isMove) cell.classList.add('move');
        if (isPower) cell.classList.add('power');
        if (threat) cell.classList.add('threat');
        if (isSpawn) cell.classList.add('spawn');
        if (isSelected) cell.classList.add('selected');
        cell.addEventListener('click', () => handleCell(x, y));

        // Ground decals, painted flat on the tilted board, beneath units.
        if (isSelected) cell.appendChild(decal('reticle'));
        if (isMove) cell.appendChild(decal('move-decal'));
        if (isPower) cell.appendChild(decal('power-decal'));
        if (isSpawn) cell.appendChild(decal('spawn-decal'));
        if (threat) {
          const arrow = decal('threat-decal');
          const angle = Math.round((Math.atan2(threat.dy, threat.dx) * 180) / Math.PI);
          arrow.style.setProperty('--angle', `${angle}deg`);
          cell.appendChild(arrow);
        }

        const anchor = anchorAt(x, y);
        const occ = occupantAt(x, y);
        if (!anchor && !occ) {
          const terr = TERRAIN[key(x, y)];
          if (terr === 'water') cell.appendChild(decal('water-decal'));
          else if (terr) cell.appendChild(terrainToken(terr));
        }
        if (anchor) cell.appendChild(buildingToken(anchor));
        if (occ) cell.appendChild(state.units.includes(occ) ? unitToken(occ) : enemyToken(occ));
        boardEl.appendChild(cell);
      }
    }

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

  render();
}());
