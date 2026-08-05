#!/usr/bin/env bash
#
# Brings up a LONG-LIVED emulator + dev server for interactive browser driving.
#
# This is deliberately not `firebase emulators:exec`, which tears everything
# down the moment its command exits — fine for the e2e suite, useless for
# driving the app by hand.
#
# Ports are chosen to stay out of everything else's way:
#   8082  Firestore emulator (8080 = e2e suite, 8085 = rules tests, 8081 taken
#         by an unrelated local service on at least one dev machine)
#   4002  Emulator UI
#   5273  Vite dev server. NOT 4173/5173: playwright.config.ts uses
#         `reuseExistingServer: !CI`, so a Playwright run started while this is
#         up would silently adopt this server and its hand-built data instead
#         of starting a clean one.
#
# State persists across restarts in .emulator-data/chrome, so a journey can be
# picked up where it left off. Delete that directory to start clean — and do
# that first when debugging anything that looks like corrupt state.
#
# Ctrl-C stops both processes and exports emulator data.

set -euo pipefail

FIRESTORE_PORT=8082
VITE_PORT=5273
DATA_DIR=".emulator-data/chrome"

cd "$(dirname "$0")/.."

# firebase-tools 15 requires JDK 21+, and a machine can easily have an older
# JDK on PATH or pinned in JAVA_HOME (this repo's default is Zulu 17). Pick a
# new enough JDK by VERSION rather than by whether JAVA_HOME happens to be set,
# and fail with the real reason rather than the CLI's late generic error.
java_major() {
  "$1" -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/'
}

java_ok=false
if command -v java >/dev/null 2>&1 && [ "$(java_major java)" -ge 21 ] 2>/dev/null; then
  java_ok=true
else
  for candidate in /opt/homebrew/opt/openjdk /opt/homebrew/opt/openjdk@25 /opt/homebrew/opt/openjdk@21; do
    if [ -x "$candidate/bin/java" ] && [ "$(java_major "$candidate/bin/java")" -ge 21 ] 2>/dev/null; then
      export JAVA_HOME="$candidate"
      export PATH="$JAVA_HOME/bin:$PATH"
      java_ok=true
      echo "Using JDK at $JAVA_HOME (java $(java_major java))"
      break
    fi
  done
fi

if [ "$java_ok" != true ]; then
  echo "ERROR: firebase-tools needs a JDK 21+ and none was found." >&2
  echo "       Install one (brew install openjdk) or set JAVA_HOME to a 21+ JDK." >&2
  exit 1
fi

for port in "$FIRESTORE_PORT" "$VITE_PORT"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "ERROR: port $port is already in use. Stop the other process first:" >&2
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >&2
    exit 1
  fi
done

mkdir -p "$DATA_DIR"

cleanup() {
  echo ""
  echo "Shutting down…"
  [ -n "${VITE_PID:-}" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "${EMULATOR_PID:-}" ] && kill "$EMULATOR_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting Firestore emulator on $FIRESTORE_PORT (rules: firestore.rules)…"
npx firebase-tools emulators:start \
  --only firestore \
  --project demo-fip-hifz \
  --config firebase.chrome.json \
  --import "$DATA_DIR" \
  --export-on-exit "$DATA_DIR" \
  >journey-emulator.log 2>&1 &
EMULATOR_PID=$!

printf "Waiting for the emulator"
for _ in $(seq 1 90); do
  if curl -s "http://127.0.0.1:$FIRESTORE_PORT/" >/dev/null 2>&1; then
    echo " ready."
    break
  fi
  if ! kill -0 "$EMULATOR_PID" 2>/dev/null; then
    echo ""
    echo "ERROR: the emulator exited. Last lines of journey-emulator.log:" >&2
    tail -20 journey-emulator.log >&2
    exit 1
  fi
  printf "."
  sleep 1
done

echo "Starting Vite on $VITE_PORT (pointed at the emulator)…"
VITE_USE_FIRESTORE_EMULATOR=true \
VITE_FIRESTORE_EMULATOR_PORT="$FIRESTORE_PORT" \
VITE_FIREBASE_PROJECT_ID=demo-fip-hifz \
  npx vite --host 127.0.0.1 --port "$VITE_PORT" --strictPort >journey-vite.log 2>&1 &
# --host 127.0.0.1 is required, not cosmetic: Vite's default binds IPv6
# localhost ([::1]) only, so http://127.0.0.1:PORT — which is what the
# emulator, the verify script, and browser automation all use — gets connection
# refused while http://localhost:PORT works.
VITE_PID=$!

printf "Waiting for Vite"
for _ in $(seq 1 60); do
  if curl -s "http://127.0.0.1:$VITE_PORT/" >/dev/null 2>&1; then
    echo " ready."
    break
  fi
  if ! kill -0 "$VITE_PID" 2>/dev/null; then
    echo ""
    echo "ERROR: Vite exited. Last lines of journey-vite.log:" >&2
    tail -20 journey-vite.log >&2
    exit 1
  fi
  printf "."
  sleep 1
done

cat <<EOF

  App           http://127.0.0.1:$VITE_PORT
  Emulator UI   http://127.0.0.1:4002
  Firestore     127.0.0.1:$FIRESTORE_PORT   (production ruleset)
  Data          $DATA_DIR  (persisted on exit)

  Verify an event:
    FIRESTORE_EMULATOR_HOST=127.0.0.1:$FIRESTORE_PORT \\
      npx tsx scripts/verify-emulator-event.mts --event <eventId>

  Ctrl-C to stop.

EOF

wait
