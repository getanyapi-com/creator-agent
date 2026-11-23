#!/usr/bin/env bash
# Deploy the current commit to the hosted Container App by hand, the same path
# .github/workflows/deploy.yml takes once the GitHub repository exists.
#
#   RESOURCE_GROUP=creator-agent-prod scripts/deploy-manual.sh
#
# scripts/build-image.sh builds and pushes the image with the Server Actions key
# from deploy/actions-key.env, and stops if that file has none.
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:?set RESOURCE_GROUP, e.g. creator-agent-prod}"
BASE="${BASE:-$RESOURCE_GROUP}"
APP_NAME="${APP_NAME:-$BASE-app}"
ACR_NAME="${ACR_NAME:-$(printf '%s' "$BASE" | tr -cd 'a-z0-9')acr}"
IMAGE_REPO="${IMAGE_REPO:-creator-agent}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
  echo "The working tree is dirty; commit first so the tag names what is deployed." >&2
  exit 1
fi

SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
TAG="$ACR_NAME.azurecr.io/$IMAGE_REPO:$SHA"
SUFFIX="s$(printf '%s' "$SHA" | cut -c1-8)"

"$REPO_ROOT/scripts/build-image.sh" "$ACR_NAME" "$IMAGE_REPO:$SHA" "$SHA"
az containerapp update -n "$APP_NAME" -g "$RESOURCE_GROUP" \
  --image "$TAG" --revision-suffix "$SUFFIX" -o none

REVISION="$APP_NAME--$SUFFIX"
until state="$(az containerapp revision show -n "$APP_NAME" -g "$RESOURCE_GROUP" \
    --revision "$REVISION" --query properties.runningState -o tsv)" \
    && { [ "$state" = "Running" ] || [ "$state" = "RunningAtMaxScale" ] || [ "$state" = "Failed" ]; }; do
  echo "revision $REVISION is $state"
  sleep 15
done
echo "revision $REVISION is $state"
[ "$state" != "Failed" ]

APP_URL="$(az containerapp show -n "$APP_NAME" -g "$RESOURCE_GROUP" \
  --query "properties.template.containers[0].env[?name=='APP_URL'].value | [0]" -o tsv)"
curl -sf -o /dev/null "$APP_URL/api/health" && echo "healthy $APP_URL"
