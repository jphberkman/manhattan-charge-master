# ShopForCare current-state audit

**Status:** Phase 1–27 reconnaissance complete. No production code, schema, UI, or ingestion changes were made.

**Classification legend**

- **KNOWN** — proven by repository code, Prisma schema, Neon live queries, or Vercel project metadata.
- **INFERRED** — strong evidence, not conclusively verified end-to-end.
- **UNKNOWN** — insufficient evidence.

**Audit date:** 2026-09-20  
**Repository:** `github.com/jphberkman/manhattan-charge-master` (package name `uigen`)  
**Production domain (Vercel):** `shopforcare.xyz`  
**Neon project used for live forensics:** `manhattan-marketplace` (`cool-fire-98130468`)

---

## 1. What ShopForCare actually is

**KNOWN.** This repository is two products in one:

1. **ShopForCare** — consumer hospital price-transparency search under `/hospital-prices` (anonymous users are redirected there from `/`).
2. **UIGen leftover** — an AI React-component generator (chat + virtual filesystem + Monaco editor) from an earlier template. README, `src/app/[projectId]`, `src/lib/file-system.ts`, `src/app/api/chat`, and Prisma `User`/`Project` still exist.

ShopForCare is **not** a greenfield app. It is a Next.js 15 App Router application that stores ~tens of millions of price rows in Neon Postgres and searches them with SQL + curated condition mappings + Anthropic for interpretation/breakdown.

---

## 2. Application map

### 2.1 Framework and language

| Item | Value | Class |
| --- | --- | --- |
| Framework | Next.js 15 (`next` ^15.5.12), App Router | KNOWN |
| UI | React 19, TypeScript | KNOWN |
| Styling | Tailwind CSS v4, Radix, shadcn-style `components/ui` | KNOWN |
| Package manager | npm (`package-lock.json`) | KNOWN |
| ORM | Prisma 6 → PostgreSQL (`DATABASE_URL`) | KNOWN |
| Tests | Vitest (mostly UIGen file-system/chat tests, not pricing) | KNOWN |
| Node compat shim | `NODE_OPTIONS='--require ./node-compat.cjs'` on Next commands | KNOWN |

README still says “Prisma with SQLite”. That is **stale**. Schema and live DB are PostgreSQL/Neon.

### 2.2 Frontend architecture (ShopForCare)

Consumer UI lives in `src/app/hospital-prices/` and `src/components/hospital-prices/`.

| Route | Role |
| --- | --- |
| `/` | Redirects anonymous users to `/hospital-prices`; logged-in UIGen users to a project |
| `/hospital-prices` | Home / search (ISR `revalidate = 3600`) |
| `/hospital-prices/search` | Search page |
| `/hospital-prices/about` | About |
| `/hospital-prices/explore` | Explore |
| `/hospital-prices/upload` | File upload UI |
| `/hospital-prices/validate` | Upload + Medicare-range “validation” |
| `/hospital-prices/admin` | Admin / edit mode |
| `/hospital-prices/audit` | Data audit UI |
| `/login` | Site-password gate |

Primary consumer flow is `AiProcedureSearch`:

1. POST `/api/procedure-search` (DB CPT resolution).
2. If matches exist → GET `/api/hospitals/compare` (hospital table).
3. User can request POST `/api/procedure-breakdown` (Anthropic enumerates billable components; prices filled from DB).
4. Optional NPI physician recs, coinsurance / custom plan OOP calc on the client.

**INFERRED.** The UI copy (“No AI estimates — just real data”) is directionally true for dollar amounts on the compare path, but false as a complete product claim: breakdown structure, condition education, physician ranking, and some insurance “rates” can still be AI- or formula-derived.

### 2.3 Backend architecture

- Next.js Route Handlers under `src/app/api/**`.
- Server Actions under `src/actions/` (UIGen auth/projects only).
- Prisma singleton `src/lib/prisma.ts` — **standard `PrismaClient`**, not `@prisma/adapter-neon` / `@neondatabase/serverless` even though those packages are in `package.json`.
- Cache: `src/lib/redis.ts` — Vercel KV (`KV_REST_API_URL` + `KV_REST_API_TOKEN`) else `REDIS_URL` else no-op.

### 2.4 API routes

