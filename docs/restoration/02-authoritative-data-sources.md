# Authoritative data sources (CMS and related)

**Purpose:** Inventory what ShopForCare can use to **verify codes and Medicare benchmarks** without treating “CMS API” as one universal medical-code service.

**Date:** 2026-09-20  
Classification: **KNOWN** (docs + current code), **INFERRED**, **UNKNOWN**.

ShopForCare already uses a mix of **local tables**, **hardcoded Medicare maps**, **NPI Registry**, and **data.cms.gov Socrata**. It does **not** currently call a licensed CMS Procedure Price Lookup API correctly.

---

## 1. What CMS is (and is not)

CMS publishes **many** datasets and a few APIs. None of them is a single “give me the CPT for MRI knee and the hospital’s cash price” service.

Hospital **chargemaster / MRF prices** come from **hospitals**, under 45 CFR 180. CMS provides **templates and validators**, not a download API of every hospital file.

---

## 2. Hospital Price Transparency (HPT) — source of **prices**

| Item | Detail |
| --- | --- |
| What it is | Regulation requiring hospitals to publish a machine-readable file of standard charges |
| Formats | CMS JSON / CSV tall / CSV wide templates (v2.x historically; **v3.0** for CY2026) |
| Official guide | https://github.com/CMSgov/hospital-price-transparency |
| Validator | https://cmsgov.github.io/hpt-tool/ (browser + CLI) |
| Discovery | Hospital `cms-hpt.txt` / transparency pages; **not** a CMS bulk API |
| Auth | None (public hospital websites / CDNs) |
| Licensing | Hospital-published public files; still must not misrepresent |
| Update frequency | Hospital-controlled; CMS expects current files; CY2026 elements enforced **2026-04-01** |
| Codes contained | Whatever the hospital encoded: CPT, HCPCS, NDC, revenue, local, DRG, etc. |
| ShopForCare today | Downloads specific URLs in `scripts/seed-hospital-files.ts`; parsers assume older CMS JSON/CSV shapes |

**CY2026 delta (KNOWN from CMS fact sheet):** median / 10th / 90th percentile allowed amounts, count of allowed amounts, Type 2 NPI, attestation. Current parsers do **not** model these fields.

**Do not assume** one adapter will parse NYU S3 CSV, Northwell ZIP, NYP Widen ZIP, H+H Panacea, and Mount Sinai JSON identically.

---

## 3. CMS Procedure Price Lookup (PPL) API

| Item | Detail |
| --- | --- |
| What it actually provides | National average **Medicare** amounts and **beneficiary copay** for a subset (~4,000) of procedures in HOPD / ASC — **not hospital chargemasters** |
| Docs | https://developer.cms.gov/ppl-api/ |
| Spec | https://developer.cms.gov/ppl-api/api-spec |
| Base URL (official) | `https://www.medicare.gov/api/procedure-price-lookup/api/v1/core` |
| Auth | Header `apiKey` (CMS-issued, ~60-day expiry) **and** header `amaLicense` (AMA CPT license). 401/403 otherwise |
| Licensing | **AMA license required** for CPT descriptions. This is a founder/legal decision, not an engineering toggle |
| Codes | CPT/HCPCS subset used in PPL, not full CPT, not ICD-10 |
| ShopForCare today | `src/lib/cms-mpfs-api.ts` calls `https://developer.cms.gov/api/ppl/v1/prices?hcpcs_code=...&geo_type=locality&geo_code=01` **with no apiKey/amaLicense**. That URL **does not match** the documented PPL API |

**Classification:** Using PPL as a silent production dependency is **incorrect until key + AMA license exist**. Treat current `lookupMpfsRate` API fallback as **unverified / likely broken**.

---

## 4. CMS HCPCS Level II files (public)

| Item | Detail |
| --- | --- |
| What | Alpha-numeric HCPCS codes, long/short descriptions, some Medicare admin flags |
| URL | https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system/quarterly-update |
| Auth | None (public ZIP) |
| Update | Quarterly |
| Licensing | Public; **does not include AMA CPT (HCPCS Level I)** |
| Use for ShopForCare | Authoritative **validation of C/G/J/L/… device and supply codes**; not a substitute for CPT |

---

## 5. ICD-10-CM (diagnosis) — CDC/NCHS, not “a CMS code API”

| Item | Detail |
| --- | --- |
| What | Diagnosis classification |
| Files | https://www.cdc.gov/nchs/icd/icd-10-cm/files.html |
| Browser | https://icd10cmtool.cdc.gov/ |
| Auth | None for public files |
| Update | Annual FY releases |
| ShopForCare today | `ConditionMapping.icd10Code` is a **hardcoded string**, never validated against CDC files |

ICD-10-CM must **not** be used as a procedure/price key.

---

## 6. ICD-10-PCS (inpatient facility procedures) — CMS

| Item | Detail |
| --- | --- |
| What | Inpatient hospital procedure coding |
| Maintainer | CMS |
| Use | Only when the consumer scenario is inpatient facility procedure, and the MRF actually uses PCS |
| ShopForCare today | **Not implemented** |

---

## 7. CPT (HCPCS Level I) — AMA

| Item | Detail |
| --- | --- |
| What | Procedure/service codes consumers actually search (MRI, colonoscopy, TKA, …) |
| Authority | American Medical Association |
| CMS role | Uses CPT in Medicare; **does not make CPT redistributable** |
| ShopForCare today | `prisma/cpt_codes.csv` seeded as 9,297 rows labeled “CMS Medicare Physician & Other Practitioners – by Geography and Service (2023)” — **INFERRED** this is HCPCS/CPT **descriptions as they appear in a CMS utilization file**, not a licensed full CPT data file |

