#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
JAVA_HOME="${JAVA_HOME:-$ROOT/.tools/jdk/jdk-17.0.13+11}"
MVN="${MVN:-$ROOT/.tools/apache-maven-3.9.16/bin/mvn}"

echo "=== Backend: mvn test ==="
cd "$ROOT/backend"
"$MVN" -s "$ROOT/.tools/settings.xml" test

echo "=== Frontend: npm run build ==="
cd "$ROOT/frontend"
npm run build

echo "=== CI PASSED ==="