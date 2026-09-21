# Failure analysis

Each issue uses: Issue / Evidence / Root Cause / User Impact / Data Integrity / Proposed Fix / Risk / Test.  
**Class** is KNOWN / INFERRED / UNKNOWN.

---

## ISSUE-01 — No file inventory; source files not retained

**Class:** KNOWN

**Issue:** ShopForCare cannot answer “which files did we ingest, did they finish, how many rows were rejected?” Original MRFs are not in the repo or an object store. `Hospital.sourceFile` is a path or URL, often `/tmp/hospital-files/...`.

**Evidence:** No inventory table in Prisma/Neon; `seed-hospital-files.ts` `DOWNLOAD_DIR = "/tmp/hospital-files"`; live `sourceFile` values include `/tmp/...` and `chargemaster.xlsx`.

**Root Cause:** Ingestion was built as one-shot scripts + upload API, not a pipeline.

**User Impact:** Cannot explain missing hospitals or stale files. Consumer sees whatever happened to load.

**Data Integrity:** Silent skip of files is undetectable. Re-download URLs may differ from what was loaded in March–April 2026.

**Proposed Fix:** Additive `SourceFile` (or `IngestionRun`) table; store hash, size, URL, status, row counters; copy bytes to durable storage **before** parse. Do not delete Neon prices.

**Risk:** Storage cost; PII-free but large files.

**Test:** Place a fixture file; status `processed`; hash stable; re-run is no-op or documented update.

---

## ISSUE-02 — Hospital identity is corrupted (largest completeness illusion)

**Class:** KNOWN

**Issue:** 26.8M prices sit on hospital id `hospital_name__Manhattan, NY` named “NYC Health + Hospitals”. NYP is one row concatenating three campuses. Duplicate Mount Sinai / HSS / Lenox Hill rows. Junk hospital `chargemaster`.

**Evidence:** Live `GROUP BY hospitalId` counts (see audit §4.5). Compare name map cannot split H+H facilities; maps `"nyc health + hospitals" → bellevue` so **all H+H prices can display as Bellevue**.

**Root Cause:** Hospital PK = `${hospitalName}__${address}`. CSV header token `hospital_name` and wide-system files were ingested as names. NYP JSON hospital_name is a pipe-joined string.

**User Impact:** Wrong facility attribution; Bellevue vs Harlem vs Metropolitan indistinguishable; NYP Cornell vs Columbia mixed.

**Data Integrity:** **Misleading**, not merely missing. This is worse than empty search.

**Proposed Fix:** Additive `Facility` with CMS CCN + NPI; keep old Hospital rows; map prices in backfill; stop using header literals as names. Founder confirms facility list.

**Risk:** Compare UI canonical list must be updated; cached compare keys.

**Test:** Known Bellevue vs Harlem golden rows resolve to different facilities.

---

## ISSUE-03 — Procedure table is 93% non-codes

**Class:** KNOWN

**Issue:** 216,676 / 232,461 procedures are not CPT or HCPCS (`00000Rx…`, etc.). Search and unique constraint treat them as procedure identity.

**Evidence:** SQL classification counts; sample keys.

**Root Cause:** JSON/upload paths accept `cptCode || procedureName.slice(0,10)` and NDC/Rx identifiers; CSV bulk path is stricter (5-digit CPT) but JSON/H+H/XLSX are not.

**User Impact:** Noise in DB; some searches may match garbage if ILIKE hits names; admin “malformed CPT” warning understates the issue (regex only flags Procedure table, audit already expected this).

**Data Integrity:** Duplicate conceptual services; codes not authoritative.

**Proposed Fix:** `codeSystem` + `billingCode` columns; quarantine non CPT/HCPCS/REV/NDC into `unresolved_code`; do not delete.

**Risk:** Query rewrites.

**Test:** Counts of codeSystem; search still finds `73721`.

---

## ISSUE-04 — `skipDuplicates` does not deduplicate