| Route | Purpose | Auth |
| --- | --- | --- |
| `POST /api/procedure-search` | Query → CPT candidates that exist in `Procedure` | Site password if `SITE_PASSWORD` set |
| `GET /api/hospitals/compare` | Per-hospital median prices for one CPT | Site password |
| `GET /api/prices` | Raw price rows for a `procedureId` (limit 1000) | Site password |
| `GET /api/prices/estimate` | Same as prices, no fabrication, take 50 | Site password |
| `POST /api/procedure-breakdown` | LLM component list + DB prices | Site password |
| `POST /api/concern-explore` | LLM health education JSON (no prices) | Site password |
| `POST /api/physicians/recommend` | NPI search + LLM ranking + CMS utilization | Site password |
| `GET /api/hospitals` | Hospital list | Site password |
| `GET /api/procedures` | Procedure list | Site password |
| `POST /api/upload` | Ingest uploaded MRF (AI schema detect) | Site password; `maxDuration=120` |
| `POST /api/validate` | Ingest + Medicare multiplier “accuracy” | Site password; `maxDuration=120` |
| `POST /api/chat` | UIGen Claude generation | Not ShopForCare-gated |
| `POST /api/admin/auth` | Admin password cookie | Public POST |
| `GET /api/admin/data-audit` | Corpus metrics | **Only site password, not admin** |
| `GET /api/admin/search-logs` | Search logs | UIGen JWT session (not admin cookie) |
| `GET /api/admin/prewarm` | Cache warmer | `CRON_SECRET` if set |
| `GET /api/admin/data-freshness` | Stale hospital flag | `CRON_SECRET` if set |
| `GET /api/admin/data-quality-snapshot` | Counts / $0 prices | `CRON_SECRET` if set |
| `GET/POST /api/admin/content*` | Editable site copy | Admin cookie |
| `/api/dispatch` | Unrelated Miami dispatch / Deepgram | — |

### 2.5 Background jobs / cron

`vercel.json`:

| Path | Schedule |
| --- | --- |
| `/api/admin/prewarm` | `0 9 * * *` (daily 09:00 UTC) |
| `/api/admin/data-freshness` | `0 6 * * 1` (Monday 06:00 UTC) |
| `/api/admin/data-quality-snapshot` | `0 7 * * *` (daily 07:00 UTC) |

**KNOWN.** These jobs inspect/warm caches. They do **not** ingest hospital files.

### 2.6 Data ingestion scripts (offline)

| Script | Role |
| --- | --- |
| `src/lib/price-transparency/seed-prices.ts` (`npm run seed:prices`) | Legacy 8-hospital seeder; **filters to 13 TARGET_CPT_CODES**; deletes all prices for that hospital first |
| `scripts/seed-hospital-files.ts` | Current bulk seeder: download URL → `/tmp/hospital-files` → stream JSON/CSV → `createMany` |
| `scripts/seed-prices.mjs` | Older JS seeder with Anthropic usage |
| `src/app/api/upload/route.ts` | Production upload path (serverless) |
| `src/app/api/validate/route.ts` | Upload + Medicare range check; **loads whole file into a Buffer** |
| `scripts/seed-cpt-codes.ts` | Loads `prisma/cpt_codes.csv` (~9,297 codes) |
| `scripts/seed-condition-mappings.ts` | Hardcoded symptom → CPT |
| `scripts/seed-medicare-rates.ts` / `seed-mpfs-rates.ts` / `seed-cms-charges.ts` / `seed-revenue-codes.ts` | Benchmark / CMS ancillary tables |
| `scripts/system-test.ts` | Live/local regression of search+compare |

### 2.7 Search implementation (summary)

See also `04-failure-analysis.md`.

**KNOWN.** Search is **not** Postgres FTS, trigram, vector, or an external search engine.

1. Keyword extraction + `ILIKE` on `ConditionMapping.condition` and `CptCode.description`.
2. If any condition mapping hits, **CptCode hits are discarded**.
3. Intersect with `Procedure` rows (`cptCode IN (...)`).
4. Redis cache `search10:{query}` 1 hour.
5. Compare uses SQL `PERCENTILE_CONT` medians on `PriceEntry`, with `$100` floor and hospital name canonicalization.

`pg_trgm` is **installed** on Neon and **unused** (no GIN/trgm indexes).

### 2.8 Authentication

| Mechanism | Purpose | Notes |
| --- | --- | --- |
| `SITE_PASSWORD` cookie `site-access` | Gate ShopForCare pages/APIs | Cookie value is the **plaintext password**. System test default `"Health"`. |
| `ADMIN_PASSWORD` cookie `admin-session=authenticated` | Edit site content | Default `"shopforcare-admin-2026"` if env unset |
| JWT `auth-token` (`jose` + `JWT_SECRET`) | UIGen user accounts | Fallback secret `"development-secret-key"` |
| `CRON_SECRET` Bearer | Cron routes | If unset, cron routes are effectively open off-localhost |

