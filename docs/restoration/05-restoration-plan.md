# Restoration plan (proposal only — not executed)

This plan follows AUDIT → DIAGNOSE → PLAN. **No migrations or product code have been applied.**

Priority bands:

- **P0** Trust / correctness (wrong or unsupported healthcare prices)
- **P1** Completeness (corpus not fully or honestly searchable)
- **P2** Code resolution (CPT/HCPCS/ICD + authority)
- **P3** Search quality
- **P4** Consumer experience (clarification, provenance, qualification)
- **P5** Infrastructure

---

## Target architecture (incremental, boring)

Keep Neon + Next.js. Do **not** introduce a vector DB, microservices, or LLM-as-database.

```
SourceFile (inventory + blob URI + hash + status)
    → adapter (nyu-wide-csv | cms-json-v2 | cms-json-v3 | hhc-tall | xlsx-ai-quarantine)
    → RawCharge (optional jsonb / columnar subset)  [P1, additive]
    → NormalizedPrice (today’s PriceEntry + provenance FKs)
    → Verification flags (suppress consumer vs quarantine)

User text
    → deterministic extract (codes, anatomy, contrast, setting)
    → ConditionMapping + CptCode/HCPCS/ICD tables
    → optional LLM candidate *proposals*
    → authority check
    → RESOLVED | AMBIGUOUS | INSUFFICIENT | UNSUPPORTED
    → SQL on NormalizedPrice
    → qualification (gross vs cash vs negotiated vs Medicare benchmark)
    → consumer result state
```

AI remains around facts. Dollar amounts stay SQL.

---

## P0 — Trust / correctness

### P0.1 Stop destructive production schema deploys

| | |
| --- | --- |
| Problem | `prisma db push --accept-data-loss` on Vercel build |
| Evidence | `package.json` |
| Change | Build = `prisma generate && next build`. Deploy migrations separately via `migrate deploy`. |
| Files | `package.json`, CI if any |
| DB | None immediately |
| Deps | None |
| Risk | Deploys fail if schema drifted — good |
| Rollback | Revert script |
| Accept | Production build does not invoke `db push` |

### P0.2 Stop CMS×2.5 from occupying `insuranceRate`

| | |
| --- | --- |
| Problem | Missing hospitals get fabricated commercial rates |
| Evidence | `hospitals/compare/route.ts` |
| Change | Remove filler block or return `dataSource: none` + separate `medicare` object only |
| Files | compare route, `HospitalCostComparison.tsx` |
| DB | None |
| Deps | None |
| Risk | Emptier grid |
| Rollback | Git revert |
| Accept | No compare entry has `cms-derived-estimate` insurance dollars |

### P0.3 Do not compute patient OOP without user plan inputs

| | |
| --- | --- |
| Problem | Default 20% coinsurance; unknown→0 |
| Evidence | compare `coinsurance` default; `calculateSimpleCost` |
| Change | `patientCost` null unless user supplied coinsurance/plan; label ESTIMATED |
| Files | compare route, `AiProcedureSearch`, `cost-calculator.ts` |
| DB | None |
| Deps | P0.2 |
| Risk | UX copy |
| Rollback | Git revert |
| Accept | Fixture: no plan → no “you pay $X” |

### P0.4 Production secrets fail-closed

| | |
| --- | --- |
| Problem | Default admin password, JWT secret, optional CRON_SECRET, plaintext site cookie |
| Evidence | `admin/auth`, `auth.ts`, cron routes |
| Change | If `NODE_ENV=production` and `ADMIN_PASSWORD`/`JWT_SECRET`/`CRON_SECRET` missing → refuse. Hash site-access cookie. Protect `/api/admin/data-audit`. |
| Files | auth routes, middleware |
| DB | None |
| Deps | Founder sets env (currently **UNKNOWN** which are set) |
| Risk | Lockout |
| Rollback | Env + revert |
| Accept | Unauthenticated audit 401; default admin password rejected |

### P0.5 Guard destructive seeders

| | |
| --- | --- |
| Problem | `seed-prices.ts` deleteMany + 13 CPT |
| Change | Require `ALLOW_DESTRUCTIVE_SEED`; refuse known prod hostnames |
| Files | `seed-prices.ts`, README |
| DB | None |
| Accept | Script exits 1 against prod URL without flag |

### P0.6 LLM codes cannot be sole authority on breakdown

| | |
| --- | --- |
| Problem | Displayed CPT from Haiku; “high confidence” = data completeness |
| Change | Show LLM CPT only as candidate; verified if in CptCode or PriceEntry; rename confidence to evidence tags |
| Files | `procedure-breakdown/route.ts`, UI |
| Deps | P2 design |
| Accept | Unverified CPT cannot appear as the only search key without banner |

---

## P1 — Data completeness

### P1.1 Inventory table (adapt, don’t bike-shed enums)

Additive model, example:

`SourceFile`: filename, sha256, bytes, hospitalId?, system?, facility?, sourceUrl, downloadedAt, fileEffectiveDate?, schemaVersion?, format, parser, status (`discovered|queued|processing|processed|processed_with_warnings|failed|quarantined`), rowsDiscovered, rowsParsed, rowsRejected, rowsInserted, warnings jsonb, ingestedAt.

Never silently discard; failed files stay `failed` with reason.

**Do not ingest the 36GB corpus until inventory exists and founder confirms the drop location.**

### P1.2 Facility identity backfill

Additive `Facility` (ccn, npi, system, displayName). Map existing 16 Hospital rows. Fix compare alias that sends all H+H → Bellevue.

**Founder decision:** canonical facility list (Manhattan only vs all H+H / NYP campuses).

### P1.3 Reconciliation job

