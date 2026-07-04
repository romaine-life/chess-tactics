// worker_threads worker: run ONE full SPSA tune (a "restart") with a distinct seed
// and hand back its champion. Parallel restarts are how the cluster Job uses its 8
// cores — each core explores an independent trajectory, and the main process keeps
// the best. Reuses the verified, deterministic runTuning from the engine bundle
// unchanged, so a restart replays identically for a given (level, cfg, masterSeed).
import { parentPort, workerData } from 'node:worker_threads';
import { runTuning } from '../../frontend/trainer-bundle/engine.mjs';

const { level, cfg } = workerData;
const result = runTuning(level, cfg);
const last = result.trajectory.length ? result.trajectory[result.trajectory.length - 1] : null;
parentPort.postMessage({
  champion: result.champion,
  finalScore: last ? last.score : 0.5,
  steps: result.trajectory.length,
  stepsSinceImprovement: result.stepsSinceImprovement,
});
