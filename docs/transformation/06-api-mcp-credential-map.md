# 06 — API / MCP / credential map

## Production integrations (product depends on these)

| Integration | Env var | Status | Notes |
| --- | --- | --- | --- |
| Neon Postgres | `DATABASE_URL` | **SET** (app works) | |
| Anthropic | `ANTHROPIC_API_KEY` | SET in prod (UNKNOWN here; mock fallback exists) | Interpretation only |
| Vercel KV | `KV_REST_API_URL`, `KV_REST_API_TOKEN` | SET in prod (assumed; fallback ioredis `REDIS_URL`) | |
| Site gate | `SITE_PASSWORD` | SET | Plaintext cookie compare — replace with HMAC cookie (P1) |
| Admin | `ADMIN_PASSWORD` | REQUIRED in prod (fail-closed now) | |
| Cron | `CRON_SECRET` | REQUIRED for cron routes | |
| UIGen auth | `JWT_SECRET` | SET or dev-default | Frozen surface |
| NLM Clinical Tables (ICD/HCPCS/RxTerms) | NONE REQUIRED | **READY (live)** | |
| CMS Care Compare / Data API / data.json | NONE REQUIRED | **READY (live)** | |
| CDC ICD-10-CM files | NONE REQUIRED | **READY (live)** | |
| NPI Registry / NPPES | NONE REQUIRED | READY | |
| CMS PPL | `CMS_PPL_API_KEY` | **MISSING** | Needs CMS key AND… |
| AMA CPT | `AMA_CPT_LICENSE` | **MISSING** | Founder/legal decision; fail-closed until then |
| Deepgram (dispatch page) | `DEEPGRAM_API_KEY` | Unrelated experiment | Ignore |

Never print values; never commit; server-side only. All satisfied by current code.

## Development MCPs available in this environment (not product dependencies)

| MCP | Use for ShopForCare dev | Verdict |
| --- | --- | --- |
| Neon | Schema/row audits, safe SQL (used throughout) | Keep using |
| Vercel | Deploy/logs/env inspection (env listing 403 with current scope) | Useful; needs scope fix to read env |
| GitHub | PR/issue automation | In use |
| Gmail / Google Calendar / Google Drive / Granola | Drive MCP needs auth; used public link fetch instead | Optional |
| cursor-cloud / subscriptions | CI waiting, agent ops | Utility |

Missing dev tooling worth adding (not MCP-dependent): Postgres query-plan snapshots in CI for the two hot queries; a data-quality check script run post-ingest (duplicate ratio, orphan codes, price-type distribution) — small scripts, no new infra.

## Distinction to keep

Product APIs (NLM/CMS/CDC/NPPES) are wired inside `src/lib/authoritative/` with caching + fail-closed behavior. MCPs are for building, never called by the product.
