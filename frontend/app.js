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
    const threats = new Set(enemyThreats().map((p) => key(p.x, p.y)));
    const spawns = new Set(spawnCells().map((p) => key(p.x, p.y)));

    boardEl.innerHTML = '';
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = `cell ${(x + y) % 2 ? 'dark' : 'light'}`;
        if (state.mode === 'move' && moves.has(key(x, y))) cell.classList.add('move');
        if (state.mode === 'power' && powers.has(key(x, y))) cell.classList.add('power');
        if (threats.has(key(x, y))) cell.classList.add('threat');
        if (spawns.has(key(x, y))) cell.classList.add('spawn');
        if (unit && unit.x === x && unit.y === y) cell.classList.add('selected');
        cell.addEventListener('click', () => handleCell(x, y));

        const anchor = anchorAt(x, y);
        const occ = occupantAt(x, y);
        if (anchor) cell.appendChild(token('anchor', 'A', anchor.hp));
        if (occ) cell.appendChild(token(state.units.includes(occ) ? 'player' : 'enemy', occ.mark, occ.hp));
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

  function token(className, mark, hp) {
    const el = document.createElement('div');
    el.className = className === 'anchor' ? 'anchor' : `token ${className}`;
    el.innerHTML = `${mark}<small>${hp}</small>`;
    return el;
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