**Class:** KNOWN

**Issue:** `createMany({ skipDuplicates: true })` without a unique constraint on `(hospitalId, procedureId, payerName, priceType, priceInCents)` inserts duplicates on re-seed.

**Evidence:** Prisma docs; schema has no such unique; data-audit queries duplicate groups; Lenox Hill ingested twice (240k + 5.4M).

**Root Cause:** Misunderstood Prisma API.

**User Impact:** Inflated n; medians may be OK but weights bias toward duplicated files.

**Data Integrity:** Duplicated.

**Proposed Fix:** Unique index (careful with payerName length) **or** ingest fingerprint; backfill later. Do not unique-index blindly on 49M rows without a plan.

**Risk:** Index build time/locks on 9GB table.

**Test:** Re-ingest fixture; row count stable.

---

## ISSUE-05 — Two seeders; the “safe” one can wipe production

**Class:** KNOWN

**Issue:** `seed-prices.ts` `deleteMany` all prices for a hospital then loads **13 CPTs only**.

**Evidence:** `src/lib/price-transparency/seed-prices.ts` lines 54–60, `TARGET_CPT_CODES`.

**Root Cause:** Prototype for a demo subset; never retired after bulk seeder existed.

**User Impact:** If run against prod, searchable corpus collapses to 13 surgeries.

**Data Integrity:** Catastrophic loss.

**Proposed Fix:** Disable or guard with `ALLOW_DESTRUCTIVE_SEED=1` + refuse `DATABASE_URL` matching prod. Document in runbooks. **Do not run this script.**

**Risk:** None if gated.

**Test:** Dry-run test env only.

---

## ISSUE-06 — Search does not scan PriceEntry descriptions; it resolves ~10 CPTs then inner-joins Procedure

**Class:** KNOWN

**Issue:** “Are we searching the whole corpus?” **No.** Search never full-text-searches 49M rows. It maps the query to a handful of CPT codes, then checks those codes exist as `Procedure`.

**Evidence:** `cpt-lookup.ts` LIMIT; `procedure-search` `take: 20`; condition mappings preferred exclusively over `CptCode` hits.

**Root Cause:** Intentional performance design after Neon timeouts (comment in procedure-search).

**User Impact:** Query “MRI” logged as CPT **70553 (brain)**, not knee, even though `73721` has 4,086 prices. Mapping `MRI brain` and `MRI knee` both match keyword `mri`; first ranked mapping wins; CptCode table unused when any mapping exists.

**Data Integrity:** **Missing results** that exist in DB.

**Proposed Fix:** Clarification engine for ambiguous anatomy; merge mapping + description candidates; do not drop CptCode hits; ask contrast/body region.

**Risk:** More candidate CPTs → heavier compare. Cap + clarify.

**Test:** Corpus in Phase 20: “MRI”, “MRI knee”, “MRI knee without contrast”.

---

## ISSUE-07 — Compare hides gross-only and sub-$100 rows; fabricates commercial rates

**Class:** KNOWN

**Issue:** Hospital appears only if cash or negotiated/discounted ≥ $100. Missing hospitals filled with `cms-derived-estimate`: cash = average **covered charges**, insurance = Medicare payment × 2.5.

**Evidence:** `hospitals/compare/route.ts` `MIN_CENTS`, `HAVING`, lines 283–336. UI labels CMS-derived, but still shows a dollar as “insuranceRate”.

**Root Cause:** Product wanted a complete Manhattan grid; used CMS PUF as filler.

**User Impact:** Consumer may treat 2.5× Medicare as a plan rate. Gross-only MRF data invisible.

**Data Integrity:** **Misleading estimated values** adjacent to real chargemaster medians.

**Proposed Fix:** Never populate `insuranceRate` from CMS multiplier. Separate Medicare benchmark module. Show gross-only as qualified.

**Risk:** Sparser tables (honest).

