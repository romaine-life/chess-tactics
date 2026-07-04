import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { SkirmishBoard } from '../render/SkirmishBoard';
import { SkirmishHud } from './SkirmishHud';
import { NavButton } from './shared/NavButton';
import { TitleBarSlot } from './shell/TitleBarSlot';
import { useSkirmish, shouldStartFreshSkirmish, setNetMoveSink, setNetResignSink } from '../game/store';
import { loadMatch, setMatchPersistenceEnabled } from '../game/matchPersistence';
import { fetchLobby, postMove, resignLobby, leaveLobby, fetchMovesSince, subscribeLobbyChannel, type MoveEvent } from '../net/lobbies';
import type { Level } from '../core/level';
import type { Side } from '../core/types';
import { objectiveSummary } from '../core/objectives';
import { formatClockMs } from '../core/clock';
import { useCampaigns } from '../campaign/store';
import { ensureCampaignsHydrated } from '../campaign/hydrate';
import { decodeBoard } from './boardCode';
import { editorBoardToLevel } from '../core/levelBoard';
import { fetchPublicMap } from '../net/maps';
import { OBJECTIVE_TYPES, type ObjectiveType } from '../core/level';
import { DEFAULT_BACKGROUND_SET } from '../art/backgroundSets';
import { PALETTE_FOR_SIDE, isPlayablePieceType } from '../core/pieces';
import { masterSrc, type Piece as PortraitPiece, type Palette as PortraitPalette } from './PortraitEditor';
import { PRODUCTION_PORTRAIT_METHOD } from './portraitCandidates';
import { preloadImages } from '../art/preload';
import { livingPieces } from '../core/rules';
import { computeStars, nextLevelRef, orderedLevels, recordLevelWin } from '../campaign/progress';
import { navigateApp } from './navigation';

const STAR_ICON = '/assets/ui/kit/icons/star.png';

