# 07 — Reimbursement capability map

What ShopForCare can honestly compute, per concept. States: **KNOWN** (from a file we hold), **DERIVED** (computed from authoritative inputs), **ESTIMATED** (model, must be labeled), **UNKNOWABLE** (do not present).

| Concept | Can we model it? | Data required | State |
| --- | --- | --- | --- |
| Gross charge | Yes | MRF | KNOWN per row |
| Discounted cash | Yes | MRF | KNOWN |
| Payer-negotiated dollar | Yes when file gives `negotiated_dollar` | MRF | KNOWN |
| Negotiated %/algorithm | Display only ("62% of billed" etc.) | MRF `negotiated_percentage/algorithm` — currently dropped by parsers | KNOWN-as-text; dollar UNKNOWABLE without base |
| De-identified min/max, median/percentiles | Yes | MRF 3.0 columns — currently dropped | KNOWN |
| Medicare MPFS (professional) | Yes | RVU × GPCI(NYC locality) × CF from CMS files | DERIVED |
| OPPS facility (APC) | Yes for OPPS-payable HCPCS | Addendum B + wage index | DERIVED |
| ASC payment | Yes | ASC addenda | DERIVED |
| Inpatient DRG payment | Approx (operating + capital, IME/DSH excluded unless modeled) | IPPS tables + provider factors | DERIVED w/ caveats |
| Geographic adjustment | Yes | GPCI/wage index | DERIVED |
| Allowed amount (commercial) | Only where a TiC file or MRF `median_amount` gives it | TiC NYC slice / MRF stats | KNOWN where present, else UNKNOWABLE |
| Deductible/copay/coinsurance/OOP | Only with user-entered plan inputs | User input | ESTIMATED, labeled |
| Network status | No public source per hospital-plan pair with reliability | — | UNKNOWABLE (say so) |
| Facility vs professional split | Partially: MRF `billing_class`; professional fee via MPFS benchmark | MRF + MPFS | DERIVED, labeled |
| Bundles | Only what a file states (case rates, per diems exist in NYP/H+H files) | MRF methodology fields | KNOWN-as-published |

## What this unlocks (if we capture the dropped fields)

The NYP file we hold literally contains case rates and per-diem notes per payer. H+H 3.0 files carry median/10th/90th and count. Capturing `methodology`, `min/max`, `median`, `percentage/algorithm` turns "one number" into a defensible range with method — no new external data needed. This is the single highest-value reimbursement upgrade and it is parser work, not research.

## Honest consumer math

Show: gross, cash, payer-specific dollar (if present), Medicare benchmark (labeled), file min/max. Patient OOP only after user supplies plan inputs; label ESTIMATED. Never present a negotiated rate as "what you'll pay."