**Test:** Hospital with only gross rows appears as qualified gross, not fake insurance.

---

## ISSUE-08 — payerType contamination; min/max not stored

**Class:** KNOWN

**Issue:** 24.9M rows `payerType='gross'`. No `priceType` `min`/`max` in prod despite types.ts.

**Evidence:** GROUP BY queries; `seed-hospital-files` emit `payerType: "gross"`; JSON uses `minimum_negotiated_charge` not CMS `minimum`.

**Root Cause:** Inconsistent classifiers across four parsers.

**User Impact:** Filters on medicare/medicaid/commercial miss gross rows (maybe OK) but analytics and audit lie.

**Data Integrity:** Wrong qualification.

**Proposed Fix:** Normalize classifier in one module; additive backfill `payerType='other'` where name is Gross; parse min/max on next ingest only.

**Risk:** Filter behavior change.

**Test:** Classifier unit tests on fixtures.

---

## ISSUE-09 — Serverless ingestion cannot handle the 36GB corpus

**Class:** KNOWN

**Issue:** `/api/upload` 120s; `/api/validate` buffers entire file; ZIP via JSZip in memory; Next body 500MB.

**Evidence:** `maxDuration`, `JSON.parse(buffer)`, `JSZip.loadAsync(arrayBuffer)`, `middlewareClientMaxBodySize`.

**Root Cause:** Convenience upload for spreadsheets, not MRF plants.

**User Impact:** Large files fail or partial-insert; operators think “upload is the ingest path.”

**Data Integrity:** Partial files.

**Proposed Fix:** Offline/worker ingest only for >N MB; upload API rejects oversized with explicit error.

**Risk:** UX for small files remains.

**Test:** 1MB CSV succeeds; oversized returns 413 with message.

---

## ISSUE-10 — `prisma db push --accept-data-loss` on every Vercel build

**Class:** KNOWN

**Issue:** Production schema can be dropped/altered automatically.

**Evidence:** `package.json` `build` script.

**Root Cause:** Prototype convenience.

**User Impact:** Outage / data loss.

**Data Integrity:** Existential.

**Proposed Fix:** `prisma generate` + `migrate deploy` only; never `db push` in production build.

**Risk:** Build fails if migrations lag — **desirable**.

**Test:** CI uses migrate; staging clone.

---

## ISSUE-11 — LLM CPT / clinical content still reaches the consumer

**Class:** KNOWN

**Issue:** Breakdown displays LLM procedure identification and component CPTs. Unverified CPT gets a footnote, not suppression. `confidence: high` means “>50% components had some DB price”, **not** code correctness. Concern-explore and physicians are generative.

**Evidence:** `procedure-breakdown/route.ts` confidence block; SearchLog `coronary bipass` → CPT `33510` (AI) vs mapping `33533`.

**Root Cause:** Product uses LLM as enumerator of billable lines.

**User Impact:** Wrong code → wrong price table; looks authoritative.

**Data Integrity:** Interpretation masquerading as coding authority.

**Proposed Fix:** Candidate set from mappings+CptCode+optional LLM **proposals**; display only codes that exist in `CptCode` or MRF; clarification states; never high confidence from completeness alone.

**Risk:** Fewer flashy breakdowns.

**Test:** Ambiguous “MRI” → NEEDS_CLARIFICATION, not a single CPT.

---

## ISSUE-12 — OOP uses unknown as zero / silent 20%

**Class:** KNOWN

**Issue:** Compare always `insuranceRate * coinsurance` with default 0.20. `calculateSimpleCost` sets deductiblePortion 0. Deductible/OOP unknown become 0 in simple path.

**Evidence:** `cost-calculator.ts`; compare route `coinsurance` query default.

**Root Cause:** Demo UX.

**User Impact:** “You pay $X” is not an out-of-pocket estimate unless the user entered a plan.

**Data Integrity:** Estimated presented like known.