### 2.9 Caching

- Redis/KV: procedure-search, CPT lookup, compare, breakdown, concern-explore, physicians, MPFS.
- CDN/`Cache-Control` on `/api/prices` and compare.
- In-memory maps on `/api/prices/estimate` and `/api/admin/data-audit` (per serverless instance).
- Next ISR on home page (1 hour).

### 2.10 File storage

**KNOWN.** There is no object store (S3/Blob) in the app.

- Bulk seeder writes to **`/tmp/hospital-files`** (ephemeral).
- Hospital rows store a `sourceFile` **string path or URL**, not the file.
- Repo contains **no** hospital MRFs. Only `prisma/cpt_codes.csv`.

---

## 3. Vercel

**KNOWN** from Vercel MCP `get_project` / `list_deployments` (without env decryption).

| Field | Value |
| --- | --- |
| Project | `manhattan-charge-master-uq6x` (`prj_J1Cg0RhjfoyqQT9mETyjeqxBNf2C`) |
| Account | `team_ZNbOz8aBMGmVa2NLax9cZpYw` (scope `jphberkmans-projects`) |
| Framework | nextjs, Node `24.x` |
| Production domain | `shopforcare.xyz` (+ `*.vercel.app` aliases) |
| Latest **production READY** deploy | `dpl_EajKDogKXd2U2Vh7QsxohEDa78SS` — commit `2542e3c` on `main` (“Revert hirepierceatdecagon landing page”) |
| Latest overall | Preview `cursor/soc2-hipaa-compliance-6685` — **ERROR** |

**Environment variables referenced in code (names only):**

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma Postgres |
| `ANTHROPIC_API_KEY` | Claude calls |
| `JWT_SECRET` | UIGen sessions |
| `SITE_PASSWORD` | Consumer gate |
| `ADMIN_PASSWORD` | Admin gate |
| `CRON_SECRET` | Cron auth |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV |
| `REDIS_URL` | ioredis fallback |
| `DEEPGRAM_API_KEY` | Unrelated dispatch |
| `BROADCASTIFY_COOKIE` | Unrelated dispatch |
| `NODE_ENV` | Cookie secure flag |

**UNKNOWN — access missing:** `filter_project_envs` returned **403** for this team scope. This agent cannot list which of the above are actually set in Production vs Preview, nor whether Neon pooled URL, KV, or Anthropic are configured.

### Build / runtime constraints

**KNOWN.**

- `package.json` `build`: `prisma db push --accept-data-loss && next build`  
  **Destructive risk:** `db push --accept-data-loss` can drop columns/tables that diverge from `schema.prisma` on every deploy.
- `next.config.ts` allows **500MB** middleware body (uploads).
- Upload/validate/breakdown set `maxDuration` 120s; prewarm 300s.
- **Ingestion inside serverless is a real path** (`/api/upload`, `/api/validate`). Multi-GB chargemasters cannot complete there.
- Bulk ingestion is intended as **local `tsx` scripts**, but those scripts persist `/tmp/...` paths into `Hospital.sourceFile`.

---

## 4. Neon / Postgres

### 4.1 Projects visible to this agent

| Neon project | Name | Storage (synthetic) | Notes |
| --- | --- | --- | --- |
| `cool-fire-98130468` | `manhattan-marketplace` | ~15.8 GB | **ShopForCare data — used below** |
| `summer-sea-45319183` | `roladex` | ~135 MB | Unrelated; not queried in depth |

**INFERRED.** Application `DATABASE_URL` on Vercel points at `manhattan-marketplace`. Not proven without env access.

### 4.2 Live table sizes (KNOWN)

`inspect_database` `table-sizes`:

| Table | Approx size |
| --- | --- |
| `PriceEntry` | **9373 MB** |
| `Procedure` | 25 MB |
| `CptCode` | ~2 MB |
| `CmsChargeData` | 336 kB |
| Others | tiny |

Indexes on `PriceEntry` alone are **~5.6 GB** (PK 2370 MB plus many btree indexes).

`pg_class.reltuples` / live counts:

| Table | Rows (class) |
| --- | --- |
| `PriceEntry` | ~45.6M estimate; **49,591,412** via `GROUP BY source` |
| `Procedure` | **232,461** exact count |
| `CptCode` | **9,297** exact |
| `Hospital` | **16** rows |
| `ConditionMapping` | **138** |
| `CmsChargeData` | **1,637** |
| `RevenueCode` | **187** |
| `SearchLog` | **163** |

