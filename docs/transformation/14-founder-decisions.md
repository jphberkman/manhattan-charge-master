# 14 — Founder decisions needed

## Blocking Phase 1 (ingest)

**D1. Legacy rows.** 45.5M existing PriceEntry rows lack provenance and carry identity/code pollution. Options:
  a) Quarantine: flag `legacy`, exclude from consumer reads, keep for diffing (recommended — reversible);
  b) Delete after fresh ingest proves out (cheaper storage, destructive);
  c) Keep serving them (not recommended — perpetuates the corruption).

**D2. Ingest go/no-go per file.** Confirm: ingest the per-campus files now in `data/mrf-drop/` (Bellevue, Harlem, Metropolitan, NYU Tisch, MSK, Sinai main, Morningside, HSS, Lenox Hill zip)? NYP combined: load with campus attribution ONLY where the file itself scopes a row (else hold)? Carter/NYEE/Behavioral: keep out of shopper corpus?

**D3. Raw archive location.** Vercel Blob vs Cloudflare R2 for immutable original files (R2 recommended: cheaper egress at GB scale). Needs an account/credential from you either way.

## Blocking Phase 2

**D4. AMA CPT license.** Buy (unlocks CPT descriptions + PPL; annual cost, licensing constraints) or continue CPT-free (hospital descriptions + HCPCS + NLM). Recommendation: defer until a paying customer asks; the corpus works without it.

**D5. Payer normalization ownership.** Rules + review queue needs a human decision-maker for ambiguous payer/plan mappings (~hours per ingest cycle initially). You, or delegate?

## Non-blocking but soon

- Brand posture: consumer-champion only, or also sell to providers/payers (affects B2B menu)?
- Mount Sinai West file: source it (not in Drive folder; site 403s our fetches).
- Migration tooling: adopt `prisma migrate` before schema deltas, or continue `db push` (recommend migrate at Phase 1 start).
- SITE_PASSWORD gate future: keep, or move to real accounts before B2B?
