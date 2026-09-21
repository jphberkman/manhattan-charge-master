#!/usr/bin/env bash
# Sequential per-campus ingest of the 2026-09 corpus. Run under tmux.
set -uo pipefail
cd "$(dirname "$0")/../.."
LOG=/tmp/ingest-run.log
run() {
  local id="$1" file="$2"
  echo "=== $(date -u +%H:%M:%S) START $id ===" | tee -a "$LOG"
  npx tsx scripts/ingest/ingest-mrf.ts "$id" "$file" 2>&1 | tee -a "$LOG"
  echo "=== $(date -u +%H:%M:%S) END $id (exit $?) ===" | tee -a "$LOG"
}

run hhc-bellevue        data/mrf-drop/hhc-bellevue/132655001-1073535027_bellevue_standardcharges.csv
run hhc-harlem          data/mrf-drop/hhc-harlem/132655001-1033124961_harlem_standardcharges.csv
run hhc-metropolitan    data/mrf-drop/hhc-metropolitan/132655001-1013924372_metropolitan_standardcharges.csv
run mount-sinai         data/mrf-drop/mount-sinai/131624096_mount-sinai-hospital_standardcharges.json
run mount-sinai-morningside data/mrf-drop/mount-sinai-morningside/132997301_mount-sinai-morningside_standardcharges.json
run lenox-hill          data/mrf-drop/lenox-hill/Lenox_Hill_Hospital_StandardCharges.json
run hss                 data/mrf-drop/hss/131624135-1801443619_hss_standardcharges.json
run nyu-langone         data/mrf-drop/nyu-langone/133971298-1801992631_nyu-langone-tisch_standardcharges.csv

echo "=== $(date -u +%H:%M:%S) ALL DONE ===" | tee -a "$LOG"
