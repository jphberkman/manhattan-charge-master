# Received files (inventory only — not ingested)

Three files were attached on 2026-09-20. They sit in `data/mrf-drop/inbox/` (gitignored). **No PriceEntry rows were written.**

Hospital identity below is taken from **the file itself** (CMS header, NPI registry for that NPI, sheet names). Nothing was guessed from the filename alone.

| File | Size | SHA-256 prefix | What the file says | Shopper hospital? |
| --- | --- | --- | --- | --- |
| `132655001-1992713564_new-york-city-health-and-hospitals-corporation_standardcharges.csv` | 0.4 MB (1,383 charge rows) | `4451469a4866` | CMS 3.0. `hospital_name` = NYC Health + Hospitals Corporation. `location_name` = **Henry J. Carter Specialty Hospital**, 1752 Park Ave. Type 2 NPI `1992713564` is registered as H+H DBA **HENRY J. CARTER SPECIALTY HOSPITAL** (long-term care hospital). Descriptions are LTACH room/per-diem CDM codes. Bellevue/Harlem/Metropolitan never appear. | **No.** Carter is not on the 13-hospital shopper list. Also far too small to be the full H+H corporation MRF. |
| `northwell-health-combined-upload-file_for-website-5-6-2024.xlsx` | 0.4 MB | `f0ed068f003b` | Internal CDM workbook (description + list price), printed 2024-05-06. Sheet names are hospital campuses (see below). | **Lenox Hill sheet only** is in-scope, as **2024 gross list price**, not insurance. |
| `chargemaster.xlsx` | 0.6 MB | `d9803712e2d3` | Banner: “Fee Schedule 1 Master Fee Schedule” printed 2024-07-17. Local `AMB*` codes. Excel author `Arias, Jenn`. **No hospital name, address, NPI, or EIN anywhere in the workbook.** | **No.** Same unlabeled shape as the junk Neon hospital previously named `chargemaster`. |

## Northwell sheets (named in the file)

| Sheet | Hospital (from sheet title) | Shopper list |
| --- | --- | --- |
| Lenox Hill CDM Upload | Lenox Hill Hospital | Yes |
| Manhasset CDM Upload | North Shore University Hospital (Manhasset) | No |
| LIJ CDM Upload | Long Island Jewish | No |
| Forest Hills CDM Upload | LIJ Forest Hills | No |
| Valley Stream CDM Upload | Northwell Valley Stream | No |
| Glen Cove / Plainview / South Shore / Huntington | Those Northwell campuses | No |
| SIUH CDM Upload | Staten Island University Hospital | No |
| Phelps / NWH / Peconic / Mather | Phelps, Northern Westchester, Peconic, Mather | No |

## Rename list (known vs unknown)

Use this when you rename the copies in Downloads. Folder names match `data/mrf-drop/`.

### Known hospital — standalone file

| What you sent | Hospital | Suggested name |
| --- | --- | --- |
| `132655001-1992713564_new-york-city-health-and-hospitals-corporation_standardcharges.csv` | **Henry J. Carter Specialty Hospital** (H+H LTACH, 1752 Park Ave). Not Bellevue / Harlem / Metropolitan. | `hhc-carter_132655001-1992713564_henry-j-carter-specialty-hospital_standardcharges.csv` |

Carter is **not** one of the 13 shopper hospitals. Keep it out of `hhc-bellevue/`, `hhc-harlem/`, and `hhc-metropolitan/`.

### Known hospitals — sheets inside one Northwell workbook

File: `northwell-health-combined-upload-file_for-website-5-6-2024.xlsx`  
If you keep it as one workbook, rename the file to `northwell-combined-cdm-2024-05-06.xlsx`.  
If you export each sheet, use:

| Sheet in the workbook | Hospital | Shopper list? | Suggested exported filename |
| --- | --- | --- | --- |
| Lenox Hill CDM Upload | Lenox Hill Hospital | Yes | `lenox-hill_cdm-list-price_2024-05-06.xlsx` |
| Manhasset CDM Upload | North Shore University Hospital (Manhasset) | No | `northwell-manhasset_cdm-list-price_2024-05-06.xlsx` |
| LIJ CDM Upload | Long Island Jewish Medical Center | No | `northwell-lij_cdm-list-price_2024-05-06.xlsx` |
| Forest Hills CDM Upload | Northwell / LIJ Forest Hills | No | `northwell-forest-hills_cdm-list-price_2024-05-06.xlsx` |
| Valley Stream CDM Upload | Northwell Valley Stream | No | `northwell-valley-stream_cdm-list-price_2024-05-06.xlsx` |
| Glen Cove CDM Upload | Glen Cove Hospital | No | `northwell-glen-cove_cdm-list-price_2024-05-06.xlsx` |
| Plainview CDM Upload | Plainview Hospital | No | `northwell-plainview_cdm-list-price_2024-05-06.xlsx` |
| South Shore CDM Upload | South Shore University Hospital | No | `northwell-south-shore_cdm-list-price_2024-05-06.xlsx` |
| Huntington CDM Upload | Huntington Hospital | No | `northwell-huntington_cdm-list-price_2024-05-06.xlsx` |
| SIUH CDM Upload | Staten Island University Hospital | No | `northwell-siuh_cdm-list-price_2024-05-06.xlsx` |
| Phelps CDM Upload | Phelps Hospital | No | `northwell-phelps_cdm-list-price_2024-05-06.xlsx` |
| NWH CDM Upload | Northern Westchester Hospital | No | `northwell-northern-westchester_cdm-list-price_2024-05-06.xlsx` |
| Peconic CDM Upload | Peconic Bay Medical Center | No | `northwell-peconic_cdm-list-price_2024-05-06.xlsx` |
| Mather CDM Upload | Mather Hospital | No | `northwell-mather_cdm-list-price_2024-05-06.xlsx` |

Only the Lenox Hill export belongs under `data/mrf-drop/lenox-hill/`. It is still a **2024 gross list price** CDM, not a CMS payer MRF.

### Unknown hospital — needs you to name it

| What you sent | What we know | What we do not know |
| --- | --- | --- |
| `chargemaster.xlsx` | “Fee Schedule 1 Master Fee Schedule”, printed 2024-07-17, local `AMB*` codes, Excel author Arias, Jenn (~15,292 rows) | **Which hospital.** No name, address, NPI, or EIN in the file. |

Rename that one to `{hospital}_fee-schedule-1_2024-07-17.xlsx` once you know the hospital (for example `hss_…` or `nyu-langone_…`). Until then, leave it as unknown.

### Still missing (no file yet)

lenox-hill (CMS MRF), mount-sinai-morningside, mount-sinai-west, nyp-lower-manhattan, nyp-columbia, nyp-cornell, hhc-bellevue, hhc-harlem, hhc-metropolitan, nyu-langone, mount-sinai, hss, msk.

Per-facility CMS `*_standardcharges.*` files for the 13 shopper hospitals. The H+H file we have is Carter, not Bellevue/Harlem/Metropolitan. If the Downloads copies are much larger than ~0.5 MB, re-send the full files.