function ResultStars({ count }: { count: number }) {
  return (
    <span className="campaign-result-stars" aria-label={`${count} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <img key={i} src={STAR_ICON} alt="" aria-hidden="true" style={{ width: 26, height: 26, opacity: i < count ? 1 : 0.22 }} />
      ))}
    </span>
  );
}

export function Skirmish() {
  const routeSearch = window.location.search;
  const routeParams = useMemo(() => new URLSearchParams(routeSearch), [routeSearch]);
  const routeCampaignId = routeParams.get('campaignId');
  const routeLevelId = routeParams.get('levelId');
  const routeMode = routeParams.get('mode');
  // Play-test a shared board-code link directly (no save/sign-in): `?board=<code>` decodes an
  // authored board into a one-off fixed-placement level. `?obj=<mode>` picks the win rule
  // (defaults to capture-all). Lets a crafted position be handed round as a URL.
  const routeBoard = routeParams.get('board');
  const routeObjective = routeParams.get('obj');
  // Multiplayer: `?lobby=<id>` enters a lobby's shared board as one of the two seats.
  const routeLobby = routeParams.get('lobby');
  // A shared USER map: `?map=<publicId>` fetches its public snapshot and plays it (no sign-in, no
  // campaign). The dead-link message shows if the id is unknown/removed.
  const routeMap = routeParams.get('map');
  const [netError, setNetError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  // Netplay has no campaign result flow, so a decided match shows its own result card.
  // "View board" dismisses it to review the final position (re-armed for the next match).
  const [netResultDismissed, setNetResultDismissed] = useState(false);
  // Real campaign play (records progress + shows the result flow), as opposed to the
  // editor's "Test Play" (mode=test) or a free skirmish (no campaign/level).
  const isCampaignPlay = Boolean(routeCampaignId && routeLevelId && routeMode !== 'test');
  // The Level Editor's "Test Play" is ephemeral author iteration — never persisted or
  // resumed (a stale snapshot after an edit would mislead), unlike real play below.
  const isTestPlay = routeMode === 'test';
  const [routeLevel, setRouteLevel] = useState(() => (routeLevelId ? useCampaigns.getState().levels[routeLevelId] ?? null : null));
  // The board mounts only once this screen has DECIDED which game to play (fresh vs resume).
  // The store ships a populated placeholder game (store.ts INITIAL_GAME), so mounting the
  // board before that decision would render the placeholder, then a second time when
  // newSkirmish swaps in the real seed — the board (and the unit deploy) would play twice,
  // the second time at the new positions. Gating the mount on this lets the board mount once,
  // fresh, for the game we actually play.
  const [boardSettled, setBoardSettled] = useState(false);
  const newSkirmish = useSkirmish((s) => s.newSkirmish);
  const resumeMatch = useSkirmish((s) => s.resumeMatch);
  const game = useSkirmish((s) => s.game);
  // Subscribed (not getState) so the victory "Continue" button knows, reactively, whether
  // a next level exists once the workspace hydrates.
  const campaigns = useCampaigns((s) => s.campaigns);
  const levelDocs = useCampaigns((s) => s.levels);
  // The live objective + which side holds the King come from the STORE (not routeLevel):
  // the store computes kingSide from the actual starting pieces, so a random-placement
  // King Assault whose roster deals the player the King reads "Protect your King" too, and
  // a free skirmish (no level) still gets a correct goal line. objectiveSummary is the one
  // source of that copy (ADR-0050 — no re-hardcoded objective strings in the UI).
  const objective = useSkirmish((s) => s.objective);
  const kingSide = useSkirmish((s) => s.objectiveCtx.kingSide);
  // The battle clock (null = untimed level / free skirmish). The store quantizes
  // remainingMs to the displayed readout, so this subscription re-renders about
  // once a second, not per tick.
  const clock = useSkirmish((s) => s.clock);
  const net = useSkirmish((s) => s.net);
  const objectiveGoal = objectiveSummary(objective, kingSide);
  // Status reads from THIS client's seat (single-player: 'player'; netplay: the lobby seat).
  const localSide: Side = net ? net.localSide : 'player';
  const turnLabel = game.winner
    ? game.winner === 'draw' ? 'Stalemate' : game.winner === localSide ? 'Victory' : 'Defeat'
    : game.turn === localSide ? (net ? 'Your Turn' : 'Player Turn') : (net ? 'Opponent Turn' : 'Enemy Turn');

  // Leave a decided netplay match and return to the lobby list. Host leaving closes the
  // lobby (which returns the guest too via the onLobby 'closed' path); guest leaving frees
  // the seat. The leave is best-effort — the player wants out now and the list self-heals
  // from the server broadcast — so navigate immediately rather than awaiting it.
  const returnToLobbies = () => {
    if (net) leaveLobby(net.lobbyId).catch((err) => console.warn('[netplay] leave on match end failed', err));
    navigateApp('/lobbies', { replace: true });
  };

  // Stars earned this clear (3 flawless, 2 light losses, 1 any win), from the level's
  // authored player force vs. who's still standing.
  const stars = useMemo(() => {
    if (!routeLevel || game.winner !== 'player') return 0;
    const initial = routeLevel.layers.units.filter((u) => u.side === 'player').length;
    return computeStars(initial, livingPieces(game.pieces, 'player').length);
  }, [routeLevel, game.winner, game.pieces]);

  // Bank the win the moment a campaign battle is won (idempotent — keeps the best stars).
  useEffect(() => {
    if (isCampaignPlay && routeLevel && game.winner === 'player') recordLevelWin(routeLevel.id, stars);
  }, [isCampaignPlay, routeLevel, game.winner, stars]);

  // Re-arm the netplay result card whenever a fresh game is built (winner clears), so a
  // dismissal from the previous match doesn't suppress the next one's result.
  useEffect(() => { if (!game.winner) setNetResultDismissed(false); }, [game.winner]);

  const replayLevel = () => {
    if (routeLevel) newSkirmish({ seed: Math.floor(Math.random() * 999999) + 1, level: routeLevel });
  };

  // The next level in this campaign after the one just cleared (null on the last level or
  // before the workspace hydrates) — powers the victory "Continue" button.
  const nextLevel = useMemo(() => {
    if (!isCampaignPlay || !routeCampaignId || !routeLevel) return null;
    const camp = campaigns.find((c) => c.id === routeCampaignId);
    if (!camp) return null;
    const ref = nextLevelRef(orderedLevels(camp), routeLevel.id);
    return ref ? levelDocs[ref.levelId] ?? null : null;
  }, [isCampaignPlay, campaigns, levelDocs, routeCampaignId, routeLevel]);

  // Victory "Continue": drop straight into the next level. The /play route keys on the
  // pathname only, so a bare search-param nav (levelId=A → levelId=B) would change the URL
  // without remounting — the board would keep showing the cleared level. So swap the board
  // in place the same way Replay does, and update the URL (replace, not push, so Back lands
  // on the campaign rather than a stale board) so a reload/deep-link resolves the new level.
  const advanceToNextLevel = () => {
    if (!routeCampaignId || !nextLevel) return;
    navigateApp(
      `/play?campaignId=${encodeURIComponent(routeCampaignId)}&levelId=${encodeURIComponent(nextLevel.id)}`,
      { replace: true },
    );
    useCampaigns.getState().selectLevel(nextLevel.id);
    setRouteLevel(nextLevel);
    newSkirmish({ seed: Math.floor(Math.random() * 999999) + 1, level: nextLevel });
  };

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('skirmish-active');
    return () => shell?.classList.remove('skirmish-active');
  }, []);

  // Warm the portrait cache for the units actually on the board so the HUD bust
  // paints instantly on the first click instead of waiting for a fetch+decode at
  // that moment. The HUD renders the bust live from the editor master render (via
  // <UnitPortrait>), so preload THOSE — not the no-longer-used baked PNGs — plus
  // the backdrop scene. Scoped to the current roster (both sides are focusable).
  useEffect(() => {
    const urls: string[] = [];
    for (const piece of game.pieces) {
      if (!isPlayablePieceType(piece.type)) continue;
      urls.push(masterSrc(piece.type as PortraitPiece, PALETTE_FOR_SIDE[piece.side] as PortraitPalette, PRODUCTION_PORTRAIT_METHOD));
      urls.push(DEFAULT_BACKGROUND_SET.portraits[piece.type]);
    }
    preloadImages(urls);
  }, [game.pieces]);

  useEffect(() => {
    // Multiplayer routes are driven by the netplay effect below, not this single-player
    // start/resume path — bail so it can't clobber the shared board with a free skirmish.
    if (routeLobby) return undefined;
    // A manual refresh or the "new version available" reload (net/appUpdate) rebuilds
    // the in-memory store from scratch; without a saved copy that would silently
    // restart a live battle. Turn disk persistence on for real play, off for the
    // editor's ephemeral Test Play and for one-off `?board=` link positions.
    setMatchPersistenceEnabled(!isTestPlay && !routeBoard && !routeMap);

    // Returning here from the menu (or any other screen) should resume, not
    // restart: the store is a singleton that already holds the live board. Only
    // build a fresh game when there isn't a matching in-progress one — i.e. the
    // first launch, after a finished game, or when a different level is opened.
    const shouldStartFresh = (levelId: string | null): boolean =>
      shouldStartFreshSkirmish(useSkirmish.getState(), levelId);
    const freshSeed = () => Math.floor(Math.random() * 999999) + 1;
    // Dev A/B lever: `?ai=greedy` pits you against the legacy random-capture
    // enemy; anything else gets the objective-aware search AI.
    const ai = new URLSearchParams(window.location.search).get('ai') === 'greedy' ? 'greedy' as const : 'search' as const;

    // Enter the board for `levelId`: keep the live in-memory match if it's the one
    // asked for (a route change, not a reload); else resume the match saved to disk
    // for this level if one survived a reload; else start fresh. The saved board is
    // self-contained (full position), so resume needs no level document — only the
    // levelId must match the one being entered.
    const startOrResume = (levelId: string | null, levelDoc: Level | null): void => {
      if (!shouldStartFresh(levelId)) return; // singleton already holds this battle
      if (!isTestPlay) {
        const saved = loadMatch();
        if (saved && saved.levelId === levelId && saved.game.winner === null) {
          resumeMatch(saved);
          return;
        }
      }
      newSkirmish({ seed: freshSeed(), level: levelDoc ?? undefined, ai });
    };

    // A `?board=<code>` link plays an authored position straight away — decode it into a
    // fixed-placement level and start fresh (ephemeral, never persisted; see the
    // persistence toggle above). Falls through to the normal flow if it can't decode.
    if (routeBoard) {
      const decoded = decodeBoard(routeBoard);
      if (decoded) {
        const objective: ObjectiveType = (OBJECTIVE_TYPES as readonly string[]).includes(routeObjective ?? '')
          ? (routeObjective as ObjectiveType) : 'capture-all';
        const level = editorBoardToLevel(decoded, { id: 'board-link', name: 'Board Link', objective });
        if (shouldStartFresh(level.id)) newSkirmish({ seed: freshSeed(), level, ai });
        setBoardSettled(true);
        return;
      }
    }

    // A `?map=<publicId>` link plays a SHARED user map: fetch its public snapshot (no sign-in) and
    // start fresh (ephemeral, like ?board=). Once fetched, routeLevel is set and this branch just
    // re-affirms the game on the effect's re-run (guarded so it never re-fetches in a loop).
    if (routeMap) {
      if (routeLevel) {
        if (shouldStartFresh(routeLevel.id)) newSkirmish({ seed: freshSeed(), level: routeLevel, ai });
        setBoardSettled(true);
        return undefined;
      }
      let active = true;
      fetchPublicMap(routeMap)
        .then((level) => {
          if (!active) return;
          setMapError(null);
          if (shouldStartFresh(level.id)) newSkirmish({ seed: freshSeed(), level, ai });
          setRouteLevel(level);
          setBoardSettled(true);
        })
        .catch(() => {
          if (!active) return;
          setMapError('This shared map isn’t available — the link may be wrong or the map was removed.');
          setBoardSettled(true);
        });
      return () => { active = false; };
    }

    if (!routeLevelId || routeLevel) {
      startOrResume(routeLevel?.id ?? null, routeLevel);
      setBoardSettled(true);
      return;
    }
    let active = true;
    // Hydrate the shared workspace the same way the menu does (server when reachable,
    // else the bundled default) so a deep-link / reload of a campaign battle resolves
    // its level offline too — not just when arriving from the level select.
    ensureCampaignsHydrated()
      .then(() => {
        if (!active) return;
        if (routeCampaignId) useCampaigns.getState().selectCampaign(routeCampaignId);
        useCampaigns.getState().selectLevel(routeLevelId);
        const level = useCampaigns.getState().levels[routeLevelId] ?? null;
        setRouteLevel(level);
        startOrResume(level?.id ?? null, level);
        setBoardSettled(true);
      })
      .catch(() => { startOrResume(routeLevelId, null); setBoardSettled(true); });
    return () => { active = false; };
  }, [newSkirmish, resumeMatch, isTestPlay, routeBoard, routeMap, routeObjective, routeCampaignId, routeLevel, routeLevelId, routeLobby]);

  // Multiplayer entry: `/play?lobby=<id>` enters a lobby's shared board. Both clients
  // build the SAME (level, seed) game; each side's moves relay through the lobby channel
  // and apply on the other client (no AI — see store.newNetMatch/applyRemoteMove). Runs
  // instead of the single-player effect above, which no-ops for lobby routes.
  useEffect(() => {
    if (!routeLobby) return undefined;
    let active = true;
    let unsubscribe: (() => void) | null = null;
    setMatchPersistenceEnabled(false);

    // Apply a relayed move iff it's the next one this board expects. `i < moveCount` is an
    // already-applied move or this client's own echo (ignored); `i > moveCount` means we
    // missed some — backfill the gap. The `i === moveCount` guard makes every path
    // idempotent, so streamed frames and backfill can race safely.
    const applyRelayMove = (m: MoveEvent): void => {
      const before = useSkirmish.getState().net?.moveCount ?? 0;
      if (m.i === before) {
        useSkirmish.getState().applyRemoteMove(m.pieceId, m.move);
        const after = useSkirmish.getState().net?.moveCount ?? 0;
        if (after === before) {
          // The expected next move could NOT be applied (a genuine desync / version skew).
          // Do not loop re-fetching the same doomed move — halt sync and surface it, so we
          // never enter the infinite-backfill trap.
          console.error('[netplay] desync: relayed move', m.i, 'could not apply; halting sync');
          setNetError('This match lost sync and can’t continue — restart it from the lobby.');
          if (unsubscribe) { unsubscribe(); unsubscribe = null; }
          return;
        }
        if (active) setNetError(null); // progress resumed — clear any transient send error
      } else if (m.i > before) {
        // A real gap (missed frames) — backfill. Only reachable when moveCount is genuinely
        // behind, never when it's stuck on an un-appliable move (guarded above).
        fetchMovesSince(routeLobby, before)
          .then((res) => { if (active) res.moves.forEach(applyRelayMove); })
          .catch((err) => console.warn('[netplay] move backfill failed', err));
      }
      // m.i < before: already applied (duplicate delivery) — ignore.
    };

    fetchLobby(routeLobby)
      .then(async ({ lobby }) => {
        if (!active) return;
        if (lobby.phase !== 'started' || lobby.level_id === null || lobby.seed === null) {
          setNetError('This match hasn’t started yet. Returning to lobbies…');
          window.setTimeout(() => { if (active) navigateApp('/lobbies', { replace: true }); }, 1400);
          return;
        }
        await ensureCampaignsHydrated();
        if (!active) return;
        const level = useCampaigns.getState().levels[lobby.level_id] ?? null;
        if (!level) { setNetError('This match’s level isn’t available on your client.'); return; }
        const seat: Side = lobby.your_side === 'enemy' ? 'enemy' : 'player';
        useSkirmish.getState().newNetMatch({ lobbyId: routeLobby, localSide: seat, level, seed: lobby.seed });
        // Relay this client's local moves to the lobby channel. Server-sequenced: the move
        // applies here only when it echoes back, so a failed POST is a no-op the seat retries.
        setNetMoveSink((pieceId, move) => {
          postMove(routeLobby, pieceId, move).catch((err) => {
            console.warn('[netplay] relay POST failed', err);
            if (active) setNetError('Move didn’t send — check your connection and try again.');
          });
        });
        // Relay a resignation the same way: the game ends only when the server's result
        // frame echoes back (onLobby → concludeNet), so a failed POST is a retryable no-op.
        setNetResignSink(() => {
          resignLobby(routeLobby).catch((err) => {
            console.warn('[netplay] resign POST failed', err);
            if (active) setNetError('Couldn’t send your resignation — try again.');
          });
        });
        // Catch up on any moves already made (reconnect / entering mid-game), then stream.
        try {
          const back = await fetchMovesSince(routeLobby, 0);
          if (active) back.moves.forEach(applyRelayMove);
        } catch (err) { console.warn('[netplay] initial backfill failed', err); }
        if (!active) return;
        // If the match was already conceded before we entered (late join / reload after a
        // resign), the lobby snapshot carries the terminal result — end the game now. The
        // SSE connect frame re-delivers it too, but concludeNet is idempotent.
        if (lobby.result) useSkirmish.getState().concludeNet(lobby.result.winner, lobby.result.reason);
        unsubscribe = subscribeLobbyChannel(routeLobby, {
          onMove: applyRelayMove,
          onLobby: (l) => {
            if (!active) return;
            if (l.phase === 'closed') {
              // The lobby is gone (host left / closed). Don't just banner and strand the
              // guest on a dead board — tear down the stream and return them to the lobby
              // list, mirroring the "not started yet" bail-out above.
              setNetError('The other player left the match. Returning to lobbies…');
              if (unsubscribe) { unsubscribe(); unsubscribe = null; }
              window.setTimeout(() => { if (active) navigateApp('/lobbies', { replace: true }); }, 1600);
              return;
            }
            // Reconnect gap-heal: this snapshot fires on every (re)connect. If the server has
            // more moves than we've applied, a move frame was missed during a drop — backfill
            // it (applyRelayMove is idempotent on moveCount, so this races safely).
            const mc = useSkirmish.getState().net?.moveCount ?? 0;
            if (l.move_count > mc) {
              fetchMovesSince(routeLobby, mc)
                .then((res) => { if (active) res.moves.forEach(applyRelayMove); })
                .catch((err) => console.warn('[netplay] reconnect backfill failed', err));
            }
            // A player resigned: the lobby frame carries the terminal result. End the game
            // from this seat (concludeNet is idempotent, so a redelivered frame is harmless).
            if (l.result) useSkirmish.getState().concludeNet(l.result.winner, l.result.reason);
          },
        });
        setBoardSettled(true);
      })
      .catch((err) => {
        if (!active) return;
        console.warn('[netplay] failed to load lobby', err);
        setNetError('Couldn’t load this lobby.');
      });

    return () => {
      active = false;
      setNetMoveSink(null);
      setNetResignSink(null);
      if (unsubscribe) unsubscribe();
    };
  }, [routeLobby]);

  const screenStyle = {
    '--skirmish-world-bg': `url("${DEFAULT_BACKGROUND_SET.world}")`,
  } as CSSProperties;

  return (
    <div data-testid="skirmish" className="skirmish-screen" style={screenStyle}>
      {/* Title bar lives in the app shell now; the in-game live status portals into its
          center section (turn/objective read from the game store, in scope here). The
          brand + account cluster are rendered by the shell bar itself. */}
      <TitleBarSlot region="center">
        {/* Timed games put the battle clock in the middle; the turn plate and objective
            chips flank it left and right (they simply sit adjacent when untimed). */}
        <div className="skirmish-topbar-status">
          <div className="skirmish-status-chip skirmish-turn-plate">
            <strong>{turnLabel}</strong>
            <small>{game.winner ? 'Skirmish Complete' : 'Live Board'}</small>
          </div>
          {clock ? (
            <div className={`skirmish-status-chip skirmish-clock${clock.remainingMs <= 20_000 ? ' is-low' : ''}`}>
              <strong>{formatClockMs(clock.remainingMs)}</strong>
              <small>{clock.incrementMs > 0 ? `+${clock.incrementMs / 1000}s / move` : 'Battle Clock'}</small>
            </div>
          ) : null}
          <div className="skirmish-status-chip skirmish-objective">
            <span className="skirmish-icon skirmish-icon-flag" aria-hidden="true" />
            <span>
              <strong>Objective</strong>
              <small>{objectiveGoal}</small>
            </span>
          </div>
        </div>
      </TitleBarSlot>

      <section className="skirmish-war-room" aria-label="Skirmish battlefield">
        <div className="skirmish-field">
          <div className="skirmish-board-frame">
            {mapError ? (
              <div className="skirmish-status-chip skirmish-turn-plate" role="alert" style={{ gap: 10 }}>
                <strong>{mapError}</strong>
                <NavButton className="app-header-button app-header-button-active" to="/">Home</NavButton>
              </div>
            ) : boardSettled ? <SkirmishBoard /> : routeLobby ? (
              <div className="skirmish-status-chip skirmish-turn-plate" role="status">
                <strong>{netError ?? 'Connecting…'}</strong>
                <small>Multiplayer</small>
              </div>
            ) : routeMap ? (
              // A cold shared-map link fetches its snapshot before the board can mount.
              <div className="skirmish-status-chip skirmish-turn-plate" role="status">
                <strong>Loading map…</strong>
                <small>Shared map</small>
              </div>
            ) : null}
          </div>
        </div>
        {/* Transient connection errors sit bottom-center — but once the match is decided
            they're moot, and the post-game chip owns that spot, so suppress them then. */}
        {boardSettled && netError && !game.winner ? (
          <div className="skirmish-status-chip skirmish-turn-plate" role="status" style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 40 }}>
            <strong>{netError}</strong>
            <small>Multiplayer</small>
          </div>
        ) : null}
      </section>
      <SkirmishHud
        canStartNewSkirmish={!isCampaignPlay}
        onRestartLevel={isCampaignPlay && routeLevel ? replayLevel : null}
        showRestartLevel={isCampaignPlay}
      />

      {isCampaignPlay && routeLevel && game.winner && (
        <div className="campaign-result" role="dialog" aria-modal="true" aria-label="Battle result" data-testid="campaign-result">
          <div className="settings-frame campaign-result-panel">
            <h2>{game.winner === 'player' ? 'Victory' : game.winner === 'draw' ? 'Stalemate' : 'Defeat'}</h2>
            {game.winner === 'player' && <ResultStars count={stars} />}
            <p>{routeLevel.name} — {objectiveGoal}</p>
            <div className="campaign-result-actions">
              <button type="button" className="app-header-button" onClick={replayLevel}>
                {game.winner === 'player' ? 'Replay' : 'Retry'}
              </button>
              {game.winner === 'player' && nextLevel ? (
                <button type="button" className="app-header-button app-header-button-active" onClick={advanceToNextLevel}>
                  Continue
                </button>
              ) : (
                <NavButton className="app-header-button app-header-button-active" to={`/campaign/${routeCampaignId}`}>
                  Back to Campaign
                </NavButton>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Netplay has no campaign result flow: a decided match gets its own result card with
          the way out (leaving via the app-shell nav was the only prior option). "View board"
          dismisses it to review the final position, leaving the persistent exit chip below. */}
      {net && game.winner && !netResultDismissed && (
        <div className="campaign-result" role="dialog" aria-modal="true" aria-label="Match result" data-testid="netplay-result">
          <div className="settings-frame campaign-result-panel">
            <h2>{turnLabel}</h2>
            <p>Multiplayer skirmish — {objectiveGoal}</p>
            <div className="campaign-result-actions">
              <button type="button" className="app-header-button" data-testid="netplay-view-board" onClick={() => setNetResultDismissed(true)}>
                View board
              </button>
              <button type="button" className="app-header-button app-header-button-active" data-testid="netplay-return" onClick={returnToLobbies}>
                Return to lobbies
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent, non-blocking exit once the result card is dismissed — so reviewing the
          final board never strands the player without a way back to the lobby list. */}
      {net && game.winner && netResultDismissed && (
        <div
          role="status"
          style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 40, display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <div className="skirmish-status-chip skirmish-turn-plate">
            <strong>{turnLabel}</strong>
            <small>Match complete</small>
          </div>
          <button type="button" className="app-header-button app-header-button-active" data-testid="netplay-return-persistent" onClick={returnToLobbies}>
            Return to lobbies
          </button>
        </div>
      )}
    </div>
  );
}
