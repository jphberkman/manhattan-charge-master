# 04 — Search & performance audit

## Current pipeline (KNOWN)

```
free text → extractKeywords (stopwords) → 2 parallel ILIKE queries
  (ConditionMapping.condition, CptCode.description)
  → codes → Procedure lookup (cptCode IN …)
  → compare route: PriceEntry medians per shopper hospital (Redis cached, key compare18)
This weekend: + classifyMedicalCode → ICD-10-CM handled as diagnosis (never price),
  HCPCS validated via NLM.
```

## What is fast today

- Cache hits: procedure-search (`search11:` 1h TTL) and compare (24h TTL) return in tens of ms.
- CptCode/ConditionMapping ILIKE at 9k/140 rows: single-digit ms.

## What is slow or broken

| Problem | Evidence | Class |
| --- | --- | --- |
| Cache miss on compare scans PriceEntry per hospital | 30s+ historical timeouts; counts intentionally skipped in procedure-search | Performance |
| Description text unsearchable | No FTS/trigram anywhere in schema | Reachability (worst) |
| AI breakdown 8–20s | External Anthropic latency; already backgrounded when DB has data | UX handled |
| Any GROUP BY over 45M rows in request path | Neon MCP timeouts observed | Architecture |

## Target search architecture (proposal — not implemented)

1. **Understand**: deterministic extraction first (codes via `classifyMedicalCode`, anatomy/contrast/setting keywords); LLM only proposes candidates when deterministic fails; NLM validates every code candidate.
2. **Reach**: Postgres FTS (tsvector on a new `ServiceDescription` table: distinct (hospitalId, rawCode, description)) + `pg_trgm` for typo tolerance. This is ~1–5M distinct descriptions, not 45M price rows — indexable and fast.
3. **Aggregate**: precomputed `PriceSummary` table per (hospitalId, code, payerClass, priceType): min/max/median/count + sourceFileId + asOf. Compare reads only this. Nightly/ingest-time refresh. Kills the 30s scans.
4. **Qualify**: every result carries evidence state (VERIFIED/QUALIFIED/…) + as-of date + source label.

## Performance targets (realistic)

| Path | Today | Target | How |
| --- | --- | --- | --- |
| Cached common search | ~50–150 ms | keep | Redis |
| Uncached code-known search | 1–10 s (scan) | < 500 ms | PriceSummary |
| Uncached text search | often empty | < 1 s | FTS on ServiceDescription |
| Interpreted search (LLM) | 8–20 s | < 2 s perceived | show DB results instantly; LLM streams after (already the pattern) |
| NLM validation | ~100–300 ms live | same, cached 24h | Redis (done) |

Precompute > cache > external call. Nothing here needs new infrastructure beyond two tables and two indexes.
