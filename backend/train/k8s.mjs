// Create/delete Kubernetes Jobs from inside the cluster via the batch/v1 REST API,
// authenticated with the pod's mounted ServiceAccount token — no client-library
// dependency. The app SA needs RBAC to create/get/delete jobs in its namespace
// (granted by the Helm chart's Role/RoleBinding). A trainer Job runs THIS image with
// a different command (node backend/train-worker.mjs), on the tainted D8als_v7 pool,
// under the app's workload identity so it reaches Postgres passwordlessly.
import { readFileSync } from 'node:fs';
import https from 'node:https';

const SA_DIR = '/var/run/secrets/kubernetes.io/serviceaccount';
const read = (f) => { try { return readFileSync(`${SA_DIR}/${f}`); } catch { return undefined; } };

export function inCluster() {
  return read('token') !== undefined && !!process.env.TRAINER_IMAGE;
}

const namespace = () => (read('namespace')?.toString().trim()) || 'default';

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const token = read('token')?.toString().trim();
    if (!token) { reject(new Error('not running in-cluster (no serviceaccount token)')); return; }
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      host: process.env.KUBERNETES_SERVICE_HOST || 'kubernetes.default.svc',
      port: process.env.KUBERNETES_SERVICE_PORT || 443,
      path, method,
      ca: read('ca.crt'),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => {
        let parsed = {};
        try { parsed = out ? JSON.parse(out) : {}; } catch { /* non-json */ }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
        else reject(new Error(`k8s ${method} ${path} -> ${res.statusCode}: ${parsed.message || out}`));
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/** Launch a trainer Job for a train_runs row. Returns the Job name. */
export async function createTrainerJob(runId) {
  const ns = namespace();
  const name = `train-${String(runId).replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase()}-${Date.now().toString(36)}`;
  const job = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name, namespace: ns, labels: { app: 'chess-trainer', 'train-run': String(runId) } },
    spec: {
      backoffLimit: 0,
      ttlSecondsAfterFinished: 3600,
      activeDeadlineSeconds: 10800,
      template: {
        metadata: { labels: { app: 'chess-trainer', 'train-run': String(runId), 'azure.workload.identity/use': 'true' } },
        spec: {
          restartPolicy: 'Never',
          ...(process.env.TRAINER_SA ? { serviceAccountName: process.env.TRAINER_SA } : {}),
          nodeSelector: { workload: 'trainer' },
          tolerations: [{ key: 'workload', operator: 'Equal', value: 'trainer', effect: 'NoSchedule' }],
          containers: [{
            name: 'trainer',
            image: process.env.TRAINER_IMAGE,
            command: ['node', 'backend/train-worker.mjs'],
            env: [
              { name: 'TRAIN_RUN_ID', value: String(runId) },
              { name: 'POSTGRES_HOST', value: process.env.POSTGRES_HOST || '' },
              { name: 'POSTGRES_DATABASE', value: process.env.POSTGRES_DATABASE || '' },
              { name: 'POSTGRES_USER', value: process.env.POSTGRES_USER || '' },
            ],
            resources: { requests: { cpu: '6', memory: '3Gi' }, limits: { cpu: '8', memory: '6Gi' } },
          }],
        },
      },
    },
  };
  await apiRequest('POST', `/apis/batch/v1/namespaces/${ns}/jobs`, job);
  return name;
}

/** Delete a trainer Job (and its pods) — cancels a run. Idempotent-ish (404 ok). */
export async function deleteTrainerJob(name) {
  try {
    await apiRequest('DELETE', `/apis/batch/v1/namespaces/${namespace()}/jobs/${name}?propagationPolicy=Background`, null);
  } catch (e) {
    if (!/-> 404/.test(String(e && e.message))) throw e;
  }
}