Per SourceFile: discovered / parsed / rejected / inserted / searchable. Fail CI or admin warning if searchable << inserted without explanation (e.g. non-CPT quarantined).

### P1.4 Retire serverless as the path for multi-GB files

Upload API: hard size/time limits + message “use inventory ingest”. Keep small xlsx for demos.

### P1.5 Unique/fingerprint for PriceEntry (phased)

1. Count duplicate groups (audit already does).  
2. Add generated fingerprint column nullable.  
3. Backfill.  
4. Unique index concurrently.  
Never `deleteMany` hospital prices as a refresh strategy.

---

## P2 — Code resolution

Layered pipeline (design; implement after P0):

1. Extract explicit codes in the query.  
2. Extract anatomy / modality / contrast / setting / laterality as **missing|value**.  
3. ConditionMapping (keep — they work for gallstones/TKA).  
4. CptCode + HCPCS files + Procedure.name (do **not** drop CptCode when mapping hits).  
5. Optional LLM proposals, tagged `llm_only`.  
6. Validate format + membership in authoritative tables.  
7. If contrast/body region would change CPT, **AMBIGUOUS** — one question.  
8. Search prices for **verified candidate set**.

Confidence = evidence flags, not invented percents:

- `exact_code`
- `mapping_phrase`
- `description_tokens`
- `multi_code_conflict`
- `llm_only`
- `missing_contrast`
- `missing_anatomy`

ICD-10-CM is diagnosis only. Do not price on ICD.

**CMS:** seed HCPCS Level II ZIP (public). ICD-10-CM files from CDC. CPT redistribution depends on AMA license (see `02-authoritative-data-sources.md`). Fix or remove fake PPL URL.

---

## P3 — Search quality

- Use `pg_trgm` **after** measuring ILIKE cost (extension already installed).  
- Candidate cap 10–20 with explanation.  
- Do not FTS 49M price rows.  
- Keep Redis; version cache keys on ranking changes.  
- Ranking: exact mapping > description token overlap > llm_only.  
- Pagination already implicit (slice 10); document it.

---

## P4 — Consumer experience

Result states (map to existing `dataQuality` / `dataSource` rather than new marketing words if possible):

| State | When |
| --- | --- |
| VERIFIED | MRF row, known facility, known price type, code validated |
| QUALIFIED | Real row but setting/payer/plan incomplete |
| ESTIMATED | User-supplied plan math only |
| NEEDS_CLARIFICATION | Ambiguous CPT set |
| INSUFFICIENT_DATA | No MRF row |
| UNVERIFIED | Failed checks; not shown as verified |

Show provenance: hospital, file date (`lastSeeded` until SourceFile exists), price type label, “not your bill”.

Healthcare safeguard copy: code ID ≠ diagnosis; concern-explore remains educational.

---

## P5 — Infrastructure

Only after EXPLAIN ANALYZE:

- Neon pooled URL + maybe existing adapter packages  
- Drop unused PriceEntry indexes if `unused-indexes` confirms  
- Partitioning **not** first  
- Materialized per-(procedure, hospital, priceType) medians if compare is the bottleneck  
- Object storage for MRFs  

Do not optimize ingestion throughput until inventory + adapters exist.

---

## Proposed database changes (additive)

1. `SourceFile` + statuses  
2. `Facility` / hospital FKs (nullable first)  
3. `PriceEntry.sourceFileId`, `parser`, `warnings` nullable  
4. `codeSystem` on Procedure  
5. Later: unique fingerprint  
6. **No drop** of PriceEntry  
7. **No** rewrite of 49M rows in one transaction  

Rollback: new tables unused by old read path until switch.

---

## Proposed ingestion changes

- Adapter per format; one canonical writer.  
- Unify `classifyPayerType` / `normalizePriceType` (fix `payerType: gross`).  
- Parse CMS min/max and v3 percentile fields into distinct types; never coerce.  
- Durable file store; not `/tmp`.  
- Counters on skip (malformed JSON currently silent).  
- Disable TARGET_CPT filter for production ingest (keep as optional `--only-cpt=` debug).

---

## Proposed verification

Deterministic checks before consumer:

- facility known  
- sourceFile known  
- code system + format  
- optional membership in CptCode/HCPCS  
- numeric price > 0  
- priceType in enum  
- freshness  
- outlier flags (already sketched in upload)  

Failures **suppress or mark**, do not delete.

---

## Test strategy

1. **Unit:** parsers on tiny fixtures (NYU header skip, HHC tall, CMS JSON item).  
2. **Golden:** 10–20 rows copied from real files (once files are available) → expected cents + hospital + code.  
3. **system-test.ts** expand with MRI/colonoscopy/ER/CBC/PT + ambiguous/unsupported; assert clarification not a wrong CPT.  
4. **Reconciliation:** fixture of 100 rows → 100 inserted or explained.  
5. Vitest in CI for classifiers; live Neon tests optional/manual.

No production ingest in tests.

---

## Restoration sequence (after founder approval)

1. P0.1 build script + P0.4 secrets + P0.5 seed guard (low data risk).  
2. P0.2 / P0.3 compare/OOP honesty (UI+API).  
3. P0.6 breakdown labeling.  
4. P1.1 SourceFile schema (empty) + admin list.  
5. Confirm file drop location and AMA/PPL decisions.  
6. P1.2 facility mapping (read-path switch last).  
7. P2 clarification for MRI-class queries.  
8. P1.3 reconciliation on **one** hospital file before bulk re-ingest.  
9. P3 trigram only if measurements say so.  
10. P5 only with EXPLAIN.

---

## Rollback posture

Every P0 item is a small PR. Database work is additive. Old compare remains if feature-flagged. Never `migrate reset` on `manhattan-marketplace`.
