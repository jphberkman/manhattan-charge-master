# 13 — Transformation roadmap

Complexity = engineering scope, not calendar. Each phase ships independently.

## Phase 0 — Trust-breaking issues (mostly DONE this weekend)

Objective: nothing on the site is invented.
Changes: remove Medicare×2.5 filler ✔, coinsurance defaults ✔, destructive build ✔, admin default password ✔, unofficial PPL ✔, shopper allowlist ✔, ICD-as-price block ✔, fail-closed CPT/PPL ✔. Remaining: HMAC site cookie; label ranges honestly in UI copy.
Success: zero estimated dollars presented as facts. Risk: emptier grid (accepted by founder).

## Phase 1 — Repair the foundation (ingest + identity + provenance)

Objective: fresh corpus loaded per campus with provenance; legacy rows quarantined.
Changes: schema deltas (additive: sourceFileId, asOf, codeKind, methodology, min/max/median, billingClass; SourceFile blob/header fields); raw archive to object storage; per-format parsers capturing ALL 3.0 fields; NPI-header identity join; file-scoped idempotent load; row accounting; legacy flag on old rows; consumer reads exclude legacy.
Dependencies: founder go on ingest; decision on legacy handling; Sinai West file.
Complexity: Large (parser fidelity is most of it). Risks: parser edge cases (mitigate: reject+log, never guess); Neon cost growth (monitor; raw stays in blob).
Success: each of the available shopper hospitals shows prices traceable to its own named file with an as-of date; ingest re-runnable without duplicates.

## Phase 2 — Upgrade data (benchmarks, payers, quality, terminology)

Objective: every price contextualized.
Changes: MPFS/OPPS NYC-locality tables (quarterly sync scripts); HCPCS quarterly local table; MS-DRG labels; PayerAlias normalization with review queue; QualityMeasure store (complications/HCAHPS/readmissions/MSPB per CCN); transparency scorecard inputs.
Dependencies: Phase 1 schema. Complexity: Medium (many small syncs). Risks: payer normalization is judgment-heavy — keep human review.
Success: compare shows Medicare benchmark from real CMS files; payer classes clean for the top ~20 NYC payers; quality visible per hospital.

## Phase 3 — Upgrade search & intelligence

Objective: any user phrase reaches the corpus in <1s.
Changes: ServiceDescription + tsvector + pg_trgm; PriceSummary precompute; deterministic extraction pipeline; ambiguity clarification UX; LLM as candidate-proposer only; SearchLog-driven mapping growth (offline review).
Dependencies: Phase 1 (clean rows to index). Complexity: Medium-Large.
Success: uncached text search <1s; measured resolution rate on SearchLog replays doubles; zero unvalidated codes in results.

## Phase 4 — Upgrade consumer product

Objective: trust visible; shareable.
Changes: provenance labels + evidence states in UI; ranges (min/median/max); freshness banners; quality-adjusted compare; cash-pay pages per procedure; share cards; report-an-error.
Complexity: Medium (mostly UI + copy). Success: a skeptical journalist can verify any number in two clicks.

## Phase 5 — Commercial/B2B

Objective: first paying design partners.
Changes: employer basket report (PDF/CSV) on PriceSummary; simple API keys + docs; broker white-label styling; pricing conversations with 2–3 NYC brokers/self-funded employers BEFORE dashboard build.
Dependencies: Phases 1–3 credibility. Complexity: Medium. Risk: building dashboards nobody asked for — design partners first.
Success: one signed design partner using the basket report.

## Phase 6 — Defensibility

Objective: assets that compound.
Changes: versioned file archive + quarterly diffs → price-change alerts + Manhattan price index; TiC NYC slice for top payers (cross-validation); identity graph maintained as data product; historical API.
Complexity: Large but incremental. Success: we can answer "how did NYU's knee MRI cash price change over 12 months?" — and nobody else in NYC can.

## Sequencing note

Phases 1→3 are the same workstream in three shippable slices; 4 rides on them; 5 needs only 1–3; 6 begins passively on day one (archive every file version from now).
