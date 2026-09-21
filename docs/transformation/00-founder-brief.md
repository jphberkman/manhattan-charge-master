# 00 — Founder brief (Phase 1: discovery, no overhaul executed)

Date: 2026-09-21. Evidence: live Neon queries, repo audit (`docs/restoration/01–08`), live API probes. Classification used throughout: **KNOWN / DERIVED / ESTIMATED / UNKNOWN**.

## What we have

- A Next.js 15 + Prisma + Neon product at shopforcare.xyz with **45.5M PriceEntry rows (15 GB)** from real Manhattan hospital MRFs (KNOWN, live query).
- A working consumer flow: natural-language search → CPT/condition mapping → per-hospital price compare → AI explanation.
- The full raw corpus **re-acquired this weekend** into `data/mrf-drop/` (Bellevue 759MB, Harlem 649MB, Metropolitan 657MB, NYU Tisch 460MB, MSK 125MB, Sinai main/Morningside, HSS 908MB, Lenox Hill zip, NYP combined) — per-campus files with CMS 3.0 headers, most updated 2026-09.
- Live, keyless authoritative integrations built this weekend: NLM ICD-10-CM + HCPCS, CMS Care Compare, HPT enforcement, CMS catalog, CDC ICD-10-CM files, RxTerms. Fail-closed CMS PPL.
- Founder-approved identity layer: 13 shopper hospitals with proven CMS CCNs.

## What is good (preserve)

- Boring stack (Postgres/Prisma/Vercel/Redis) — correct choice, keep it.
- Accuracy-first decisions already made: no 2.5× Medicare filler, no coinsurance defaults, fail-closed CPT/PPL, shopper-hospital allowlist.
- The corpus itself. 45M real published prices, plus fresh per-campus source files, is the moat seed.

## What is broken (materially hurts quality)

1. **Hospital identity in Neon is corrupted** (KNOWN): 26.8M rows on `hospital_name__Manhattan, NY`; NYP is one concatenated three-campus row; duplicate Sinai/HSS/Lenox rows; a hospital literally named `chargemaster`; Morningside carries Sinai-main's CCN 330024 (wrong); MSK carries 330154 (not in Care Compare).
2. **Codes are polluted** (KNOWN): 214k `Procedure` rows keyed by `cptCode` that is often CDM/NDC/description fragments; `payerType=gross` written as commercial in places; prior ingest collapsed price types.
3. **Search reads the wrong layer**: ILIKE over `ConditionMapping`/`CptCode` then joins `Procedure` — it never searches hospital description text, so most of 45M rows are unreachable by consumers ("Neon isn't searching all files" is identity + overlay, not missing data).
4. **No provenance**: `PriceEntry` has no FK to a source file or raw record; `Hospital.sourceFile` is a `/tmp` path.
5. **Freshness**: corpus loaded March 2026 from files that are now superseded (hospitals updated 2026-09).

## What is missing

- Per-campus re-ingest of the fresh corpus (files are here; ingest not run — awaiting your go).
- Payer/plan normalization (payer names are free text: "ANTHEM" vs "Anthem HealthPlus" vs "Anthem BCBS").
- Postgres FTS/trigram index over hospital description text.
- Medicare benchmark layer refreshed from CMS files (MPFS/OPPS Addendum B) instead of hand-entered constants.
- TiC (insurer machine-readable) awareness — even one payer's negotiated-rate file for NYC would let us cross-validate hospital-published rates.
- Quality join (Care Compare measures beyond the star rating: complications, HCAHPS, readmissions — all confirmed live on PDC).

## What is underused

- The 45M rows themselves (search can't reach them).
- `SourceFile` table (exists, hardly populated).
- Care Compare CCNs (only wired this weekend; not yet shown in UI).
- `standard_charge|min/max`, `median_amount`, percentile fields in CMS 3.0 files (parsers drop them).
- SearchLog (126 rows — nobody is looking at what users ask for).

## The one-sentence thesis

ShopForCare's product is **provable Manhattan hospital prices with identity, provenance, and freshness** — a vertical depth play, not a national breadth play; the transformation is to make the corpus reachable (search), trustworthy (provenance + evidence states), and current (scheduled re-ingest), then sell the same normalized layer to employers/navigators via API.

Read next: `13-transformation-roadmap.md` for phases, `14-founder-decisions.md` for the five decisions blocking implementation.
