import { getAccountRunProgression, putAccountRunProgression } from '../net/runProgression';
import {
  RUN_PROGRESSION_EVENT,
  mergeRunProgression,
  readRunProgression,
  writeRunProgression,
} from './progression';

let started = false;
let accountLinked = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

function schedulePush(): void {
  if (!accountLinked) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { void putAccountRunProgression(readRunProgression()); }, 800);
}

export async function initRunProgressionSync(): Promise<void> {
  if (started) return;
  started = true;
  const remote = await getAccountRunProgression();
  if (remote === null) return;
  const merged = mergeRunProgression(readRunProgression(), remote);
  window.addEventListener(RUN_PROGRESSION_EVENT, schedulePush);
  accountLinked = true;
  writeRunProgression(merged);
  await putAccountRunProgression(merged);
}

export function __resetRunProgressionSyncForTests(): void {
  started = false;
  accountLinked = false;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = undefined;
}