### 4.3 Schema vs Prisma

Live `PriceEntry` columns match Prisma: `id, hospitalId, procedureId, payerName, payerType, priceInCents, priceType, rawCode, createdAt, source`.

**There is no raw-source table, no file-inventory table, no provenance/warning columns, no setting/billing class/plan/modifier/NDC/revenue code on the price row.**

`Hospital` has `sourceFile` + `lastSeeded` only.

Migrations in repo: SQLite-style SQL from 2025–2026 (`DATETIME`, `PRIMARY KEY` without Postgres types). Production was evolved with **`prisma db push`**, not those migration files. `migration_lock.toml` says postgresql now.

### 4.4 Extensions and search strategy

- Extensions: `plpgsql`, **`pg_trgm`** (unused).
- No `tsvector` / GIN FTS.
- No partitioning.
- Connection: Prisma default pooling via `DATABASE_URL` (unknown whether `-pooler` Neon URL).

### 4.5 Hospital identity in production (KNOWN)

| Hospital id | Name | Price rows | lastSeeded | sourceFile |
| --- | --- | --- | --- | --- |
| `hospital_name__Manhattan, NY` | NYC Health + Hospitals | **26,797,494** | 2026-03-09 | H+H CSV filename |
| NYP concatenated 3-campus name | NYP Cornell\|Columbia\|Brooklyn Methodist | **7,838,046** | 2026-03-08 | NYP JSON |
| `Lenox Hill Hospital__100 E 77th St...` | Lenox Hill | **5,429,749** | 2026-04-03 | `/tmp/hospital-files/Lenox_Hill_Hospital.csv` |
| NYU Tisch | Tisch | 2,717,464 | 2026-03-13 | `/tmp/...csv` |
| HSS address id | HSS | 2,413,364 | 2026-03-13 | `/tmp/...json` |
| NYU Orthopedic | NYU Ortho | 2,183,057 | 2026-03-13 | `/tmp/...csv` |
| Mount Sinai (Manhattan, NY) | Mount Sinai | 903,028 | 2026-03-08 | JSON filename |
| MSK | MSK | 587,610 | 2026-03-13 | `/tmp/...json` |
| Mount Sinai Behavioral | MS Behavioral | 432,760 | 2026-03-09 | JSON |
| Lenox Hill (Manhattan, NY) | Lenox Hill **duplicate** | 240,000 | 2026-03-09 | JSON |
| Mount Sinai Morningside | Morningside | 20,000 | 2026-03-08 | JSON |
| `chargemaster__Manhattan, NY` | **name = "chargemaster"** | 14,282 | 2026-03-09 | `chargemaster.xlsx` |
| NYEE of Mount Sinai | NYEE | 10,624 | 2026-03-09 | JSON |
| Mount Sinai (Levy Pl) | Mount Sinai **duplicate** | 2,000 | 2026-03-13 | `/tmp/...json` |
| Northwell Health | Northwell (system-level) | 1,646 | 2026-03-09 | xlsx |
| HSS (Manhattan, NY) | HSS **duplicate** | 288 | 2026-03-08 | JSON |

Missing as distinct searchable hospitals vs registry intent: Bellevue/Harlem/Metropolitan/Carter as separate facilities (folded into H+H blob), NYP campuses split, Mount Sinai West as distinct from Morningside (compare map aliases Morningside → `mount-sinai-west`).

### 4.6 Payer / price type distribution (KNOWN)

`payerType`:

| payerType | count |
| --- | --- |
| `gross` | 24,935,547 |
| `other` | 11,440,333 |
| `commercial` | 9,373,970 |
| `cash` | 3,171,615 |
| `medicare` | 499,430 |
| `medicaid` | 170,517 |

`priceType`: **only** `gross` (32.6M), `negotiated` (13.8M), `discounted` (3.2M). No `min`/`max` in production.

`source`: **all** `mrf`.

**KNOWN defect:** `scripts/seed-hospital-files.ts` writes gross charges with `payerType: "gross"` (not a documented `PayerType`). Canonical types are `commercial | medicare | medicaid | cash | other`.

### 4.7 Procedure code quality (KNOWN)

Of 232,461 `Procedure` rows:

| Kind | Count |
| --- | --- |
| 5-digit numeric CPT | 12,573 |
| HCPCS `[A-Z][0-9]{4}` | 3,212 |
| **Other (NDC-like, Rx keys, descriptions, garbage)** | **216,676 (93%)** |