**Founder decision required:** obtain AMA license (and optionally PPL) vs. restrict product to hospital-file descriptions + public HCPCS + ICD without redistributing CPT long descriptions.

---

## 8. Medicare payment files already partially wired

| Dataset | ShopForCare module | What it is | What it is not |
| --- | --- | --- | --- |
| Hardcoded NYC 2025 MPFS/IPPS/OPPS snippets | `src/lib/medicare.ts` `MEDICARE_RATES` | Hand-entered physician fee + episode/DRG/APC for ~40 CPTs | Not maintained automatically |
| `CptCode.medicareRate` / facility / non-facility | `scripts/seed-mpfs-rates.ts` | Local cache | UNKNOWN freshness |
| Inpatient/outpatient charge PUFs | `CmsChargeData` + `scripts/seed-cms-charges.ts` | Average covered charges / Medicare payments by CCN + DRG/APC | **Not** a negotiated commercial rate. Compare currently multiplies Medicare payment × **2.5** |
| Medicare Physician by Provider and Service (Socrata `s55f-ussd`) | `src/lib/cms-utilization.ts` | 2022 volume by NPI + HCPCS | Stale year hardcoded **2022**; not prices |

Socrata `data.cms.gov` APIs are generally **public, no key** with rate limits. Treat as **authoritative for Medicare utilization/payment statistics**, never for a specific commercial plan rate.

---

## 9. NPI Registry (CMS/NPPES)

| Item | Detail |
| --- | --- |
| Module | `src/lib/npi.ts` |
| What | Provider identity, taxonomy, practice address |
| Auth | Public |
| Not | Procedure codes, prices, network status |

Used correctly as **identity verification** for physician recs if NPI is required before display.

---

## 10. NLM / UMLS / VSAC

Comments in `procedure-breakdown` say “NLM CPT API”. **KNOWN false:** that function calls `searchCptCodes` (local SQL).

UMLS/VSAC **could** later supply synonyms; they require licenses/keys and still are not hospital prices. **Do not implement in P0.**

---

## 11. Recommended authority hierarchy for restoration

```
Hospital MRF (gross / cash / negotiated as published)
    → normalized PriceEntry with provenance
CMS HCPCS Level II file          → validate C/G/J/L codes
CDC ICD-10-CM files              → validate diagnosis tokens only
CptCode table / AMA-licensed CPT → validate 5-digit CPT if license allows
CMS MPFS / IPPS / OPPS / PUFs    → Medicare benchmark, labeled as Medicare
CMS PPL                          → only with apiKey + amaLicense; Medicare averages
LLM                              → interpretation only
```

**Never:** LLM, 2.5× Medicare, or coinsurance defaults as a substitute for a missing MRF dollar.

---

## 12. Founder questions (blocking P2)

1. Is there an **AMA CPT license** for ShopForCare?  
2. Should CMS **PPL** be used at all (Medicare copay UX vs. chargemaster product)?  
3. Accept **hospital description text** as the consumer label when CPT long descriptions cannot be redistributed?

---

## 13. Live access (2026-09-20) and ShopForCare wiring

Probed from this environment. No invented medical facts.

| Source | Probe | Result | ShopForCare module |
| --- | --- | --- | --- |
| NLM ICD-10-CM Clinical Tables | `M17.11` | `Unilateral primary osteoarthritis, right knee` | `src/lib/authoritative/nlm-clinical-tables.ts` `GET /api/codes/lookup` |
| NLM HCPCS Clinical Tables | `E0193` | `Powered air flotation bed` | same; keyword “knee mri” / “walker” returned **0 hits** (real miss) |
| CDC/NCHS ICD-10-CM FY2026 listing | FTP HTML 200 | Code Descriptions ZIP is published | `listCdcIcd10CmFiles`; `npm run sync:icd10cm` |
| CMS PPL official | `medicare.gov/.../core/prices` | **HTTP 401** “No API key found” | `cms-ppl.ts` fail-closed; no unofficial URL |
| CMS Data API catalog | `https://data.cms.gov/data.json` | 159 datasets | `listCmsCatalog` |
| CMS Care Compare (`xubh-q36u`) | POST `facility_id=330204` | BELLEVUE HOSPITAL CENTER | `getCareCompareByCcn`; `GET /api/hospitals/cms-profile` |
| CMS HPT enforcement | dataset `6a3aa708-...` | JSON actions including NY | `listHptEnforcement` |
| NLM RxTerms | `ibuprofen` | 11 displays | `searchRxTerms` (`?rx=1` on lookup) |

**Care Compare CCNs we could prove** for the 13 shopper facilities: 330119 Lenox Hill, 330046 Mount Sinai West, 330101 NYP Hospital (Cornell address), 330204 Bellevue, 330240 Harlem, 330199 Metropolitan, 330214 NYU Langone Hospitals, 330024 Mount Sinai Hospital, 330270 HSS.

**No distinct Care Compare row** for: Mount Sinai Morningside, NYP Lower Manhattan, NYP Columbia (do not reuse 330101), MSK (`330154` not in this dataset). Those `cmsCcn` values stay `null`.

`dataset-list` at `/data-api/v1/dataset-list` is **404**; inventory is `data.json`.

ICD-10-CM search does **not** populate hospital price results.
