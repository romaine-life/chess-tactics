#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage: image-fingerprint.sh --image NAME --dockerfile PATH --context PATH --paths "PATH [PATH ...]" [--platform PLATFORM] [--base-images "IMAGE [IMAGE ...]"]

Computes a stable image-input fingerprint from tracked files, Docker build
metadata, and resolved base image digests. Writes fingerprint, proof_tag, and
proof_ref to $GITHUB_OUTPUT when present.
EOF
}

image=""
dockerfile=""
context=""
paths=""
proof_repository="${PROOF_REPOSITORY:-chess-tactics}"
registry_server="${REGISTRY_SERVER:-romainecr.azurecr.io}"
include_base_digests="${INCLUDE_BASE_DIGESTS:-true}"
build_platform="${BUILD_PLATFORM:-linux/amd64}"
base_images=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image)
      image="${2:-}"
      shift 2
      ;;
    --dockerfile)
      dockerfile="${2:-}"
      shift 2
      ;;
    --context)
      context="${2:-}"
      shift 2
      ;;
    --paths)
      paths="${2:-}"
      shift 2
      ;;
    --proof-repository)
      proof_repository="${2:-}"
      shift 2
      ;;
    --registry-server)
      registry_server="${2:-}"
      shift 2
      ;;
    --platform)
      build_platform="${2:-}"
      shift 2
      ;;
    --base-images)
      base_images="${2:-}"
      shift 2
      ;;
    --no-base-digests)
      include_base_digests="false"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "${image}" || -z "${dockerfile}" || -z "${context}" || -z "${paths}" || -z "${build_platform}" ]]; then
  usage
  exit 2
fi

if [[ ! -f "${dockerfile}" ]]; then
  echo "Dockerfile '${dockerfile}' does not exist" >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT
manifest="${tmp}/manifest.txt"
: >"${manifest}"

for path in ${paths}; do
  if [[ "${path}" == "." ]]; then
    git ls-files -z \
      | sort -z \
      | xargs -0 sha256sum >>"${manifest}"
  elif [[ -d "${path}" ]]; then
    git ls-files -z -- "${path}" \
      | sort -z \
      | xargs -0 sha256sum >>"${manifest}"
  elif [[ -f "${path}" ]]; then
    sha256sum "${path}" >>"${manifest}"
  else
    echo "Fingerprint input '${path}' does not exist" >&2
    exit 1
  fi
done

{
  printf 'image=%s\n' "${image}"
  printf 'dockerfile=%s\n' "${dockerfile}"
  printf 'context=%s\n' "${context}"
  printf 'platform=%s\n' "${build_platform}"
  printf 'buildx=docker/build-push-action@v7\n'
  printf 'buildx-version=%s\n' "$(docker buildx version | tr -s '[:space:]' ' ')"
  sha256sum scripts/image-fingerprint.sh
} >>"${manifest}"

if [[ "${include_base_digests}" == "true" ]]; then
  resolved_base_ref=""
  resolved_base_count=0
  while IFS= read -r base_image; do
    digest="$(docker buildx imagetools inspect "${base_image}" --format '{{json .Manifest.Digest}}' | tr -d '"')"
    if [[ ! "${digest}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
      echo "Unable to resolve immutable digest for base image '${base_image}'" >&2
      exit 1
    fi
    printf 'base=%s@%s\n' "${base_image}" "${digest}" >>"${manifest}"
    resolved_base_ref="${base_image}@${digest}"
    resolved_base_count=$((resolved_base_count + 1))
  done < <(
    if [[ -n "${base_images}" ]]; then
      for base_image in ${base_images}; do
        printf '%s\n' "${base_image}"
      done | sort -u
    else
      awk '
        BEGIN { IGNORECASE = 1 }
        $1 == "FROM" {
          image = ""
          for (i = 2; i <= NF; i++) {
            if ($i !~ /^--/) {
              image = $i
              break
            }
          }
          if (image != "" && tolower(image) != "scratch") print image
        }
      ' "${dockerfile}" | sort -u
    fi
  )
  if [[ "${resolved_base_count}" -eq 1 ]]; then
    echo "resolved_base_ref=${resolved_base_ref}"
  fi
fi

fingerprint="$(sha256sum "${manifest}" | cut -d' ' -f1)"
proof_tag="${image}-${fingerprint}"
proof_ref="${registry_server}/${proof_repository}:${proof_tag}"

echo "fingerprint=${fingerprint}"
echo "proof_tag=${proof_tag}"
echo "proof_ref=${proof_ref}"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "fingerprint=${fingerprint}"
    echo "proof_tag=${proof_tag}"
    echo "proof_ref=${proof_ref}"
    if [[ "${include_base_digests}" == "true" && "${resolved_base_count:-0}" -eq 1 ]]; then
      echo "resolved_base_ref=${resolved_base_ref}"
    fi
  } >>"${GITHUB_OUTPUT}"
fi
