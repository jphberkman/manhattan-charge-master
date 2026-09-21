# 03 — Data & database audit

## The founder hypothesis: "we are not searching the whole corpus"

**Confirmed, with a different cause than assumed.** The data is in Neon (45.5M rows, 15 GB — live query 2026-09-21). Three overlays make most of it unreachable:

1. **Identity** (KNOWN): 26.8M rows attributed to the junk H+H blob hospital; NYP concatenated; duplicates split each real hospital's rows across 2+ ids. A consumer compare that filters to clean hospital ids can only see the minority of rows.
2. **Code keys** (KNOWN): `Procedure.cptCode` is the join key, but ~93% of Procedure rows are keyed by CDM codes, NDC fragments, or description prefixes (restoration audit). CPT-keyed search finds only CPT-keyed rows.
3. **Search layer** (KNOWN): the search entry point is ConditionMapping (~140 rows) + CptCode (9,297 descriptions). Hospital `description` text — the richest field in every MRF — is never queried.

So "search the entire corpus" = fix identity + search descriptions, not re-upload alone.

## Row-level quality issues (from audit + parsers)

- Price types collapsed: some paths wrote `gross` for everything (`normalizePriceType` defaults to gross).
- `payerType` classification by substring of payer name; "Gross" payer written as `other`.
- No unit/percentage/algorithm capture: CMS 3.0 `negotiated_percentage`, `negotiated_algorithm`, `methodology`, `min/max`, `median/10th/90th` columns are **dropped** by every current parser. These are exactly the fields that make a price defensible.
- Duplicates: same file re-uploaded → straight `create` (no upsert on unique key) → repeated rows (DERIVED from validate/upload code paths; magnitude UNKNOWN — measurable with a hash of (hospital, code, payer, plan, priceType)).
- Staleness: corpus loaded 2026-03; hospitals published 2026-09 updates (KNOWN from fresh downloads).

## Fresh corpus on disk (not yet ingested)

| Drop folder | File | Size | Header identity |
| --- | --- | --- | --- |
| hhc-bellevue | 132655001-1073535027 CSV | 759 MB | Bellevue Hospital Center, CMS 3.0, 2026-09-05 |
| hhc-harlem | 132655001-1033124961 CSV | 649 MB | Harlem Hospital Center |
| hhc-metropolitan | 132655001-1013924372 CSV | 657 MB | Metropolitan Hospital Center |
| nyu-langone | Tisch CSV | 460 MB | NYU wide CSV |
| msk | MSK JSON | 125 MB | Memorial Hospital … NYC |
| mount-sinai | Sinai main JSON | 75 MB | The Mount Sinai Hospital, 2025-09-22 |
| mount-sinai-morningside | Morningside JSON | 84 MB | Mount Sinai Morningside |
| hss | HSS JSON | 908 MB | (verify header at ingest) |
| lenox-hill | Northwell zip | 33 MB | (verify CSV inside) |
| inbox | NYP combined json.zip | 933 MB uncompressed | 7 campuses incl. Columbia/Cornell/Lower Manhattan |
| unknown | fee schedule xlsx | 0.6 MB | No identity — quarantined |

Missing: **Mount Sinai West** (not in Drive folder either).

## Database structure judgments

- Schema is a reasonable consumer read model but not a data platform: no RawRecord, no SourceFile FK on PriceEntry, no payer/plan tables, no price-type completeness (min/max/median), no effective-date on prices.
- 8 composite indexes on PriceEntry are query-shaped and fine; the missing pieces are (a) precomputed per-(hospital, code, payerType, priceType) aggregates, and (b) FTS/trigram over description.
- Neon size headroom is fine (15 GB now; full re-ingest of fresh corpus at full fidelity ESTIMATED 30–80 GB depending on payer-row explosion; Neon handles this, cost rises — see roadmap for tiering: keep raw rows in files/R2, normalized + aggregates in Postgres).

## What to measure before Phase 2 (diagnostic scripts, safe)

1. Duplicate ratio: count distinct (hospitalId, rawCode, payerName, priceType, priceInCents) vs total.
2. Reachability: % of PriceEntry rows reachable via a clean shopper hospital id AND a CPT/HCPCS-classified code.
3. Description coverage: distinct description count per hospital vs Procedure rows linked.