**Proposed Fix:** Result state ESTIMATED vs QUALIFIED; require disclosed assumptions; never apply coinsurance without user input.

**Risk:** Less “complete” UI.

**Test:** No plan → no patientCost or explicit “unknown”.

---

## ISSUE-13 — Security: default admin password, plaintext site cookie, open audit

**Class:** KNOWN

**Issue:** `ADMIN_PASSWORD` defaults to `shopforcare-admin-2026`. Site cookie stores password plaintext. `/api/admin/data-audit` has no admin check. Cron routes open if `CRON_SECRET` unset. JWT fallback `development-secret-key`. `data-audit` returns DB stats to anyone with site password.

**Evidence:** `admin/auth/route.ts`, `middleware.ts`, `data-audit/route.ts`, `auth.ts`.

**Root Cause:** Prototype auth.

**User Impact:** Admin impersonation; data scraping; if SITE_PASSWORD leaked, corpus metrics exposed.

**Data Integrity:** Indirect (tamper content, trigger uploads).

**Proposed Fix:** Fail closed if secrets missing in production; hash site cookie; protect audit; require CRON_SECRET.

**Risk:** Lockout if env missing — fail closed is correct.

**Test:** Unset ADMIN_PASSWORD in prod-like env → admin login 500/disabled.

---

## ISSUE-14 — Stale data; lastSeeded March–April 2026; today 2026-09-20

**Class:** KNOWN

**Issue:** Most hospitals lastSeeded 2026-03-08 to 2026-04-03 (~5–6 months). CY2026 HPT fields not parsed.

**Evidence:** Hospital.lastSeeded; no ingest cron.

**Root Cause:** Manual seed only.

**User Impact:** Stale prices presented without “as of” prominence beyond lastSeeded when mapped.

**Data Integrity:** Stale.

**Proposed Fix:** Show source date; freshness cron already flags >90 days — surface in consumer UI.

**Risk:** Trust copy changes.

**Test:** UI shows ingested date.

---

## ISSUE-15 — pg_trgm unused; CptCode descriptions don’t contain consumer words like “knee” for 73721

**Class:** KNOWN / INFERRED

**Issue:** Official-ish descriptions are “MRI Any Joint Lower Extrem W/O Contrast”. ILIKE `%knee%` on `CptCode` returned **no rows**. Search depends on the 138 mappings.

**Evidence:** SQL; mapping row `MRI knee` → 73721 exists.

**Root Cause:** CMS short descriptions + mapping overlay.

**User Impact:** Unmapped phrases miss even when prices exist.

**Data Integrity:** Missing retrieval.

**Proposed Fix:** Synonym table (deterministic) + clarification; optional trigram on `CptCode.description` and `Procedure.name`. Not a vector DB.

**Risk:** False positives (“joint” too broad).

**Test:** “MRI knee without contrast” → 73721 with explainable evidence.

---

## ISSUE-16 — Build/runtime: Neon adapter unused; EXPLAIN not yet captured

**Class:** KNOWN / UNKNOWN

**Issue:** `@neondatabase/serverless` unused. Compare aggregation on 49M rows can be slow; procedure-search comments mention 30s timeouts.

**Evidence:** `prisma.ts`; compare SQL; comments.

**Root Cause:** Scale arrived after prototype queries.

**Proposed Fix:** EXPLAIN ANALYZE on compare for `73721` before adding caches/partitions. Indexes already numerous; bottleneck may be **hospital grouping + percentile**, not missing index.

**Risk:** Premature Postgres surgery.

**Test:** EXPLAIN on staging clone.

---

## What is *not* the primary failure

**Class:** KNOWN

“Neon is empty / never ingested” is **false**. ~49.6 million `PriceEntry` rows exist, including thousands of MRI/colonoscopy/TKA prices.

The failures are **identity, qualification, retrieval overlay, estimated fillers, and missing provenance** — not a missing disk.
