# 05 — Healthcare data source map

Live-probed 2026-09-20/21 unless noted. Authority: **A** = government/canonical, **B** = official but licensed/limited, **C** = derived/commercial.

## Pricing

| Source | What | Access | Authority | Use | Priority |
| --- | --- | --- | --- | --- | --- |
| Hospital MRFs (45 CFR 180) | Gross/cash/negotiated as published | Public URLs (probed: H+H Panacea, NYU S3, MSK 200; Sinai/Northwell 403 from DC — founder Drive folder works) | A (for "hospital published X") | THE core corpus | P0 |
| Insurer Transparency in Coverage (TiC) MRFs | Payer-side negotiated rates + allowed amounts | Public indexes (UHC index probed 200); files are enormous (TB-scale monthly) | A | Cross-validate hospital rates; fill payer view for NYC slice only | P1 (scoped), REJECT (full mirror) |
| CMS Medicare PUFs: Inpatient/Outpatient by Provider & Service, Physician & Other Practitioners | Avg charges/payments by CCN/NPI + code | data.cms.gov API, no key (titles confirmed live) | A | Medicare benchmark + volume | P0 (already partly wired) |
| MPFS RVU/GPCI files, OPPS Addendum B, ASC Addenda, IPPS tables | Fee schedules | CMS downloads, no key (pages probed 200/301) | A | Replace hand-entered `medicare.ts` constants | P1 |
| CMS PPL API | Medicare OP/ASC averages + copay | apiKey + **AMA license** (401 confirmed) | B | Only if AMA license obtained | P2/blocked |
| NY SPARCS (state discharge data) | NY inpatient/ED volumes & charges | Application for identifiable; public aggregates | A(state) | NY volume context | P2 |

## Terminology

| Source | Access | Use | Priority |
| --- | --- | --- | --- |
| NLM ICD-10-CM / HCPCS Clinical Tables | No key (live) | Validation/search — **wired** | P0 done |
| CDC ICD-10-CM files | No key (live) | Versioned codebook — **wired** (`sync:icd10cm`) | P0 done |
| CMS HCPCS Level II quarterly ZIP | No key (page 200) | Full local HCPCS table incl. coverage flags | P1 |
| CPT (AMA) | **License required** | Only with license; fail-closed today | Blocked |
| ICD-10-PCS (CMS) | No key | Inpatient procedures if MRFs use PCS | P2 |
| MS-DRG definitions (CMS) | No key | DRG labels for inpatient rows (H+H files are DRG-heavy) | P1 |
| NUBC revenue codes | Already seeded locally | Facility line labels | done |
| RxNorm/RxTerms (NLM) | No key (live) | Drug normalization — stub wired | P2 |
| NDC directory (FDA) | No key | Drug rows in MRFs (H+H has NDC rows) | P2 |

## Providers / identity

| Source | Access | Use | Priority |
| --- | --- | --- | --- |
| CMS Care Compare Hospital General Info (xubh-q36u) | No key (live) | CCN identity + stars — **wired** | P0 done |
| NPPES bulk / NPI Registry API | No key (both probed) | Type 2 NPIs (campus-level identity: H+H files carry per-campus NPIs — this is how we split systems) | **P0** |
| Provider of Services file / Hospital Enrollment (CMS) | No key | CCN↔NPI↔address crosswalk | P1 |

## Quality (all confirmed live on provider-data catalog, 237 datasets)

Complications & Deaths (ynj2-r877), HCAHPS (dgck-syfz), HAIs (77hc-ibv8), Readmissions program (9n3s-kdb3), Medicare Spending per Beneficiary, HVBP domains, PPS-exempt cancer hospital measures (relevant to **MSK**). Use: quality-adjusted comparison; P1.

## Compliance

HPT enforcement dataset (wired, live). CMS HPT public "attestation/compliance" lists as they publish. Use: transparency scoring. P1 (partly done).

## Insurance / plans

| Source | Access | Use | Priority |
| --- | --- | --- | --- |
| TiC indexes (UHC/Aetna/Cigna/Anthem) | Public | NYC-scoped negotiated-rate extraction | P1 scoped |
| CMS plan datasets (MA/PDP landscape) | No key | Plan metadata | P2 |
| NY DFS rate filings | Public | Context only | P3 |

## Geography

ZIP↔CBSA (HUD/Census, no key), CMS GPCI/locality files, wage index. Use: adjust Medicare benchmarks correctly for Manhattan (locality 01/NYC). P1 small.

## Rejects

- Full TiC mirror (TB-scale, no product need beyond NYC slice).
- UMLS full license integration now (synonyms nice-to-have; NLM CTSS covers P0).
- Any unofficial "CPT lookup" API (licensing risk — already removed).
