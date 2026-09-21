# 11 — What would make ShopForCare 10x better?

Format: Idea → why → difficulty → data → impact. Overlaps allowed.

## Product

1. Provenance on every number → trust is the product → S → have it after schema add → Transformational
2. Whole-file search → users find what hospitals actually sell → M → corpus → High
3. Honest ranges (min/median/max) → kills false precision → S → MRF 3.0 fields → High
4. Price+quality one screen → the actual consumer decision → M → PDC quality sets → High
5. Cash-pay pages per procedure → SEO + immediate utility → M → corpus → High
6. Change alerts → makes data alive → M → versioned ingest → High
7. Bill-range checker → emotional hook ("was I overcharged?") → M → corpus → High
8. Scheduler-ready share card → spreads via patients → S → corpus → Medium
9. Clarifying questions on ambiguity (MRI knee: with/without contrast) → correctness UX → M → code ontology → High
10. "No file / stale file" as first-class UI states → honesty visible → S → SourceFile → Medium

## Data

1. Per-campus NPI-keyed identity graph (system→campus→NPI→CCN) → the join everyone gets wrong → M → NPPES + file headers → Transformational
2. Payer/plan normalization table → enables payer lens + B2B → M-L → manual+rules → High
3. Capture methodology/min/max/median/% → defensible rates → S-M → parsers → High
4. Versioned SourceFile archive (R2/S3 + sha) → history moat → S → drop pipeline → High
5. HCPCS quarterly local table → coverage flags, categories → S → CMS zip → Medium
6. MS-DRG table → label H+H/NYP inpatient rows → S → CMS → Medium
7. Medicare benchmark from real MPFS/OPPS files (NYC locality) → replace hardcoded constants → M → CMS files → High
8. TiC NYC slice for top payers → cross-validation → L → TiC indexes → High
9. Quality measure store per CCN → adjustable compare → M → PDC → High
10. SearchLog mining → what users want vs what we resolve → S → have it → Medium

## Engineering

1. PriceSummary precompute → sub-second uncached compare → M → corpus → High
2. ServiceDescription + tsvector/pg_trgm → reachability → M → corpus → Transformational
3. Idempotent versioned ingest (upsert on natural key; file-scoped delete-then-insert) → repeatable pipeline → M → — → High
4. Ingest worker outside serverless (local script now; queue later) → correct ceiling → S now → — → High
5. Row-level accounting per file (discovered/parsed/rejected/inserted) → parser drift detection → S → SourceFile → High
6. Read model vs raw model split (raw in object storage, normalized in PG) → cost + fidelity → M → R2 → Medium
7. Query-plan regression checks on 2 hot queries → perf safety → S → — → Medium
8. Backfill `asOf`+`sourceFileId` on existing rows where provable; quarantine rest → salvage without lying → M → — → High
9. HMAC site cookie → fix plaintext gate → S → — → Medium
10. Structured logs on search resolution path → debuggability → S → — → Medium

## AI

1. Deterministic-first resolution; LLM only proposes candidates that NLM/DB validate → accuracy with speed → M → wired APIs → High
2. Ambiguity detector (multi-service queries) → ask instead of guess → M → ontology → High
3. Query expansion from SearchLog misses (offline, human-reviewed) → grows mapping table safely → S → logs → Medium
4. Explanation generation constrained to cited rows (already the pattern — keep) → trust → done → High
5. Extraction QA: LLM reads parser rejects, proposes rules (human merges) → parser velocity → M → rejects → Medium
6. Plan-document reader (user uploads SBC → coinsurance/deductible inputs) → OOP estimates without guessing → M-L → user docs → High
7. Never-invent guarantee tests (red-team suite asserting no dollars from LLM path) → CI trust → S → — → High
8. Voice/photo intake of bills (later) → bill checker feeder → L → — → Medium
9. Embedding similarity for description clustering (offline only, human-approved merges) → dedupe descriptions → M → corpus → Medium
10. Confidence = evidence state machine, not model logits → honest UX → S → provenance → High

## B2B

1. Employer basket report (PDF/CSV) → first dollar → M → PriceSummary → High
2. Broker white-label → channel leverage → M → same → High
3. API keys on PriceSummary → navigation cos → M → same → High
4. Rate benchmarking for ASCs/imaging (they undercut hospitals; they love this data) → niche wedge → M → corpus → Medium-High
5. Journalist/research extracts with citation requirements → distribution → S → same → Medium
6. Quarterly Manhattan price index report → brand authority → M → history → High
7. TPA audit support (published rate vs paid claim) → later, high WTP → L → TiC+corpus → High
8. Compliance monitoring for hospitals (their own file quality) → contrarian revenue → M → validator+enforcement → Medium
9. Self-insured unions (NYC-heavy, price-sensitive) → overlooked buyer → M → reports → Medium-High
10. Design-partner program (2–3 brokers) before building dashboards → validation → S → — → High

## Trust/verification

1. Evidence states rendered in UI (VERIFIED/QUALIFIED/ESTIMATED/STALE) → S-M → provenance → Transformational
2. Public methodology page → auditability → S → — → High
3. Per-hospital transparency scorecard → accountability + press → S-M → have data → High
4. File diff logs public ("what changed this month") → living data proof → M → versioning → High
5. Reproducible row: click price → see file name, line context → M → raw archive → High
6. Independent spot-audit routine (sample rows vs original file bytes) → internal QA → S → archive → Medium
7. Correction/report-an-error flow → user trust loop → S → — → Medium
8. Freshness SLA displayed per hospital → sets expectations → S → SourceFile → Medium
9. No-data honesty metrics (what % of grid is empty, shown in admin) → keeps us honest → S → — → Medium
10. External citations (CMS/NLM sources linked on every code) → authority borrowing → S → wired → Medium
