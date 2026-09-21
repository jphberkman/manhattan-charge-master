# 02 — Current architecture

**KNOWN** from repo + Vercel/Neon evidence.

## Stack

- Next.js 15 App Router, React 19, Vercel deployment (`manhattan-charge-master-uq6x`, domain shopforcare.xyz).
- Prisma 6 → Neon Postgres project `manhattan-marketplace` (`cool-fire-98130468`).
- Cache: Vercel KV preferred, ioredis fallback, no-op fallback (`src/lib/redis.ts`).
- AI: Anthropic `claude-haiku-4-5` via raw fetch (`anthropic-fetch.ts`) and AI SDK (UIGen leftover). Mock provider without key.
- Auth: SITE_PASSWORD cookie gate (plaintext compare in middleware — weak, P1), UIGen JWT/bcrypt (frozen), admin password (now fail-closed in prod).

## Vercel

- Crons (`vercel.json`): prewarm 9:00 daily, data-freshness Mon 6:00, data-quality-snapshot 7:00 daily — all now require CRON_SECRET or admin.
- `next.config.ts`: 500MB middleware body (upload path — serverless ingest is a trap for multi-GB MRFs; keep uploads modest, ingest offline).
- Build: `prisma generate && prisma db push && next build` (additive; `--accept-data-loss` removed this weekend). No migration history (`_prisma_migrations` absent) — schema managed by push. **Decision needed** eventually: adopt migrate.
- Function limits: 60–120s maxDuration on heavy routes. Env listing was 403 for this agent (UNKNOWN what extra env exists).

## Neon (live, 2026-09-21)

| Table | ~Rows | Size |
| --- | --- | --- |
| PriceEntry | 45,555,148 | 15 GB |
| Procedure | 214,332 | 61 MB |
| CptCode | 9,297 | 3.6 MB |
| CmsChargeData | 1,637 | — |
| ConditionMapping | ~140 | — |
| Hospital | 14–16 | — |
| SourceFile / RevenueCode / SearchLog / content tables | small | — |

Hospital rows (live query) confirm the identity corruption: `hospital_name__Manhattan, NY` (H+H blob), concatenated NYP id, duplicate HSS/Lenox/Sinai rows, `chargemaster__Manhattan, NY`, **Morningside stamped with CCN 330024 (that is Sinai main's CCN)**, MSK stamped 330154 (not in Care Compare's dataset).

Indexes: 8 composite b-trees on PriceEntry (procedure/hospital/payerType/priceType permutations). **No FTS or trigram index anywhere; no index on Procedure.name usable for description search at 45M-row join scale.** A GROUP BY hospitalId on PriceEntry times out through pooled MCP (observed twice) — fine for batch, not for request path.

## Actual data pipeline (discovered, not aspirational)

```
Hospital URL / manual download
  → scripts/seed-hospital-files.ts   (offline; wrote /tmp paths as provenance; TARGET_CPT filter on some paths)
  → POST /api/upload | /api/validate (serverless; AI schema detect; wrote junk hospitals like "chargemaster")
  → PriceEntry (no source FK, price types collapsed on some paths)
Search: ConditionMapping/CptCode ILIKE → Procedure by cptCode → compare medians
New (this weekend): data/mrf-drop/<hospital>/ per-campus corpus + SourceFile inventory + authoritative code APIs
```

## Bottlenecks (evidence-backed)

1. Description text unsearchable (no FTS) — the biggest gap between corpus and consumer.
2. PriceEntry aggregates computed per-request; compare relies on Redis cache to be usable.
3. Serverless ingest ceiling (120s / memory) vs 200MB–5GB files — ingest must stay offline/worker.
4. Neon pooled connection timeouts on large scans — precompute aggregates instead.
