# Founder decisions (2026-09-20)

Recorded from the restoration briefing. These override earlier audit assumptions.

## Shopper hospitals (13)

Shoppers should see **only** these facilities — not every row currently in Neon, and not NYU Orthopedic, H+H-as-one-blob, or concatenated NYP campuses.

1. Lenox Hill Hospital (Northwell Health)
2. Mount Sinai Morningside
3. Mount Sinai West
4. NewYork-Presbyterian Lower Manhattan Hospital
5. NewYork-Presbyterian / Columbia University Irving Medical Center
6. NewYork-Presbyterian / Weill Cornell Medical Center
7. NYC Health + Hospitals / Bellevue
8. NYC Health + Hospitals / Harlem
9. NYC Health + Hospitals / Metropolitan
10. NYU Langone Health (Tisch Hospital & Kimmel Pavilion)
11. The Mount Sinai Hospital (Main Campus)
12. Hospital for Special Surgery (HSS)
13. Memorial Sloan Kettering Cancer Center (MSK)

Until files are re-uploaded **per facility**, some of these will correctly show **no prices** rather than borrowing another hospital’s file.

## Files

Re-upload the full set. Do not treat March–April 2026 `/tmp` paths as recoverable source files.

Serverless upload still cannot swallow multi-GB files. Use the upload API for moderate files; large MRFs still need the offline seeder with inventory logging.

**Drop folder:** `data/mrf-drop/<hospital-id>/` (see `data/mrf-drop/README.md`). The cloud agent cannot read a laptop `Downloads` folder. Copy or attach files into that tree, or share a Drive link with the same 13 folder names. Run `npm run inventory:mrf` to list files without ingesting.

First three attachments are inventoried in `docs/restoration/07-received-file-inventory.md`. None were ingested.

## CPT / AMA

There is **no AMA license**. CPT long descriptions are **not** a public unlicensed API. CMS Procedure Price Lookup also requires AMA license + API key.

ShopForCare will use:

- Hospital file descriptions
- Public HCPCS Level II files
- ICD-10-CM public files when we validate diagnoses
- Existing `CptCode` table only as an internal lookup of what was already seeded — not as a claim of licensed CPT redistribution

We will **not** call unofficial “CMS CPT APIs.”

## Neon

Treat `manhattan-marketplace` as the live corpus unless a different `DATABASE_URL` is shown. Vercel env listing was 403.

## Priority

**Data validation and accuracy first** — not a pretty empty grid, not speed work.

## UIGen leftover

**Freeze and ignore.** Do not delete yet (risk of breaking auth/routes). Do not spend restoration time on it. ShopForCare is the product.
