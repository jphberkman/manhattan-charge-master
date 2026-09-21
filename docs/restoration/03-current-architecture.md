# Current architecture (as implemented)

This replaces the conceptual restoration diagram with **what the repository and Neon actually do** on 2026-09-20.

Classification: **KNOWN** unless marked otherwise.

---

## A. Consumer request path

```
USER (browser)
  └─ middleware.ts
       ├─ optional SITE_PASSWORD cookie gate
       └─ JWT only for /api/projects (UIGen)
  └─ /hospital-prices  (HomePageContent → AiProcedureSearch)
        │
        ├─ POST /api/procedure-search
        │     ├─ redis GET search10:{q}
        │     ├─ searchCptCodes()  [ConditionMapping ILIKE + CptCode ILIKE]
        │     ├─ prisma.procedure.findMany({ cptCode in ... })
        │     └─ SearchLog insert
        │
        ├─ GET /api/hospitals/compare?cptCode=
        │     ├─ redis GET compare17:...
        │     ├─ Procedure by unique cptCode
        │     ├─ SQL median PriceEntry per Hospital (cash / negotiated|discounted / gross)
        │     ├─ name map → 10 canonical Manhattan hospitals
        │     ├─ OPTIONAL fill missing hospitals from CmsChargeData
        │     │     insuranceRate := avgMedicarePayments/100 * 2.5
        │     │     cashPrice := avgCoveredCharges   [NOT MRF cash]
        │     ├─ patientCost := insuranceRate * coinsurance (default 0.20)
        │     └─ getMedicareRateAsync (hardcoded map → CptCode → unofficial PPL URL)
        │
        ├─ POST /api/procedure-breakdown  (SSE)
        │     ├─ Anthropic Haiku: components + CPT/HCPCS, no dollars
        │     ├─ PriceEntry findMany by those CPTs (take 500, 5s timeout)
        │     └─ Sum mins/maxes; nulls treated as 0 in totals
        │
        ├─ POST /api/physicians/recommend
        │     ├─ NPPES NPI search
        │     ├─ Anthropic rank / optionally generate
        │     └─ data.cms.gov utilization 2022
        │
        └─ Client cost-calculator.ts
              known: user deductible/OOP/coinsurance if entered
              derived: patientCost math
              estimated: default 20% coinsurance when user skipped plan
              unknown: benefits, network, medical necessity — not modeled
```

**UIGen island (not ShopForCare):**

```
USER (if logged in) → /{projectId}
  → POST /api/chat → Claude + str_replace_editor / file_manager
  → VirtualFileSystem in Project.data JSON
  → PreviewFrame iframe
```

---

## B. Data plane (actual)

```
HOSPITAL PUBLIC MRF
  (JSON / CSV / ZIP / XLSX on hospital CDNs)
        │
        ├─ scripts/seed-hospital-files.ts     [offline, /tmp, bulk]
        ├─ src/lib/price-transparency/seed-prices.ts  [13 CPT only; deleteMany]
        ├─ POST /api/upload                   [serverless 120s; AI schema]
        └─ POST /api/validate                 [Buffer whole file; AI schema]
                │
                ▼
        NormalizedRow (in memory only — not persisted)
                │
                ▼
        Neon public schema
           Hospital.sourceFile  (path/URL string)
           Procedure            (cptCode unique; polluted keys)
           PriceEntry           (only persisted “fact” table)
           CptCode              (9,297 descriptions)
           ConditionMapping     (138 curated phrases)
           CmsChargeData        (Medicare averages)
           SearchLog
                │
                ▼
        READ PATH = SQL on PriceEntry + Procedure
        (no raw table, no search index beyond btree)
```

**Not present:** object storage, ingestion queue, file hash inventory, adapter registry table, verification queue.

---

## C. External systems

```
Anthropic Messages API  → interpretation, schema detection, education, physicians
NPPES NPI Registry      → physician identity
data.cms.gov Socrata    → utilization (2022 dataset id s55f-ussd)
developer.cms.gov PPL   → intended MPFS fallback; URL/auth mismatch
Hospital CDNs           → MRF download at seed time only
Vercel KV / Redis       → response cache
Vercel Cron             → prewarm / freshness / quality snapshot (no ingest)
```

---

## D. Deployment

```
GitHub jphberkman/manhattan-charge-master
    → Vercel project manhattan-charge-master-uq6x
        domains: shopforcare.xyz
        build: prisma db push --accept-data-loss && next build
        runtime: Node 24.x serverless functions
    → Neon manhattan-marketplace (INFERRED binding)
```

---

## E. Where facts vs interpretation sit today

| Layer | Fact? | Notes |
| --- | --- | --- |
| `PriceEntry.priceInCents` | Intended fact | No raw row to prove it |
| `payerType` / `priceType` | Weak fact | Contaminated (`payerType=gross`); min/max absent |
| `Hospital.name` | Weak | Duplicates, concatenated NYP, `hospital_name` |
| `Procedure.cptCode` | Weak | 93% non CPT/HCPCS |
| `searchCptCodes` confidence | Heuristic | Keyword fraction + mapping weight, not evidence |
| Compare `dataSource=chargemaster` | Fact-ish | Median of filtered rows, $100 floor |
| Compare `cms-derived-estimate` | **Estimated, labeled in UI** | 2.5× Medicare; cash:=chargemaster |
| Breakdown components | Interpretation | CPT may be LLM |
| Breakdown dollars | Fact if `dataSource=real` | Totals still sum missing as 0 |
| OOP | Derived/estimated | Missing inputs become 0 remaining deductible in simple mode |

---

## F. Dual ingestion architectures (do not confuse)

1. **Registry + TARGET_CPT_CODES** (`hospital-registry.ts`, three streaming parsers). Designed for 8 Manhattan files and 13 surgeries. Memory-safe. **Drops almost all rows by design.**
2. **Bulk seeder + upload** (`seed-hospital-files.ts`, `/api/upload`). Designed to take **all 5-digit CPT** (CSV) / more on JSON. Populated production volume. **Weak identity, weak skip accounting, serverless-unsafe for 36GB.**

Restoration should **extend (2)** with inventory/provenance, not resurrect (1) as the production corpus filter.
