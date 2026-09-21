# Machine-readable file drop

This is the **only** place ShopForCare should receive hospital chargemaster files for restoration ingest.

I cannot see your laptop `Downloads` folder. Copy or attach files **here**, one hospital per directory. Do not commit the files to git (they are gitignored). Do not upload multi-GB files through the website upload page.

## Chat attach limit

Cursor chat attachments stop at **about 10 MB**. That is why the large MRFs failed. Do **not** use the ShopForCare website upload for those either (serverless timeout).

### How to send files larger than 10 MB

1. **Best for files you already downloaded:** Google Drive (or Dropbox).
   - Upload the file (or one zip per hospital).
   - Share: **Anyone with the link can view**.
   - Paste the link in chat. Direct file links work; folders work if each hospital is named.
2. **I can pull the hospital’s public MRF URL** when it is still live (no upload).
3. If you have the git repo on the same Mac, copy into `data/mrf-drop/<hospital-id>/` locally. Do not `git add` the MRFs.

## Folders (13 shopper hospitals)

| Folder | Hospital | Put in this folder |
| --- | --- | --- |
| `lenox-hill/` | Lenox Hill Hospital (Northwell Health) | That campus file only |
| `mount-sinai-morningside/` | Mount Sinai Morningside | That campus file only |
| `mount-sinai-west/` | Mount Sinai West | That campus file only |
| `nyp-lower-manhattan/` | NYP Lower Manhattan | That campus file only |
| `nyp-columbia/` | NYP / Columbia Irving | That campus file only |
| `nyp-cornell/` | NYP / Weill Cornell | That campus file only |
| `hhc-bellevue/` | H+H Bellevue | Bellevue rows/file only |
| `hhc-harlem/` | H+H Harlem | Harlem only |
| `hhc-metropolitan/` | H+H Metropolitan | Metropolitan only |
| `nyu-langone/` | NYU Langone Tisch & Kimmel | Tisch/Kimmel only — **not** Orthopedic |
| `mount-sinai/` | The Mount Sinai Hospital (main) | Main campus only |
| `hss/` | Hospital for Special Surgery | HSS only |
| `msk/` | Memorial Sloan Kettering | MSK only |
| `inbox/` | Unsorted | Use if you are not sure yet |
| `unknown/` | Hospital not identifiable | Files with no name/NPI/address, confirmed unknown |

Keep original CMS filenames when you can (`{EIN}_{hospital}_standardcharges.csv` / `.json` / `.zip`).

## Rules

1. **One facility per folder.** A system-wide H+H file or an NYP file that concatenates campuses goes in `inbox/`, not under Bellevue or Cornell.
2. **Do not put NYU Orthopedic under `nyu-langone/`.**
3. Website `POST /api/upload` is for modest spreadsheets (serverless ~2 minute cap). Large MRFs stay in this drop and get ingested offline.
4. Nothing here is ingested until we inventory the file (name, size, hash) and you say go.

When files land, run:

```bash
npx tsx scripts/inventory-mrf-drop.ts
```

That lists what is here. It does **not** write prices.
