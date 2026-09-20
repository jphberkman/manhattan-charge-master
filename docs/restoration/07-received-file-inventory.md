# Received files (inventory only — not ingested)

Hospital identity is taken from **file contents** (CMS header, NPI, sheet names, JSON `hospital_name`). Byte-identical duplicates are noted. **No PriceEntry rows were written.**

## This batch (2026-09-20, second drop)

| You sent | Bytes on disk | SHA-256 prefix | Same as | Hospital in the file | Shopper list? |
| --- | --- | --- | --- | --- | --- |
| `chargemaster.xlsx` | 0.6 MB | `d9803712e2d3` | First `chargemaster.xlsx` (identical) | **Unknown** — still no hospital name | — |
| `132655001-1992713564_nyc-health-and-hospitals_standardcharges.zip` | 2.7 MB zip / **211 MB** CSV inside / 359,517 charge rows | `dc64c875cfb5` | Not the tiny Carter CSV (different date and size) | **Henry J. Carter Specialty Hospital** only. Header location 1752 Park Ave, NPI `1992713564`. No Bellevue/Harlem/Metropolitan rows. Updated 2025-09-05, CMS 3.0. Codes are CDM / MS-DRG / APR-DRG, not CPT. | No |
| `135562304_new-york-eye-and-ear-infirmary-of-mount-sinai_standardcharges (1).csv` | 55 bytes | `a6637d249241` | The other 55-byte NYEE csv | Stub only: one cell “New York Eye and Ear Infirmary of Mount Sinai”. Not an MRF. | Name is NYEE; file is empty |
| `135562304_new-york-eye-and-ear-infirmary-of-mount-sinai_standardcharges.csv` | 55 bytes | `a6637d249241` | Duplicate of the stub | Same stub | Same |
| `northwell-health-combined-upload-file for-website-5-6-2024 (1).xlsx` | 0.4 MB | `f0ed068f003b` | First Northwell xlsx (identical) | Combined Northwell CDM; Lenox Hill sheet is the only shopper campus | Lenox Hill sheet only |
| `133957095_NewYork-Presbyterian-Hospital_standardcharges.json (1).zip` | 8.5 MB zip / **~933 MB** JSON inside | `3fded8cf1726` | The other NYP zip (identical) | **NewYork-Presbyterian combined file.** `hospital_name` concatenates Columbia, Weill Cornell, and Brooklyn Methodist. `hospital_location` also lists Allen, Westchester, **Lower Manhattan**, Westchester Behavioral. Updated 2025-12-31, CMS JSON 2.2.1. | Contains Columbia, Cornell, and Lower Manhattan **in one file**. Do not rename as a single campus. |
| `133957095_NewYork-Presbyterian-Hospital_standardcharges.json.zip` | 8.5 MB | `3fded8cf1726` | Duplicate of the zip above | Same NYP combined file | Same |
| `135562304_new-york-eye-and-ear-infirmary-of-mount-sinai_standardcharges.json` | 2.2 MB / 5,393 items | `65b7c8f08156` | Real MRF (the csvs were not) | **New York Eye and Ear Infirmary of Mount Sinai**, 310 E 14th St. License `7002026H`. Updated 2025-09-22, CMS JSON 2.2.0. | **No.** NYEE is not one of the 13. Not Morningside, West, or Main campus. |

## Rename list — known vs unknown

### Known — keep / rename

| Current name | Hospital | Suggested name |
| --- | --- | --- |
| `132655001-1992713564_new-york-city-health-and-hospitals-corporation_standardcharges.csv` | Carter (small 2026-09-05 slice, 1,383 rows) | `hhc-carter_standardcharges_2026-09-05_partial.csv` |
| `132655001-1992713564_nyc-health-and-hospitals_standardcharges.zip` | Carter (full 2025-09-05 MRF, 359k rows) | `hhc-carter_standardcharges_2025-09-05.zip` |
| `135562304_new-york-eye-and-ear-infirmary-of-mount-sinai_standardcharges.json` | NY Eye and Ear (Mount Sinai) | `nyee-mount-sinai_standardcharges_2025-09-22.json` |
| `133957095_NewYork-Presbyterian-Hospital_standardcharges.json.zip` | NYP **multi-campus** (Columbia + Cornell + Lower Manhattan + others) | `nyp-combined_columbia-cornell-lower-manhattan-plus_standardcharges_2025-12-31.json.zip` |
| `northwell-health-combined-upload-file_for-website-5-6-2024.xlsx` | Northwell combined CDM (see sheet list) | `northwell-combined-cdm-2024-05-06.xlsx` |

Northwell sheet rename list is unchanged: only **Lenox Hill** is a shopper hospital.

### Known name, but not a usable MRF

| Current name | Why |
| --- | --- |
| Both `135562304_…_standardcharges.csv` files (55 bytes) | Hospital name only. Discard or ignore; use the JSON. |

### Duplicate — do not keep a second copy

| Current name | Duplicate of |
| --- | --- |
| `chargemaster.xlsx` (second attach) | First `chargemaster.xlsx` |
| Northwell `(1).xlsx` | First Northwell xlsx |
| NYP `(1).zip` | NYP `.zip` |

### Unknown — founder confirmed (2026-09-20)

| File | Location now | Decision |
| --- | --- | --- |
| `chargemaster.xlsx` (Fee Schedule 1, 2024-07-17, `AMB*` codes) | `data/mrf-drop/unknown/unknown_fee-schedule-1_2024-07-17.xlsx` | Hospital unknown. **Do not ingest. Do not attach to any of the 13.** |

### Still missing for the 13 shopper hospitals

| Shopper folder | Status |
| --- | --- |
| `lenox-hill/` | Only a 2024 CDM **sheet** inside Northwell xlsx (list price). No CMS MRF. |
| `nyp-columbia/` `nyp-cornell/` `nyp-lower-manhattan/` | Present **together** in the NYP combined JSON. Not split. |
| `hhc-bellevue/` `hhc-harlem/` `hhc-metropolitan/` | Missing. H+H files are Carter. |
| `mount-sinai/` `mount-sinai-morningside/` `mount-sinai-west/` | Missing. NYEE is a different Mount Sinai facility. |
| `nyu-langone/` `hss/` `msk/` | Missing. |
