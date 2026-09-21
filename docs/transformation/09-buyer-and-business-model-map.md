# 09 — Buyer & business model map

Skeptical pass. WTP = willingness to pay (hypothesis, unvalidated).

| Buyer | Problem | Our asset | Product change needed | WTP | Sales complexity | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Consumers | "What will this cost me at which hospital?" | Compare grid | Provenance + freshness UI | ~$0 (traffic, not revenue) | n/a | Audience, not buyer. Free forever; feeds everything else |
| Self-funded employers (NYC) | Steer employees to lower-cost sites; validate TPA claims | Normalized Manhattan negotiated/cash rates | Employer view: procedure basket × hospitals × payer class; CSV/API export | $10–50k/yr ESTIMATED | Medium (via brokers) | **Primary B2B hypothesis** |
| Benefits consultants/brokers | Client-ready market comparisons | Same + report generation | White-label PDF/deck export | $5–25k/yr per firm | Medium | Strong channel; sell tooling not data |
| Healthcare navigation cos. | Need price + quality per facility | API | Clean API + SLAs | Per-call/seat | Medium | Good API customer once corpus is trustworthy |
| TPAs / health plans | Benchmark competitor rates | TiC cross-validated hospital rates | Payer-normalized layer | High but slow | High (procurement, politics) | LATER |
| Providers (revenue cycle) | See competitor negotiated rates | Same corpus, provider lens | Rate benchmarking view | $$ | Medium | Real but adversarial to consumer trust — decide brand posture |
| Researchers / journalists | Clean NYC price data | Normalized extracts | Data dictionary + citation | Low $ | Low | Cheap goodwill + distribution; do it |
| Digital health devs | Price API | API keys, docs | Developer portal | Usage-based | Low | Only after API exists for employers |
| Data companies | Bulk normalized MRF data | Our cleaning pipeline | Licensing | Medium | Medium | Competes with Turquoise/Serif — need NYC depth angle |

## Competitive reality (public positioning, checked against their sites' claims)

- Turquoise Health, Serif Health, Clarify, PayerSet: national MRF/TiC aggregation sold to payers/providers/data teams. We will not out-breadth them.
- Fair Health: consumer + licensed claims benchmarks.
- Differentiation that is actually available to us: **depth + verification in one market** — 13 named Manhattan facilities, per-campus identity proven by NPI/CCN, file-dated provenance, quality joined, consumer-legible. National players are wide and shallow on identity hygiene; that is the seam.

## Model recommendation

1. Free consumer product (trust + distribution + SEO).
2. Paid: NYC employer/broker reports + a small API on the same PriceSummary layer.
3. Do not sell raw data dumps early; sell verified, normalized, cited answers.

Layered architecture (consumer app / search engine / reimbursement intelligence / normalized data / raw corpus) is sensible **as internal layering**; do not build three products' UIs now. One platform, one B2B surface when a design partner exists. Get 2–3 NYC brokers/employers as design partners before building dashboards.
