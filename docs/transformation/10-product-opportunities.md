# 10 — Product opportunities

Ranked by (impact × confidence) / effort, grounded in data we hold or can fetch keylessly.

## NOW-adjacent (unlock existing assets)

1. **Provenance-first compare** — every price shows hospital file + as-of date. Impact: Transformational for trust. Effort: S (after schema adds sourceFileId/asOf). Confidence: High.
2. **Description search ("search the whole file")** — FTS over distinct service descriptions per hospital. Impact: High (corpus reachability). Effort: M. Confidence: High.
3. **Range-honest prices** — surface file min/max/median instead of a single number. Effort: S (parser capture + UI). Impact: High. Confidence: High.
4. **Freshness + transparency score per hospital** — file date, CMS 3.0 completeness, enforcement history (all data in hand). Effort: S. Impact: Medium-High (press-friendly).
5. **Quality-adjusted compare** — stars + complications/HCAHPS next to price (PDC datasets live). Effort: M. Impact: High. Confidence: High.

## NEXT

6. **Cash-pay playbook pages** — per procedure: cheapest verified cash price among the 13, what to say to scheduling. SEO magnet. Effort: M.
7. **Payer lens** — after payer normalization: "with Aetna commercial, published negotiated rates are…" Effort: M-L. Confidence: Medium (payer name chaos).
8. **Price-change alerts** — diff files at re-ingest; "NYU raised MRI gross 12% since June." Requires versioned ingest. Effort: M. Impact: High (nobody local does this).
9. **Bill check (consumer)** — user enters CPT+hospital from a bill; we show the published range. Careful copy; no advice claims. Effort: M.
10. **Employer basket report** — 20 shoppable procedures × 13 hospitals × cash/median negotiated, PDF/CSV. First revenue artifact. Effort: M.

## LATER / MOONSHOT

11. TiC NYC slice: payer-side rates for the 13 hospitals to cross-validate MRFs (storage/pipeline heavy but scoped).
12. Historical price archive → "Manhattan price index" quarterly report (defensibility flywheel).
13. Pre-service cost planner with plan inputs (accumulator math, labeled ESTIMATED).
14. API productization for navigation companies.
15. Expansion to outer boroughs → NY metro (same pipeline, more files).

## Explicitly not recommended now

- National coverage sprint (loses to incumbents; dilutes verification).
- AI chat as the primary interface (interpretation layer only).
- Any estimated-price filler to look complete (the old failure mode).
