#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/setup.mjs
npm run check
npm test
if docker compose ps --status running --services | grep -q '^app$'; then
  docker compose exec -T app node scripts/backup.mjs
  previous_container=$(docker compose ps -q app)
  previous_image=$(docker inspect --format '{{.Image}}' "$previous_container")
  docker image tag "$previous_image" laviste:previous
fi
DOCKER_BUILDKIT=${DOCKER_BUILDKIT:-0} docker build -t "laviste:${RELEASE_TAG:-local}" .
if ! docker compose up -d --no-build --wait --wait-timeout 120; then
  if docker image inspect laviste:previous >/dev/null 2>&1; then
    RELEASE_TAG=previous docker compose up -d --no-build --wait --wait-timeout 120
  fi
  exit 1
fi
curl --fail --silent http://127.0.0.1:3474/api/health