Samples of “other”: `00000Rx00000000027`, etc.

MRI knee **does** exist: CPT `73721` has **4,086** price rows; `73718`–`73723` similarly populated. Knee replacement `27447` has 1,203 rows. Colonoscopy `45378` has 3,478.

**Conclusion:** Neon **does** contain far more than the 13-code TARGET set. Completeness of *source files* vs *searchable CPT procedures* is a different question (see §6 and `04-failure-analysis.md`).

### 4.8 ERD (actual)

```
User 1──* Project          (UIGen; unused by ShopForCare UI)

Hospital 1──* PriceEntry *──1 Procedure
                               │
                               │  (logical only; no FK)
                               ▼
                             CptCode (code PK)

ConditionMapping.cptCode ──(logical)──► Procedure.cptCode / CptCode.code
RevenueCode              (standalone)
CmsChargeData            (standalone; keyed by CMS CCN + DRG + year)
SearchLog                (append-only query telemetry)
SiteContent / ContentHistory  (CMS-like copy)
```

No `SourceFile`, `RawRecord`, `IngestionRun`, or `Verification` entities.

---

## 5. AI / LLM inventory

All healthcare LLM calls go through `src/lib/anthropic-fetch.ts` except UIGen chat (`@ai-sdk/anthropic`).

| Call site | Provider / model | Input | Output | Validation | Fallback | Enters product as |
| --- | --- | --- | --- | --- | --- | --- |
| `POST /api/chat` | Anthropic `claude-haiku-4-5` via AI SDK; mock if no key | User + VFS tools | Streaming UIGen code | Tool handlers | MockLanguageModel | UIGen only |
| `POST /api/procedure-breakdown` | `anthropicStream`, default Haiku 4.5, `max_tokens` 2500 | Patient query + optional “NLM hint” (actually local CPT search) | JSON procedure + components + CPT/HCPCS | JSON parse/repair; CPT “verified in DB” note; **prices from DB only** | Error SSE | Procedure name, component list, CPT codes, clinical reasoning **shown to consumer** |
| `POST /api/concern-explore` | `anthropicCall` cascade Haiku | Symptom text | Educational JSON | Parse JSON | 500 | Educational text (disclaimer attached) |
| `POST /api/physicians/recommend` | `anthropicCall` | Hospitals + procedure | Ranked physicians | NPI registry validation flags | Can generate names if NPI empty | Physician list; `npiVerified` / `npiSource` flags |
| `POST /api/upload` `detectSchemaFromSample` | `anthropicCall` | First 25 rows | Column map JSON | Parse JSON | Throw | **Parser behavior → inserted prices** |
| `POST /api/validate` schema + unknown JSON map | `anthropicCall` | Sample rows | Field map | Parse JSON | Skip/throw | Inserted prices |
| `scripts/seed-prices.mjs` | Anthropic if key set | — | — | — | — | Offline seed (legacy) |

Retry: `anthropicCall` retries 529/503, then model cascade Haiku 4.5 → 3.5 → 3. `anthropicStream` does **not** retry.

### Hallucination / fact-boundary flags

| Path | Can LLM output become a consumer-facing healthcare **fact**? |
| --- | --- |
| Breakdown dollar fields | **No** (prompt forbids; DB overwrite). Totals of nulls become 0. |
| Breakdown CPT / procedure identity | **Yes** — LLM-chosen CPT is displayed; unverified codes get a note, not a block |
| Compare insuranceRate | **No LLM**; **Yes formula** — `cms-derived-estimate` uses Medicare payment × 2.5 and treats chargemaster as cash |
| Compare patientCost | **Yes derived** — `insuranceRate * coinsurance` (unknown coinsurance silently 20%) |
| Concern-explore | Educational, not prices; still clinical-adjacent |
| Physicians | Invented names possible if NPI path fails |
| Upload schema AI | Indirect: wrong columns → wrong prices stored as facts |

---

## 6. Ingestion → search pipeline (forensics)

### Intended bulk path (`seed-hospital-files.ts`)

```
Hospital URL
 → fetch (User-Agent browser-like)
 → optional ZIP extract (JSZip; **loads entire ZIP into RAM**)
 → /tmp/hospital-files/{sanitized name}.{csv|json}
 → peek first 100 bytes for JSON vs CSV
 → stream parse
 → NormalizedRow{hospitalName,address,cptCode,procedureName,category,payer*,price*}
 → upsert Hospital id = `${name}__${address}`
 → upsert Procedure on cptCode (first name wins, never updated)
 → PriceEntry.createMany skipDuplicates (skipDuplicates is a no-op without a unique constraint)
```

