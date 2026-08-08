import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { readAdminBattleHref } from '../admin/battleRoute';
import { type AdminBattleMode } from '../game/store';
import { useSkirmish } from '../game/SkirmishStoreContext';
import { authorizeAdminPlaytest } from '../net/adminPlaytest';
import { acquireLipsanon, GOLD_SCALE, grantGold, LIPSANON_BY_ID, RUN_LIPSANA, type LipsanonId } from '../run/model';
import { useActiveRun } from '../run/store';
import { navigateApp, readValidatedReturnTo } from './navigation';
import { RunGoldIcon } from './RunResources';
import { SettingsButton, SettingsRow, SettingsSection } from './shared/SettingsControls';
import { HouseSelect, type HouseSelectOption } from './shared/HouseSelect';
import { InnerChromeBox } from './shared/ChromeBox';

type LipsanonChoice = LipsanonId | '';

export function AdminControls({
  authReady,
  isAdmin,
  presentation = 'settings',
  onBattleArmed,
}: {
  authReady: boolean;
  isAdmin: boolean;
  presentation?: 'settings' | 'battle';
  onBattleArmed?: (mode: AdminBattleMode) => void;
}): ReactElement {
  const started = useSkirmish((state) => state.started);
  const winner = useSkirmish((state) => state.game.winner);
  const net = useSkirmish((state) => state.net);
  const pendingPromotion = useSkirmish((state) => state.pendingPromotion);
  const armAdminMode = useSkirmish((state) => state.armAdminMode);
  const run = useActiveRun((state) => state.run);
  const runHydrated = useActiveRun((state) => state.hydrated);
  const hydrateRun = useActiveRun((state) => state.hydrate);
  const replaceRun = useActiveRun((state) => state.replace);
  const [goldAmount, setGoldAmount] = useState('5');
  const [lipsanonId, setLipsanonId] = useState<LipsanonChoice>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (isAdmin && !runHydrated) void hydrateRun();
  }, [hydrateRun, isAdmin, runHydrated]);

  const battleHref = readAdminBattleHref(readValidatedReturnTo());
  const activeBattle = started && !winner;
  const battleUnavailable = !activeBattle
    || Boolean(net)
    || Boolean(pendingPromotion)
    || (presentation === 'settings' && !battleHref);
  const lipsanonOptions = useMemo<HouseSelectOption<LipsanonChoice>[]>(() => [
    { value: '', label: 'Choose a lipsanon' },
    ...RUN_LIPSANA
      .filter((lipsanon) => !run?.lipsana.includes(lipsanon.id))
      .map((lipsanon) => ({ value: lipsanon.id, label: lipsanon.name, title: lipsanon.description })),
  ], [run?.lipsana]);
  const selectedLipsanon = lipsanonId ? LIPSANON_BY_ID[lipsanonId] : null;

  const armBattleAction = async (mode: AdminBattleMode): Promise<void> => {
    if (battleUnavailable || !battleHref) return;
    setBusy(mode);
    setStatus('');
    try {
      await authorizeAdminPlaytest({ action: mode });
      if (!armAdminMode(mode)) throw new Error('The active Battle changed before the control could be armed.');
      if (presentation === 'battle') onBattleArmed?.(mode);
      else navigateApp(battleHref);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The administrator action could not be authorized.');
    } finally {
      setBusy(null);
    }
  };

  const gainGold = async (): Promise<void> => {
    if (!run) return;
    const amount = Number(goldAmount);
    const amountTenths = Math.round(amount * GOLD_SCALE);
    if (!Number.isFinite(amount) || amount <= 0 || amountTenths / GOLD_SCALE !== amount) {
      setStatus('Enter a positive gold amount in tenths.');
      return;
    }
    setBusy('gain-gold');
    setStatus('');
    try {
      await authorizeAdminPlaytest({ action: 'gain-gold', amountTenths });
      replaceRun(grantGold(run, amountTenths));
      setStatus(`Granted ${amount} gold.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Gold could not be granted.');
    } finally {
      setBusy(null);
    }
  };

  const gainLipsanon = async (): Promise<void> => {
    if (!run || !lipsanonId) return;
    setBusy('gain-lipsanon');
    setStatus('');
    try {
      await authorizeAdminPlaytest({
        action: 'gain-lipsanon',
        lipsanonId,
      });
      const granted = acquireLipsanon(run, lipsanonId);
      if (granted === run) throw new Error('That lipsanon could not be granted to the current Run.');
      replaceRun(granted);
      setStatus(`Granted ${LIPSANON_BY_ID[lipsanonId].name}.`);
      setLipsanonId('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The lipsanon could not be granted.');
    } finally {
      setBusy(null);
    }
  };

  if (!authReady) {
    if (presentation === 'battle') {
      return <InnerChromeBox className="skirmish-admin-access-note">Checking administrator access…</InnerChromeBox>;
    }
    return (
      <SettingsSection title="Administration">
        <SettingsRow title="Checking access" description="Confirming administrator authority." value={<span>Loading</span>} />
      </SettingsSection>
    );
  }

  if (!isAdmin) {
    if (presentation === 'battle') {
      return <InnerChromeBox className="skirmish-admin-access-note">Administrator access required.</InnerChromeBox>;
    }
    return (
      <SettingsSection title="Administration">
        <SettingsRow title="Administrator access required" description="This destination is available only to allowlisted playtest administrators." value={<span>Locked</span>} />
      </SettingsSection>
    );
  }

  const battleDescription = net
    ? 'Live multiplayer is server-sequenced; client-only interventions are disabled to prevent a desync.'
    : pendingPromotion
      ? 'Finish the current promotion choice before arming an intervention.'
      : !activeBattle
        ? 'Start or resume a Battle before using board controls.'
        : !battleHref
          ? 'Open Admin Controls from the active Battle so it has an exact return route.'
      : 'The active Battle is ready for a one-shot intervention.';

  if (presentation === 'battle') {
    return (
      <div className="skirmish-admin-controls" data-testid="battle-admin-controls">
        <div className="skirmish-view-group">
          <span className="skirmish-eyebrow">Battle</span>
          {battleUnavailable ? (
            <InnerChromeBox className="skirmish-admin-access-note">{battleDescription}</InnerChromeBox>
          ) : null}
          <div className="skirmish-admin-action-list">
            <InnerChromeBox className="skirmish-admin-action">
              <div>
                <strong>Free Move</strong>
                <small>Move one unit of either army anywhere, then return to normal play.</small>
              </div>
              <SettingsButton
                tone="primary"
                disabled={battleUnavailable || busy !== null}
                onClick={() => void armBattleAction('free-move')}
                data-testid="battle-admin-free-move"
              >
                Arm
              </SettingsButton>
            </InnerChromeBox>
            <InnerChromeBox className="skirmish-admin-action">
              <div>
                <strong>Kill Unit</strong>
                <small>Select any living unit; normal death and Reservist handling run.</small>
              </div>
              <SettingsButton
                tone="danger"
                disabled={battleUnavailable || busy !== null}
                onClick={() => void armBattleAction('kill-unit')}
                data-testid="battle-admin-kill-unit"
              >
                Arm
              </SettingsButton>
            </InnerChromeBox>
            <InnerChromeBox className="skirmish-admin-action">
              <div>
                <strong>Win Battle</strong>
                <small>Award victory while preserving every living player survivor.</small>
              </div>
              <SettingsButton
                tone="primary"
                disabled={battleUnavailable || busy !== null}
                onClick={() => void armBattleAction('win-battle')}
                data-testid="battle-admin-win-battle"
              >
                Win
              </SettingsButton>
            </InnerChromeBox>
          </div>
        </div>

        <div className="skirmish-view-group">
          <span className="skirmish-eyebrow">Active Run</span>
          <div className="skirmish-admin-action-list">
            <InnerChromeBox className="skirmish-admin-action skirmish-admin-action--stack">
              <div>
                <strong>Gain Gold</strong>
                <small>{run ? `Add gold to ${run.war.name}.` : 'Start a Run before granting gold.'}</small>
              </div>
              <div className="admin-control-inline">
                <InnerChromeBox as="span" className="admin-gold-field">
                  <input
                    className="admin-gold-input"
                    type="number"
                    min="0.1"
                    max="1000000"
                    step="0.1"
                    value={goldAmount}
                    disabled={!run || busy !== null}
                    onChange={(event) => setGoldAmount(event.target.value)}
                    aria-label="Gold amount"
                  />
                </InnerChromeBox>
                <SettingsButton
                  tone="primary"
                  disabled={!run || busy !== null}
                  onClick={() => void gainGold()}
                  data-testid="battle-admin-gain-gold"
                  data-ui-sfx="gold"
                >
                  <RunGoldIcon className="run-gold-icon--button" />
                  Grant
                </SettingsButton>
              </div>
            </InnerChromeBox>
            <InnerChromeBox className="skirmish-admin-action skirmish-admin-action--stack">
              <div>
                <strong>Gain Lipsanon</strong>
                <small>{selectedLipsanon?.description ?? (run ? 'Choose any lipsanon not currently held.' : 'Start a Run before granting a lipsanon.')}</small>
              </div>
              <div className="admin-control-stack">
                <HouseSelect
                  value={lipsanonId}
                  options={lipsanonOptions}
                  onChange={setLipsanonId}
                  ariaLabel="Lipsanon to grant"
                  disabled={!run || busy !== null}
                />
                <SettingsButton
                  tone="primary"
                  disabled={!run || !lipsanonId || busy !== null}
                  onClick={() => void gainLipsanon()}
                  data-testid="battle-admin-gain-lipsanon"
                >
                  Grant
                </SettingsButton>
              </div>
            </InnerChromeBox>
          </div>
        </div>
        {status ? <p className="admin-control-status" role="status">{status}</p> : null}
      </div>
    );
  }

  return (
    <>
      <SettingsSection title="Battle">
        <SettingsRow title="Battle status" description={battleDescription} value={<span>{battleUnavailable ? 'Unavailable' : 'Ready'}</span>} />
        <SettingsRow title="Free Move" description="Return to the board and move one unit of either army anywhere. Its own side's and neutral occupied squares remain blocked.">
          <SettingsButton
            tone="primary"
            disabled={battleUnavailable || busy !== null}
            onClick={() => void armBattleAction('free-move')}
            data-testid="admin-free-move"
          >
            Arm
          </SettingsButton>
        </SettingsRow>
        <SettingsRow title="Kill Unit" description="Return to the board and select any living unit. Normal death and Reservist handling still run.">
          <SettingsButton
            tone="danger"
            disabled={battleUnavailable || busy !== null}
            onClick={() => void armBattleAction('kill-unit')}
            data-testid="admin-kill-unit"
          >
            Arm
          </SettingsButton>
        </SettingsRow>
        <SettingsRow title="Win Battle" description="Award victory to the player. Every currently living player unit counts as a survivor.">
          <SettingsButton
            tone="primary"
            disabled={battleUnavailable || busy !== null}
            onClick={() => void armBattleAction('win-battle')}
            data-testid="admin-win-battle"
          >
            Win
          </SettingsButton>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Active Run">
        <SettingsRow
          title="Gain Gold"
          description={run ? `Add gold to ${run.war.name}. Enter an amount in tenths.` : 'Start a Run before granting gold.'}
        >
          <div className="admin-control-inline">
            <InnerChromeBox as="span" className="admin-gold-field">
              <input
                className="admin-gold-input"
                type="number"
                min="0.1"
                max="1000000"
                step="0.1"
                value={goldAmount}
                disabled={!run || busy !== null}
                onChange={(event) => setGoldAmount(event.target.value)}
                aria-label="Gold amount"
              />
            </InnerChromeBox>
            <SettingsButton
              tone="primary"
              disabled={!run || busy !== null}
              onClick={() => void gainGold()}
              data-testid="admin-gain-gold"
              data-ui-sfx="gold"
            >
              <RunGoldIcon className="run-gold-icon--button" />
              Grant
            </SettingsButton>
          </div>
        </SettingsRow>
        <SettingsRow
          title="Gain Lipsanon"
          description={selectedLipsanon?.description ?? (run ? 'Choose any lipsanon not currently held, including one already seen this Run.' : 'Start a Run before granting a lipsanon.')}
          tall
        >
          <div className="admin-control-stack">
            <HouseSelect
              value={lipsanonId}
              options={lipsanonOptions}
              onChange={setLipsanonId}
              ariaLabel="Lipsanon to grant"
              disabled={!run || busy !== null}
            />
            <SettingsButton
              tone="primary"
              disabled={!run || !lipsanonId || busy !== null}
              onClick={() => void gainLipsanon()}
              data-testid="admin-gain-lipsanon"
            >
              Grant
            </SettingsButton>
          </div>
        </SettingsRow>
      </SettingsSection>
      {status ? <p className="admin-control-status" role="status">{status}</p> : null}
    </>
  );
}
