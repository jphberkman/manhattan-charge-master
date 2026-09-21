# 12 — Target architecture

Boring on purpose. Same stack, two new layers (raw archive, read model), no microservices.

```
ACQUIRE      data/mrf-drop/<campus>/ (manual)  +  scripts/fetch-public-mrfs.sh (scheduled later)
             sha256 + bytes + header identity recorded in SourceFile (status=discovered)
ARCHIVE      object storage (Vercel Blob or R2): original bytes, immutable, versioned
             (Postgres keeps pointers, never the blobs)
PARSE        per-format adapters (cms-json-2.x, cms-csv-3.0-tall, nyu-wide, hhc-tall, xlsx-quarantine)
             emits RawCharge-shaped records with EVERY 3.0 field:
             code|1..3+types, setting, billing_class, methodology, gross, cash,
             negotiated_dollar/percentage/algorithm, min/max, median/10th/90th/count,
             payer_name, plan_name, notes; rejects logged with reason
NORMALIZE    identity: file-header NPI → campus (ShopperHospital) — never filename
             codes: classifyMedicalCode → codeKind; HCPCS/ICD validated (NLM/local tables)
             payers: PayerAlias table → canonical Payer + Plan (+payerClass)
LOAD         PriceEntry(+ sourceFileId, asOf, codeKind, methodology, minCents, maxCents,
             medianCents, settingBillingClass) — file-scoped replace (delete old rows for
             that sourceFile lineage, insert new) = idempotent re-ingest
READ MODEL   PriceSummary(hospitalId, code, codeKind, payerClass, priceType):
             min/median/max/count, latestAsOf, sourceFileIds — rebuilt at ingest
             ServiceDescription(hospitalId, code, description, tsv) — FTS + pg_trgm
SERVE        /api/procedure-search → deterministic extract → FTS + code tables → NLM validate
             /api/hospitals/compare → PriceSummary only (no 45M scans)
             /api/codes/*, /api/hospitals/cms-profile (wired)
             evidence state computed per row at read time
QUALIFY      Medicare benchmark service (MPFS/OPPS NYC locality tables, quarterly sync)
             Care Compare quality store per CCN
OBSERVE      SourceFile row accounting, ingest diffs, SearchLog review, spot-audit script
```

## Schema deltas (additive only)

- `PriceEntry`: + sourceFileId FK, asOf, codeKind, methodology, minCents, maxCents, medianCents, billingClass, setting. Existing rows: backfill where provable, else `legacy=true` and excluded from consumer reads.
- New: `Payer`, `PayerAlias`, `Plan`, `PriceSummary`, `ServiceDescription`, `QualityMeasure`, `MedicareRate(locality)`.
- `SourceFile`: + blobUrl, headerNpi, headerLocation, asOf, supersedesId.

## What we deliberately do NOT build

Vector DB, microservices, Kafka, search cluster (Postgres FTS is enough at 1–5M descriptions), national ingestion farm, real-time TiC mirror.

## Scale posture

13 hospitals × full-fidelity ≈ ESTIMATED 60–150M rows worst case → PriceSummary keeps reads O(thousands); Neon storage cost is the main dial (mitigate: drop legacy blob rows, keep raw in R2, consider partitioning PriceEntry by hospital when >100M).
