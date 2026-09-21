# Warehouse vs search index

ShopForCare answers **“what does CPT X cost at hospital Y?”** from a skinny Postgres table. Raw chargemasters stay in Neon object storage. They are never committed to git and never shipped to Vercel.

## Two layers

| Layer | Where | What |
| --- | --- | --- |
| **Warehouse (originals)** | Neon project `cool-fire-98130468`, branch `br-rough-block-aili6snu`, bucket `shopforcare-price-transparency` | Per-hospital MRFs + `03-manifests/MASTER_INDEX.csv`. Source of truth. Do not re-scrape. Do not use Google Drive in the app. |
| **Search index** | Postgres table `PriceIndex` (same Neon database) | One row per `(hospitalId, code)` with list / cash / negotiated cents and the warehouse `objectKey`. |

Request path: `GET /api/prices?cpt=27447&hospital=hhc-bellevue` and `GET /api/hospitals/compare?cptCode=27447` read **PriceIndex only** (compare falls back to `PriceSummary` if the index is empty). They never open warehouse files.

## What v1 ingests

Preferred **Manhattan shopper** MRFs listed in `MASTER_INDEX.csv` and present in Neon:

Bellevue, Harlem, Metropolitan, NYU Tisch, MSK, Mount Sinai main, Mount Sinai Morningside, HSS, Lenox Hill.

Skipped on purpose:

- Transparency-in-Coverage payer indexes and multi-GB in-network blobs (`02-insurance-tic/`)
- Combined NYP file (cannot attribute Columbia / Cornell / Lower Manhattan)
- Mount Sinai West (README: shares Morningside — do not borrow)
- NYU Orthopedic, NYEE, non-Manhattan hospitals, sister-campus READMEs

## How to re-run ingest

Offline job (not a Vercel serverless function — HSS alone is hundreds of MB gzip):

```bash
# App database (pooled URL is fine for reads; direct URL is better for COPY)
export DATABASE_URL="postgresql://…@ep-crimson-credit-aiv54i67.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require"

# Neon object storage (create a storage:read credential in the Neon console)
export NEON_STORAGE_ENDPOINT="https://br-rough-block-aili6snu.storage.c-4.us-east-1.aws.neon.tech"
export NEON_STORAGE_REGION="us-east-1"
export NEON_STORAGE_BUCKET="shopforcare-price-transparency"
export NEON_STORAGE_ACCESS_KEY_ID="nak_live_…"
export NEON_STORAGE_SECRET_ACCESS_KEY="nsk_live_…"

npx tsx scripts/ingest/ingest-from-lake.ts --dry-run
npx tsx scripts/ingest/ingest-from-lake.ts --only=msk
npx tsx scripts/ingest/ingest-from-lake.ts
```

Or `npm run ingest:lake`. The job:

1. GETs `03-manifests/MASTER_INDEX.csv` from the bucket
2. Downloads each preferred MRF to a temp directory (deleted afterwards)
3. Checks hospital identity from the **file header**, not the filename
4. Extracts billing code + list/cash/negotiated into `PriceIndex`
5. Leaves the warehouse object untouched

## Vercel (`manhattan-charge-master-uq6x`)

Set **`DATABASE_URL`** to the manhattan-marketplace Neon branch (`cool-fire-98130468` / `br-rough-block-aili6snu`). That is enough for search.

Do **not** put storage keys or MRF files on Vercel. Ingest runs from a machine that can stream hundreds of MB; the app only queries `PriceIndex`.