Loss points **KNOWN** from code:

| Stage | What is dropped / distorted |
| --- | --- |
| CSV | Non-`CPT` code types skipped; non-5-digit CPT skipped (`isStandardCptCode`) |
| JSON `cptOnly: true` (Mount Sinai entries) | Non-5-digit codes skipped |
| JSON | Percentage/algorithm rates skipped (`standard_charge_percentage` continue) |
| JSON | `minimum`/`maximum` field names must be `minimum_negotiated_charge` — CMS `minimum`/`maximum` **not read** in this script |
| ZIP | Only **one** member file ingested (largest json then csv) |
| Hospital id | Filename/header mistakes become hospitals (`hospital_name`, `chargemaster`) |
| Procedure upsert `update: {}` | First description frozen; later better names ignored |
| No row inventory | Malformed JSON objects `catch { /* skip */ }` with **no counter** |
| `/tmp` path stored | Provenance not reproducible after VM recycle |
| `skipDuplicates: true` | **Does not dedupe**; Prisma skipDuplicates requires unique/constraint |

### Legacy path (`seed-prices.ts` + parsers)

Filters to **13 surgical CPT codes**. Comment explicitly: “we only keep ~13 CPT codes”. **Not** what populated the 49M-row table (**INFERRED**: bulk script + uploads did).

If someone re-runs `npm run seed:prices` against production, it **`deleteMany` all prices for that hospital id** then reloads only 13 CPTs. High operational risk.

### Upload path

- Streaming CSV/JSON for some formats; XLSX via SheetJS (memory).
- AI column mapping on 25-row sample — **fragile on CMS wide files**.
- `maxDuration` 120s — **cannot ingest multi-GB files**.
- `validate` `JSON.parse(buffer)` — **cannot ingest multi-GB JSON**.

### Search eligibility

A source row is consumer-searchable only if:

1. It became a `PriceEntry`.
2. Its `Procedure.cptCode` is what `searchCptCodes` returns.
3. Compare then finds cash or negotiated/discounted rows with `priceInCents >= 10000`.

Gross-only rows **do not** produce a compare entry (`HAVING` requires cash or insurance).

---

## 7. Observability that already exists

**KNOWN.**

- `SearchLog` (query, endpoint, resultCount, cpt, insurer, timing) — fire-and-forget.
- `/api/admin/data-audit` — hospital counts, source/payer groupBy, outliers, duplicate groups, malformed CPT count, recent searches.
- Cron freshness + quality snapshot.
- Admin audit page.

**Missing:** file inventory, per-file accept/reject counts, parser identity, verification status, zero-result explanation, ingestion duration.

---

## 8. Tests

**KNOWN.** Vitest coverage is UIGen (file system, chat, auth). Pricing correctness is `scripts/system-test.ts` (HTTP against localhost or `shopforcare.xyz`), not CI. No golden-record tests tying a source MRF row to a search hit.

---

## 9. Access gaps (do not guess)

| Resource | Status | Why needed |
| --- | --- | --- |
| Vercel env values / which `DATABASE_URL` | **403** on `filter_project_envs` | Confirm Neon project, KV, Anthropic, SITE_PASSWORD, whether `CRON_SECRET` is set |
| Original ~36GB MRF corpus | **Not in repo, not in this VM** | File-level reconciliation vs 49M rows |
| AMA CPT license / CMS PPL key | **UNKNOWN** | Code calls an unofficial PPL URL without auth |
| Production runtime logs / EXPLAIN of slow compare | Not pulled this phase | Bottleneck proof |
| `roladex` Neon | Listed, unused | Confirm it is unrelated |

---

## 10. Phase 1 verdict (one paragraph)

ShopForCare is a working Next.js + Neon price explorer with **tens of millions of MRF-derived rows already in Postgres**. The founder concern “Neon isn’t searching all the files” is **partly true and partly a misdiagnosis**: the database is large, but **hospital identity is corrupted**, **93% of Procedure keys are not CPT/HCPCS**, **search is a tiny ILIKE overlay plus 138 condition mappings**, **compare hides hospitals without cash/negotiated ≥ $100**, and **there is no file inventory or raw-record provenance**. The 13-code parser filter is real in one seeder and is **not** the current production volume path. Do not rewrite the database until file-level reconciliation and identity cleanup are designed (see `05-restoration-plan.md`).
