#!/usr/bin/env bash
# Local GROBID for field eval only (127.0.0.1, CRF models, no external lookups).
#   scripts/grobid-local.sh start|stop|status
# Source and build live in ~/.cache/versio-grobid (outside the repo). Apache-2.0.
set -euo pipefail

VERSION="0.9.1"
CACHE="${HOME}/.cache/versio-grobid"
SRC="${CACHE}/grobid-${VERSION}"
PIDFILE="${CACHE}/grobid.pid"
LOG="${CACHE}/grobid.log"
URL="http://127.0.0.1:8070"

java_home() {
  if command -v brew >/dev/null && [ -d "$(brew --prefix openjdk@21 2>/dev/null)" ]; then
    echo "$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
  elif /usr/libexec/java_home -v 21 >/dev/null 2>&1; then
    /usr/libexec/java_home -v 21
  else
    echo "Java 21 is required: brew install openjdk@21" >&2
    exit 1
  fi
}

alive() { curl -sf "${URL}/api/isalive" >/dev/null 2>&1; }

case "${1:-status}" in
  start)
    if alive; then echo "GROBID already running at ${URL}"; exit 0; fi
    mkdir -p "${CACHE}"
    if [ ! -d "${SRC}" ]; then
      curl -sfL "https://github.com/grobidOrg/grobid/archive/refs/tags/${VERSION}.tar.gz" -o "${CACHE}/grobid.tar.gz"
      tar -xzf "${CACHE}/grobid.tar.gz" -C "${CACHE}"
    fi
    export JAVA_HOME="$(java_home)"
    # Bind both connectors to loopback only (never reachable from the network).
    CONFIG="${SRC}/grobid-home/config/grobid.yaml"
    if ! grep -q "bindHost: 127.0.0.1" "${CONFIG}"; then
      sed -i '' -E 's/^([[:space:]]+)port: (8070|8071)$/\1port: \2\
\1bindHost: 127.0.0.1/' "${CONFIG}"
    fi
    (cd "${SRC}" && nohup ./gradlew run --no-daemon >"${LOG}" 2>&1 & echo $! >"${PIDFILE}")
    for _ in $(seq 1 600); do
      if alive; then echo "GROBID ${VERSION} running at ${URL}"; exit 0; fi
      sleep 2
    done
    echo "GROBID did not start; see ${LOG}" >&2
    exit 1
    ;;
  stop)
    if [ -f "${PIDFILE}" ]; then pkill -P "$(cat "${PIDFILE}")" 2>/dev/null || true; kill "$(cat "${PIDFILE}")" 2>/dev/null || true; rm -f "${PIDFILE}"; fi
    pkill -f "org.grobid.service.main.GrobidServiceApplication" 2>/dev/null || true
    echo "stopped"
    ;;
  status)
    if alive; then echo "running at ${URL}"; else echo "not running"; fi
    ;;
  *) echo "usage: $0 start|stop|status" >&2; exit 2 ;;
esac
