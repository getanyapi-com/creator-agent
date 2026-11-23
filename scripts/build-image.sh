#!/usr/bin/env bash
# Build the app image on this machine and push it to the Container Apps
# registry. The one place both scripts/azure-provision.sh (the first image) and
# scripts/deploy-manual.sh (every later one) build an image.
#
#   scripts/build-image.sh [--make-key] <registry name> <repo:tag> <deployment id>
#
# Container Apps run linux/amd64. A build on an Apple Silicon Mac defaults to
# arm64, which pushes fine and then fails to pull with "not found", so the
# platform is pinned here rather than remembered.
#
# The build is given the Server Actions key the deploy workflow uses, or every
# Server Action id changes and each open tab breaks on its next click (Clerk's
# provider calls one when the session changes). It is the repository secret of
# the same name, and its copy lives in this checkout's gitignored
# deploy/actions-key.env (README, "Let GitHub deploy"). It is read, never
# generated, unless --make-key is given and the file does not exist yet: only
# the first build of a new instance may make it. The key is never printed and
# never an argument; docker reads it from the environment.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY_FILE="$REPO_ROOT/deploy/actions-key.env"

MAKE_KEY=false
if [ "${1:-}" = "--make-key" ]; then MAKE_KEY=true; shift; fi
if [ $# -ne 3 ]; then
  sed -n '6p' "${BASH_SOURCE[0]}" >&2
  exit 2
fi
REGISTRY="$1" IMAGE_REF="$2" DEPLOYMENT_ID="$3"

if $MAKE_KEY && [ ! -e "$KEY_FILE" ]; then
  (umask 077; mkdir -p "$(dirname "$KEY_FILE")"
   printf 'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=%s\n' "$(openssl rand -base64 32)" > "$KEY_FILE")
  echo "made a new Server Actions key in $KEY_FILE; give GitHub the same value (README, \"Let GitHub deploy\")"
fi

NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$( { sed -n 's/^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=//p' "$KEY_FILE" 2>/dev/null || true; } | tail -n 1)"
if [ -z "$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY" ]; then
  echo "No NEXT_SERVER_ACTIONS_ENCRYPTION_KEY= line in $KEY_FILE. Save the key the deploy workflow uses there (README, \"Let GitHub deploy\")." >&2
  exit 2
fi
export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY

TAG="$REGISTRY.azurecr.io/$IMAGE_REF"
az acr login --name "$REGISTRY"
docker build --platform linux/amd64 -t "$TAG" \
  --secret id=actions_key,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
  --build-arg NEXT_DEPLOYMENT_ID="$DEPLOYMENT_ID" "$REPO_ROOT"
docker push "$TAG"
