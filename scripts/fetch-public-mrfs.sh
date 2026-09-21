#!/usr/bin/env bash
# Download public hospital MRFs into data/mrf-drop. Inventory only — does not ingest.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DROP="$ROOT/data/mrf-drop"
UA="Mozilla/5.0 (compatible; ShopForCare-restore/1.0)"

fetch() {
  local dest_dir="$1" url="$2" filename="$3"
  mkdir -p "$DROP/$dest_dir"
  local out="$DROP/$dest_dir/$filename"
  echo "GET $url"
  echo " -> $out"
  curl -fL --retry 3 --retry-delay 5 -C - -A "$UA" --max-time 0 -o "$out" "$url"
  ls -lh "$out"
}

# Campus-specific CMS 3.0 (Panacea). Header location_name is the hospital.
fetch hhc-bellevue "https://nychh.pt.panaceainc.com/MRFDownload/nychh/bellevue" \
  "132655001-1073535027_bellevue_standardcharges.csv"
fetch hhc-harlem "https://nychh.pt.panaceainc.com/MRFDownload/nychh/harlem" \
  "132655001-1033124961_harlem_standardcharges.csv"
fetch hhc-metropolitan "https://nychh.pt.panaceainc.com/MRFDownload/nychh/metropolitan" \
  "132655001-1013924372_metropolitan_standardcharges.csv"

fetch nyu-langone \
  "https://standard-charges-prod.s3.amazonaws.com/pricing_files/133971298-1801992631_nyu-langone-tisch_standardcharges.csv" \
  "133971298-1801992631_nyu-langone-tisch_standardcharges.csv"

fetch msk \
  "https://www.mskcc.org/hpt/1/131924236_memorial-hospital-for-cancer-and-allied-diseases-nyc_standardcharges.json" \
  "131924236_memorial-hospital-for-cancer-and-allied-diseases-nyc_standardcharges.json"

echo "Done public fetches (no ingest)."
