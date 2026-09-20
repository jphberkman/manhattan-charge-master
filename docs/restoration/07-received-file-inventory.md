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

## What we still need

Per-facility CMS `*_standardcharges.*` files for the 13 shopper hospitals. The H+H file we have is Carter, not Bellevue/Harlem/Metropolitan. If the Downloads copies are much larger than ~0.5 MB, re-send the full files.
