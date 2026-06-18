#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Phase 8 — Blue/Green Deploy Script
#
# Usage:
#   ./deploy/blue-green-deploy.sh <IMAGE_TAG>
#
# Required env vars:
#   CONTAINER_RUNTIME  — docker (default) or podman
#   HEALTH_URL         — URL to poll for readiness (default: http://localhost:8080/health)
#   PORT_BLUE          — host port for the blue slot (default: 8080)
#   PORT_GREEN         — host port for the green slot (default: 8081)
#   DATA_DIR           — path to the data directory (default: ./data)
#
# What it does:
#   1. Detect which slot (blue/green) is currently "live" (serving PORT_BLUE).
#   2. Start the new image in the idle slot on PORT_GREEN.
#   3. Wait for the new slot to pass health checks.
#   4. Atomically swap traffic: re-map PORT_BLUE to the new container
#      by stopping old and re-starting new on PORT_BLUE.
#   5. Remove the old container.
#
# This approach requires no external load balancer for single-host deployments.
# For Kubernetes: use a standard rolling update — this script is for bare-metal
# or single-VM production environments.
# ---------------------------------------------------------------------------

set -euo pipefail

TAG="${1:?Usage: $0 <IMAGE_TAG>}"
IMAGE="conductor-agent:${TAG}"

RUNTIME="${CONTAINER_RUNTIME:-docker}"
HEALTH_URL="${HEALTH_URL:-http://localhost:8080/health}"
PORT_BLUE="${PORT_BLUE:-8080}"
PORT_GREEN="${PORT_GREEN:-8081}"
DATA_DIR="${DATA_DIR:-$(pwd)/data}"

# Maximum seconds to wait for the new container to become healthy
HEALTH_TIMEOUT=60
# Interval between health check attempts (seconds)
HEALTH_INTERVAL=3

BLUE_NAME="conductor-blue"
GREEN_NAME="conductor-green"

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

container_running() {
  "$RUNTIME" ps --format '{{.Names}}' 2>/dev/null | grep -qx "$1"
}

container_exists() {
  "$RUNTIME" ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$1"
}

wait_healthy() {
  local url="$1"
  local deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
  log "Waiting for health at ${url} (timeout ${HEALTH_TIMEOUT}s)..."

  while [[ $(date +%s) -lt $deadline ]]; do
    local body
    body=$(curl -sf --max-time 3 "${url}" 2>/dev/null || true)
    if echo "${body}" | grep -q '"status":"UP"'; then
      log "Health check passed."
      return 0
    fi
    sleep "$HEALTH_INTERVAL"
  done

  log "ERROR: Health check timed out after ${HEALTH_TIMEOUT}s."
  return 1
}

run_slot() {
  local name="$1"
  local port="$2"

  mkdir -p "${DATA_DIR}"

  "$RUNTIME" run -d \
    --name "${name}" \
    --restart unless-stopped \
    -p "${port}:8080" \
    -v "${DATA_DIR}:/data" \
    -e "NODE_ENV=production" \
    -e "DB_PATH=/data/agent-mesh.db" \
    -e "PORT=8080" \
    "${IMAGE}"
  log "Started container ${name} on port ${port}."
}

stop_slot() {
  local name="$1"
  if container_running "$name"; then
    log "Stopping ${name}..."
    "$RUNTIME" stop --time 15 "$name" || true
  fi
  if container_exists "$name"; then
    "$RUNTIME" rm -f "$name" || true
  fi
}

# ---------------------------------------------------------------------------
# Determine live slot
# ---------------------------------------------------------------------------

log "=== Conductor Blue/Green Deploy ==="
log "Image : ${IMAGE}"
log "Runtime: ${RUNTIME}"

LIVE_SLOT=""
IDLE_SLOT=""
IDLE_PORT=""

if container_running "$BLUE_NAME"; then
  LIVE_SLOT="$BLUE_NAME"
  IDLE_SLOT="$GREEN_NAME"
  IDLE_PORT="$PORT_GREEN"
elif container_running "$GREEN_NAME"; then
  LIVE_SLOT="$GREEN_NAME"
  IDLE_SLOT="$BLUE_NAME"
  IDLE_PORT="$PORT_BLUE"
else
  # Cold start — nothing is running
  log "No live slot detected. Cold-starting on blue slot."
  run_slot "$BLUE_NAME" "$PORT_BLUE"
  wait_healthy "${HEALTH_URL}"
  log "=== Deploy complete (cold start) ==="
  exit 0
fi

log "Live slot  : ${LIVE_SLOT}"
log "Idle slot  : ${IDLE_SLOT} (port ${IDLE_PORT})"

# Clean up any leftover idle container
stop_slot "$IDLE_SLOT"

# ---------------------------------------------------------------------------
# Bring up the new container in the idle slot
# ---------------------------------------------------------------------------

run_slot "$IDLE_SLOT" "$IDLE_PORT"
IDLE_HEALTH="http://localhost:${IDLE_PORT}/health"
wait_healthy "$IDLE_HEALTH"

# ---------------------------------------------------------------------------
# Traffic cutover: stop live, restart idle on the live port
# ---------------------------------------------------------------------------

log "Cutting over traffic from ${LIVE_SLOT} to ${IDLE_SLOT}..."

stop_slot "$LIVE_SLOT"
stop_slot "$IDLE_SLOT"

# Determine which name/port becomes the new live
NEW_LIVE_NAME="$IDLE_SLOT"
NEW_LIVE_PORT="$PORT_BLUE"  # Always expose on the blue (canonical) port

run_slot "$NEW_LIVE_NAME" "$NEW_LIVE_PORT"
wait_healthy "${HEALTH_URL}"

log "=== Deploy complete. New live: ${NEW_LIVE_NAME} on port ${NEW_LIVE_PORT} ==="
