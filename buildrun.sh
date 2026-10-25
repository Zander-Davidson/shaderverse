#!/usr/bin/env bash
# Builds SHADERVERSE into a Docker image and runs it, serving the app at
# http://localhost:$PORT (default 8080).
#
#   ./buildrun.sh            build and run in the foreground (Ctrl+C stops it)
#   PORT=9000 ./buildrun.sh  use another port
#   ./buildrun.sh --detach   run in the background; stop with: docker stop shaderverse
#   ./buildrun.sh --open     also open the app in your default browser

set -euo pipefail

IMAGE="${IMAGE:-shaderverse}"
NAME="${NAME:-shaderverse}"
PORT="${PORT:-8080}"
DETACH=false
OPEN=false

for arg in "$@"; do
  case "$arg" in
    -d|--detach) DETACH=true ;;
    -o|--open) OPEN=true ;;
    -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. Get it from https://docs.docker.com/get-docker/" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "The Docker daemon is not running. Start Docker Desktop (or dockerd) and try again." >&2
  exit 1
fi

echo "==> Building image '$IMAGE'"
docker build -t "$IMAGE" .

# Replace a previous container with the same name.
if docker ps -aq --filter "name=^/${NAME}$" | grep -q .; then
  echo "==> Removing existing container '$NAME'"
  docker rm -f "$NAME" >/dev/null
fi

URL="http://localhost:${PORT}"
open_browser() {
  # Wait for the server, then open it.
  for _ in $(seq 1 30); do
    if curl -fs "$URL" >/dev/null 2>&1; then break; fi
    sleep 0.5
  done
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1
  else echo "Open $URL in your browser."
  fi
}

if $DETACH; then
  docker run -d --rm --name "$NAME" -p "${PORT}:80" "$IMAGE" >/dev/null
  echo "==> SHADERVERSE is running at $URL"
  echo "    Stop it with: docker stop $NAME"
  if $OPEN; then open_browser; fi
else
  echo "==> SHADERVERSE will be available at $URL (Ctrl+C to stop)"
  if $OPEN; then open_browser & fi
  docker run --rm --name "$NAME" -p "${PORT}:80" "$IMAGE"
fi
