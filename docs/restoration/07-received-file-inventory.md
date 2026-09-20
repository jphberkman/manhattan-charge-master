# Received files (inventory only — not ingested)

Three files were attached on 2026-09-20. They sit in `data/mrf-drop/inbox/` (gitignored). **No PriceEntry rows were written.**

| File | Size | SHA-256 prefix | What it actually is | Shopper hospital? |
| --- | --- | --- | --- | --- |
| `132655001-1992713564_new-york-city-health-and-hospitals-corporation_standardcharges.csv` | 0.4 MB (1,383 charge rows) | `4451469a4866` | CMS 3.0 tall MRF. Header names the corporation. `location_name` is **Henry J. Carter Specialty Hospital** (1752 Park Ave), not Bellevue/Harlem/Metropolitan. Codes are almost all CDM/local + revenue codes / some MS-DRG. 53 unique descriptions, nearly all inpatient. | **No.** Carter is not on the shopper list. Do not load this as Bellevue. Also far too small to be the full H+H corporation MRF (those are typically hundreds of MB to multi-GB). If the copy in Downloads is much larger, this chat upload was clipped. |
| `northwell-health-combined-upload-file_for-website-5-6-2024.xlsx` | 0.4 MB | `f0ed068f003b` | Internal CDM workbook dated **2024-05-06**, not a CMS standard-charges file. Columns: charge description + current list price. Sheets: Manhasset, LIJ, **Lenox Hill** (1,367 rows), Forest Hills, Valley Stream, Glen Cove, Plainview, South Shore, Huntington, SIUH, Phelps, NWH, Peconic, Mather. No payer, almost no CPT column. | **Lenox Hill sheet only** is in-scope, and only as **gross list price**, labeled 2024 CDM — not negotiated insurance. Other sheets are not shopper hospitals. |
| `chargemaster.xlsx` | 0.6 MB | `d9803712e2d3` | Sheet `FS071724`: “Fee Schedule 1 Master Fee Schedule” (~15,292 rows). Local `AMB*` codes, Std-Fee / Stat-Fee. **No hospital name.** | **No.** Cannot attribute. |

## What we still need

Per-facility CMS machine-readable files (csv/json/zip) for the 13 shopper hospitals. Prefer the hospital’s current `*_standardcharges.*` file, not an internal fee-schedule extract.

If the H+H or Northwell originals on disk are larger than ~0.5 MB, re-send via Google Drive or a zip-per-hospital attach so the full file arrives.
