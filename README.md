# `prod` — deploy-state branch (orphan, do not develop here)

This long-lived **orphan** branch is DEPLOY STATE, not source. It carries only the
Kubernetes/Helm deploy manifests (`k8s/`) that ArgoCD renders into the cluster.

- **Source lives on `main`** (PR-gated / protected). Never open feature PRs here.
- The Build-and-Deploy pipeline bumps the image tag in `k8s/values.yaml` **here**,
  not on `main` — so `main` can stay protected and CI-gated.
- ArgoCD's Application (in the infra-bootstrap repo) tracks this branch's `targetRevision`.
