# 08 — Trust & safeguards

## Failure catalog → safeguard

| Failure | Safeguard | Status |
| --- | --- | --- |
| Wrong hospital attribution (H+H blob→Bellevue etc.) | Shopper-hospital resolver refuses ambiguous names; per-campus NPI from file header is the join key | Resolver done; NPI join at re-ingest |
| Wrong code (CDM treated as CPT) | `classifyMedicalCode` + NLM validation; unknown kinds never keyed as CPT | Done for search; enforce at ingest |
| ICD used as price key | Blocked in procedure-search (diagnosis path) | Done |
| Stale price | `asOf` from file header on every row; freshness banner; re-ingest schedule | Pending (schema) |
| Duplicate rates | Unique (sourceFileId, hospital, code, payer, plan, priceType) upsert | Pending |
| Cash vs gross confusion | Never default priceType; parser must read explicit column or drop row | Partial (validate path still defaults gross — fix) |
| Negotiated rate presented as patient cost | UI labels: "negotiated rate between hospital and payer" | Pending copy |
| Missing professional fee | Label facility-only rows (`billing_class`) | Pending parser capture |
| Bundle misread | Carry `methodology` + notes verbatim | Pending parser capture |
| Malformed MRF / parser drift | Per-file row accounting in SourceFile (discovered/parsed/rejected/inserted) + threshold alerts | Table exists; wire ingest |
| AI hallucination | AI never writes prices; breakdown constrained by DB ranges; codes validated via NLM | Done |
| Unit errors (drugs) | Capture drug_unit fields; exclude drug rows from procedure compare | Pending |
| Source file corruption | sha256 recorded at inventory (done in drop scripts) | Done for drop |
| Payer name chaos | Payer/plan normalization table with manual review queue | Pending |

## Evidence model (recommendation)

Attach one state per displayed fact, derived from checkable conditions — not AI vibes:

- **VERIFIED**: row from a current file (≤ 12 months), hospital identity proven (NPI/CCN), code validated (HCPCS/CPT table) → show plainly.
- **QUALIFIED**: real row but description-keyed (no standard code) or methodology is %/algorithm → show with label.
- **ESTIMATED**: Medicare benchmark or user-plan OOP math → always labeled, never in the price column.
- **AMBIGUOUS**: query maps to multiple services → ask, don't average.
- **STALE**: file older than hospital's newest known file → show with date warning.
- **UNVERIFIED/INCOMPLETE**: fails identity or code checks → suppressed from consumers, visible in admin.

State is computed at read time from provenance columns (asOf, sourceFileId, codeKind, methodology) — cheap, deterministic, testable.
