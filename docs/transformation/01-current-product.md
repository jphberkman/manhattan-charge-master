# 01 — Current product

**KNOWN** unless marked. Sources: repo, live site behavior described in `docs/restoration/01`.

## Surfaces

| Route | What it is | State |
| --- | --- | --- |
| `/hospital-prices` | Consumer home: search box, suggestions, compare grid | Live product |
| `/hospital-prices/search`, `/explore`, `/about` | Search/explore/marketing | Live |
| `/hospital-prices/upload`, `/validate`, `/admin`, `/audit` | Operator tools | Site-password gated |
| `/` (UIGen) | Leftover AI component generator (chat → virtual FS → preview) | **Frozen by founder decision**; anonymous users redirect to `/hospital-prices` |
| `/miami-dispatch`, `/miami-cruise` | Unrelated experiments | Dead weight, ignore |

## Consumer flow (as implemented)

1. User types free text → `POST /api/procedure-search` (ILIKE on ConditionMapping + CptCode; now also NLM ICD/HCPCS classification from this weekend's work).
2. Result cards → `GET /api/hospitals/compare?cpt=…` per selected procedure (median of PriceEntry rows per shopper hospital; no more Medicare×2.5 filler).
3. Background AI (`/api/procedure-breakdown`, Haiku) explains components; constrained by real chargemaster ranges where present.
4. Insurance selector → coinsurance math **only when user supplies it**.
5. Physician recommendations via NPI Registry.

## Product principles already enforced in code

- Prices come only from `PriceEntry` (hospital files); AI cannot mint dollars.
- 13 shopper hospitals only; unattributable source rows are not shown as a campus.
- Missing data renders as missing, not filled.

## Gaps a user feels today

- Searches for anything outside ~140 condition mappings / seeded CPT descriptions return nothing even when the corpus has it (description text unsearchable).
- Hospital list shows campuses with zero reachable prices (correct but empty until re-ingest).
- No "as of" date, no source label on a price row (provenance exists nowhere to show).
- No payer-level display a consumer can trust (payer names unnormalized).

## Verdict

The consumer skin is fine. The product problem is one layer down: reachability, identity, provenance, freshness. Fixing those makes the same UI feel dramatically better without a redesign.
