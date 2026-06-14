import './style.css';
// Generated asset families (frontend/scripts/normalize-mode-buttons.mjs) are
// described by the asset catalog and assembled at render time.
import assetCatalog from './asset-catalog.json';

(function () {
  const COLS = 8;
  const ROWS = 12;
  const LEVEL_WIDTH_MIN = 4;
  const LEVEL_WIDTH_MAX = 16;
  const LEVEL_HEIGHT_MIN = 4;
  const LEVEL_HEIGHT_MAX = 20;
  const MAX_PARTY_SIZE = 3;
  const PLAYER_1_SPAWN_ZONE_ID = 'player-1-spawn';
  const PLAYER_2_SPAWN_ZONE_ID = 'player-2-spawn';
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
    { id: 'terrain:random-rock', label: 'Rand Rock', role: 'terrain', type: 'random-rock', mark: '?' },
  ];
  const MISC_ZONE_TYPES = [
    { id: 'falling-rock', label: 'Falling Rock' },
  ];
  const DESIGN_PORTFOLIO_ID = 'main-menu-acceptance';
  const DESIGN_PORTFOLIO_CLIENT_SCHEMA_VERSION = 1;
  const MAIN_MENU_REVIEW_STORAGE_KEY = 'chess-tactics-main-menu-review-draft-v1';
  const MAIN_MENU_REFERENCE_STORAGE_KEY = 'chess-tactics-main-menu-reference-crops-v1';
  const APPROVED_RENDER_SRC = '/assets/ui/main-menu-aspirational.png';
  const APPROVED_RENDER_WIDTH = 1586;
  const APPROVED_RENDER_HEIGHT = 992;
  const REFERENCE_CROP_MIN_SIZE = 8;
  const MAIN_MENU_REVIEW_STATUSES = {
    accepted: { label: 'Accepted', cardClass: 'accepted', columnClass: 'settled' },
    review: { label: 'Needs Review', cardClass: 'review', columnClass: 'review' },
    rejected: { label: 'Rejected', cardClass: 'rejected', columnClass: 'rejected' },
  };
  const MAIN_MENU_LEDGER_ITEMS = [
    {
      id: 'mode-buttons',
      label: 'Mode button stack',
      note: 'Accepted painted crop and transparent hit targets.',
      baseStatus: 'accepted',
    },
    {
      id: 'brand-chrome',
      label: 'Brand/title banner',
      note: 'Accepted upper-left crest and title crop.',
      baseStatus: 'accepted',
    },
    {
      id: 'bridge-approach',
      label: 'Art-backed bridge',
      note: 'Keep live DOM controls over game-native chrome.',
      baseStatus: 'accepted',
    },
    {
      id: 'profile-chrome',
      label: 'Profile/status panel',
      note: 'Identity, sign-in/account, counters, and chrome.',
      baseStatus: 'review',
    },
    {
      id: 'news-chrome',
      label: 'Daily/news panel',
      note: 'Daily line, campaign tools copy, reusable panel art.',
      baseStatus: 'review',
    },
    {
      id: 'dock-chrome',
      label: 'Bottom dock',
      note: 'Icons, labels/tooltips, focus states, and priority.',
      baseStatus: 'review',
    },
    {
      id: 'battlefield-plate',
      label: 'Battlefield plate',
      note: 'Frame, status labels, depth, and responsive fit.',
      baseStatus: 'review',
    },
  ];
  const MAIN_MENU_REFERENCE_CROP_DEFAULTS = {
    'mode-buttons': { x: 42, y: 247, w: 492, h: 487 },
    'brand-chrome': { x: 38, y: 35, w: 625, h: 170 },
    'profile-chrome': { x: 1175, y: 26, w: 393, h: 162 },
    'daily-panel': { x: 29, y: 763, w: 485, h: 180 },
    'news-panel': { x: 1176, y: 763, w: 392, h: 190 },
    'dock-chrome': { x: 548, y: 810, w: 410, h: 136 },
    'battlefield-plate': { x: 538, y: 175, w: 930, h: 682 },
  };
  const ZONE_COLORS = [
    { fill: 'rgba(255,210,74,0.24)', stroke: '#ffd24a' },
    { fill: 'rgba(174,230,255,0.22)', stroke: '#aee6ff' },
    { fill: 'rgba(255,106,82,0.21)', stroke: '#ff6a52' },
    { fill: 'rgba(123,208,164,0.22)', stroke: '#7bd0a4' },
    { fill: 'rgba(220,186,255,0.22)', stroke: '#dcbaff' },
  ];
  const PIECES = {
    pawn: { mark: 'P', name: 'Pawn', role: 'Forward footman' },
    knight: { mark: 'N', name: 'Knight', role: 'L-shaped jumper' },
    bishop: { mark: 'B', name: 'Bishop', role: 'Diagonal runner' },
    rook: { mark: 'R', name: 'Rook', role: 'Straight-line tower' },
    queen: { mark: 'Q', name: 'Queen', role: 'Promoted raider' },
    rock: { mark: 'O', name: 'Rock', role: 'Impassable obstacle' },
    'random-rock': { mark: '?', name: 'Rand Rock', role: 'Potential falling rock' },
  };

  const TOKEN_BASE = [
    { type: 'baseDark', d: 'M 13,45 L 32,55 L 51,45 L 32,35 Z' },
    { type: 'base', d: 'M 17,43 L 32,51 L 47,43 L 32,36 Z' },
    { type: 'gold', d: 'M 21,42 L 32,47 L 43,42 L 40,40 L 32,44 L 24,40 Z' }
  ];

  const GEOMETRIES = {
    pawn: [
      ...TOKEN_BASE,
      { type: 'shade', d: 'M 23,27 H 41 V 39 L 32,45 L 23,39 Z' },
      { type: 'core', d: 'M 26,25 H 38 V 38 L 32,42 L 26,38 Z' },
      { type: 'accent', d: 'M 28,30 H 36 V 37 L 32,40 L 28,37 Z' },
      { type: 'gold', d: 'M 25,23 H 39 V 27 H 25 Z' },
      { type: 'dark', d: 'M 31,12 H 34 V 25 H 31 Z' },
      { type: 'accent', d: 'M 34,13 H 46 V 20 H 34 Z' },
      { type: 'gold', d: 'M 34,20 H 43 V 24 H 34 Z' }
    ],
    rook: [
      ...TOKEN_BASE,
      { type: 'shade', d: 'M 21,22 H 43 V 41 L 32,46 L 21,41 Z' },
      { type: 'core', d: 'M 24,24 H 40 V 39 L 32,43 L 24,39 Z' },
      { type: 'accent', d: 'M 26,31 H 38 V 36 H 26 Z' },
      { type: 'gold', d: 'M 22,19 H 42 V 24 H 22 Z' },
      { type: 'core', d: 'M 20,12 H 25 V 20 H 20 Z' },
      { type: 'core', d: 'M 30,10 H 35 V 20 H 30 Z' },
      { type: 'core', d: 'M 40,12 H 45 V 20 H 40 Z' }
    ],
    bishop: [
      ...TOKEN_BASE,
      { type: 'shade', d: 'M 23,27 L 32,18 L 41,27 V 40 L 32,45 L 23,40 Z' },
      { type: 'core', d: 'M 26,28 L 32,21 L 38,28 V 38 L 32,42 L 26,38 Z' },
      { type: 'accent', d: 'M 27,34 L 38,25 L 40,29 L 29,38 Z' },
      { type: 'gold', d: 'M 24,25 L 32,16 L 40,25 L 38,28 L 32,22 L 26,28 Z' },
      { type: 'dark', d: 'M 30,10 H 34 V 17 H 30 Z' },
      { type: 'gold', d: 'M 27,9 L 32,5 L 37,9 L 34,12 H 30 Z' }
    ],
    knight: [
      ...TOKEN_BASE,
      { type: 'shade', d: 'M 25,27 H 39 L 42,40 L 32,45 L 23,40 Z' },
      { type: 'core', d: 'M 25,18 L 37,15 L 45,22 L 41,29 L 34,28 L 32,36 L 24,39 L 22,30 Z' },
      { type: 'shade', d: 'M 18,25 L 25,18 L 25,28 L 17,32 Z' },
      { type: 'dark', d: 'M 29,12 L 34,15 L 28,19 Z' },
      { type: 'gold', d: 'M 38,18 H 43 L 46,21 L 39,22 Z' },
      { type: 'accent', d: 'M 27,30 H 37 L 36,35 H 26 Z' },
      { type: 'dark', d: 'M 35,21 H 38 V 24 H 35 Z' }
    ],
    queen: [
      ...TOKEN_BASE,
      { type: 'shade', d: 'M 21,25 H 43 V 40 L 32,47 L 21,40 Z' },
      { type: 'core', d: 'M 25,24 H 39 V 39 L 32,43 L 25,39 Z' },
      { type: 'accent', d: 'M 27,31 H 37 V 37 H 27 Z' },
      { type: 'gold', d: 'M 20,18 L 25,24 H 39 L 44,18 L 40,29 H 24 Z' },
      { type: 'gold', d: 'M 21,15 L 25,10 L 29,17 L 25,21 Z' },
      { type: 'gold', d: 'M 29,16 L 32,8 L 35,16 L 32,21 Z' },
      { type: 'gold', d: 'M 35,17 L 39,10 L 43,15 L 39,21 Z' },
      { type: 'dark', d: 'M 30,20 H 34 V 24 H 30 Z' }
    ],
    rock: [
      { type: 'stoneDark', d: 'M 12,39 L 24,51 H 42 L 53,38 L 47,21 L 36,13 L 22,16 L 13,27 Z' },
      { type: 'stone', d: 'M 16,38 L 25,47 H 40 L 49,37 L 44,24 L 35,18 L 24,20 L 17,29 Z' },
      { type: 'stoneLight', d: 'M 24,20 L 35,18 L 41,24 L 30,27 L 19,28 Z' },
      { type: 'stoneShade', d: 'M 31,28 L 44,24 L 49,37 L 39,42 Z' },
      { type: 'stoneShade', d: 'M 17,29 L 30,27 L 25,47 L 16,38 Z' }
    ],
    'random-rock': [
      { type: 'stoneDark', d: 'M 12,39 L 24,51 H 42 L 53,38 L 47,21 L 36,13 L 22,16 L 13,27 Z' },
      { type: 'stone', d: 'M 16,38 L 25,47 H 40 L 49,37 L 44,24 L 35,18 L 24,20 L 17,29 Z' },
      { type: 'stoneLight', d: 'M 24,20 L 35,18 L 41,24 L 30,27 L 19,28 Z' },
      { type: 'stoneShade', d: 'M 31,28 L 44,24 L 49,37 L 39,42 Z' },
      { type: 'stoneShade', d: 'M 17,29 L 30,27 L 25,47 L 16,38 Z' },
      { type: 'gold', d: 'M 29,30 H 35 V 36 H 29 Z' }
    ]
  };

  const PIECE_PALETTES = {
    player: {
      core: '#efe7d2',
      shade: '#b7b9ad',
      light: '#fff6dc',
      dark: '#25364b',
      accent: '#2866b8',
      accentDark: '#15366f',
      gold: '#d6a43a',
      base: '#214f9f',
      baseDark: '#12284f',
      outline: '#0b1019',
      shadow: 'rgba(4, 9, 16, 0.38)'
    },
    enemy: {
      core: '#34383a',
      shade: '#1d2225',
      light: '#5a5d56',
      dark: '#111417',
      accent: '#b5362f',
      accentDark: '#661b19',
      gold: '#d1a13a',
      base: '#91251f',
      baseDark: '#411111',
      outline: '#06080b',
      shadow: 'rgba(4, 4, 5, 0.48)'
    },
    neutral: {
      core: '#777f7d',
      shade: '#4d5656',
      light: '#a6aaa2',
      dark: '#2d3435',
      accent: '#6c7480',
      accentDark: '#3e4650',
      gold: '#a88a48',
      base: '#60696c',
      baseDark: '#30383a',
      outline: '#15191b',
      shadow: 'rgba(3, 5, 6, 0.42)',
      stone: '#69716c',
      stoneDark: '#333b3a',
      stoneLight: '#9aa097',
      stoneShade: '#4c5652'
    }
  };

  function getPieceSvg(type, side) {
    const paths = GEOMETRIES[type] || GEOMETRIES.pawn;
    const palette = side === 'player' ? PIECE_PALETTES.player : (side === 'enemy' ? PIECE_PALETTES.enemy : PIECE_PALETTES.neutral);
    const fillColors = {
      ...palette,
      stone: type === 'random-rock' ? 'rgba(126, 105, 151, 0.58)' : palette.stone,
      stoneDark: type === 'random-rock' ? 'rgba(58, 48, 74, 0.62)' : palette.stoneDark,
      stoneLight: type === 'random-rock' ? 'rgba(175, 151, 201, 0.62)' : palette.stoneLight,
      stoneShade: type === 'random-rock' ? 'rgba(90, 73, 112, 0.62)' : palette.stoneShade
    };

    const pathStrings = paths.map((path) => {
      const fillVal = fillColors[path.type] || palette.core;
      const strokeWidth = path.type === 'gold' || path.type === 'accent' ? 1.1 : 1.45;
      return `<path d="${path.d}" fill="${fillVal}" stroke="${palette.outline}" stroke-width="${strokeWidth}" stroke-linejoin="miter" stroke-linecap="square" ${type === 'random-rock' ? 'stroke-dasharray="2,2"' : ''}></path>`;
    }).join('');

    return `<svg width="100%" height="100%" viewBox="0 0 64 64" style="shape-rendering: crispEdges;" class="cursor-pointer transition-transform hover:-translate-y-1 active:translate-y-0" xmlns="http://www.w3.org/2000/svg">
      <path d="M 17,50 L 32,58 L 47,50 L 32,43 Z" fill="${palette.shadow}" stroke="none"></path>
      <g>
        ${pathStrings}
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
  const gamePanel = document.getElementById('gamePanel');
  const levelEditorPanel = document.getElementById('levelEditorPanel');
  const shellEl = document.querySelector('.shell');
  const accountEl = document.getElementById('account');
  const accountAvatarEl = document.getElementById('accountAvatar');
  const accountNameEl = document.getElementById('accountName');
  const signInButton = document.getElementById('signInButton');
  const signOutButton = document.getElementById('signOutButton');
  let currentUser = null;
  let lobbyPollTimer = null;
  let battleAnimFrameId = null;
  let idleAnimFrameId = null;

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
  const MOONLIGHT = {
    skyTop: '#08111c',
    skyBottom: '#101c25',
    grassA: '#243f2c',
    grassB: '#2b4931',
    grassMoon: '#466e4a',
    grassDeep: '#142519',
    grid: 'rgba(126, 170, 143, 0.48)',
    gridShadow: 'rgba(3, 10, 13, 0.78)',
    waterA: '#113447',
    waterB: '#18506a',
    waterMoon: '#7dd7ee',
    stoneA: '#43525a',
    stoneB: '#647176',
    stoneDeep: '#222c31',
    cliffLeft: '#394238',
    cliffRight: '#263139',
    cliffDeep: '#151d22',
    cliffMoss: '#526e49',
  };
  const DEFAULT_BOARD_METRICS = {
    cols: COLS,
    rows: ROWS,
    width: boardEl.width,
    height: boardEl.height,
    originX: boardEl.width / 2 + 54,
    originY: 54,
  };

  function loadMainMenuReviewDraft() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(MAIN_MENU_REVIEW_STORAGE_KEY) || '{}');
      return normalizeMainMenuReviewDraft(parsed);
    } catch (error) {
      return {};
    }
  }

  function loadMainMenuReferenceSelections() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(MAIN_MENU_REFERENCE_STORAGE_KEY) || '{}');
      return normalizeMainMenuReferenceSelections(parsed);
    } catch (error) {
      return {};
    }
  }

  function normalizeMainMenuReviewDraft(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter(([id, status]) => (
      MAIN_MENU_LEDGER_ITEMS.some((item) => item.id === id) && MAIN_MENU_REVIEW_STATUSES[status]
    )));
  }

  function mainMenuReviewDraftFromPortfolioData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return normalizeMainMenuReviewDraft(data.review_statuses || data.statuses || {});
  }

  function mainMenuReferenceSelectionsFromPortfolioData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return normalizeMainMenuReferenceSelections(data.reference_crops || data.referenceCrops || {});
  }

  function mainMenuReviewPortfolioData(draft, referenceSelections) {
    return {
      kind: 'main-menu-design-portfolio',
      document_version: DESIGN_PORTFOLIO_CLIENT_SCHEMA_VERSION,
      review_statuses: normalizeMainMenuReviewDraft(draft),
      reference_crops: normalizeMainMenuReferenceSelections(referenceSelections),
    };
  }

  function saveMainMenuReviewDraftLocal(draft) {
    try {
      const cleanDraft = normalizeMainMenuReviewDraft(draft);
      if (Object.keys(cleanDraft).length) {
        window.localStorage.setItem(MAIN_MENU_REVIEW_STORAGE_KEY, JSON.stringify(cleanDraft));
      } else {
        window.localStorage.removeItem(MAIN_MENU_REVIEW_STORAGE_KEY);
      }
    } catch (error) {
      // Review persistence is a convenience layer; storage failures should not block the screen.
    }
  }

  function saveMainMenuReferenceSelectionsLocal(selections) {
    try {
      const cleanSelections = normalizeMainMenuReferenceSelections(selections);
      if (Object.keys(cleanSelections).length) {
        window.localStorage.setItem(MAIN_MENU_REFERENCE_STORAGE_KEY, JSON.stringify(cleanSelections));
      } else {
        window.localStorage.removeItem(MAIN_MENU_REFERENCE_STORAGE_KEY);
      }
    } catch (error) {
      // Reference crop persistence is a convenience layer; storage failures should not block the screen.
    }
  }

  async function loadMainMenuReviewDraftRemote() {
    state.mainMenuReviewSaveState = 'loading';
    render();
    try {
      const body = await apiRequest(`/api/design-portfolios/${encodeURIComponent(DESIGN_PORTFOLIO_ID)}`);
      const portfolio = body && body.portfolio;
      const remoteDraft = mainMenuReviewDraftFromPortfolioData(portfolio && portfolio.data);
      const remoteReferenceSelections = mainMenuReferenceSelectionsFromPortfolioData(portfolio && portfolio.data);
      state.mainMenuReviewDraft = remoteDraft;
      state.mainMenuReferenceSelections = remoteReferenceSelections;
      state.mainMenuReviewRevision = portfolio && portfolio.revision ? portfolio.revision : 0;
      state.mainMenuReviewUpdatedAt = portfolio && portfolio.updated_at ? portfolio.updated_at : '';
      state.mainMenuReviewSaveState = state.mainMenuReviewRevision ? 'saved' : 'ready';
      state.mainMenuReviewSaveError = '';
      saveMainMenuReviewDraftLocal(remoteDraft);
      saveMainMenuReferenceSelectionsLocal(remoteReferenceSelections);
    } catch (error) {
      state.mainMenuReviewSaveState = 'local';
      state.mainMenuReviewSaveError = 'Slot save unavailable; using this browser only.';
    } finally {
      render();
    }
  }

  async function saveMainMenuReviewDraft(draft) {
    const cleanDraft = normalizeMainMenuReviewDraft(draft);
    state.mainMenuReviewDraft = cleanDraft;
    state.mainMenuReviewSaveState = 'saving';
    state.mainMenuReviewSaveError = '';
    saveMainMenuReviewDraftLocal(cleanDraft);
    render();

    try {
      const body = await apiRequest(`/api/design-portfolios/${encodeURIComponent(DESIGN_PORTFOLIO_ID)}`, {
        method: 'PUT',
        body: JSON.stringify({
          client_schema_version: DESIGN_PORTFOLIO_CLIENT_SCHEMA_VERSION,
          metadata: {
            route: '/design/main-menu',
            source: 'design-portfolio-card',
          },
          data: mainMenuReviewPortfolioData(cleanDraft, state.mainMenuReferenceSelections),
        }),
      });
      const portfolio = body && body.portfolio;
      const persistedDraft = mainMenuReviewDraftFromPortfolioData(portfolio && portfolio.data);
      const persistedReferenceSelections = mainMenuReferenceSelectionsFromPortfolioData(portfolio && portfolio.data);
      state.mainMenuReviewDraft = persistedDraft;
      state.mainMenuReferenceSelections = persistedReferenceSelections;
      state.mainMenuReviewRevision = portfolio && portfolio.revision ? portfolio.revision : 0;
      state.mainMenuReviewUpdatedAt = portfolio && portfolio.updated_at ? portfolio.updated_at : '';
      state.mainMenuReviewSaveState = 'saved';
      saveMainMenuReviewDraftLocal(persistedDraft);
      saveMainMenuReferenceSelectionsLocal(persistedReferenceSelections);
    } catch (error) {
      state.mainMenuReviewSaveState = 'local';
      state.mainMenuReviewSaveError = 'Could not save to slot; kept browser copy.';
    } finally {
      render();
    }
  }

  function mainMenuReviewBaseStatus(id) {
    const item = MAIN_MENU_LEDGER_ITEMS.find((entry) => entry.id === id);
    return item ? item.baseStatus : 'review';
  }

  function nextMainMenuReviewDraft(id, status) {
    const draft = { ...state.mainMenuReviewDraft };
    if (status === mainMenuReviewBaseStatus(id)) {
      delete draft[id];
    } else {
      draft[id] = status;
    }
    return normalizeMainMenuReviewDraft(draft);
  }

  function clampReferenceNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeMainMenuReferenceSelection(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const x = Number(raw.x);
    const y = Number(raw.y);
    const w = Number(raw.w);
    const h = Number(raw.h);
    if (![x, y, w, h].every(Number.isFinite)) return null;
    const cleanX = clampReferenceNumber(x, 0, APPROVED_RENDER_WIDTH - REFERENCE_CROP_MIN_SIZE);
    const cleanY = clampReferenceNumber(y, 0, APPROVED_RENDER_HEIGHT - REFERENCE_CROP_MIN_SIZE);
    const cleanW = clampReferenceNumber(w, REFERENCE_CROP_MIN_SIZE, APPROVED_RENDER_WIDTH - cleanX);
    const cleanH = clampReferenceNumber(h, REFERENCE_CROP_MIN_SIZE, APPROVED_RENDER_HEIGHT - cleanY);
    return {
      x: Math.round(cleanX),
      y: Math.round(cleanY),
      w: Math.round(cleanW),
      h: Math.round(cleanH),
    };
  }

  function normalizeMainMenuReferenceSelections(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).map(([key, selection]) => (
      [key, normalizeMainMenuReferenceSelection(selection)]
    )).filter(([key, selection]) => MAIN_MENU_REFERENCE_CROP_DEFAULTS[key] && selection));
  }

  function mainMenuReferenceSelection(key) {
    return normalizeMainMenuReferenceSelection(state.mainMenuReferenceSelections[key])
      || MAIN_MENU_REFERENCE_CROP_DEFAULTS[key]
      || { x: 0, y: 0, w: APPROVED_RENDER_WIDTH, h: APPROVED_RENDER_HEIGHT };
  }

  function mainMenuReferenceSelectionStyle(selection) {
    const cleanSelection = normalizeMainMenuReferenceSelection(selection);
    if (!cleanSelection) return '';
    return [
      `left:${(cleanSelection.x / APPROVED_RENDER_WIDTH) * 100}%`,
      `top:${(cleanSelection.y / APPROVED_RENDER_HEIGHT) * 100}%`,
      `width:${(cleanSelection.w / APPROVED_RENDER_WIDTH) * 100}%`,
      `height:${(cleanSelection.h / APPROVED_RENDER_HEIGHT) * 100}%`,
    ].join(';');
  }

  function mainMenuReferencePreviewStyle(selection) {
    const cleanSelection = normalizeMainMenuReferenceSelection(selection);
    if (!cleanSelection) return '';
    return [
      `--crop-x:${cleanSelection.x}`,
      `--crop-y:${cleanSelection.y}`,
      `--crop-w:${cleanSelection.w}`,
      `--crop-h:${cleanSelection.h}`,
    ].join(';');
  }

  async function saveMainMenuReferenceSelection(key, selection) {
    const cleanSelection = normalizeMainMenuReferenceSelection(selection);
    if (!MAIN_MENU_REFERENCE_CROP_DEFAULTS[key] || !cleanSelection) return;
    const cleanSelections = normalizeMainMenuReferenceSelections({
      ...state.mainMenuReferenceSelections,
      [key]: cleanSelection,
    });
    state.mainMenuReferenceSelections = cleanSelections;
    state.mainMenuReviewSaveState = 'saving';
    state.mainMenuReviewSaveError = '';
    saveMainMenuReferenceSelectionsLocal(cleanSelections);
    render();

    try {
      const body = await apiRequest(`/api/design-portfolios/${encodeURIComponent(DESIGN_PORTFOLIO_ID)}`, {
        method: 'PUT',
        body: JSON.stringify({
          client_schema_version: DESIGN_PORTFOLIO_CLIENT_SCHEMA_VERSION,
          metadata: {
            route: '/design/main-menu',
            source: 'design-portfolio-reference-picker',
          },
          data: mainMenuReviewPortfolioData(state.mainMenuReviewDraft, cleanSelections),
        }),
      });
      const portfolio = body && body.portfolio;
      const persistedDraft = mainMenuReviewDraftFromPortfolioData(portfolio && portfolio.data);
      const persistedReferenceSelections = mainMenuReferenceSelectionsFromPortfolioData(portfolio && portfolio.data);
      state.mainMenuReviewDraft = persistedDraft;
      state.mainMenuReferenceSelections = persistedReferenceSelections;
      state.mainMenuReviewRevision = portfolio && portfolio.revision ? portfolio.revision : 0;
      state.mainMenuReviewUpdatedAt = portfolio && portfolio.updated_at ? portfolio.updated_at : '';
      state.mainMenuReviewSaveState = 'saved';
      saveMainMenuReviewDraftLocal(persistedDraft);
      saveMainMenuReferenceSelectionsLocal(persistedReferenceSelections);
    } catch (error) {
      state.mainMenuReviewSaveState = 'local';
      state.mainMenuReviewSaveError = 'Could not save reference crop to slot; kept browser copy.';
    } finally {
      render();
    }
  }

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
    levelEditorMode: 'board',
    selectedZoneId: null,
    zoneTool: 'paint',
    zoneDragStart: null,
    zoneDragPreview: null,
    zonePainting: false,
    zoneLastPaintKey: null,
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
    gridStartX: 0,
    gridStartY: 0,
    gridEndX: 7,
    gridEndY: 11,
    mainMenuReviewDraft: loadMainMenuReviewDraft(),
    mainMenuReferenceSelections: loadMainMenuReferenceSelections(),
    mainMenuReviewSaveState: 'ready',
    mainMenuReviewSaveError: '',
    mainMenuReviewRevision: 0,
    mainMenuReviewUpdatedAt: '',
    mainMenuReviewFocusId: 'profile-chrome',
    mainMenuReferenceEditor: null,
    mainMenuReferenceDrag: null,
  };

  const ART_SCREENS = {
    main: {
      label: 'Chess Tactics main menu',
      src: '/assets/ui/main-menu-aspirational.png',
      shellClass: 'main-menu-screen main-menu-art-screen',
      boardClass: 'main-menu-artboard',
      hotspotClass: 'main-menu-hotspot',
      hotspots: [
        { className: 'solo', action: 'party', label: 'Solo Skirmish' },
        { className: 'campaigns', action: 'campaigns', label: 'Campaign Editor' },
        { className: 'editor', action: 'level-editor-preview', label: 'Level Editor' },
        { className: 'lobbies', action: 'lobbies', label: 'Lobbies' },
        { className: 'settings', action: 'settings', label: 'Settings' },
        { className: 'signin', action: 'auth-dynamic', label: 'Sign In' },
        { className: 'account-settings', action: 'settings', label: 'Account settings' },
        { className: 'dock-achievements', action: 'settings', label: 'Achievements roadmap' },
        { className: 'dock-campaigns', action: 'campaigns', label: 'Campaigns' },
        { className: 'dock-lobbies', action: 'lobbies', label: 'Lobbies' },
        { className: 'dock-collection', action: 'settings', label: 'Collection roadmap' },
      ],
    },
    campaigns: {
      label: 'Campaign editor',
      src: '/assets/ui/campaign-editor-concept.png',
      shellClass: 'screen-concept screen-concept-campaign',
      boardClass: 'screen-concept-artboard',
      hotspotClass: 'screen-hotspot',
      hotspots: [
        { className: 'campaign-home', action: 'main', label: 'Main menu' },
        { className: 'campaign-new', action: 'new-campaign', label: 'New campaign' },
        { className: 'campaign-edit-board', action: 'edit-level-board', label: 'Edit board' },
        { className: 'campaign-test', action: 'party', label: 'Test play' },
        { className: 'campaign-save', action: 'save-campaign', label: 'Save campaign' },
        { className: 'campaign-duplicate', action: 'add-level', label: 'Duplicate or add level' },
        { className: 'campaign-delete', action: 'delete-campaign', label: 'Delete campaign' },
        { className: 'campaign-settings', action: 'settings', label: 'Settings' },
      ],
    },
    'level-editor': {
      label: 'Level editor',
      src: '/assets/ui/level-editor-concept.png',
      shellClass: 'screen-concept screen-concept-level-editor',
      boardClass: 'screen-concept-artboard',
      hotspotClass: 'screen-hotspot',
      hotspots: [
        { className: 'level-home', action: 'back-to-campaigns', label: 'Back to campaign editor' },
        { className: 'level-board-tab', action: 'set-level-editor-mode', mode: 'board', label: 'Board mode' },
        { className: 'level-zones-tab', action: 'set-level-editor-mode', mode: 'zones', label: 'Zones mode' },
        { className: 'level-test', action: 'party', label: 'Test level' },
        { className: 'level-save', action: 'save-level-editor', label: 'Save level' },
        { className: 'level-menu', action: 'back-to-campaigns', label: 'Editor menu' },
        { className: 'level-tiles', action: 'set-level-editor-mode', mode: 'board', label: 'Tiles' },
        { className: 'level-pieces', action: 'set-level-editor-mode', mode: 'board', label: 'Pieces' },
      ],
    },
    skirmish: {
      label: 'Skirmish',
      src: '/assets/ui/skirmish-concept.png',
      shellClass: 'screen-concept screen-concept-skirmish',
      boardClass: 'screen-concept-artboard',
      hotspotClass: 'screen-hotspot',
      hotspots: [
        { className: 'skirmish-main', action: 'main', label: 'Main menu' },
        { className: 'skirmish-settings', action: 'settings', label: 'Settings' },
        { className: 'skirmish-end', action: 'end-turn', label: 'End turn' },
        { className: 'skirmish-move', action: 'noop', label: 'Move' },
        { className: 'skirmish-power', action: 'noop', label: 'Power' },
        { className: 'skirmish-wait', action: 'end-turn', label: 'Wait' },
      ],
    },
  };

  const APP_ROUTES = {
    '/': { screen: 'main', mainMenuView: 'skeleton' },
    '/main-menu': { screen: 'main', mainMenuView: 'skeleton' },
    '/main-menu/skeleton': { screen: 'main', mainMenuView: 'skeleton' },
    '/design': { screen: 'main', mainMenuView: 'design-index' },
    '/design/glossary': { screen: 'main', mainMenuView: 'glossary' },
    '/design/widgets': { screen: 'main', mainMenuView: 'widgets' },
    '/design/assets': { screen: 'main', mainMenuView: 'asset-catalog' },
    '/design/assets/navigation-drilldown': { screen: 'main', mainMenuView: 'asset-nav-prototype', prototype: 'drilldown' },
    '/design/assets/navigation-tree': { screen: 'main', mainMenuView: 'asset-nav-prototype', prototype: 'tree' },
    '/design/assets/navigation-hybrid': { screen: 'main', mainMenuView: 'asset-nav-prototype', prototype: 'hybrid' },
    '/design/assets/buttons': { screen: 'main', mainMenuView: 'asset-catalog', assetGroup: 'buttons' },
    '/design/assets/main-menu-buttons': { screen: 'main', mainMenuView: 'asset-catalog', assetType: 'button-9slice.main-menu' },
    '/design/assets/main-menu-button-icons': { screen: 'main', mainMenuView: 'asset-catalog', assetType: 'button-icon.main-menu' },
    '/design/main-menu': { screen: 'main', mainMenuView: 'assets' },
    '/design/main-menu/assets': { screen: 'main', mainMenuView: 'asset-lab' },
    '/design/main-menu/specimen': { screen: 'main', mainMenuView: 'specimen' },
    '/design/main-menu/render': { screen: 'main', mainMenuView: 'concept', conceptScreen: 'main' },
    '/design/main-menu/render/hotspots': { screen: 'main', mainMenuView: 'concept', conceptScreen: 'main', hotspots: true },
    '/campaigns': { screen: 'campaigns' },
    '/campaigns/skeleton': { screen: 'campaigns' },
    '/design/campaigns/render': { screen: 'campaigns', conceptScreen: 'campaigns' },
    '/design/campaigns/render/hotspots': { screen: 'campaigns', conceptScreen: 'campaigns', hotspots: true },
    '/level-editor': { screen: 'level-editor', turn: 'editor' },
    '/level-editor/skeleton': { screen: 'level-editor', turn: 'editor' },
    '/design/level-editor/render': { screen: 'level-editor', turn: 'editor', conceptScreen: 'level-editor' },
    '/design/level-editor/render/hotspots': { screen: 'level-editor', turn: 'editor', conceptScreen: 'level-editor', hotspots: true },
    '/skirmish': { screen: 'game', turn: 'player' },
    '/skirmish/skeleton': { screen: 'game', turn: 'player' },
    '/design/skirmish/render': { screen: 'game', turn: 'player', conceptScreen: 'skirmish' },
    '/design/skirmish/render/hotspots': { screen: 'game', turn: 'player', conceptScreen: 'skirmish', hotspots: true },
  };

  function currentPath() {
    const path = window.location.pathname || '/';
    return path === '/' ? path : path.replace(/\/+$/, '');
  }

  function currentRoute() {
    const path = currentPath();
    if (APP_ROUTES[path]) return APP_ROUTES[path];
    if (path === '/design/assets/glossary') {
      return { screen: 'main', mainMenuView: 'asset-catalog', catalogMode: 'glossary' };
    }
    const glossaryTermMatch = path.match(/^\/design\/assets\/glossary\/(.+)$/);
    if (glossaryTermMatch) {
      return { screen: 'main', mainMenuView: 'asset-catalog', catalogMode: 'glossary', glossaryTerm: decodeURIComponent(glossaryTermMatch[1]) };
    }
    const widgetMatch = path.match(/^\/design\/assets\/widgets\/([^/]+)(?:\/([^/]+))?$/);
    if (widgetMatch) {
      return {
        screen: 'main',
        mainMenuView: 'asset-catalog',
        catalogMode: 'widgets',
        widgetFamily: decodeURIComponent(widgetMatch[1]),
        widgetSlug: widgetMatch[2] ? decodeURIComponent(widgetMatch[2]) : '',
      };
    }
    const assetRouteTypes = {
      'main-menu-buttons': 'button-9slice.main-menu',
      'main-menu-button-icons': 'button-icon.main-menu',
    };
    const assetMatch = path.match(/^\/design\/assets\/([^/]+)(?:\/([^/]+))?$/);
    if (assetMatch) {
      const assetType = assetRouteTypes[assetMatch[1]];
      if (!assetType) return APP_ROUTES['/'];
      return {
        screen: 'main',
        mainMenuView: 'asset-catalog',
        assetType,
        assetId: assetMatch[2] ? decodeURIComponent(assetMatch[2]) : '',
      };
    }
    return APP_ROUTES['/'];
  }

  function applyInitialRoute() {
    const route = currentRoute();
    state.screen = route.screen;
    if (route.turn) state.turn = route.turn;
  }

  const MAIN_MENU_PREVIEW_PIECES = [
    { id: 'menu-blue-rook-left', side: 'player', type: 'rook', mark: 'R', name: 'Allied Rook', role: 'Fortress anchor', x: 0, y: 8, alive: true },
    { id: 'menu-blue-knight', side: 'player', type: 'knight', mark: 'N', name: 'Allied Knight', role: 'L-shaped jumper', x: 2, y: 7, alive: true },
    { id: 'menu-blue-bishop', side: 'player', type: 'bishop', mark: 'B', name: 'Allied Bishop', role: 'Diagonal runner', x: 3, y: 9, alive: true },
    { id: 'menu-blue-rook-center', side: 'player', type: 'rook', mark: 'R', name: 'Allied Rook', role: 'Command tower', x: 4, y: 8, alive: true },
    { id: 'menu-blue-pawn-a', side: 'player', type: 'pawn', mark: 'P', name: 'Allied Pawn', role: 'Forward sentry', x: 1, y: 10, alive: true },
    { id: 'menu-blue-pawn-b', side: 'player', type: 'pawn', mark: 'P', name: 'Allied Pawn', role: 'Forward sentry', x: 5, y: 10, alive: true },
    { id: 'menu-red-rook-left', side: 'enemy', type: 'rook', mark: 'R', name: 'Enemy Rook', role: 'Tower guard', x: 1, y: 1, alive: true },
    { id: 'menu-red-bishop', side: 'enemy', type: 'bishop', mark: 'B', name: 'Enemy Bishop', role: 'Signal piece', x: 3, y: 2, alive: true },
    { id: 'menu-red-queen', side: 'enemy', type: 'queen', mark: 'Q', name: 'Enemy Queen', role: 'Command piece', x: 5, y: 2, alive: true },
    { id: 'menu-red-knight', side: 'enemy', type: 'knight', mark: 'N', name: 'Enemy Knight', role: 'Shock jumper', x: 6, y: 4, alive: true },
    { id: 'menu-red-rook-right', side: 'enemy', type: 'rook', mark: 'R', name: 'Enemy Rook', role: 'Tower guard', x: 7, y: 1, alive: true },
    { id: 'menu-rock-a', side: 'neutral', type: 'rock', mark: 'O', name: 'Ruins', role: 'Ancient stone', x: 0, y: 4, alive: true },
    { id: 'menu-rock-b', side: 'neutral', type: 'rock', mark: 'O', name: 'Ruins', role: 'Ancient stone', x: 6, y: 6, alive: true },
    { id: 'menu-rock-c', side: 'neutral', type: 'rock', mark: 'O', name: 'Ruins', role: 'Ancient stone', x: 2, y: 3, alive: true },
  ];

  Object.values(IMAGES).forEach((spriteSet) => {
    Object.values(spriteSet).forEach((image) => {
      const redraw = () => drawBoard();
      if (image.complete) {
        window.setTimeout(redraw, 0);
      } else {
        image.addEventListener('load', redraw, { once: true });
      }
    });
  });

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
    const assignments = levelZoneAssignments(level);
    return {
      name: (document.getElementById('levelName') && document.getElementById('levelName').value) || (level && level.name),
      objective: (document.getElementById('levelObjective') && document.getElementById('levelObjective').value) || (level && level.objective),
      difficulty: (document.getElementById('levelDifficulty') && document.getElementById('levelDifficulty').value) || (level && level.difficulty),
      width: (document.getElementById('levelWidth') && document.getElementById('levelWidth').value) || (level && level.width),
      height: (document.getElementById('levelHeight') && document.getElementById('levelHeight').value) || (level && level.height),
      enemy_budget: (document.getElementById('levelEnemyBudget') && document.getElementById('levelEnemyBudget').value) || (level && level.enemy_budget),
      notes: (document.getElementById('levelNotes') && document.getElementById('levelNotes').value) || (level && level.notes),
      layout: level ? (level.layout || []) : [],
      zones: level ? levelZones(level) : [],
      zone_assignments: {
        player_1_spawn_zone_id: PLAYER_1_SPAWN_ZONE_ID,
        player_2_spawn_zone_id: PLAYER_2_SPAWN_ZONE_ID,
        misc_zones: collectMiscZoneAssignments(assignments),
      },
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
    level.zones = levelZones(level).map((zone, zoneIndex) => normalizeClientZone(zone, cols, rows, zoneIndex));
    level.zone_assignments = normalizeClientZoneAssignments(levelZoneAssignments(level), level.zones);
  }

  function selectedLevelBrush() {
    return LEVEL_BRUSHES.find((brush) => brush.id === state.selectedLevelBrush) || LEVEL_BRUSHES[0];
  }

  function levelLayout(level) {
    if (!level || !Array.isArray(level.layout)) return [];
    return level.layout;
  }

  function zoneId(index) {
    return `zone-${index + 1}`;
  }

  function selectionId(zone, index) {
    return `${zone.id || 'zone'}-selection-${index + 1}-${Date.now()}`;
  }

  function randomRockZoneFromLayout(level) {
    const randomRocks = levelLayout(level).filter((cell) => cell.role === 'terrain' && cell.type === 'random-rock');
    if (!randomRocks.length) return null;
    return {
      id: 'zone-1',
      name: 'Zone 1',
      selections: randomRocks.map((cell, index) => ({
        id: `selection-${index + 1}`,
        type: 'cell',
        x: Number(cell.x),
        y: Number(cell.y),
      })),
    };
  }

  function defaultSpawnZones(level) {
    const cols = clampBoardNumber(level && level.width, COLS, LEVEL_WIDTH_MIN, LEVEL_WIDTH_MAX);
    const rows = clampBoardNumber(level && level.height, ROWS, LEVEL_HEIGHT_MIN, LEVEL_HEIGHT_MAX);
    return [
      {
        id: PLAYER_1_SPAWN_ZONE_ID,
        name: 'Player 1 Spawn',
        selections: [{ id: 'selection-1', type: 'rect', x1: 0, y1: rows - 1, x2: cols - 1, y2: rows - 1 }],
      },
      {
        id: PLAYER_2_SPAWN_ZONE_ID,
        name: 'Player 2 Spawn',
        selections: [{ id: 'selection-1', type: 'rect', x1: 0, y1: 0, x2: cols - 1, y2: 0 }],
      },
    ];
  }

  function levelZones(level) {
    if (!level) return [];
    if (!Array.isArray(level.zones)) {
      const migrated = randomRockZoneFromLayout(level);
      level.zones = defaultSpawnZones(level);
      if (migrated) level.zones.push(migrated);
      level.zone_assignments = {
        player_1_spawn_zone_id: PLAYER_1_SPAWN_ZONE_ID,
        player_2_spawn_zone_id: PLAYER_2_SPAWN_ZONE_ID,
        misc_zones: migrated ? [{ id: 'misc-zone-1', type: 'falling-rock', zone_id: migrated.id }] : [],
      };
    }
    return level.zones;
  }

  function normalizeClientZone(zone, cols, rows, index) {
    const normalized = {
      id: zone.id || zoneId(index),
      name: String(zone.name || `Zone ${index + 1}`).slice(0, 40),
      selections: [],
    };
    const selections = Array.isArray(zone.selections) ? zone.selections : [];
    normalized.selections = selections.map((selection, selectionIndex) => {
      if (!selection || typeof selection !== 'object') return null;
      if (selection.type === 'cell') {
        const x = clampBoardNumber(selection.x, 0, 0, cols - 1);
        const y = clampBoardNumber(selection.y, 0, 0, rows - 1);
        return { id: selection.id || `${normalized.id}-selection-${selectionIndex + 1}`, type: 'cell', x, y };
      }
      if (selection.type === 'rect') {
        const x1 = clampBoardNumber(selection.x1, 0, 0, cols - 1);
        const y1 = clampBoardNumber(selection.y1, 0, 0, rows - 1);
        const x2 = clampBoardNumber(selection.x2, 0, 0, cols - 1);
        const y2 = clampBoardNumber(selection.y2, 0, 0, rows - 1);
        return { id: selection.id || `${normalized.id}-selection-${selectionIndex + 1}`, type: 'rect', x1, y1, x2, y2 };
      }
      return null;
    }).filter(Boolean);
    return normalized;
  }

  function levelZoneAssignments(level) {
    const assignments = (level && level.zone_assignments) || {};
    return {
      player_1_spawn_zone_id: PLAYER_1_SPAWN_ZONE_ID,
      player_2_spawn_zone_id: PLAYER_2_SPAWN_ZONE_ID,
      misc_zones: Array.isArray(assignments.misc_zones) ? assignments.misc_zones : (Array.isArray(assignments.miscZones) ? assignments.miscZones : []),
    };
  }

  function collectMiscZoneAssignments(assignments) {
    const rows = Array.from(document.querySelectorAll('.misc-zone-row'));
    if (!rows.length) return assignments.misc_zones;
    return rows.map((row, index) => {
      const typeInput = row.querySelector('[data-misc-field="type"]');
      const zoneInput = row.querySelector('[data-misc-field="zone"]');
      return {
        id: row.dataset.miscId || `misc-zone-${index + 1}`,
        type: typeInput ? typeInput.value : 'falling-rock',
        zone_id: zoneInput ? zoneInput.value : '',
      };
    }).filter((zone) => zone.type && zone.zone_id);
  }

  function normalizeClientZoneAssignments(assignments, zones) {
    const zoneIds = new Set(zones.map((zone) => zone.id));
    const misc_zones = assignments.misc_zones
      .map((zone, index) => ({
        id: zone.id || `misc-zone-${index + 1}`,
        type: zone.type,
        zone_id: zone.zone_id || zone.zoneId || '',
      }))
      .filter((zone) => MISC_ZONE_TYPES.some((type) => type.id === zone.type) && zoneIds.has(zone.zone_id));
    return {
      player_1_spawn_zone_id: PLAYER_1_SPAWN_ZONE_ID,
      player_2_spawn_zone_id: PLAYER_2_SPAWN_ZONE_ID,
      misc_zones,
    };
  }

  function isRequiredSpawnZone(zoneId) {
    return zoneId === PLAYER_1_SPAWN_ZONE_ID || zoneId === PLAYER_2_SPAWN_ZONE_ID;
  }

  function selectedZone(level) {
    const zones = levelZones(level);
    if (!zones.length) return null;
    return zones.find((zone) => zone.id === state.selectedZoneId) || zones[0];
  }

  function ensureSelectedZone(level) {
    const zones = levelZones(level);
    if (!zones.length) {
      const zone = { id: zoneId(0), name: 'Zone 1', selections: [] };
      zones.push(zone);
      state.selectedZoneId = zone.id;
      return zone;
    }
    const zone = selectedZone(level);
    state.selectedZoneId = zone.id;
    return zone;
  }

  function zoneCells(zone, level) {
    const size = {
      cols: clampBoardNumber(level && level.width, COLS, LEVEL_WIDTH_MIN, LEVEL_WIDTH_MAX),
      rows: clampBoardNumber(level && level.height, ROWS, LEVEL_HEIGHT_MIN, LEVEL_HEIGHT_MAX),
    };
    const cells = new Map();
    (zone && Array.isArray(zone.selections) ? zone.selections : []).forEach((selection) => {
      if (selection.type === 'cell') {
        const x = Number(selection.x);
        const y = Number(selection.y);
        if (inBounds(x, y, size)) cells.set(`${x},${y}`, { x, y });
      } else if (selection.type === 'rect') {
        const startX = Math.min(Number(selection.x1), Number(selection.x2));
        const endX = Math.max(Number(selection.x1), Number(selection.x2));
        const startY = Math.min(Number(selection.y1), Number(selection.y2));
        const endY = Math.max(Number(selection.y1), Number(selection.y2));
        for (let y = startY; y <= endY; y += 1) {
          for (let x = startX; x <= endX; x += 1) {
            if (inBounds(x, y, size)) cells.set(`${x},${y}`, { x, y });
          }
        }
      }
    });
    return Array.from(cells.values()).sort((a, b) => (a.y - b.y) || (a.x - b.x));
  }

  function validateLevelForSave(level, patch) {
    if (!level || !patch) return false;
    const draft = {
      ...level,
      width: clampBoardNumber(patch.width, level.width, LEVEL_WIDTH_MIN, LEVEL_WIDTH_MAX),
      height: clampBoardNumber(patch.height, level.height, LEVEL_HEIGHT_MIN, LEVEL_HEIGHT_MAX),
      zones: Array.isArray(patch.zones) ? patch.zones : levelZones(level),
      zone_assignments: patch.zone_assignments || levelZoneAssignments(level),
    };
    const zonesById = new Map(draft.zones.map((zone) => [zone.id, zone]));
    const checks = [
      { label: 'Player 1 spawn zone', zoneId: PLAYER_1_SPAWN_ZONE_ID },
      { label: 'Player 2 spawn zone', zoneId: PLAYER_2_SPAWN_ZONE_ID },
    ];
    for (const check of checks) {
      const zone = zonesById.get(check.zoneId);
      if (!zone) {
        setCampaignMessage(`${check.label} is required before saving.`, true);
        return false;
      }
      if (zoneCells(zone, draft).length < MAX_PARTY_SIZE) {
        setCampaignMessage(`${check.label} needs at least ${MAX_PARTY_SIZE} cells before saving.`, true);
        return false;
      }
    }
    return true;
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
    state.levelEditorMode = state.levelEditorMode || 'board';
    state.hoverTile = null;
    state.zoneDragStart = null;
    state.zoneDragPreview = null;
    state.zonePainting = false;
    state.zoneLastPaintKey = null;
    state.gridStartX = 0;
    state.gridStartY = 0;
    state.gridEndX = level.width - 1;
    state.gridEndY = level.height - 1;
    const zone = selectedZone(level);
    state.selectedZoneId = zone && zone.id;
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
    state.zoneDragStart = null;
    state.zoneDragPreview = null;
    state.zonePainting = false;
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

  function paintRandomRockGrid(add) {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    if (!level) return;
    const x1 = state.gridStartX;
    const y1 = state.gridStartY;
    const x2 = state.gridEndX;
    const y2 = state.gridEndY;

    const startX = Math.min(x1, x2);
    const endX = Math.max(x1, x2);
    const startY = Math.min(y1, y2);
    const endY = Math.max(y1, y2);

    level.layout = editorPiecesToLayout();
    let layout = level.layout;

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        if (!inBounds(x, y, { cols: level.width, rows: level.height })) continue;
        layout = layout.filter((cell) => Number(cell.x) !== x || Number(cell.y) !== y);
        if (add) {
          layout.push({ x, y, role: 'terrain', type: 'random-rock' });
        }
      }
    }

    level.layout = layout.sort((a, b) => (Number(a.y) - Number(b.y)) || (Number(a.x) - Number(b.x)));
    syncLevelEditorPieces();
    setCampaignMessage('Board grid updated. Save the level to persist it.');
    render();
  }

  function nextZoneId(level) {
    const used = new Set(levelZones(level).map((zone) => zone.id));
    for (let index = 1; index < 1000; index += 1) {
      const id = `zone-${index}`;
      if (!used.has(id)) return id;
    }
    return `zone-${Date.now()}`;
  }

  function addLevelZone() {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    if (!level) return;
    const zones = levelZones(level);
    const zone = { id: nextZoneId(level), name: `Zone ${zones.length + 1}`, selections: [] };
    zones.push(zone);
    state.selectedZoneId = zone.id;
    state.levelEditorMode = 'zones';
    setCampaignMessage(`${zone.name} added. Save the level to persist it.`);
    render();
  }

  function deleteSelectedZone() {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    if (!level) return;
    const zone = selectedZone(level);
    if (!zone) return;
    if (isRequiredSpawnZone(zone.id)) {
      setCampaignMessage(`${zone.name} is required and cannot be deleted. Clear or edit its cells instead.`, true);
      render();
      return;
    }
    level.zones = levelZones(level).filter((item) => item.id !== zone.id);
    level.zone_assignments = normalizeClientZoneAssignments(levelZoneAssignments(level), level.zones);
    state.selectedZoneId = level.zones[0] && level.zones[0].id;
    state.zoneDragStart = null;
    state.zoneDragPreview = null;
    setCampaignMessage(`${zone.name} deleted. Save the level to persist it.`);
    render();
  }

  function clearSelectedZone() {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    if (!level) return;
    const zone = selectedZone(level);
    if (!zone) return;
    zone.selections = [];
    setCampaignMessage(`${zone.name} cleared. Save the level to persist it.`);
    render();
  }

  function addZoneSelection(selection) {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    if (!level || !selection) return;
    const zone = ensureSelectedZone(level);
    zone.selections = Array.isArray(zone.selections) ? zone.selections : [];
    zone.selections.push({ id: selectionId(zone, zone.selections.length), ...selection });
    setCampaignMessage(`${zone.name} updated. Save the level to persist it.`);
    render();
  }

  function addZonePaintCell(tile) {
    if (!tile) return;
    const key = `${tile.x},${tile.y}`;
    if (state.zoneLastPaintKey === key) return;
    state.zoneLastPaintKey = key;
    addZoneSelection({ type: 'cell', x: tile.x, y: tile.y });
  }

  function addZoneRectSelection(start, end) {
    if (!start || !end) return;
    addZoneSelection({ type: 'rect', x1: start.x, y1: start.y, x2: end.x, y2: end.y });
  }

  function addMiscZoneAssignment() {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    if (!level) return;
    const assignments = levelZoneAssignments(level);
    const zone = selectedZone(level) || levelZones(level)[0];
    assignments.misc_zones.push({
      id: `misc-zone-${Date.now()}`,
      type: MISC_ZONE_TYPES[0].id,
      zone_id: zone ? zone.id : '',
    });
    level.zone_assignments = assignments;
    setCampaignMessage('Misc zone assignment added. Save the level to persist it.');
    render();
  }

  function deleteMiscZoneAssignment(index) {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    if (!level) return;
    const assignments = levelZoneAssignments(level);
    assignments.misc_zones.splice(index, 1);
    level.zone_assignments = assignments;
    setCampaignMessage('Misc zone assignment removed. Save the level to persist it.');
    render();
  }

  async function saveLevelEditor() {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    if (!level) return;
    level.layout = editorPiecesToLayout();
    level.zones = levelZones(level);
    level.zone_assignments = normalizeClientZoneAssignments(levelZoneAssignments(level), level.zones);
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

  async function saveCampaignLevel(options = {}) {
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    if (!campaign || !level) return;
    const label = options.label || 'level';
    const titleLabel = label.charAt(0).toUpperCase() + label.slice(1);
    const patch = levelFormData();
    if (!validateLevelForSave(level, patch)) {
      render();
      return;
    }
    state.campaignLoading = true;
    setCampaignMessage(`Saving ${label}...`);
    render();
    try {
      const body = await campaignRequest(`/api/campaigns/${encodeURIComponent(campaign.id)}/levels/${encodeURIComponent(level.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      syncCampaign(body.campaign);
      state.selectedLevelId = body.level.id;
      setCampaignMessage(`${titleLabel} saved.`);
    } catch (error) {
      setCampaignMessage(error.message || `Could not save ${label}.`, true);
    } finally {
      state.campaignLoading = false;
      render();
    }
  }

  function saveZoneEditor() {
    void saveCampaignLevel({ label: 'zone' });
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

  function easeOutLanding(x) {
    return 1 - Math.pow(1 - x, 3);
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
        piece.offsetY = startHeight * (1 - easeOutLanding(t));
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

  function getMovementLift(piece, now) {
    if (!piece.anim) return 0;
    const elapsed = now - piece.anim.startTime;
    const t = Math.min(1, elapsed / piece.anim.duration);
    return Math.sin(t * Math.PI) * (piece.type === 'rock' ? 2 : 6);
  }

  function shouldIdleAnimateBoard() {
    return false;
  }

  function syncIdleAnimationLoop() {
    if (shouldIdleAnimateBoard()) {
      if (!idleAnimFrameId) {
        idleAnimFrameId = requestAnimationFrame(updateIdleAnimation);
      }
    } else if (idleAnimFrameId) {
      cancelAnimationFrame(idleAnimFrameId);
      idleAnimFrameId = null;
    }
  }

  function updateIdleAnimation() {
    idleAnimFrameId = null;
    if (!shouldIdleAnimateBoard()) return;
    drawBoard();
    idleAnimFrameId = requestAnimationFrame(updateIdleAnimation);
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
      if (state.levelEditorMode === 'board') paintEditorTile(x, y);
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

  function boardExtents(metrics) {
    const top = isoCenter(0, 0, metrics);
    const leftCenter = isoCenter(0, metrics.rows - 1, metrics);
    const rightCenter = isoCenter(metrics.cols - 1, 0, metrics);
    const bottomCenter = isoCenter(metrics.cols - 1, metrics.rows - 1, metrics);
    return {
      top: { x: top.x, y: top.y - TH / 2 },
      left: { x: leftCenter.x - TW / 2, y: leftCenter.y },
      right: { x: rightCenter.x + TW / 2, y: rightCenter.y },
      bottom: { x: bottomCenter.x, y: bottomCenter.y + TH / 2 },
    };
  }

  function terrainKind(c, r, metrics) {
    const lowerWater = r >= metrics.rows - 2 && c <= Math.max(1, Math.floor(metrics.cols * 0.42));
    const leftWater = c === 0 && r >= Math.floor(metrics.rows * 0.38);
    const pond = c <= 2 && r >= metrics.rows - 3 && r - c >= metrics.rows - 4;
    if (lowerWater || leftWater || pond) return 'water';
    const roadLine = Math.round(metrics.rows * 0.38) + c;
    const diagonalRoad = Math.abs(r - roadLine) <= (metrics.cols > 10 ? 1 : 0);
    const midRoad = r === Math.floor(metrics.rows / 2) && c >= 1 && c < metrics.cols - 1;
    if (diagonalRoad || midRoad) return 'stone';
    return 'grass';
  }

  function drawBattlefieldBackground(metrics) {
    const ext = boardExtents(metrics);
    const glowX = (ext.left.x + ext.right.x) / 2;
    const glowY = Math.max(0, ext.top.y - 72);
    const sky = ctx.createLinearGradient(0, 0, 0, boardEl.height);
    sky.addColorStop(0, MOONLIGHT.skyTop);
    sky.addColorStop(0.58, MOONLIGHT.skyBottom);
    sky.addColorStop(1, '#071015');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, boardEl.width, boardEl.height);

    const moonGlow = ctx.createRadialGradient(glowX, glowY, 12, glowX, glowY, 260);
    moonGlow.addColorStop(0, 'rgba(134, 202, 220, 0.22)');
    moonGlow.addColorStop(0.42, 'rgba(72, 119, 137, 0.10)');
    moonGlow.addColorStop(1, 'rgba(72, 119, 137, 0)');
    ctx.fillStyle = moonGlow;
    ctx.fillRect(0, 0, boardEl.width, boardEl.height);

    ctx.fillStyle = 'rgba(3, 8, 10, 0.34)';
    ctx.beginPath();
    ctx.ellipse((ext.left.x + ext.right.x) / 2, ext.bottom.y + CLIFF + 18, (ext.right.x - ext.left.x) * 0.62, 42, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCliff(metrics) {
    const { left, right, bottom } = boardExtents(metrics);
    const leftFace = ctx.createLinearGradient(left.x, left.y, bottom.x, bottom.y + CLIFF);
    leftFace.addColorStop(0, MOONLIGHT.cliffLeft);
    leftFace.addColorStop(1, MOONLIGHT.cliffDeep);
    ctx.fillStyle = leftFace;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y); ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(bottom.x, bottom.y + CLIFF); ctx.lineTo(left.x, left.y + CLIFF);
    ctx.closePath(); ctx.fill();
    const rightFace = ctx.createLinearGradient(right.x, right.y, bottom.x, bottom.y + CLIFF);
    rightFace.addColorStop(0, MOONLIGHT.cliffRight);
    rightFace.addColorStop(1, MOONLIGHT.cliffDeep);
    ctx.fillStyle = rightFace;
    ctx.beginPath();
    ctx.moveTo(bottom.x, bottom.y); ctx.lineTo(right.x, right.y);
    ctx.lineTo(right.x, right.y + CLIFF); ctx.lineTo(bottom.x, bottom.y + CLIFF);
    ctx.closePath(); ctx.fill();

    for (let i = 0; i < metrics.cols + metrics.rows; i += 1) {
      const t = i / Math.max(1, metrics.cols + metrics.rows - 1);
      const x = left.x + (bottom.x - left.x) * t;
      const y = left.y + (bottom.y - left.y) * t;
      ctx.fillStyle = i % 2 ? 'rgba(92, 112, 104, 0.26)' : 'rgba(15, 21, 24, 0.34)';
      ctx.fillRect(Math.round(x), Math.round(y + 7), 2, CLIFF - 10);
    }

    ctx.fillStyle = MOONLIGHT.cliffMoss;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y); ctx.lineTo(bottom.x, bottom.y); ctx.lineTo(right.x, right.y);
    ctx.lineTo(right.x, right.y + 3); ctx.lineTo(bottom.x, bottom.y + 3); ctx.lineTo(left.x, left.y + 3);
    ctx.closePath(); ctx.fill();
  }

  function drawTile(c, r, metrics) {
    const { x: cx, y: cy } = isoCenter(c, r, metrics);
    const terrain = terrainKind(c, r, metrics);
    ctx.save();
    diamond(cx, cy);
    if (terrain === 'water') {
      const water = ctx.createLinearGradient(cx - TW / 2, cy - TH / 2, cx + TW / 2, cy + TH / 2);
      water.addColorStop(0, '#0b2434');
      water.addColorStop(0.45, MOONLIGHT.waterA);
      water.addColorStop(1, MOONLIGHT.waterB);
      ctx.fillStyle = water;
    } else if (terrain === 'stone') {
      ctx.fillStyle = (c + r) % 2 ? MOONLIGHT.stoneA : '#4d5e63';
    } else {
      ctx.fillStyle = (c + r) % 2 ? MOONLIGHT.grassA : MOONLIGHT.grassB;
    }
    ctx.fill();
    ctx.clip();
    if (terrain === 'water') {
      for (let i = 0; i < 5; i += 1) {
        const waveY = Math.round(cy - 8 + i * 4 + (prand(c, r, i + 60) - 0.5) * 2);
        const waveX = Math.round(cx - 24 + prand(c, r, i + 80) * 18);
        ctx.fillStyle = i % 2 ? 'rgba(125, 215, 238, 0.46)' : 'rgba(172, 236, 247, 0.30)';
        ctx.fillRect(waveX, waveY, 18 + Math.round(prand(c, r, i + 90) * 16), 2);
      }
      ctx.fillStyle = 'rgba(3, 12, 18, 0.26)';
      ctx.fillRect(Math.round(cx - TW / 2), Math.round(cy + TH / 2 - 5), TW, 5);
    } else if (terrain === 'stone') {
      for (let i = 0; i < 6; i += 1) {
        const bx = Math.round(cx - 28 + i * 11 + (prand(c, r, i + 100) - 0.5) * 4);
        const by = Math.round(cy - 7 + (i % 2) * 5 + (prand(c, r, i + 110) - 0.5) * 3);
        ctx.fillStyle = prand(c, r, i + 120) > 0.45 ? MOONLIGHT.stoneB : MOONLIGHT.stoneDeep;
        ctx.fillRect(bx, by, 9, 3);
      }
      ctx.fillStyle = 'rgba(185, 213, 207, 0.16)';
      ctx.fillRect(Math.round(cx - 20), Math.round(cy - 13), 34, 2);
    } else {
      for (let i = 0; i < 9; i += 1) {
        const bx = Math.round(cx + (prand(c, r, i) - 0.5) * TW * 0.68);
        const by = Math.round(cy + (prand(c, r, i + 20) - 0.5) * TH * 0.62);
        ctx.fillStyle = prand(c, r, i + 40) > 0.56 ? MOONLIGHT.grassMoon : MOONLIGHT.grassDeep;
        ctx.fillRect(bx, by, prand(c, r, i + 130) > 0.6 ? 3 : 2, 2);
      }
      if (prand(c, r, 220) > 0.86 && (c === 0 || r === 0 || c === metrics.cols - 1 || r === metrics.rows - 1)) {
        ctx.fillStyle = '#132016';
        ctx.fillRect(Math.round(cx - 3), Math.round(cy - 7), 5, 10);
        ctx.fillStyle = '#35583b';
        ctx.fillRect(Math.round(cx - 8), Math.round(cy - 13), 14, 8);
        ctx.fillStyle = 'rgba(118, 175, 123, 0.52)';
        ctx.fillRect(Math.round(cx - 5), Math.round(cy - 14), 8, 2);
      }
    }
    ctx.restore();
    diamond(cx, cy);
    ctx.strokeStyle = MOONLIGHT.gridShadow;
    ctx.lineWidth = 1;
    ctx.stroke();
    diamond(cx, cy);
    ctx.strokeStyle = terrain === 'water' ? 'rgba(125, 215, 238, 0.42)' : MOONLIGHT.grid;
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
      drawDiamondFill(x, y, isEnemy ? 'rgba(255,72,66,0.17)' : 'rgba(19,211,255,0.20)', null, metrics);
    } else if (isMove) {
      drawDiamondFill(x, y, isEnemy ? 'rgba(255,72,66,0.10)' : 'rgba(19,211,255,0.16)', null, metrics);
    } else if (isAttack) {
      drawDiamondFill(x, y, isEnemy ? 'rgba(255,72,66,0.13)' : 'rgba(255,139,64,0.13)', null, metrics);
    }

    // 2. Draw Attack Indicator (Dashed border around the tile)
    if (isAttack) {
      ctx.save();
      diamond(cx, cy);
      ctx.strokeStyle = isEnemy ? '#ff4842' : '#ff8b40';
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 3]);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(20, 5, 4, 0.70)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Draw Move Indicator (Isometric disk/ring in the center of the tile)
    if (isMove) {
      ctx.save();
      ctx.beginPath();
      // An isometric ellipse tuned to stay visible over dark terrain.
      ctx.ellipse(cx, cy, 11, 5.5, 0, 0, 2 * Math.PI);

      const strokeColor = isEnemy ? '#ff4842' : '#13d3ff';
      const fillColor = isEnemy ? 'rgba(255,72,66,0.34)' : 'rgba(19,211,255,0.42)';

      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawZoneCell(x, y, color, strong, metrics) {
    drawDiamondFill(x, y, color.fill, strong ? color.stroke : null, metrics);
    if (!strong) {
      const center = isoCenter(x, y, metrics);
      diamond(center.x, center.y);
      ctx.strokeStyle = color.stroke;
      ctx.globalAlpha = 0.38;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawZoneOverlays(metrics) {
    if (state.screen !== 'level-editor') return;
    const campaign = selectedCampaign();
    const level = selectedLevel(campaign);
    if (!level) return;
    const zones = levelZones(level);
    const assignments = levelZoneAssignments(level);
    const assignedIds = new Set([
      assignments.player_1_spawn_zone_id,
      assignments.player_2_spawn_zone_id,
      ...assignments.misc_zones.map((zone) => zone.zone_id || zone.zoneId),
    ].filter(Boolean));
    zones.forEach((zone, index) => {
      if (state.levelEditorMode !== 'zones' && !assignedIds.has(zone.id)) return;
      const active = state.levelEditorMode === 'zones' && (!state.selectedZoneId ? index === 0 : zone.id === state.selectedZoneId);
      const color = ZONE_COLORS[index % ZONE_COLORS.length];
      zoneCells(zone, level).forEach((cell) => drawZoneCell(cell.x, cell.y, color, active, metrics));
    });

    if (state.levelEditorMode === 'zones' && state.zoneDragStart && state.zoneDragPreview) {
      const startX = Math.min(state.zoneDragStart.x, state.zoneDragPreview.x);
      const endX = Math.max(state.zoneDragStart.x, state.zoneDragPreview.x);
      const startY = Math.min(state.zoneDragStart.y, state.zoneDragPreview.y);
      const endY = Math.max(state.zoneDragStart.y, state.zoneDragPreview.y);
      const color = ZONE_COLORS[Math.max(0, zones.findIndex((zone) => zone.id === state.selectedZoneId)) % ZONE_COLORS.length];
      ctx.save();
      ctx.setLineDash([6, 4]);
      for (let y = startY; y <= endY; y += 1) {
        for (let x = startX; x <= endX; x += 1) {
          if (inBounds(x, y, metrics)) drawZoneCell(x, y, color, true, metrics);
        }
      }
      ctx.restore();
    }
  }

  function drawMainMenuBoardAccents(metrics) {
    if (state.screen !== 'main') return;
    [
      [1, 7], [2, 7], [3, 7],
      [1, 8], [2, 8], [3, 8], [4, 8],
      [2, 9], [3, 9], [4, 9],
    ].forEach(([x, y]) => drawDiamondFill(x, y, 'rgba(37,199,255,0.20)', 'rgba(37,199,255,0.72)', metrics));
    [
      [3, 2], [4, 2], [5, 2],
      [4, 3], [5, 3], [6, 3],
      [5, 4], [6, 4],
    ].forEach(([x, y]) => drawDiamondFill(x, y, 'rgba(255,95,73,0.14)', 'rgba(255,95,73,0.52)', metrics));
    [[2, 7], [4, 8]].forEach(([x, y]) => drawDiamondFill(x, y, 'rgba(255,255,255,0.16)', '#e8f8ff', metrics));
  }

  function drawBoard() {
    const metrics = boardMetrics();
    syncCanvasSize(metrics);
    ctx.clearRect(0, 0, boardEl.width, boardEl.height);
    ctx.imageSmoothingEnabled = false;
    drawBattlefieldBackground(metrics);
    drawCliff(metrics);
    for (let s = 0; s <= metrics.cols + metrics.rows - 2; s += 1) {
      for (let c = 0; c < metrics.cols; c += 1) {
        const r = s - c;
        if (r >= 0 && r < metrics.rows) drawTile(c, r, metrics);
      }
    }
    for (let x = 0; x < metrics.cols; x += 1) {
      drawDiamondFill(x, 0, 'rgba(255,92,72,0.14)', null, metrics);
      if (metrics.rows > 1) drawDiamondFill(x, 1, 'rgba(255,139,64,0.07)', null, metrics);
      drawDiamondFill(x, metrics.rows - 1, 'rgba(19,211,255,0.14)', null, metrics);
      if (metrics.rows > 1) drawDiamondFill(x, metrics.rows - 2, 'rgba(19,211,255,0.08)', null, metrics);
    }
    drawZoneOverlays(metrics);
    drawMainMenuBoardAccents(metrics);
    const selected = state.battleAnimating ? null : selectedPiece();
    if (state.screen === 'game' && state.showThreats) {
      getEnemyThreats().forEach((sq) => {
        drawDiamondFill(sq.x, sq.y, 'rgba(255,72,66,0.28)', 'rgba(255,116,88,0.86)', metrics);
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
    if (selected && !state.animating && !state.battleAnimating) {
      const selectedFill = selected.side === 'enemy' ? 'rgba(255,72,66,0.20)' : 'rgba(19,211,255,0.22)';
      const selectedStroke = selected.side === 'enemy' ? '#ff7458' : '#9beeff';
      drawDiamondFill(selected.x, selected.y, selectedFill, selectedStroke, metrics);
      const center = isoCenter(selected.x, selected.y, metrics);
      ctx.save();
      diamond(center.x, center.y);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = selected.side === 'enemy' ? 'rgba(255,184,92,0.76)' : 'rgba(255,226,127,0.78)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    if (state.hoverTile && !state.animating && !state.battleAnimating) {
      if (state.screen === 'level-editor') {
        if (state.levelEditorMode === 'zones') {
          drawDiamondFill(state.hoverTile.x, state.hoverTile.y, 'rgba(255,210,74,0.16)', '#ffd24a', metrics);
        } else {
          const brush = selectedLevelBrush();
          const fill = brush.role === 'player'
            ? 'rgba(174,230,255,0.25)'
            : (brush.role === 'enemy' ? 'rgba(255,106,82,0.25)' : (brush.role === 'terrain' ? 'rgba(180,180,180,0.24)' : 'rgba(255,255,255,0.12)'));
          drawDiamondFill(state.hoverTile.x, state.hoverTile.y, fill, brush.id === 'empty' ? '#ffffff' : '#ffd24a', metrics);
        }
      } else {
        drawDiamondFill(state.hoverTile.x, state.hoverTile.y, 'rgba(155,238,255,0.11)', 'rgba(155,238,255,0.62)', metrics);
      }
    }
    
    const piecesForRender = state.screen === 'main' ? MAIN_MENU_PREVIEW_PIECES : state.pieces;
    const activePieces = piecesForRender
      .filter((piece) => piece.alive)
      .sort((a, b) => {
        const posA = getPieceRenderPos(a);
        const posB = getPieceRenderPos(b);
        return (posA.x + posA.y) - (posB.x + posB.y);
    });

    const now = performance.now();
    activePieces.forEach((piece) => drawPiece(piece, now));
  }

  function drawPiece(piece, now) {
    const renderPos = getPieceRenderPos(piece);
    const { x, y } = isoCenter(renderPos.x, renderPos.y);
    const palette = piece.side === 'player'
      ? PIECE_PALETTES.player
      : (piece.side === 'enemy' ? PIECE_PALETTES.enemy : PIECE_PALETTES.neutral);
    ctx.save();
    const offsetY = piece.offsetY || 0;
    const lift = getMovementLift(piece, now);
    ctx.translate(Math.round(x), Math.round(y - 24 - offsetY - lift));

    const img = IMAGES[piece.type] 
      ? (piece.side === 'player' 
          ? IMAGES[piece.type].player 
          : (piece.side === 'enemy' ? IMAGES[piece.type].enemy : IMAGES[piece.type].neutral))
      : null;
    if (img && img.complete && img.naturalWidth) {
      const size = piece.type === 'rock' || piece.type === 'random-rock' ? 48 : 52;
      ctx.drawImage(img, -size / 2, -16, size, size);
    } else {
      if (piece.type === 'rock' || piece.type === 'random-rock') {
        ctx.fillStyle = palette.outline;
        ctx.fillRect(-17, -6, 34, 29);
        ctx.fillStyle = palette.stone || palette.core;
        ctx.fillRect(-13, -10, 26, 30);
        ctx.fillStyle = palette.stoneLight || palette.light;
        ctx.fillRect(-8, -8, 11, 8);
        ctx.fillStyle = palette.stoneShade || palette.shade;
        ctx.fillRect(2, 3, 10, 13);
      } else {
        ctx.fillStyle = palette.outline;
        ctx.fillRect(-17, 13, 34, 8);
        ctx.fillStyle = palette.baseDark;
        ctx.fillRect(-14, 10, 28, 8);
        ctx.fillStyle = palette.base;
        ctx.fillRect(-11, 7, 22, 6);
        ctx.fillStyle = palette.outline;
        ctx.fillRect(-12, -11, 24, 23);
        ctx.fillStyle = palette.core;
        ctx.fillRect(-9, -14, 18, 24);
        ctx.fillStyle = palette.accent;
        ctx.fillRect(-6, -2, 12, 7);
        ctx.fillStyle = palette.gold;
        ctx.fillRect(-8, -17, 16, 5);
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

  function renderZoneOptions(level, selectedId, allowNone = true) {
    const zones = levelZones(level);
    return `${allowNone ? '<option value="">None</option>' : ''}${zones.map((zone) => `
      <option value="${escapeText(zone.id)}" ${zone.id === selectedId ? 'selected' : ''}>${escapeText(zone.name)}</option>
    `).join('')}`;
  }

  function renderMiscZoneTypeOptions(selectedType) {
    return MISC_ZONE_TYPES.map((type) => `
      <option value="${escapeText(type.id)}" ${type.id === selectedType ? 'selected' : ''}>${escapeText(type.label)}</option>
    `).join('');
  }

  function renderMiscZoneAssignment(level, assignment, index) {
    const zoneId = assignment.zone_id || assignment.zoneId || '';
    const type = assignment.type || 'falling-rock';
    return `
      <div class="misc-zone-row" data-misc-id="${escapeText(assignment.id || `misc-zone-${index + 1}`)}">
        <label>Type
          <select data-misc-field="type">${renderMiscZoneTypeOptions(type)}</select>
        </label>
        <label>Zone
          <select data-misc-field="zone">${renderZoneOptions(level, zoneId)}</select>
        </label>
        <button type="button" data-action="delete-misc-zone" data-misc-index="${index}">Remove</button>
      </div>`;
  }

  function renderZoneAssignmentControls(level) {
    const assignments = levelZoneAssignments(level);
    return `
      <div class="misc-zone-assignments">
        <div class="zone-editor-head compact">
          <div class="roster-title">Misc Zones</div>
          <button type="button" data-action="add-misc-zone">Add</button>
        </div>
        ${assignments.misc_zones.length ? assignments.misc_zones.map((assignment, index) => renderMiscZoneAssignment(level, assignment, index)).join('') : '<p class="empty-lobbies">No misc zones assigned.</p>'}
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
                    <label class="wide">Notes<textarea id="levelNotes" maxlength="400">${escapeText(level.notes)}</textarea></label>
                  </div>
                  <div class="menu-row">
                    <button type="button" data-action="save-level" ${state.campaignLoading ? 'disabled' : ''}>Save Level</button>
                    <button type="button" data-action="edit-level-board" ${state.campaignLoading ? 'disabled' : ''}>Edit Level</button>
                    <button type="button" data-action="delete-level" ${campaign.levels.length <= 1 || state.campaignLoading ? 'disabled' : ''}>Delete Level</button>
                  </div>` : ''}
              </div>
            ` : '<p class="empty-lobbies">Create a campaign to begin.</p>'}
          </div>
        </div>
        <button type="button" data-action="main">Back</button>
      </div>`;
  }

  function shouldShowMainConcept() {
    return currentRoute().mainMenuView === 'concept';
  }

  function shouldShowMainSkeleton() {
    return currentRoute().mainMenuView === 'skeleton';
  }

  function shouldShowMainAssets() {
    return currentRoute().mainMenuView === 'assets';
  }

  function shouldShowMainAssetLab() {
    return currentRoute().mainMenuView === 'asset-lab';
  }

  function shouldShowAssetCatalog() {
    return currentRoute().mainMenuView === 'asset-catalog';
  }

  function shouldShowAssetNavigationPrototype() {
    return currentRoute().mainMenuView === 'asset-nav-prototype';
  }

  function shouldShowMainSpecimen() {
    return currentRoute().mainMenuView === 'specimen';
  }

  function shouldShowMainDesignIndex() {
    return currentRoute().mainMenuView === 'design-index';
  }

  function shouldShowGlossary() {
    return currentRoute().mainMenuView === 'glossary';
  }

  function shouldShowWidgets() {
    return currentRoute().mainMenuView === 'widgets';
  }


  // Live main-menu mode list. Actions and labels are app concerns (live DOM);
  // the ART comes from the asset catalog (button-9slice.main-menu + the
  // button-icon.main-menu assets). Each row is assembled at render time:
  // 9-slice state + composited icon + live label + action — the catalog model.
  // `action` is the live menu's dispatch code (DOM behavior); `slug` is the
  // widget's stable identity in catalog URLs. They are intentionally separate:
  // the URL should read solo-skirmish, not the internal "party" action.
  const MENU_MODES = [
    { action: 'party', slug: 'solo-skirmish', icon: 'button-icon.main-menu.sword', label: 'Solo Skirmish' },
    { action: 'campaigns', slug: 'campaign-editor', icon: 'button-icon.main-menu.crown', label: 'Campaign Editor' },
    { action: 'level-editor-preview', slug: 'level-editor', icon: 'button-icon.main-menu.scroll', label: 'Level Editor' },
    { action: 'lobbies', slug: 'lobbies', icon: 'button-icon.main-menu.people', label: 'Lobbies' },
    { action: 'settings', slug: 'settings', icon: 'button-icon.main-menu.gear', label: 'Settings' },
  ];

  function renderModeButton(mode, { active = false, specimen = false } = {}) {
    const nineSlice = assetById('button-9slice.main-menu');
    if (!nineSlice) return '';
    const rules = nineSlice.rules || {};
    const stateDef = (nineSlice.states || {})[active ? 'pressed' : 'normal'] || (nineSlice.states || {}).normal;
    if (!stateDef) return '';
    const icon = assetById(mode.icon);
    const frameStyle = frameStyleForAsset(nineSlice, stateDef.rect);
    const iconStyle = icon ? `${insetStyle(rules.iconSlot, stateDef.rect)};${frameStyleForAsset(icon, icon.rect)}` : '';
    const labelStyle = insetStyle(rules.textInset, stateDef.rect);
    return `
      <button class="mode-button ${active ? 'is-active' : ''}${specimen ? ' is-specimen' : ''}" type="button" data-action="${escapeText(specimen ? 'noop' : mode.action)}" aria-label="${escapeText(mode.label)}"${active ? ' aria-current="true"' : ''}${specimen ? ' tabindex="-1"' : ''} style="--asset-aspect:${stateDef.rect.w} / ${stateDef.rect.h}">
        <span class="mode-button-9slice" style="${frameStyle}" aria-hidden="true"></span>
        ${icon ? `<span class="mode-button-icon" style="${iconStyle}" aria-hidden="true"></span>` : ''}
        <span class="mode-button-label" style="${labelStyle}">${escapeText(mode.label)}</span>
      </button>`;
  }

  function renderModeButtonStack({ activeAction = 'party' } = {}) {
    const buttons = MENU_MODES
      .map((mode) => renderModeButton(mode, { active: mode.action === activeAction }))
      .join('');
    return `
      <nav class="main-menu-actions main-menu-actions-assets" aria-label="Play modes">
        ${buttons}
      </nav>`;
  }

  // Completed widgets gallery: the finished main-menu button widgets, each
  // assembled from catalog assets (a 9-slice state + an icon) + a live label +
  // an action. Distinct from the asset catalog (which holds the parts).
  function renderWidgetCard(mode) {
    const active = mode.action === 'party';
    const iconAsset = assetById(mode.icon);
    const iconName = iconAsset ? (iconAsset.title || mode.icon) : mode.icon;
    return `
      <article class="widget-card">
        <div class="widget-card-preview main-menu-actions-assets">${renderModeButton(mode, { active, specimen: true })}</div>
        <div class="widget-card-meta">
          <h3>${escapeText(mode.label)}</h3>
          <p>${active ? 'pressed' : 'normal'} 9-slice + ${escapeText(iconName)} + live label + <code>${escapeText(mode.action)}</code> action</p>
        </div>
      </article>`;
  }

  function renderWidgets() {
    const cards = MENU_MODES.map(renderWidgetCard).join('');
    return `
      <div class="main-assets-screen widgets-screen" data-live-screen="widgets">
        <header class="main-assets-header">
          <a class="design-back" href="/design">&larr; Design</a>
          <p class="eyebrow">Design system · completed widgets</p>
          <h2>Widgets</h2>
          <p class="main-assets-intro">Finished, assembled widgets — each built from catalog assets (a 9-slice in a state + an icon) plus a live label and an action. This is the main-menu button family, live in the game.</p>
        </header>
        <section class="widget-gallery" aria-label="Completed widgets">
          ${cards}
        </section>
      </div>`;
  }

  function mainMenuReviewStatusFor(id, fallbackStatus) {
    const draftStatus = state.mainMenuReviewDraft[id];
    return MAIN_MENU_REVIEW_STATUSES[draftStatus] ? draftStatus : fallbackStatus;
  }

  function mainMenuReviewMeta(status) {
    return MAIN_MENU_REVIEW_STATUSES[status] || MAIN_MENU_REVIEW_STATUSES.review;
  }

  function renderReviewStatusBadge(status, label) {
    const meta = mainMenuReviewMeta(status);
    return `<span class="review-status-badge ${escapeText(meta.cardClass)}">${escapeText(label || meta.label)}</span>`;
  }

  function renderReviewStatusControls(id, label, currentStatus) {
    const actions = [
      { status: 'accepted', label: 'Accept' },
      { status: 'review', label: 'Needs Review' },
      { status: 'rejected', label: 'Reject' },
    ];

    return `
      <div class="review-status-controls" role="group" aria-label="Review status for ${escapeText(label)}">
        ${actions.map((action) => `
          <button
            type="button"
            class="${action.status === currentStatus ? 'is-active' : ''}"
            data-action="set-main-menu-review-status"
            data-review-id="${escapeText(id)}"
            data-review-status="${escapeText(action.status)}"
            aria-pressed="${action.status === currentStatus ? 'true' : 'false'}"
          >${escapeText(action.label)}</button>
        `).join('')}
      </div>`;
  }

  function renderApprovedReferenceCard(crop, bare = false) {
    const key = crop.key || crop.cropClass || '';
    const selection = mainMenuReferenceSelection(key);
    const frame = `<span class="portfolio-reference-frame" style="${escapeText(mainMenuReferencePreviewStyle(selection))}">
          <img src="${APPROVED_RENDER_SRC}" alt="" aria-hidden="true" draggable="false">
        </span>`;
    if (bare) return frame;
    return `
      <button
        class="portfolio-reference-picker"
        type="button"
        data-action="open-reference-crop-picker"
        data-crop-key="${escapeText(key)}"
        data-crop-title="${escapeText(crop.title || 'Approved Render Crop')}"
        aria-label="${escapeText(`Open full render crop picker for ${crop.title || 'approved render crop'}`)}"
      >
        ${frame}
      </button>`;
  }

  function renderReferenceCropEditor() {
    if (!state.mainMenuReferenceEditor) return '';
    const key = state.mainMenuReferenceEditor.key;
    const selection = normalizeMainMenuReferenceSelection(state.mainMenuReferenceEditor.selection)
      || mainMenuReferenceSelection(key);
    const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    return `
      <div class="reference-crop-modal" role="dialog" aria-modal="true" aria-label="Approved render crop picker">
        <div class="reference-crop-dialog">
          <header>
            <div>
              <strong>${escapeText(state.mainMenuReferenceEditor.title || 'Approved Render Crop')}</strong>
              <span>${escapeText(`${selection.x}, ${selection.y}, ${selection.w} x ${selection.h}`)}</span>
            </div>
            <button type="button" data-action="close-reference-crop-picker">Close</button>
          </header>
          <div class="reference-crop-stage" data-crop-key="${escapeText(key)}">
            <img src="${APPROVED_RENDER_SRC}" alt="Approved main menu render" draggable="false">
            <span class="reference-crop-selection" style="${escapeText(mainMenuReferenceSelectionStyle(selection))}">
              ${handles.map((handle) => `
                <span
                  class="reference-crop-handle reference-crop-handle-${escapeText(handle)}"
                  data-crop-handle="${escapeText(handle)}"
                  aria-hidden="true"
                ></span>
              `).join('')}
            </span>
          </div>
          <footer>
            <button type="button" data-action="reset-reference-crop-picker" data-crop-key="${escapeText(key)}">Reset</button>
            <button type="button" data-action="close-reference-crop-picker">Done</button>
          </footer>
        </div>
      </div>`;
  }

  function renderPortfolioAsset(asset, index) {
    const openAttr = index === 0 ? ' open' : '';
    const referenceCrops = asset.referenceCrops || [];
    return `
      <details class="portfolio-asset ${asset.statusClass || ''}" id="${escapeText(asset.id)}"${openAttr}>
        <summary>
          <span class="portfolio-asset-index">${escapeText(String(index + 1).padStart(2, '0'))}</span>
          <span class="portfolio-asset-title">${escapeText(asset.title)}</span>
          <span class="portfolio-asset-status">${escapeText(asset.status)}</span>
        </summary>
        <div class="portfolio-asset-body">
          <div class="portfolio-asset-copy">
            <p>${escapeText(asset.description)}</p>
            <dl>
              <div>
                <dt>Review target</dt>
                <dd>${escapeText(asset.target)}</dd>
              </div>
              <div>
                <dt>Live use</dt>
                <dd>${escapeText(asset.liveUse)}</dd>
              </div>
              <div>
                <dt>Decision</dt>
                <dd>${escapeText(asset.decision)}</dd>
              </div>
            </dl>
            <div class="portfolio-asset-links">
              <a href="/design/main-menu#${escapeText(asset.id)}">Section link</a>
              ${asset.file ? `<a href="${escapeText(asset.file)}" target="_blank" rel="noreferrer">Open image</a>` : ''}
              <a href="/main-menu">Live menu</a>
              <a href="/design/main-menu/render">Render reference</a>
            </div>
            <div class="portfolio-review-draft">
              <span>Saved draft</span>
              ${renderReviewStatusControls(asset.id, asset.title, asset.reviewStatus)}
            </div>
          </div>
          <figure class="portfolio-asset-figure">
            <div class="portfolio-comparison ${asset.specimen ? 'portfolio-comparison-live' : ''}">
              ${asset.specimen ? `
                <div class="portfolio-comparison-card">
                  <strong>Live Component</strong>
                  <div class="portfolio-specimen" inert>${asset.specimen}</div>
                </div>
              ` : ''}
              ${asset.file ? `
                <div class="portfolio-comparison-card">
                  <strong>Current Candidate</strong>
                  <div class="portfolio-asset-image-wrap ${asset.overlayLabel ? 'accepted-brand-preview' : ''} ${asset.cropClass ? escapeText(asset.cropClass) : ''}">
                    <img src="${escapeText(asset.file)}" alt="${escapeText(asset.alt)}" draggable="false">
                    ${asset.overlayLabel ? `<span>${escapeText(asset.overlayLabel)}</span>` : ''}
                  </div>
                </div>
              ` : ''}
              ${referenceCrops.map((crop) => `
                <div class="portfolio-comparison-card">
                  <strong>${escapeText(crop.title || 'Approved Render Crop')}</strong>
                  ${renderApprovedReferenceCard(crop)}
                </div>
              `).join('')}
            </div>
            <figcaption>${escapeText(asset.caption)}</figcaption>
          </figure>
        </div>
      </details>`;
  }

  const GLOSSARY = [
    { term: 'asset', tag: '', def: 'A reusable image plus contract the game operates on: it renders, state-switches, slots into, or swaps it.', src: 'Unity / Unreal' },
    { term: '9-slice', tag: 'asset', def: 'A texture that scales while its corners stay fixed and the middle stretches; the reusable, icon-less button or panel background.', src: 'Unity 9-slicing · Godot NinePatchRect' },
    { term: 'icon', tag: 'asset', def: 'A standalone image composited into a slot.', src: 'universal' },
    { term: 'sprite atlas', tag: 'asset', def: 'One image packing several unrelated sprites (our source sheets).', src: 'Unity Sprite Atlas' },
    { term: 'catalog', tag: '', def: 'The library of all assets, browsed sorted by type. It holds assets, not widgets.', src: 'project' },
    { term: 'type', tag: '', def: 'An inventory shelf: a kind of asset (9-slice, icon). The catalog tree top levels.', src: 'project' },
    { term: 'state', tag: '', def: 'A named visual variant: normal, pressed (later highlighted, selected, disabled).', src: 'Unity UI transitions' },
    { term: 'slot', tag: '', def: 'A labelled region of a 9-slice filled at runtime by an asset (icon) or live text: iconSlot, textInset, arrowSlot.', src: 'Unreal UMG' },
    { term: 'rect', tag: '', def: 'A pixel rectangle {x, y, w, h}; the bounds of a state or slot.', src: 'Unity Rect · Godot region_rect' },
    { term: 'patch margins', tag: '', def: 'The fixed border thicknesses of a 9-slice: the parts that do not stretch.', src: 'Unity / Godot' },
    { term: 'widget', tag: 'not an asset', def: 'The general term for an interactive element the player manipulates; assembled at runtime from assets, not a stored asset. Also called a control.', src: 'Unreal UMG · Wikipedia' },
    { term: 'button', tag: 'not an asset', def: 'A kind of widget: a clickable control. Widget is the general term; button is the specific kind. The Main Menu Button is the button this catalog builds from its 9-slice and icons.', src: 'Unity / Unreal / Godot Button' },
    { term: 'template', tag: 'not an asset', def: 'The reusable definition a widget instance is built from.', src: 'Unreal UI Template · Unity Prefab' },
    { term: 'instance', tag: 'not an asset', def: 'A specific live widget produced from a template.', src: 'all engines' },
  ];

  function renderGlossaryTag(tag) {
    if (!tag) return '';
    const cls = tag === 'asset' ? 'is-asset' : 'is-not-asset';
    return `<span class="glossary-tag ${cls}">${escapeText(tag)}</span>`;
  }

  function renderGlossary() {
    return `
      <div class="main-assets-screen glossary-screen" data-live-screen="glossary">
        <header class="main-assets-header">
          <a class="design-back" href="/design">&larr; Design</a>
          <p class="eyebrow">Design system</p>
          <h2>Glossary</h2>
          <p class="main-assets-intro">The shared vocabulary for the asset catalog. Every term is attested by engine documentation (Unity, Unreal, Godot).</p>
        </header>

        <section class="glossary-callout" aria-label="Core distinction">
          <p><strong>Two structures, kept separate.</strong> The <b>catalog</b> is an inventory of assets sorted by type (Buttons, Icons, Board, Pieces). A <b>button</b> is a <b>widget</b> &mdash; a composition of assets assembled at runtime &mdash; not an inventory item.</p>
        </section>

        <dl class="glossary-list">
          ${GLOSSARY.map((g) => `
            <div class="glossary-row">
              <dt>
                <span class="glossary-term">${escapeText(g.term)}</span>
                ${renderGlossaryTag(g.tag)}
              </dt>
              <dd>
                <p>${escapeText(g.def)}</p>
                <span class="glossary-src">${escapeText(g.src)}</span>
              </dd>
            </div>
          `).join('')}
        </dl>

        <section class="glossary-example" aria-label="Worked example">
          <h3>Worked example</h3>
          <p>The on-screen <b>Solo Skirmish</b> button is a <b>widget</b>: the <code>button-9slice.main-menu</code> 9-slice (in its <code>pressed</code> state) + the <code>button-icon.main-menu.sword</code> icon (in the <code>iconSlot</code>) + the live label &ldquo;Solo Skirmish&rdquo; (in the <code>textInset</code>) + the <code>party</code> action. The 9-slice and icon are assets in the catalog; the button itself is not.</p>
        </section>
      </div>`;
  }

  function renderDesignIndex() {
    const areas = [
      {
        href: '/design/assets',
        kicker: 'Design system',
        title: 'Catalog',
        copy: 'Classified catalog of the game’s buildable entities — assets (9-slice, icon) and widgets (button) — with contracts, states, slot rules, source art, and previews.',
        go: 'Open catalog',
      },
      {
        href: '/design/glossary',
        kicker: 'Design system',
        title: 'Glossary',
        copy: 'The shared vocabulary — asset, 9-slice, icon, slot, state, widget, template — each attested by engine docs.',
        go: 'Open glossary',
      },
      {
        href: '/design/widgets',
        kicker: 'Components',
        title: 'Widgets',
        copy: 'Completed, assembled widgets — the main-menu button family, built from catalog assets plus live labels and actions.',
        go: 'Open widgets',
      },
      {
        href: '/design/main-menu',
        kicker: 'Artwork review',
        title: 'Main Menu',
        copy: 'Six chrome regions checked against the approved render — accept, flag, or reject each as the live build converges.',
        go: 'Open review',
      },
      {
        href: '/design/main-menu/assets',
        kicker: 'Asset lab',
        title: 'Main Menu — Assets',
        copy: 'A sibling page for decomposing accepted render crops into reusable button, icon, frame, and state assets.',
        go: 'Open lab',
      },
      {
        href: '/design/main-menu/render',
        kicker: 'Concept render',
        title: 'Main Menu — Render',
        copy: 'The aspirational painted main-menu render, with the clickable hotspot map.',
        go: 'View render',
      },
      {
        href: '/design/campaigns/render',
        kicker: 'Concept render',
        title: 'Campaign Editor',
        copy: 'Concept render for the campaign editor surface and its tools.',
        go: 'View render',
      },
      {
        href: '/design/level-editor/render',
        kicker: 'Concept render',
        title: 'Level Editor',
        copy: 'Concept render for the level editor — tile palette, brush controls, board frame.',
        go: 'View render',
      },
      {
        href: '/design/skirmish/render',
        kicker: 'Concept render',
        title: 'Skirmish',
        copy: 'Concept render for the in-match skirmish HUD, roster, and board.',
        go: 'View render',
      },
    ];
    return `
      <div class="main-assets-screen design-hub-screen" data-live-screen="design-index">
        <header class="main-assets-header">
          <p class="eyebrow">Design portfolio</p>
          <h2>Design</h2>
          <p class="main-assets-intro">Artwork references and reusable asset contracts live side by side. Art shows the target; the asset catalog defines what the game can operate on.</p>
        </header>

        <section class="design-hub-grid" aria-label="Design areas">
          ${areas.map((area) => `
            <a class="design-hub-card" href="${escapeText(area.href)}">
              <span class="design-hub-kicker">${escapeText(area.kicker)}</span>
              <h3>${escapeText(area.title)}</h3>
              <p>${escapeText(area.copy)}</p>
              <span class="design-hub-go">${escapeText(area.go)} &rarr;</span>
            </a>
          `).join('')}
        </section>
      </div>`;
  }

  function mainMenuPortfolioAssets() {
    return [
      {
        id: 'mode-buttons',
        title: 'Mode Button Family',
        baseStatus: 'review',
        file: '/assets/ui/main-menu/contact-sheet.png',
        alt: 'Contact sheet of the icon-less 9-slice (normal + pressed) and the five icon badges on a transparency checkerboard',
        caption: 'Phase-1 asset family, aligned to the asset catalog: generated art normalized into an icon-less 9-slice (2 states) plus 5 standalone icon badges. Replace any PNG in place to upgrade the art with no code change.',
        description: 'The live button stack is assembled per the asset catalog (button-9slice.main-menu + button-icon.main-menu.*): an icon-less 9-slice state, a composited icon badge in the icon slot, and a live DOM label in the text slot — not a single painted crop. See the full breakdown in the Asset Catalog.',
        target: 'Accept the catalog-aligned family (correct decomposition, bridge-grade art) as the live mode stack, or flag art-quality items for the next art pass.',
        liveUse: 'Drives the live main menu mode stack at / and /main-menu — each button = 9-slice state + composited icon + live label + action.',
        decision: 'New this pass — supersedes the painted-crop bridge. Pending your accept/reject.',
        specimen: renderModeButtonStack({ activeAction: 'party' }),
        referenceCrops: [
          {
            title: 'Approved Render Crop',
            key: 'mode-buttons',
            alt: 'Approved render crop of the left-side main menu mode button stack',
          },
        ],
      },
      {
        id: 'brand-chrome',
        title: 'Title / Brand Plate',
        baseStatus: 'accepted',
        file: '/assets/ui/main-menu-brand-title-only-v1.png',
        alt: 'Accepted main menu title plate crop with crest, Chess Tactics title, and divider',
        caption: 'Title-only crop. The console label and subtitle have been removed so the lockup is just the game title.',
        description: 'The title plate is now reduced to the actual game brand: crest, Chess Tactics, and the lower divider from the accepted render.',
        target: 'Keep this as the locked upper-left brand/title plate unless a later layout change exposes a fit issue.',
        liveUse: 'Used as the visible live brand plate in the upper-left main menu column.',
        decision: 'Accepted as the main title lockup.',
        referenceCrops: [
          {
            title: 'Approved Render Crop',
            key: 'brand-chrome',
            alt: 'Approved render crop of the upper-left main menu brand and title area',
          },
        ],
      },
      {
        id: 'profile-chrome',
        title: 'Profile / Status Panel',
        baseStatus: 'review',
        specimen: renderProfileStatus(),
        alt: 'Generated pixel art profile and status chrome for the main menu',
        caption: 'Right-rail profile source for player identity, force counters, and the sign-in/account action slot.',
        description: 'This panel is still under review: player identity, guest/sign-in/account affordance, allies/threat counters, and the surrounding chrome are not settled.',
        target: 'Decide whether this profile/status treatment should be accepted, revised, rebuilt from a new crop, or split into smaller assets.',
        liveUse: 'Used behind the Guest/profile block, allies/threat counters, and sign-in/account hotspot on the live menu.',
        decision: 'Needs review. Do not treat the current overlay or generated chrome as accepted.',
        referenceCrops: [
          {
            title: 'Approved Render Crop',
            key: 'profile-chrome',
            alt: 'Approved render crop of the upper-right profile and force status panels',
          },
        ],
      },
      {
        id: 'news-chrome',
        title: 'Daily / News Panel',
        baseStatus: 'review',
        specimen: renderDailyPanel() + renderNewsPanel(),
        alt: 'Generated pixel art daily and news panel chrome for the main menu',
        caption: 'Reusable panel source for the daily line and right-side campaign/news notes.',
        description: 'A smaller command-panel treatment for rotating copy, daily challenge text, or future campaign updates.',
        target: 'Decide whether this panel should be calmer, more military, more chesslike, or stay as-is.',
        liveUse: 'Used twice on the live menu: the left daily preview and the right campaign-tools/news block.',
        decision: 'Approve the reusable panel, or request separate art for daily and news states.',
        referenceCrops: [
          {
            title: 'Daily Render Crop',
            key: 'daily-panel',
            alt: 'Approved render crop of the bottom-left daily challenge panel',
          },
          {
            title: 'News Render Crop',
            key: 'news-panel',
            alt: 'Approved render crop of the bottom-right news panel',
          },
        ],
      },
      {
        id: 'dock-chrome',
        title: 'Bottom Dock',
        baseStatus: 'review',
        specimen: renderDock(),
        alt: 'Generated pixel art bottom dock chrome for the main menu',
        caption: 'Bottom quick-link dock source for secondary navigation buttons.',
        description: 'A lower-priority navigation strip for achievements, campaigns, lobbies, collection, and future utility links.',
        target: 'Check if the dock belongs on the first pass, and whether its ornament level competes with the main buttons.',
        liveUse: 'Used behind four live quick-link hotspots near the bottom-center of the main menu.',
        decision: 'Approve, reduce visual weight, or defer until the main menu needs those secondary features.',
        referenceCrops: [
          {
            title: 'Approved Render Crop',
            key: 'dock-chrome',
            alt: 'Approved render crop of the bottom-center icon dock',
          },
        ],
      },
      {
        id: 'battlefield-plate',
        title: 'Battlefield Plate',
        baseStatus: 'review',
        file: '',
        alt: '',
        caption: 'Approved render crop for the central board plate. Compare this against the live menu battlefield before accepting the frame, depth, and label treatment.',
        description: 'The current live menu uses the canvas battlefield inside CSS chrome. The central board plate details, label treatment, depth, and responsive fit still need review.',
        target: 'Decide whether the live battlefield plate is close enough to the approved render framing, or needs another pass before it is locked.',
        liveUse: 'Used as the central main-menu battlefield preview behind the live moonlit board.',
        decision: 'Needs review. The board itself is live, but the surrounding plate treatment is not accepted yet.',
        referenceCrops: [
          {
            title: 'Approved Render Crop',
            key: 'battlefield-plate',
            alt: 'Approved render crop of the central main menu battlefield plate',
          },
        ],
      },
    ];
  }

  function renderSpecimenCapture() {
    const params = new URLSearchParams(window.location.search || '');
    const id = params.get('id') || '';
    const only = params.get('only') || 'both';
    const asset = mainMenuPortfolioAssets().find((entry) => entry.id === id);
    if (!asset) {
      return `<div class="specimen-capture" data-live-screen="specimen-missing"><div class="portfolio-specimen">Unknown specimen id: ${escapeText(id)}</div></div>`;
    }
    const proposedInner = asset.specimen
      || (asset.file ? `<img src="${escapeText(asset.file)}" alt="${escapeText(asset.alt || '')}" draggable="false" style="display:block;width:100%">` : '<span>No standalone component for this slot.</span>');
    const proposed = `<div class="portfolio-specimen" data-specimen="proposed">${proposedInner}</div>`;
    const compare = (asset.referenceCrops || [])
      .map((crop) => `<div class="portfolio-specimen" data-specimen="compare">${renderApprovedReferenceCard(crop, true)}</div>`)
      .join('');
    return `
      <div class="specimen-capture" data-live-screen="specimen-${escapeText(id)}-${escapeText(only)}">
        ${only !== 'compare' ? proposed : ''}
        ${only !== 'proposed' ? compare : ''}
      </div>`;
  }

  function renderMainAssetReview() {
    const portfolioAssets = mainMenuPortfolioAssets().map((asset) => {
      const reviewStatus = mainMenuReviewStatusFor(asset.id, asset.baseStatus);
      const reviewMeta = mainMenuReviewMeta(reviewStatus);
      return {
        ...asset,
        reviewStatus,
        status: reviewMeta.label,
        statusClass: reviewMeta.cardClass,
      };
    });

    const accepted = portfolioAssets.filter((a) => a.reviewStatus === 'accepted').length;
    const inReview = portfolioAssets.filter((a) => a.reviewStatus === 'review').length;
    const rejected = portfolioAssets.filter((a) => a.reviewStatus === 'rejected').length;

    return `
      <div class="main-assets-screen" data-live-screen="main-assets">
        <header class="main-assets-header">
          <a class="design-back" href="/design">&larr; Design</a>
          <p class="eyebrow">Main menu · design portfolio</p>
          <h2>Chrome Asset Review</h2>
          <p class="main-assets-intro">Each main-menu region is checked against the approved render crop before it replaces a skeleton slot. Accept it, flag it for review, or send it back — per row.</p>
          <div class="main-assets-summary">
            <span class="count-accepted"><b>${accepted}</b> accepted</span>
            <span class="count-review"><b>${inReview}</b> in review</span>
            ${rejected ? `<span class="count-rejected"><b>${rejected}</b> rejected</span>` : ''}
            <span><b>${portfolioAssets.length}</b> total</span>
          </div>
        </header>

        <section class="portfolio-asset-list" aria-label="Main menu chrome portfolio">
          ${portfolioAssets.map(renderPortfolioAsset).join('')}
        </section>

        ${renderReferenceCropEditor()}
      </div>`;
  }

  function frameStyleForAsset(asset, frame) {
    const sheet = asset.sheet || {};
    const sheetWidth = Number(sheet.width) || frame.w || 1;
    const sheetHeight = Number(sheet.height) || frame.h || 1;
    const scaleX = (sheetWidth / frame.w) * 100;
    const scaleY = (sheetHeight / frame.h) * 100;
    const maxX = Math.max(1, sheetWidth - frame.w);
    const maxY = Math.max(1, sheetHeight - frame.h);
    const posX = maxX === 1 ? 0 : (frame.x / maxX) * 100;
    const posY = maxY === 1 ? 0 : (frame.y / maxY) * 100;
    const imageUrl = String(sheet.image || '').replace(/["'\\\n\r]/g, '');
    return [
      `--asset-image: url(${imageUrl})`,
      `--asset-bg-x: ${posX.toFixed(4)}%`,
      `--asset-bg-y: ${posY.toFixed(4)}%`,
      `--asset-bg-w: ${scaleX.toFixed(4)}%`,
      `--asset-bg-h: ${scaleY.toFixed(4)}%`,
      `--asset-aspect: ${frame.w} / ${frame.h}`,
    ].join('; ');
  }

  function insetStyle(inset, frame) {
    if (!inset) return '';
    const frameWidth = Number(frame && frame.w) || 1;
    const frameHeight = Number(frame && frame.h) || 1;
    return [
      `left:${(inset.x / frameWidth * 100).toFixed(3)}%`,
      `top:${(inset.y / frameHeight * 100).toFixed(3)}%`,
      `width:${(inset.w / frameWidth * 100).toFixed(3)}%`,
      `height:${(inset.h / frameHeight * 100).toFixed(3)}%`,
    ].join(';');
  }

  function assetById(id) {
    return (assetCatalog.assets || []).find((asset) => asset.id === id);
  }

  function renderCatalogFrame(asset, frame, content = '') {
    return `
      <div class="catalog-frame" style="${frameStyleForAsset(asset, frame)}">
        ${content}
      </div>`;
  }

  function renderAssetFrame(asset, stateKey, sampleLabel = '') {
    const state = asset.states[stateKey];
    const textInset = asset.rules && asset.rules.textInset;
    const label = sampleLabel ? `<span class="catalog-frame-label" style="${insetStyle(textInset, state.rect)}">${escapeText(sampleLabel)}</span>` : '';
    return renderCatalogFrame(asset, state.rect, label);
  }

  function renderButtonAssetCard(asset) {
    const stateEntries = Object.entries(asset.states || {});
    const rules = asset.rules || {};
    return `
      <article class="catalog-asset-card" id="${escapeText(asset.id)}">
        <header class="catalog-asset-head">
          <span class="design-hub-kicker">${escapeText(asset.type)} · ${escapeText(asset.status || 'draft')}</span>
          <h3>${escapeText(asset.title || asset.id)}</h3>
          <p>${escapeText(asset.summary || '')}</p>
        </header>

        <section class="catalog-asset-meta" aria-label="Asset metadata">
          <div><dt>ID</dt><dd>${escapeText(asset.id)}</dd></div>
          <div><dt>Source</dt><dd>${escapeText(asset.source?.kind || 'unknown')}</dd></div>
          <div><dt>Text</dt><dd>${escapeText(rules.text || 'unknown')}</dd></div>
          <div><dt>Sizing</dt><dd>${escapeText(rules.sizing || 'unknown')}</dd></div>
        </section>

        <section class="catalog-state-grid" aria-label="Button states">
          ${stateEntries.map(([stateKey, state]) => `
            <div class="catalog-state-card">
              <strong>${escapeText(state.label || stateKey)}</strong>
              ${renderAssetFrame(asset, stateKey)}
              <code>x:${state.rect.x} y:${state.rect.y} w:${state.rect.w} h:${state.rect.h}</code>
            </div>
          `).join('')}
        </section>

        <section class="catalog-slot-grid" aria-label="Button slots">
          <div><h4>Icon Slot</h4><code>${escapeText(JSON.stringify(rules.iconSlot || {}))}</code></div>
          <div><h4>Text Slot</h4><code>${escapeText(JSON.stringify(rules.textInset || {}))}</code></div>
          <div><h4>Arrow Slot</h4><code>${escapeText(JSON.stringify(rules.arrowSlot || {}))}</code></div>
          <div><h4>Hitbox</h4><code>${escapeText(JSON.stringify(rules.hitbox || {}))}</code></div>
        </section>

        <section class="catalog-rule-grid" aria-label="Asset rules">
          <div>
            <h4>Text Inset</h4>
            <code>${escapeText(JSON.stringify(rules.textInset || {}))}</code>
          </div>
          <div>
            <h4>Hitbox</h4>
            <code>${escapeText(JSON.stringify(rules.hitbox || {}))}</code>
          </div>
          <div>
            <h4>States</h4>
            <code>${escapeText((rules.states || []).join(', '))}</code>
          </div>
          <div>
            <h4>Notes</h4>
            <ul>${(rules.notes || []).map((note) => `<li>${escapeText(note)}</li>`).join('')}</ul>
          </div>
        </section>
      </article>`;
  }

  function renderIconAssetCard(asset) {
    const rules = asset.rules || {};
    return `
      <article class="catalog-asset-card" id="${escapeText(asset.id)}">
        <header class="catalog-asset-head">
          <span class="design-hub-kicker">${escapeText(asset.type)} · ${escapeText(asset.status || 'draft')}</span>
          <h3>${escapeText(asset.title || asset.id)}</h3>
          <p>${escapeText(asset.summary || '')}</p>
        </header>

        <section class="catalog-asset-meta" aria-label="Asset metadata">
          <div><dt>ID</dt><dd>${escapeText(asset.id)}</dd></div>
          <div><dt>Source</dt><dd>${escapeText(asset.source?.kind || 'unknown')}</dd></div>
          <div><dt>Fits Slot</dt><dd>${escapeText(rules.fitsSlot || 'unknown')}</dd></div>
          <div><dt>Background</dt><dd>${escapeText(rules.background || 'unknown')}</dd></div>
        </section>

        <section class="catalog-icon-preview" aria-label="Icon preview">
          <div class="catalog-state-card">
            <strong>Icon Crop</strong>
            ${renderCatalogFrame(asset, asset.rect)}
            <code>x:${asset.rect.x} y:${asset.rect.y} w:${asset.rect.w} h:${asset.rect.h}</code>
          </div>
        </section>

        <section class="catalog-rule-grid" aria-label="Asset rules">
          <div>
            <h4>Notes</h4>
            <ul>${(rules.notes || []).map((note) => `<li>${escapeText(note)}</li>`).join('')}</ul>
          </div>
        </section>
      </article>`;
  }

  function assetTypeLabel(type) {
    if (type === 'button-9slice.main-menu') return 'Main Menu Button 9-Slice';
    if (type === 'button-icon.main-menu') return 'Main Menu Button Icon';
    return `${type[0].toUpperCase()}${type.slice(1)}`;
  }

  function assetTypePath(type) {
    if (type === 'button-9slice.main-menu') return '/design/assets/main-menu-buttons';
    if (type === 'button-icon.main-menu') return '/design/assets/main-menu-button-icons';
    return `/design/assets/${type}s`;
  }

  function assetPath(asset) {
    return `${assetTypePath(asset.type)}/${encodeURIComponent(asset.id)}`;
  }

  function renderCatalogAssetCard(asset) {
    if (asset.type === 'button-9slice.main-menu') return renderButtonAssetCard(asset);
    if (asset.type === 'button-icon.main-menu') return renderIconAssetCard(asset);
    return '';
  }

  function buttonFamilySummaries() {
    const countsByType = (assetCatalog.assets || []).reduce((acc, asset) => {
      acc[asset.type] = (acc[asset.type] || 0) + 1;
      return acc;
    }, {});
    return [
      {
        href: '/design/assets/main-menu-buttons',
        title: 'Main Menu Buttons',
        summary: 'Menu-row button frames with live labels, an icon slot, arrow affordance, binary states, and hitbox rules.',
        count: countsByType['button-9slice.main-menu'] || 0,
        status: 'draft',
      },
      {
        href: '#',
        title: 'Plain Buttons',
        summary: 'Future bucket for buttons without menu icon slots, such as dialog actions, small controls, or art-only buttons.',
        count: 0,
        status: 'planned',
      },
    ];
  }

  function renderButtonTypeCatalog() {
    const families = buttonFamilySummaries();
    return `
      <section class="catalog-family-grid" aria-label="Button types">
        ${families.map((family) => `
          <a class="catalog-family-card ${family.href === '#' ? 'disabled' : ''}" href="${escapeText(family.href)}" ${family.href === '#' ? 'aria-disabled="true"' : ''}>
            <span class="design-hub-kicker">${escapeText(family.status)} · ${family.count} asset${family.count === 1 ? '' : 's'}</span>
            <h3>${escapeText(family.title)}</h3>
            <p>${escapeText(family.summary)}</p>
          </a>
        `).join('')}
      </section>`;
  }

  function renderAssetCatalogHome(countsByType) {
    const classes = [
      {
        label: 'asset',
        kinds: [
          { title: '9-slice', href: '/design/assets/main-menu-buttons', count: countsByType['button-9slice.main-menu'] || 0, summary: 'Scalable, icon-less frames whose corners stay fixed while the middle stretches.' },
          { title: 'icon', href: '/design/assets/main-menu-button-icons', count: countsByType['button-icon.main-menu'] || 0, summary: 'Standalone images composited into a slot.' },
          { title: 'sprite atlas', href: '#', count: 0, planned: true, summary: 'One image packing several unrelated sprites.' },
        ],
      },
      {
        label: 'widget',
        kinds: [
          { title: 'button', href: '#', count: 0, planned: true, summary: 'Interactive element assembled from a 9-slice + icon + live label.' },
        ],
      },
    ];
    return `
      <div class="catalog-home">
        ${classes.map((cls) => `
          <section class="catalog-home-class" aria-label="${escapeText(cls.label)}">
            <h3 class="catalog-home-class-label">${escapeText(cls.label)}</h3>
            <div class="catalog-family-grid">
              ${cls.kinds.map((k) => `
                <a class="catalog-family-card ${k.planned ? 'disabled' : ''}" href="${escapeText(k.href)}"${k.planned ? ' aria-disabled="true"' : ''}>
                  <span class="design-hub-kicker">${k.planned ? 'planned' : `${k.count} entit${k.count === 1 ? 'y' : 'ies'}`}</span>
                  <h4>${escapeText(k.title)}</h4>
                  <p>${escapeText(k.summary)}</p>
                </a>
              `).join('')}
            </div>
          </section>
        `).join('')}
      </div>`;
  }

  function renderAssetTypePicker(assets, selectedAsset) {
    if (!assets.length) return '';
    const selectedId = selectedAsset && selectedAsset.id;
    const typeLabel = assetTypeLabel(assets[0].type);
    return `
      <aside class="catalog-picker" aria-label="${escapeText(typeLabel)} assets">
        <div class="catalog-picker-head">
          <h3>${escapeText(typeLabel)} Assets</h3>
          <span>${assets.length}</span>
        </div>
        <label class="catalog-picker-control">
          <span>Selected ${escapeText(typeLabel.toLowerCase())}</span>
          <select data-catalog-asset-select>
            ${assets.map((asset) => `
              <option value="${assetPath(asset)}" data-catalog-search="${escapeText(`${asset.title || ''} ${asset.id}`.toLowerCase())}" ${asset.id === selectedId ? 'selected' : ''}>${escapeText(asset.title || asset.id)}</option>
            `).join('')}
          </select>
        </label>
        <label class="catalog-picker-control">
          <span>Search ${escapeText(typeLabel.toLowerCase())} assets</span>
          <input type="search" data-catalog-asset-search placeholder="Filter by name or id" autocomplete="off">
        </label>
        <p class="catalog-picker-count" data-catalog-match-count>${assets.length} matches</p>
      </aside>`;
  }

  function renderCatalogModeToggle(active) {
    const tabs = [['catalog', 'Catalog', '/design/assets'], ['glossary', 'Glossary', '/design/assets/glossary']];
    // The active tab is inert (you are already in that view); only the inactive
    // tab is a link, so clicking the current mode never reloads you to its root.
    return `<nav class="catalog-mode-toggle" aria-label="Catalog view mode">
      ${tabs.map(([key, label, href]) => (active === key
        ? `<span class="active" aria-current="page">${escapeText(label)}</span>`
        : `<a href="${escapeText(href)}">${escapeText(label)}</a>`)).join('')}
    </nav>`;
  }

  // Glossary mode reuses the classification tree but drops the specific-entity
  // leaves, leaving only the glossary-term nodes; each links to its definition.
  function pruneTreeToTerms(nodes) {
    return nodes
      .filter((node) => GLOSSARY.some((g) => g.term === node.label))
      .map((node) => {
        const kids = node.children ? pruneTreeToTerms(node.children) : [];
        const out = { label: node.label, href: `/design/assets/glossary/${encodeURIComponent(node.label)}` };
        if (kids.length) out.children = kids;
        return out;
      });
  }

  function renderGlossaryEntry(term) {
    const g = GLOSSARY.find((e) => e.term === term);
    if (!g) return '<p class="catalog-empty">Pick a term from the tree to read its definition.</p>';
    return `
      <article class="glossary-entry">
        <header>
          <h3>${escapeText(g.term)}</h3>
          ${renderGlossaryTag(g.tag)}
        </header>
        <p class="glossary-entry-def">${escapeText(g.def)}</p>
        <p class="glossary-entry-src">${escapeText(g.src)}</p>
        <p class="glossary-entry-more"><a href="/design/glossary">Full glossary &rarr;</a></p>
      </article>`;
  }

  function renderAssetCatalog() {
    const route = currentRoute();
    const activeHref = currentPath();
    if (route.catalogMode === 'glossary') {
      const term = route.glossaryTerm || 'asset';
      const termHref = `/design/assets/glossary/${encodeURIComponent(term)}`;
      return `
        <div class="main-assets-screen asset-catalog-screen" data-live-screen="asset-catalog">
          <header class="main-assets-header">
            <a class="design-back" href="/design">&larr; Design</a>
            <p class="eyebrow">Design system</p>
            <h2>Glossary</h2>
            <p class="main-assets-intro">The same classification, read as a glossary: pick a type to see what it means. The full vocabulary lives in the <a href="/design/glossary">Glossary</a>.</p>
            ${renderCatalogModeToggle('glossary')}
          </header>

          <section class="prototype-tree-layout asset-catalog-tree-layout" aria-label="Glossary explorer">
            ${renderPrototypeTreePanel(termHref, pruneTreeToTerms(ASSET_TREE_PROTOTYPE), { flat: true })}
            <div class="prototype-tree-content">
              ${renderGlossaryEntry(term)}
            </div>
          </section>
        </div>`;
    }
    if (route.catalogMode === 'widgets') {
      const modes = route.widgetSlug
        ? MENU_MODES.filter((mode) => mode.slug === route.widgetSlug)
        : MENU_MODES;
      const single = Boolean(route.widgetSlug) && modes.length === 1;
      const title = single ? modes[0].label : 'Main Menu Buttons';
      const intro = single
        ? 'A completed widget, shown live on the catalog page — assembled from a catalog 9-slice (in a state) + an icon + a live label + an action.'
        : 'The completed Main Menu button widgets, shown live on the catalog page. Each is assembled from a catalog 9-slice (in a state) + an icon + a live label + an action.';
      const cards = modes.length
        ? `<section class="widget-gallery" aria-label="Widgets">${modes.map(renderWidgetCard).join('')}</section>`
        : '<p class="catalog-empty">No widgets in this family yet.</p>';
      return `
        <div class="main-assets-screen asset-catalog-screen" data-live-screen="asset-catalog">
          <header class="main-assets-header">
            <a class="design-back" href="/design">&larr; Design</a>
            <p class="eyebrow">Design system</p>
            <h2>${escapeText(title)}</h2>
            <p class="main-assets-intro">${escapeText(intro)}</p>
            ${renderCatalogModeToggle('catalog')}
          </header>

          <section class="prototype-tree-layout asset-catalog-tree-layout" aria-label="Asset catalog explorer">
            ${renderPrototypeTreePanel(activeHref)}
            <div class="prototype-tree-content">
              ${cards}
            </div>
          </section>
        </div>`;
    }
    const selectedType = route.assetType || '';
    const selectedGroup = route.assetGroup || '';
    const assets = (assetCatalog.assets || []).filter((asset) => !selectedType || asset.type === selectedType);
    const selectedAsset = assets.find((asset) => asset.id === route.assetId) || assets[0];
    const countsByType = (assetCatalog.assets || []).reduce((acc, asset) => {
      acc[asset.type] = (acc[asset.type] || 0) + 1;
      return acc;
    }, {});
    const content = selectedGroup === 'buttons'
      ? renderButtonTypeCatalog()
      : selectedType
        ? `<section class="catalog-browser" aria-label="Catalog asset browser">
            ${renderAssetTypePicker(assets, selectedAsset)}
            <div class="catalog-selected-asset">
              ${selectedAsset ? renderCatalogAssetCard(selectedAsset) : '<p class="catalog-empty">No assets in this section yet.</p>'}
            </div>
          </section>`
        : renderAssetCatalogHome(countsByType);
    return `
      <div class="main-assets-screen asset-catalog-screen" data-live-screen="asset-catalog">
        <header class="main-assets-header">
          <a class="design-back" href="/design">&larr; Design</a>
          <p class="eyebrow">Design system</p>
          <h2>${selectedGroup === 'buttons' ? 'Button Types' : selectedType ? `${assetTypeLabel(selectedType)} Assets` : 'Catalog'}</h2>
          <p class="main-assets-intro">Every reusable runtime asset should eventually appear here with its states, frame bounds, rules, source art, and sample previews before it is wired into the game.</p>
          ${renderCatalogModeToggle('catalog')}
        </header>

        <section class="prototype-tree-layout asset-catalog-tree-layout" aria-label="Asset catalog explorer">
          ${renderPrototypeTreePanel(activeHref)}
          <div class="prototype-tree-content">
            ${content}
          </div>
        </section>
      </div>`;
  }

  // The catalog is a classification of our entities by object type (is-a),
  // vague class at top -> specific entity at the leaf. The classes/terms are the
  // glossary's object types; the leaves are the specific entities you find/build.
  // (Anatomy terms like state/slot/rect are the per-entity "made-of" view, not
  // here; usage terms like template/instance/catalog/type are not entities.)
  const ASSET_TREE_PROTOTYPE = [
    {
      label: 'asset',
      href: '/design/assets',
      children: [
        {
          label: '9-slice',
          href: '/design/assets/main-menu-buttons',
          children: [
            { label: 'Main Menu', href: '/design/assets/main-menu-buttons/button-9slice.main-menu' },
          ],
        },
        {
          label: 'icon',
          href: '/design/assets/main-menu-button-icons',
          children: [
            { label: 'Sword', href: '/design/assets/main-menu-button-icons/button-icon.main-menu.sword' },
            { label: 'Crown', href: '/design/assets/main-menu-button-icons/button-icon.main-menu.crown' },
            { label: 'Scroll', href: '/design/assets/main-menu-button-icons/button-icon.main-menu.scroll' },
            { label: 'Players', href: '/design/assets/main-menu-button-icons/button-icon.main-menu.people' },
            { label: 'Gear', href: '/design/assets/main-menu-button-icons/button-icon.main-menu.gear' },
          ],
        },
        { label: 'sprite atlas', href: '#', planned: true },
      ],
    },
    {
      label: 'widget',
      href: '/design/assets/widgets/main-menu',
      children: [
        {
          label: 'button',
          href: '/design/assets/widgets/main-menu',
          children: [
            {
              label: 'Main Menu',
              href: '/design/assets/widgets/main-menu',
              children: [
                { label: 'Solo Skirmish', href: '/design/assets/widgets/main-menu/solo-skirmish' },
                { label: 'Campaign Editor', href: '/design/assets/widgets/main-menu/campaign-editor' },
                { label: 'Level Editor', href: '/design/assets/widgets/main-menu/level-editor' },
                { label: 'Lobbies', href: '/design/assets/widgets/main-menu/lobbies' },
                { label: 'Settings', href: '/design/assets/widgets/main-menu/settings' },
              ],
            },
          ],
        },
      ],
    },
  ];

  function prototypeLinks(active) {
    const links = [
      ['drilldown', 'Page Drilldown', '/design/assets/navigation-drilldown'],
      ['tree', 'Tree Sidebar', '/design/assets/navigation-tree'],
      ['hybrid', 'Hybrid', '/design/assets/navigation-hybrid'],
    ];
    return `<nav class="prototype-switcher" aria-label="Asset navigation prototypes">
      ${links.map(([key, label, href]) => `<a class="${active === key ? 'active' : ''}" href="${href}">${label}</a>`).join('')}
    </nav>`;
  }

  function renderTreeList(nodes, activeHref = '', depth = 0, opts = {}) {
    return `
      <ul class="prototype-tree-list depth-${depth}">
        ${nodes.map((node) => {
          const active = activeHref === node.href ? 'active' : '';
          // Glossary (flat) mode: every node -- parents included -- is a link to
          // its entry, with children always shown beneath. No expand/collapse.
          if (node.children && opts.flat) {
            return `
              <li>
                <a class="prototype-tree-term ${active} ${node.planned ? 'planned' : ''}" href="${escapeText(node.href)}">
                  <span>${escapeText(node.label)}</span>
                  ${node.planned ? '<em>planned</em>' : ''}
                </a>
                ${renderTreeList(node.children, activeHref, depth + 1, opts)}
              </li>`;
          }
          if (node.children) {
            return `
              <li>
                <details class="prototype-tree-branch ${active}" open>
                  <summary>
                    <span>${escapeText(node.label)}</span>
                    ${node.planned ? '<em>planned</em>' : ''}
                    <a class="prototype-tree-launch" href="${escapeText(node.href)}" data-tree-launch aria-label="Open ${escapeText(node.label)}">↗</a>
                  </summary>
                  ${renderTreeList(node.children, activeHref, depth + 1, opts)}
                </details>
              </li>`;
          }
          return `
            <li>
              <a class="${active} ${node.planned ? 'planned' : ''}" href="${escapeText(node.href)}">
                <span>${escapeText(node.label)}</span>
                ${node.planned ? '<em>planned</em>' : ''}
              </a>
            </li>`;
        }).join('')}
      </ul>`;
  }

  function renderPrototypeTreePanel(activeHref, nodes = ASSET_TREE_PROTOTYPE, opts = {}) {
    return `
      <aside class="prototype-tree-panel">
        ${opts.flat ? '' : `<div class="prototype-tree-tools" aria-label="Tree controls">
          <button type="button" data-action="expand-prototype-tree">Expand all</button>
          <button type="button" data-action="collapse-prototype-tree">Collapse all</button>
        </div>`}
        ${renderTreeList(nodes, activeHref, 0, opts)}
      </aside>`;
  }

  function renderAssetBreadcrumb(parts) {
    return `<div class="prototype-crumbs">${parts.map((part, index) => `<span>${escapeText(part)}</span>${index < parts.length - 1 ? '<b>/</b>' : ''}`).join('')}</div>`;
  }

  function renderPrototypePreviewCard(title, copy, items = []) {
    return `
      <article class="prototype-preview-card">
        <span class="design-hub-kicker">Selected node</span>
        <h3>${escapeText(title)}</h3>
        <p>${escapeText(copy)}</p>
        ${items.length ? `<div class="prototype-mini-list">${items.map((item) => `<a href="${escapeText(item.href || '#')}" class="${item.planned ? 'planned' : ''}">${escapeText(item.label)}</a>`).join('')}</div>` : ''}
      </article>`;
  }

  function renderDrilldownPrototype() {
    return `
      <section class="prototype-drill-grid">
        ${renderPrototypePreviewCard('Assets', 'Start at the root. Each card sends you to a new page one level deeper.', [
          { label: 'Buttons', href: '/design/assets/buttons' },
          { label: 'Icons', href: '#' },
          { label: 'Board', href: '#', planned: true },
          { label: 'Pieces', href: '#', planned: true },
        ])}
        ${renderPrototypePreviewCard('Buttons', 'The button category page lists button families, not individual button assets.', [
          { label: 'Main Menu Buttons', href: '/design/assets/main-menu-buttons' },
          { label: 'Plain Buttons', href: '#', planned: true },
        ])}
        ${renderPrototypePreviewCard('Main Menu Buttons', 'The type page has the dropdown/search picker and one full inspection card.', [
          { label: 'Main Menu', href: '/design/assets/main-menu-buttons/button-9slice.main-menu' },
        ])}
      </section>`;
  }

  function renderTreePrototype() {
    return `
      <section class="prototype-tree-layout">
        ${renderPrototypeTreePanel('/design/assets/main-menu-buttons')}
        <div class="prototype-tree-content">
          ${renderAssetBreadcrumb(['Assets', 'Buttons', 'Main Menu Buttons'])}
          ${renderPrototypePreviewCard('Main Menu Buttons', 'The tree stays visible while the right panel swaps to the selected category, type, or asset page.', [
            { label: 'Main Menu', href: '/design/assets/main-menu-buttons/button-9slice.main-menu' },
          ])}
        </div>
      </section>`;
  }

  function renderHybridPrototype() {
    return `
      <section class="prototype-tree-layout prototype-hybrid-layout">
        ${renderPrototypeTreePanel('/design/assets/main-menu-buttons/button-9slice.main-menu')}
        <div class="prototype-tree-content">
          ${renderAssetBreadcrumb(['Assets', 'Buttons', 'Main Menu Buttons', 'Main Menu Button 9-Slice'])}
          <div class="prototype-hybrid-grid">
            ${renderPrototypePreviewCard('Main Menu Buttons', 'Type-level controls live here: search, dropdown, status filters, and family notes.', [
              { label: 'Search within Main Menu Buttons', href: '#' },
              { label: 'Selected: Main Menu Button 9-Slice', href: '/design/assets/main-menu-buttons/button-9slice.main-menu' },
            ])}
            ${renderPrototypePreviewCard('Inspection Card', 'The selected asset still gets a dedicated full card, but the tree keeps the larger catalog context visible.', [
              { label: 'States: pressed, normal', href: '#' },
              { label: 'Slots: icon, text, arrow, hitbox', href: '#' },
            ])}
          </div>
        </div>
      </section>`;
  }

  function renderAssetNavigationPrototype() {
    const prototype = currentRoute().prototype || 'drilldown';
    const titles = {
      drilldown: 'Navigation Prototype: Page Drilldown',
      tree: 'Navigation Prototype: Tree Sidebar',
      hybrid: 'Navigation Prototype: Hybrid',
    };
    const bodies = {
      drilldown: renderDrilldownPrototype(),
      tree: renderTreePrototype(),
      hybrid: renderHybridPrototype(),
    };
    return `
      <div class="main-assets-screen asset-catalog-screen asset-prototype-screen" data-live-screen="asset-nav-prototype">
        <header class="main-assets-header">
          <a class="design-back" href="/design/assets">&larr; Asset Catalog</a>
          <p class="eyebrow">Asset navigation study</p>
          <h2>${titles[prototype]}</h2>
          <p class="main-assets-intro">Quick structural mocks for comparing how a large asset catalog might be explored. These pages are intentionally rough.</p>
          ${prototypeLinks(prototype)}
        </header>
        ${bodies[prototype]}
      </div>`;
  }

  function renderModeButtonAssetLab() {
    const liveRows = [
      { label: 'Solo Skirmish', className: 'is-active' },
      { label: 'Campaign Editor' },
      { label: 'Level Editor' },
      { label: 'Lobbies' },
      { label: 'Settings' },
    ];
    return `
      <div class="main-assets-screen main-menu-asset-lab" data-live-screen="main-menu-assets">
        <header class="main-assets-header">
          <a class="design-back" href="/design">&larr; Design</a>
          <p class="eyebrow">Main menu · asset lab</p>
          <h2>Render Crop vs Reusable Assets</h2>
          <p class="main-assets-intro">This page keeps the accepted menu crop intact and puts candidate button asset sheets beside it. Use it to feel the difference before replacing anything in the live menu.</p>
          <div class="main-assets-summary">
            <span><b>01</b> accepted crop baseline</span>
            <span><b>02</b> reusable button-sheet candidates</span>
            <span><b>01</b> live-text widget mock</span>
          </div>
        </header>

        <section class="asset-lab-grid" aria-label="Main menu button asset comparison">
          <article class="asset-lab-card asset-lab-card-wide">
            <header>
              <span class="design-hub-kicker">Current live approach</span>
              <h3>Accepted Render Crop</h3>
              <p>The live menu clips the complete concept render and places transparent buttons over the painted labels.</p>
            </header>
            <div class="asset-lab-render-crop">
              <img src="/assets/ui/main-menu-aspirational.png" alt="Approved main menu render crop containing the five painted mode buttons" draggable="false">
            </div>
          </article>

          <article class="asset-lab-card">
            <header>
              <span class="design-hub-kicker">Candidate source</span>
              <h3>Five-Mode Button Sheet</h3>
              <p>No-text pixel button rows with icons and states. This is closer to a reusable asset source.</p>
            </header>
            <img class="asset-lab-sheet" src="/assets/ui/main-menu-button-art-five-mode.png" alt="No-text five-mode button art sheet" draggable="false">
          </article>

          <article class="asset-lab-card">
            <header>
              <span class="design-hub-kicker">Candidate source</span>
              <h3>Three-State Button Sheet</h3>
              <p>A tighter state sheet for selected, normal, and alternate rows. It can feed a future slicer/manifest.</p>
            </header>
            <img class="asset-lab-sheet" src="/assets/ui/main-menu-button-art-three-state.png" alt="No-text three-state button art sheet" draggable="false">
          </article>

          <article class="asset-lab-card asset-lab-card-wide">
            <header>
              <span class="design-hub-kicker">Widget mock</span>
              <h3>Sliced Rows + Live Text</h3>
              <p>Here the same source sheet is treated as five independent row assets. The text is separate, so the renderer can change labels, state, spacing, and hit targets without repainting the art.</p>
            </header>
            <div class="asset-kit-rows" aria-label="Reusable button rows with live text">
              ${liveRows.map((row, index) => `
                <button class="asset-kit-row ${row.className || ''}" style="--asset-row: ${index};" type="button">
                  <span>${escapeText(row.label)}</span>
                </button>
              `).join('')}
            </div>
          </article>
        </section>
      </div>`;
  }

  function renderCogIcon() {
    // Material settings gear: fat teeth + center hole read unambiguously as a cog at
    // icon size (thin radial strokes read as a sunburst, so avoid them).
    return `<svg class="ui-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"></path>
    </svg>`;
  }

  function renderRookIcon() {
    return `<svg class="ui-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M3.4 2.6h2.1v1.5h1.4V2.6h1.4v1.5h1.4V2.6h2.1v3.1l-1.2 1 .6 4.9 1.1 1.5v1.2H3.1v-1.2l1.1-1.5.6-4.9-1.2-1z"></path>
    </svg>`;
  }

  function renderProfileStatus() {
    const signedIn = Boolean(currentUser);
    const name = signedIn
      ? escapeText(currentUser.displayName || currentUser.name || currentUser.username || 'Commander')
      : 'Commander';
    // Element 03 hybrid (render-fidelity + text rule, docs/ui-art-direction.md):
    // art-crop the painterly lion crest from the approved render; clean SVG for the
    // geometric cog and rook silhouettes; every word and number is live DOM text
    // (localizable, accessible, scalable) — never baked into the image.
    return `
      <section class="profile-panel" aria-label="Commander profile and skirmish forces">
        <div class="profile-bar profile-identity">
          <span class="profile-crest" role="img" aria-label="Commander crest"></span>
          <span class="profile-name">
            <strong>${name}</strong>
            <small>Rank 12</small>
          </span>
          <button class="profile-auth" type="button" data-action="${signedIn ? 'settings' : 'sign-in'}">${signedIn ? 'Account' : 'Sign In'}</button>
          <button class="profile-gear" type="button" data-action="settings" aria-label="Settings">${renderCogIcon()}</button>
        </div>
        <dl class="profile-bar profile-forces">
          <div class="force force-allies">
            <span class="force-icon" aria-hidden="true">${renderRookIcon()}</span>
            <dt>Allies</dt><dd>3</dd>
          </div>
          <div class="force force-enemies">
            <span class="force-icon" aria-hidden="true">${renderRookIcon()}</span>
            <dt>Enemies</dt><dd>3</dd>
          </div>
        </dl>
      </section>`;
  }

  function renderDailyPanel() {
    // Element 04 (daily) — DOM + live text + clean SVG icons (text is never baked).
    return `
      <section class="menu-panel daily-panel" aria-label="Daily challenge">
        <header class="daily-head">
          <strong>Daily Challenge</strong>
          <span class="daily-timer"><svg class="ui-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M3.5 1.5h9v3L9 8l3.5 3.5v3h-9v-3L7 8 3.5 4.5z"></path></svg>12h 45m</span>
        </header>
        <div class="daily-body">
          <span class="daily-reticle" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" focusable="false"><circle cx="8" cy="8" r="5.4"></circle><path d="M8 .9v2.6M8 12.5v2.6M.9 8h2.6M12.5 8h2.6"></path><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"></circle></svg></span>
          <p>Capture the enemy King</p>
        </div>
        <footer class="daily-reward">
          <span class="daily-reward-label">Reward</span>
          <span class="daily-gem" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 16 16" fill="currentColor" focusable="false"><path d="M4 2.2h8l2.8 3.9L8 14.2 1.2 6.1z"></path></svg></span>
          <strong>50</strong>
        </footer>
      </section>`;
  }

  function renderNewsBullet(tone) {
    if (tone === 'gold') {
      return `<svg class="ui-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M2 12.5h12L13 5.5l-3 2.6L8 3 6 8.1l-3-2.6z"></path></svg>`;
    }
    if (tone === 'red') {
      return `<svg class="ui-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><rect x="3" y="3" width="10" height="10" rx="1"></rect></svg>`;
    }
    return `<svg class="ui-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 1.5l5.5 6.5L8 14.5 2.5 8z"></path></svg>`;
  }

  function renderNewsPanel() {
    // Element 04 (news) — DOM + live text + clean SVG bullets (text is never baked).
    const items = [
      { tone: 'cobalt', text: 'v1.2.0 Balance Update' },
      { tone: 'gold', text: 'New official maps added' },
      { tone: 'red', text: 'Community Spotlight: Top Tactics' },
    ];
    const lines = items.map((it) =>
      `<li class="news-line news-line-${it.tone}"><span class="news-ico" aria-hidden="true">${renderNewsBullet(it.tone)}</span><span>${escapeText(it.text)}</span></li>`
    ).join('');
    return `
      <section class="menu-panel news-panel" aria-label="News">
        <header class="news-head"><strong>News</strong></header>
        <ul class="news-list">${lines}</ul>
      </section>`;
  }

  const DOCK_ITEMS = [
    { action: 'settings', label: 'Achievements' },
    { action: 'campaigns', label: 'Campaigns' },
    { action: 'lobbies', label: 'Lobbies' },
    { action: 'settings', label: 'Collection' },
  ];

  function renderDock() {
    // Element 05 — art-backed: the concept dock is icon-only pixel art with no baked
    // text, so crop the dock strip from the render (dock-chrome {x:548,y:810,w:410,h:136})
    // and overlay transparent live hit-targets — the accepted mode-button (01) pattern.
    const targets = DOCK_ITEMS.map((item, i) =>
      `<button class="dock-hit" style="left:${(i * 24.6 + 1.4).toFixed(2)}%" type="button" data-action="${escapeText(item.action)}" aria-label="${escapeText(item.label)}" title="${escapeText(item.label)}"></button>`
    ).join('');
    return `<nav class="menu-dock menu-dock-art" aria-label="Quick links">${targets}</nav>`;
  }

  function renderMainMenuSkeleton() {
    return `
      <div class="main-menu-screen main-menu-live-screen main-menu-skeleton-screen" data-live-screen="main-skeleton">
        <section class="main-menu-left" aria-label="Main navigation">
          <div class="main-menu-brand main-menu-brand-art accepted-brand-crop" aria-label="Chess Tactics">
            <img src="/assets/ui/main-menu-brand-title-only-v1.png" alt="" aria-hidden="true" draggable="false">
          </div>

          <section class="main-menu-battlefield-plate main-menu-battlefield-art" aria-label="Moonlit grassland battlefield preview">
            <div class="main-menu-battlefield-meta">
              <span>Moonlit Grassland</span>
              <span>Skirmish Preview</span>
            </div>
            <div class="main-menu-battlefield-status" aria-hidden="true">
              <span>6 Allies</span>
              <span>5 Threats</span>
              <span>Bridge Hold</span>
            </div>
          </section>

          ${renderModeButtonStack({ activeAction: 'party' })}

          ${renderDailyPanel()}
        </section>

        <aside class="main-menu-right" aria-label="Profile and status">
          ${renderProfileStatus()}

          ${renderNewsPanel()}
        </aside>

        ${renderDock()}
      </div>`;
  }

  function renderArtHotspot(screenId, screen, hotspot) {
    const signedIn = Boolean(currentUser);
    const action = hotspot.action === 'auth-dynamic'
      ? (signedIn ? 'settings' : 'sign-in')
      : hotspot.action;
    const label = hotspot.action === 'auth-dynamic'
      ? (signedIn ? 'Signed In' : 'Sign In')
      : hotspot.label;
    const modeAttr = hotspot.mode ? ` data-mode="${escapeText(hotspot.mode)}"` : '';
    return `<button class="${screen.hotspotClass} ${hotspot.className}" type="button" data-screen="${screenId}" data-action="${escapeText(action)}"${modeAttr} data-label="${escapeText(label)}" aria-label="${escapeText(label)}"></button>`;
  }

  function renderArtScreen(screenId) {
    const screen = ART_SCREENS[screenId];
    if (!screen) return '';
    return `
      <div class="${screen.shellClass}" data-art-screen="${screenId}">
        <a class="design-back design-back--art" href="/design">&larr; Design</a>
        <div class="${screen.boardClass}" aria-label="${escapeText(screen.label)}">
          <img src="${escapeText(screen.src)}" alt="" aria-hidden="true" decoding="async" draggable="false">
          ${screen.hotspots.map((hotspot) => renderArtHotspot(screenId, screen, hotspot)).join('')}
        </div>
      </div>`;
  }

  function renderMenu() {
    if (shellEl) shellEl.classList.toggle('main-menu-active', state.screen === 'main');
    if (shellEl) shellEl.classList.toggle('concept-screen-active', ['campaigns', 'level-editor', 'game'].includes(state.screen));
    if (shellEl) {
      shellEl.classList.toggle('show-art-hotspots', Boolean(currentRoute().hotspots));
    }
    if (boardWrapEl) boardWrapEl.classList.toggle('level-editor-active', state.screen === 'level-editor');
    if (boardScrollEl) boardScrollEl.classList.toggle('level-editor-scroll', state.screen === 'level-editor');
    menuLayer.classList.toggle('main-menu-layer', state.screen === 'main');
    menuLayer.classList.toggle('concept-screen-layer', ['campaigns', 'level-editor', 'game'].includes(state.screen));
    menuLayer.classList.toggle('level-editor-layer', false);
    if (state.screen === 'level-editor') {
      menuLayer.hidden = false;
      menuLayer.innerHTML = renderArtScreen('level-editor');
      return;
    }
    if (state.screen === 'game') {
      menuLayer.hidden = false;
      menuLayer.innerHTML = renderArtScreen('skirmish');
      return;
    }
    menuLayer.hidden = false;
    if (state.screen === 'main') {
      if (shouldShowMainConcept()) {
        menuLayer.innerHTML = renderArtScreen('main');
      } else if (shouldShowMainAssets()) {
        menuLayer.innerHTML = renderMainAssetReview();
      } else if (shouldShowMainAssetLab()) {
        menuLayer.innerHTML = renderModeButtonAssetLab();
      } else if (shouldShowAssetNavigationPrototype()) {
        menuLayer.innerHTML = renderAssetNavigationPrototype();
      } else if (shouldShowAssetCatalog()) {
        menuLayer.innerHTML = renderAssetCatalog();
      } else if (shouldShowMainSpecimen()) {
        menuLayer.innerHTML = renderSpecimenCapture();
      } else if (shouldShowWidgets()) {
        menuLayer.innerHTML = renderWidgets();
      } else if (shouldShowGlossary()) {
        menuLayer.innerHTML = renderGlossary();
      } else if (shouldShowMainDesignIndex()) {
        menuLayer.innerHTML = renderDesignIndex();
      } else {
        menuLayer.innerHTML = renderMainMenuSkeleton();
      }
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
      menuLayer.innerHTML = renderArtScreen('campaigns');
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
    if (state.screen === 'level-editor') {
      if (gamePanel) gamePanel.hidden = true;
      if (levelEditorPanel) {
        levelEditorPanel.hidden = false;
        const campaign = selectedCampaign();
        const level = selectedLevel(campaign);
        const brush = selectedLevelBrush();
        const mode = state.levelEditorMode === 'zones' ? 'zones' : 'board';
        const zones = level ? levelZones(level) : [];
        const zone = level ? selectedZone(level) : null;
        const zoneIndex = zone ? Math.max(0, zones.findIndex((item) => item.id === zone.id)) : 0;
        const zoneColor = ZONE_COLORS[zoneIndex % ZONE_COLORS.length];
        const zoneCellCount = zone && level ? zoneCells(zone, level).length : 0;
        levelEditorPanel.innerHTML = `
          <div class="panel-section">
            <p class="eyebrow">Level editor</p>
            <h2 style="font-size: .8rem; line-height: 1.3;">${level ? escapeText(level.name) : 'Level'}</h2>
            <p class="menu-copy" style="color: var(--muted); font-size: 1.05rem; margin-top: 8px;">${state.campaignMessage || 'Paint the board, then save.'}</p>
            <div class="editor-mode-tabs" role="tablist" aria-label="Level editor modes">
              <button type="button" class="${mode === 'board' ? 'active' : ''}" data-action="set-level-editor-mode" data-mode="board">Board</button>
              <button type="button" class="${mode === 'zones' ? 'active' : ''}" data-action="set-level-editor-mode" data-mode="zones">Zones</button>
            </div>
            <div class="actions">
              <button type="button" data-action="save-level-editor" ${state.campaignLoading ? 'disabled' : ''}>Save</button>
              <button type="button" data-action="back-to-campaigns">Back</button>
              <button type="button" data-action="seed-level-layout">Seed</button>
              <button type="button" data-action="clear-level-layout">Clear</button>
            </div>
          </div>
          ${mode === 'board' ? `
            <div class="panel-section">
              <div class="roster-title" style="margin-bottom: 8px;">Level Setup</div>
              <div class="editor-grid">
                <label>Width<input id="levelWidth" type="number" min="4" max="16" value="${level ? escapeText(level.width) : 8}"></label>
                <label>Height<input id="levelHeight" type="number" min="4" max="20" value="${level ? escapeText(level.height) : 12}"></label>
                <label>Enemy Budget<input id="levelEnemyBudget" type="number" min="1" max="24" value="${level ? escapeText(level.enemy_budget) : 3}"></label>
              </div>
            </div>
            <div class="panel-section">
              <div class="roster-title" style="margin-bottom: 8px;">Palette Brushes</div>
              <div class="level-palette canvas-palette" aria-label="Level editor brushes">
                ${LEVEL_BRUSHES.map((item) => `
                  <button type="button" class="${brush.id === item.id ? 'active' : ''} ${item.role || 'empty'} ${item.type || ''}" data-action="select-level-brush" data-brush="${item.id}">
                    <span>${escapeText(item.mark)}</span>${escapeText(item.label)}
                  </button>
                `).join('')}
              </div>
            </div>
          ` : `
            <div class="panel-section zone-editor-panel">
              <div class="zone-editor-head">
                <div>
                  <div class="roster-title">Zones</div>
                  <p>${zones.length} saved · ${zoneCellCount} cells in active zone</p>
                </div>
                <button type="button" data-action="add-level-zone">New Zone</button>
              </div>
              <div class="zone-list" aria-label="Level zones">
                ${zones.length ? zones.map((item, index) => `
                  <button type="button" class="${zone && zone.id === item.id ? 'active' : ''}" data-action="select-level-zone" data-zone-id="${escapeText(item.id)}">
                    <i style="background:${ZONE_COLORS[index % ZONE_COLORS.length].stroke};"></i>
                    <span>${escapeText(item.name)}</span>
                    <small>${zoneCells(item, level).length}</small>
                  </button>
                `).join('') : '<p class="empty-lobbies">No zones yet.</p>'}
              </div>
            </div>
            <div class="panel-section zone-editor-panel">
              <label class="zone-name-label">Zone Name
                <input id="selectedZoneName" value="${zone ? escapeText(zone.name) : ''}" maxlength="40" ${zone ? '' : 'disabled'}>
              </label>
              <div class="zone-tool-tabs" role="tablist" aria-label="Zone drawing tools">
                <button type="button" class="${state.zoneTool === 'paint' ? 'active' : ''}" data-action="set-zone-tool" data-tool="paint">Paint</button>
                <button type="button" class="${state.zoneTool === 'rect' ? 'active' : ''}" data-action="set-zone-tool" data-tool="rect">Area</button>
              </div>
              <div class="zone-swatch" style="--zone-color:${zoneColor.stroke};">
                <span></span>
                <p>${zone ? `${zone.selections.length} selections. Overlaps are allowed; unique cells are drawn on the board.` : 'Create a zone to start drawing.'}</p>
              </div>
              <div class="tool-actions">
                <button type="button" data-action="save-zone-editor" ${zone || level ? '' : 'disabled'}>Save Zone</button>
                <button type="button" data-action="clear-selected-zone" ${zone ? '' : 'disabled'}>Clear Zone</button>
                <button type="button" data-action="delete-selected-zone" ${zone ? '' : 'disabled'}>Delete Zone</button>
              </div>
            </div>
            <div class="panel-section zone-editor-panel">
              <div class="roster-title">Assignments</div>
              ${level ? renderZoneAssignmentControls(level) : ''}
            </div>
          `}
        `;
      }
      return;
    }

    if (gamePanel) gamePanel.hidden = false;
    if (levelEditorPanel) levelEditorPanel.hidden = true;

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
    openPortfolioHashTarget();
    renderPanel();
    syncIdleAnimationLoop();
  }

  function openPortfolioHashTarget() {
    if (!window.location.hash) return;
    const id = window.decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const target = document.getElementById(id);
    if (!target || !target.matches('details.portfolio-asset')) return;
    target.open = true;
    window.requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  }

  function approvedRenderPointFromEvent(event, stage) {
    const image = stage && stage.querySelector('img');
    if (!image) return null;
    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: clampReferenceNumber(((event.clientX - rect.left) / rect.width) * APPROVED_RENDER_WIDTH, 0, APPROVED_RENDER_WIDTH),
      y: clampReferenceNumber(((event.clientY - rect.top) / rect.height) * APPROVED_RENDER_HEIGHT, 0, APPROVED_RENDER_HEIGHT),
    };
  }

  function referenceSelectionFromPoints(start, end) {
    if (!start || !end) return null;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    return normalizeMainMenuReferenceSelection({ x, y, w, h });
  }

  function referenceSelectionFromMove(initial, start, end) {
    const cleanInitial = normalizeMainMenuReferenceSelection(initial);
    if (!cleanInitial || !start || !end) return null;
    const nextX = cleanInitial.x + (end.x - start.x);
    const nextY = cleanInitial.y + (end.y - start.y);
    return normalizeMainMenuReferenceSelection({
      ...cleanInitial,
      x: clampReferenceNumber(nextX, 0, APPROVED_RENDER_WIDTH - cleanInitial.w),
      y: clampReferenceNumber(nextY, 0, APPROVED_RENDER_HEIGHT - cleanInitial.h),
    });
  }

  function referenceSelectionFromResize(initial, start, end, handle) {
    const cleanInitial = normalizeMainMenuReferenceSelection(initial);
    if (!cleanInitial || !start || !end || !handle) return null;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let left = cleanInitial.x;
    let top = cleanInitial.y;
    let right = cleanInitial.x + cleanInitial.w;
    let bottom = cleanInitial.y + cleanInitial.h;

    if (handle.includes('w')) {
      left = clampReferenceNumber(cleanInitial.x + dx, 0, right - REFERENCE_CROP_MIN_SIZE);
    }
    if (handle.includes('e')) {
      right = clampReferenceNumber(cleanInitial.x + cleanInitial.w + dx, left + REFERENCE_CROP_MIN_SIZE, APPROVED_RENDER_WIDTH);
    }
    if (handle.includes('n')) {
      top = clampReferenceNumber(cleanInitial.y + dy, 0, bottom - REFERENCE_CROP_MIN_SIZE);
    }
    if (handle.includes('s')) {
      bottom = clampReferenceNumber(cleanInitial.y + cleanInitial.h + dy, top + REFERENCE_CROP_MIN_SIZE, APPROVED_RENDER_HEIGHT);
    }

    return normalizeMainMenuReferenceSelection({
      x: left,
      y: top,
      w: right - left,
      h: bottom - top,
    });
  }

  function updateReferenceCropStageSelection(stage, selection) {
    const cleanSelection = normalizeMainMenuReferenceSelection(selection);
    if (!stage || !cleanSelection) return;
    const box = stage.querySelector('.reference-crop-selection');
    if (box) box.setAttribute('style', mainMenuReferenceSelectionStyle(cleanSelection));
    const readout = stage.closest('.reference-crop-dialog') && stage.closest('.reference-crop-dialog').querySelector('header span');
    if (readout) readout.textContent = `${cleanSelection.x}, ${cleanSelection.y}, ${cleanSelection.w} x ${cleanSelection.h}`;
  }

  function beginReferenceCropDrag(event) {
    const stage = event.target.closest('.reference-crop-stage');
    if (!stage || !state.mainMenuReferenceEditor) return;
    const key = stage.dataset.cropKey;
    if (!MAIN_MENU_REFERENCE_CROP_DEFAULTS[key]) return;
    const start = approvedRenderPointFromEvent(event, stage);
    if (!start) return;
    const currentSelection = normalizeMainMenuReferenceSelection(state.mainMenuReferenceEditor.selection)
      || mainMenuReferenceSelection(key);
    const resizeHandle = event.target.closest('.reference-crop-handle');
    const selectionBox = event.target.closest('.reference-crop-selection');
    const mode = resizeHandle ? 'resize' : (selectionBox ? 'move' : 'draw');
    event.preventDefault();
    stage.setPointerCapture(event.pointerId);
    state.mainMenuReferenceDrag = {
      key,
      mode,
      handle: resizeHandle ? resizeHandle.dataset.cropHandle : '',
      pointerId: event.pointerId,
      start,
      initial: currentSelection,
    };
    if (mode === 'draw') {
      const selection = normalizeMainMenuReferenceSelection({
        x: start.x,
        y: start.y,
        w: REFERENCE_CROP_MIN_SIZE,
        h: REFERENCE_CROP_MIN_SIZE,
      });
      state.mainMenuReferenceEditor.selection = selection;
      updateReferenceCropStageSelection(stage, selection);
    }
  }

  function updateReferenceCropDrag(event) {
    const drag = state.mainMenuReferenceDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const stage = menuLayer.querySelector('.reference-crop-stage');
    if (!stage) return;
    const end = approvedRenderPointFromEvent(event, stage);
    const selection = drag.mode === 'move'
      ? referenceSelectionFromMove(drag.initial, drag.start, end)
      : drag.mode === 'resize'
        ? referenceSelectionFromResize(drag.initial, drag.start, end, drag.handle)
        : referenceSelectionFromPoints(drag.start, end);
    if (!selection) return;
    event.preventDefault();
    state.mainMenuReferenceEditor.selection = selection;
    updateReferenceCropStageSelection(stage, selection);
  }

  function finishReferenceCropDrag(event) {
    const drag = state.mainMenuReferenceDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const stage = menuLayer.querySelector('.reference-crop-stage');
    const selection = state.mainMenuReferenceEditor && state.mainMenuReferenceEditor.selection;
    state.mainMenuReferenceDrag = null;
    if (stage && stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    if (selection) void saveMainMenuReferenceSelection(drag.key, selection);
  }

  function handleMenuClick(event) {
    const treeLaunch = event.target.closest('[data-tree-launch]');
    if (treeLaunch) {
      event.preventDefault();
      event.stopPropagation();
      const href = treeLaunch.getAttribute('href');
      if (href && href !== '#') window.location.href = href;
      return;
    }
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.action === 'noop') return;
    if (button.dataset.action === 'open-reference-crop-picker') {
      const key = button.dataset.cropKey;
      if (MAIN_MENU_REFERENCE_CROP_DEFAULTS[key]) {
        state.mainMenuReferenceEditor = {
          key,
          title: button.dataset.cropTitle || 'Approved Render Crop',
          selection: mainMenuReferenceSelection(key),
        };
        state.mainMenuReferenceDrag = null;
        render();
      }
      return;
    }
    if (button.dataset.action === 'close-reference-crop-picker') {
      state.mainMenuReferenceEditor = null;
      state.mainMenuReferenceDrag = null;
      render();
      return;
    }
    if (button.dataset.action === 'reset-reference-crop-picker') {
      const key = button.dataset.cropKey;
      if (MAIN_MENU_REFERENCE_CROP_DEFAULTS[key]) {
        state.mainMenuReferenceEditor = {
          key,
          title: state.mainMenuReferenceEditor ? state.mainMenuReferenceEditor.title : 'Approved Render Crop',
          selection: MAIN_MENU_REFERENCE_CROP_DEFAULTS[key],
        };
        void saveMainMenuReferenceSelection(key, MAIN_MENU_REFERENCE_CROP_DEFAULTS[key]);
      }
      return;
    }
    if (button.dataset.action === 'focus-main-menu-review-item') {
      const reviewId = button.dataset.reviewId;
      if (MAIN_MENU_LEDGER_ITEMS.some((item) => item.id === reviewId)) {
        state.mainMenuReviewFocusId = reviewId;
        render();
      }
      return;
    }
    if (button.dataset.action === 'set-main-menu-review-status') {
      const reviewId = button.dataset.reviewId;
      const reviewStatus = button.dataset.reviewStatus;
      if (
        MAIN_MENU_LEDGER_ITEMS.some((item) => item.id === reviewId)
        && MAIN_MENU_REVIEW_STATUSES[reviewStatus]
      ) {
        state.mainMenuReviewFocusId = reviewId;
        void saveMainMenuReviewDraft(nextMainMenuReviewDraft(reviewId, reviewStatus));
      }
      return;
    }
    if (button.dataset.action === 'expand-prototype-tree' || button.dataset.action === 'collapse-prototype-tree') {
      const panel = button.closest('.prototype-tree-panel');
      if (panel) {
        const open = button.dataset.action === 'expand-prototype-tree';
        panel.querySelectorAll('details.prototype-tree-branch').forEach((branch) => {
          branch.open = open;
        });
      }
      return;
    }
    if (button.dataset.action === 'end-turn') {
      if (state.screen === 'game' && state.turn === 'player' && !state.animating) {
        state.turn = 'enemy';
        state.selected = null;
        render();
        window.setTimeout(enemyTurn, 280);
      }
      return;
    }
    if (button.dataset.action === 'level-editor-preview') {
      state.screen = 'level-editor';
      state.turn = 'editor';
      state.selected = null;
      render();
      return;
    }
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
    if (button.dataset.action === 'set-level-editor-mode' && button.dataset.mode) {
      state.levelEditorMode = button.dataset.mode === 'zones' ? 'zones' : 'board';
      state.zoneDragStart = null;
      state.zoneDragPreview = null;
      state.zonePainting = false;
      if (state.levelEditorMode === 'zones') {
        const campaign = selectedCampaign();
        const level = selectedLevel(campaign);
        if (level && levelZones(level).length && !selectedZone(level)) state.selectedZoneId = levelZones(level)[0].id;
      }
      render();
      return;
    }
    if (button.dataset.action === 'add-level-zone') {
      addLevelZone();
      return;
    }
    if (button.dataset.action === 'select-level-zone' && button.dataset.zoneId) {
      state.selectedZoneId = button.dataset.zoneId;
      state.zoneDragStart = null;
      state.zoneDragPreview = null;
      state.zonePainting = false;
      render();
      return;
    }
    if (button.dataset.action === 'set-zone-tool' && button.dataset.tool) {
      state.zoneTool = button.dataset.tool === 'rect' ? 'rect' : 'paint';
      state.zoneDragStart = null;
      state.zoneDragPreview = null;
      state.zonePainting = false;
      render();
      return;
    }
    if (button.dataset.action === 'clear-selected-zone') {
      clearSelectedZone();
      return;
    }
    if (button.dataset.action === 'delete-selected-zone') {
      deleteSelectedZone();
      return;
    }
    if (button.dataset.action === 'add-misc-zone') {
      addMiscZoneAssignment();
      return;
    }
    if (button.dataset.action === 'delete-misc-zone') {
      deleteMiscZoneAssignment(Number(button.dataset.miscIndex));
      return;
    }
    if (button.dataset.action === 'save-zone-editor') {
      saveZoneEditor();
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
    if (button.dataset.action === 'draw-rock-grid') {
      paintRandomRockGrid(true);
      return;
    }
    if (button.dataset.action === 'clear-rock-grid') {
      paintRandomRockGrid(false);
      return;
    }
    if (button.dataset.action === 'save-level') void saveCampaignLevel();
    if (button.dataset.action === 'edit-level-board') {
      state.levelEditorMode = 'board';
      if (selectedCampaign() && selectedLevel(selectedCampaign())) {
        enterLevelEditor();
      } else {
        state.screen = 'level-editor';
        state.turn = 'editor';
        state.selected = null;
        render();
      }
    }
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
  }

  function handleMenuInput(event) {
    const target = event.target;
    if (target.matches('[data-catalog-asset-select]')) {
      if (target.value) window.location.href = target.value;
      return;
    }
    if (target.matches('[data-catalog-asset-search]')) {
      const picker = target.closest('.catalog-picker');
      const query = String(target.value || '').trim().toLowerCase();
      if (picker) {
        let matches = 0;
        picker.querySelectorAll('[data-catalog-asset-select] option').forEach((option) => {
          const haystack = option.dataset.catalogSearch || '';
          const isMatch = query ? haystack.includes(query) : true;
          option.hidden = !isMatch;
          if (isMatch) matches += 1;
        });
        const count = picker.querySelector('[data-catalog-match-count]');
        if (count) count.textContent = `${matches} ${matches === 1 ? 'match' : 'matches'}`;
      }
      return;
    }
    if (target.id === 'levelWidth' || target.id === 'levelHeight' || target.id === 'levelEnemyBudget') {
      const campaign = selectedCampaign();
      const level = selectedLevel(campaign);
      if (level) {
        if (target.id === 'levelWidth') level.width = clampBoardNumber(target.value, level.width, LEVEL_WIDTH_MIN, LEVEL_WIDTH_MAX);
        if (target.id === 'levelHeight') level.height = clampBoardNumber(target.value, level.height, LEVEL_HEIGHT_MIN, LEVEL_HEIGHT_MAX);
        if (target.id === 'levelEnemyBudget') level.enemy_budget = clampBoardNumber(target.value, level.enemy_budget, 1, 24);
        if (target.id === 'levelWidth' || target.id === 'levelHeight') {
          applyLevelFormDraft(level);
          syncLevelEditorPieces();
          state.gridEndX = level.width - 1;
          state.gridEndY = level.height - 1;
        }
        setCampaignMessage('Level settings changed. Save the level to persist them.');
        render();
      }
    }
    if (target.id === 'selectedZoneName') {
      const campaign = selectedCampaign();
      const level = selectedLevel(campaign);
      const zone = level && selectedZone(level);
      if (zone) zone.name = String(target.value || '').slice(0, 40) || zone.name;
    }
    if (target.dataset.miscField) {
      const campaign = selectedCampaign();
      const level = selectedLevel(campaign);
      if (level) level.zone_assignments = levelFormData().zone_assignments;
    }
    if (target.id === 'gridStartX') state.gridStartX = clampBoardNumber(target.value, 0, 0, 15);
    if (target.id === 'gridStartY') state.gridStartY = clampBoardNumber(target.value, 0, 0, 19);
    if (target.id === 'gridEndX') state.gridEndX = clampBoardNumber(target.value, 7, 0, 15);
    if (target.id === 'gridEndY') state.gridEndY = clampBoardNumber(target.value, 11, 0, 19);
  }

  menuLayer.addEventListener('click', handleMenuClick);
  levelEditorPanel.addEventListener('click', handleMenuClick);
  menuLayer.addEventListener('input', handleMenuInput);
  menuLayer.addEventListener('change', handleMenuInput);
  levelEditorPanel.addEventListener('input', handleMenuInput);
  levelEditorPanel.addEventListener('change', handleMenuInput);
  menuLayer.addEventListener('pointerdown', beginReferenceCropDrag);
  menuLayer.addEventListener('pointermove', updateReferenceCropDrag);
  menuLayer.addEventListener('pointerup', finishReferenceCropDrag);
  menuLayer.addEventListener('pointercancel', finishReferenceCropDrag);

  menuLayer.addEventListener('wheel', (event) => {
    if (state.screen !== 'level-editor' || !boardScrollEl) return;
    boardScrollEl.scrollTop += event.deltaY;
    event.preventDefault();
  }, { passive: false });

  boardEl.addEventListener('click', (event) => {
    const tile = pointToTile(event.clientX, event.clientY);
    if (tile) handleTile(tile.x, tile.y);
  });

  boardEl.addEventListener('pointerdown', (event) => {
    if (state.screen !== 'level-editor' || state.levelEditorMode !== 'zones' || event.button !== 0) return;
    const tile = pointToTile(event.clientX, event.clientY);
    if (!tile) return;
    event.preventDefault();
    boardEl.setPointerCapture(event.pointerId);
    ensureSelectedZone(selectedLevel(selectedCampaign()));
    if (state.zoneTool === 'rect') {
      state.zoneDragStart = tile;
      state.zoneDragPreview = tile;
      render();
    } else {
      state.zonePainting = true;
      state.zoneLastPaintKey = null;
      addZonePaintCell(tile);
    }
  });

  boardEl.addEventListener('pointermove', (event) => {
    if (state.screen !== 'level-editor' || state.levelEditorMode !== 'zones') return;
    const tile = pointToTile(event.clientX, event.clientY);
    if (state.zoneTool === 'rect' && state.zoneDragStart) {
      if (tile && (!state.zoneDragPreview || tile.x !== state.zoneDragPreview.x || tile.y !== state.zoneDragPreview.y)) {
        state.zoneDragPreview = tile;
        render();
      }
    } else if (state.zonePainting && tile) {
      addZonePaintCell(tile);
    }
  });

  boardEl.addEventListener('pointerup', (event) => {
    if (state.screen !== 'level-editor' || state.levelEditorMode !== 'zones') return;
    const tile = pointToTile(event.clientX, event.clientY);
    if (state.zoneTool === 'rect' && state.zoneDragStart) {
      addZoneRectSelection(state.zoneDragStart, tile || state.zoneDragPreview || state.zoneDragStart);
    }
    state.zoneDragStart = null;
    state.zoneDragPreview = null;
    state.zonePainting = false;
    state.zoneLastPaintKey = null;
    if (boardEl.hasPointerCapture(event.pointerId)) boardEl.releasePointerCapture(event.pointerId);
    render();
  });

  boardEl.addEventListener('pointercancel', (event) => {
    state.zoneDragStart = null;
    state.zoneDragPreview = null;
    state.zonePainting = false;
    state.zoneLastPaintKey = null;
    if (boardEl.hasPointerCapture(event.pointerId)) boardEl.releasePointerCapture(event.pointerId);
    render();
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

  applyInitialRoute();
  initAuth();
  lobbyPollTimer = window.setInterval(() => {
    if (currentUser && (state.screen === 'lobbies' || state.screen === 'lobby')) {
      void loadLobbies(true);
    }
  }, 3500);
  window.addEventListener('beforeunload', () => {
    if (lobbyPollTimer) window.clearInterval(lobbyPollTimer);
  });
  window.addEventListener('hashchange', openPortfolioHashTarget);
  render();
  void loadMainMenuReviewDraftRemote();
}());
