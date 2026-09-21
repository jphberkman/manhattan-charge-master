# Phase 1 ingest status (2026-09-21)

Founder memo executed: fresh corpus, header/NPI identity, full-fidelity fields, legacy rows quarantined (not deleted), description FTS + PriceSummary for shopper search.

Live Neon: project `cool-fire-98130468`, branch `br-rough-block-aili6snu`. Source tag `mrf-2026-09`.

## Loaded (9 of 13 shopper hospitals)

| Shopper | Header identity | Rows inserted | Rejected | Notes |
| --- | --- | --- | --- | --- |
| Bellevue | NPI 1073535027 / Bellevue Hospital Center | 1,895,148 | 446,512 | Tall CSV; rejects are non-dollar payer rows |
| Harlem | NPI 1033124961 / Harlem Hospital Center | 1,729,452 | 338,264 | Same |
| Metropolitan | NPI 1013924372 / Metropolitan Hospital Center | 1,754,557 | 338,281 | Same |
| NYU Tisch | NPI 1801992631 / Tisch Hospital | 3,700,792 | 2 | Wide CSV (413 payer-plan pairs) |
| MSK | Memorial Hospital for Cancer and Allied Diseases | 551,904 | 3 | JSON |
| Mount Sinai main | The Mount Sinai Hospital | 450,269 | 0 | JSON |
| Mount Sinai Morningside | Mount Sinai Morningside | 443,138 | 0 | JSON |
| HSS | Hospital for Special Surgery | 2,399,700 | 7 | JSON; `headerLocation` is first listed site (HSS Hudson Yards) |
| Lenox Hill | Lenox Hill Hospital | 5,645,094 | 4,733 | JSON; `headerLocation` is first listed site (Greenwich Village) |

**Fresh PriceEntry:** 18,570,054 rows with `sourceFileId`.  
**Read model:** 641,922 PriceSummary rows; 782,436 ServiceDescription rows; GIN FTS + pg_trgm.

## Not loaded (honest empty, not borrowed)

| Shopper | Why |
| --- | --- |
| NYP Columbia / Cornell / Lower Manhattan | Combined multi-campus file held pending founder split/attribution |
| Mount Sinai West | No campus file in Drive or drop folder |

Out of shopper list (not ingested): Carter, NYEE, NYU Orthopedic, unlabeled `chargemaster.xlsx`.

## Quarantine

~49.6M legacy `PriceEntry` rows (`sourceFileId` IS NULL) remain in the table. Consumer compare / procedure-search / breakdown read **PriceSummary only**, which is built from the fresh `sourceFileId` corpus. Legacy names (H+H blob, concatenated NYP, NYU Orthopedic as Tisch) are not shopper keys.

## Caveats (accuracy over a complete-looking grid)

- H+H files reject ~15–20% of payer rows with algorithm/% and no dollar — intended fail-closed.
- HSS and Lenox files list multiple sites; we attribute the file to the shopper hospital but record the first header location.
- NYU 27447 has commercial/medicare/medicaid summaries; **no cash row** in that code sample.
- Sinai campuses have no 27447 summary in the current rebuild (code not in those files as ingested).
- Hospital wording for imaging is not consumer English (`Inject Cntrst Knee Arth/CT/MRI`); FTS matches published descriptions, not invented synonyms.
- API compare returns `publishedMin` / `publishedMax`; shopper UI may not yet surface those labels.

## Next (still in memo, not started)

Do **not**: B2B dashboards, TiC mirror, national coverage, buy CPT.

Do, when founder says: NYP campus decision, Mount Sinai West file, provenance labels in UI, optional HMAC cookie / payer alias / R2 archive.
