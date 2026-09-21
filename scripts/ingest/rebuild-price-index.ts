/**
 * Rebuild PriceIndex from PriceSummary with payer-class columns.
 * Does not re-download MRFs. CPT/HCPCS only — CDM collisions are dropped.
 *
 *   npx tsx scripts/ingest/rebuild-price-index.ts
 */
import { config as loadEnv } from "dotenv";
import { Client } from "pg";
import { SHOPPER_HOSPITALS } from "../../src/lib/price-transparency/shopper-hospitals";

loadEnv({ path: ".env.local" });
loadEnv();

function dbConnect(): Client {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL required");
  const connectionString = /sslmode=/i.test(dbUrl)
    ? dbUrl
    : `${dbUrl}${dbUrl.includes("?") ? "&" : "?"}sslmode=require`;
  return new Client({ connectionString, statement_timeout: 0 });
}

async function main() {
  const client = dbConnect();
  await client.connect();
  const hospitalIds = SHOPPER_HOSPITALS.map((h) => h.id);

  await client.query(`ALTER TABLE "PriceIndex" ADD COLUMN IF NOT EXISTS "commercialCents" INTEGER`);
  await client.query(`ALTER TABLE "PriceIndex" ADD COLUMN IF NOT EXISTS "medicareCents" INTEGER`);
  await client.query(`ALTER TABLE "PriceIndex" ADD COLUMN IF NOT EXISTS "medicaidCents" INTEGER`);

  await client.query(`
    CREATE TEMP TABLE price_index_keys AS
    SELECT "hospitalId", code, "objectKey"
    FROM "PriceIndex"
  `);

  await client.query(`DELETE FROM "PriceIndex"`);

  const inserted = await client.query(
    `
    INSERT INTO "PriceIndex" (
      id, "hospitalId", code, "codeKind", description,
      "listCents", "cashCents", "negotiatedCents",
      "commercialCents", "medicareCents", "medicaidCents",
      "negotiatedMinCents", "negotiatedMaxCents",
      "sampleCount", "objectKey", "asOf", "ingestedAt"
    )
    SELECT
      gen_random_uuid()::text,
      s."hospitalId",
      s.code,
      MIN(s."codeKind"),
      (
        SELECT sd.description
        FROM "ServiceDescription" sd
        WHERE sd."hospitalId" = s."hospitalId"
          AND sd.code = s.code
          AND sd."codeKind" IN ('cpt-shaped', 'hcpcs-level-2')
        ORDER BY length(sd.description) DESC
        LIMIT 1
      ),
      MAX(CASE WHEN s."priceType" = 'gross' THEN s."medianCents" END),
      MAX(CASE WHEN s."priceType" = 'cash' THEN s."medianCents" END),
      MAX(CASE WHEN s."priceType" = 'negotiated' AND s."payerClass" = 'commercial' THEN s."medianCents" END),
      MAX(CASE WHEN s."priceType" = 'negotiated' AND s."payerClass" = 'commercial' THEN s."medianCents" END),
      MAX(CASE WHEN s."priceType" = 'negotiated' AND s."payerClass" = 'medicare' THEN s."medianCents" END),
      MAX(CASE WHEN s."priceType" = 'negotiated' AND s."payerClass" = 'medicaid' THEN s."medianCents" END),
      MIN(CASE WHEN s."priceType" = 'negotiated' AND s."payerClass" = 'commercial' THEN s."minCents" END),
      MAX(CASE WHEN s."priceType" = 'negotiated' AND s."payerClass" = 'commercial' THEN s."maxCents" END),
      COALESCE(SUM(s.count), 0)::int,
      COALESCE(
        MAX(k."objectKey"),
        MAX(h."sourceFile"),
        'price-summary'
      ),
      MAX(s."latestAsOf"),
      NOW()
    FROM "PriceSummary" s
    LEFT JOIN "Hospital" h ON h.id = s."hospitalId"
    LEFT JOIN price_index_keys k ON k."hospitalId" = s."hospitalId" AND k.code = s.code
    WHERE s."hospitalId" = ANY($1)
      AND s."codeKind" IN ('cpt-shaped', 'hcpcs-level-2')
    GROUP BY s."hospitalId", s.code
    `,
    [hospitalIds],
  );

  const sample = await client.query<{
    hospitalId: string;
    commercial: number | null;
    medicare: number | null;
    cash: number | null;
  }>(
    `SELECT "hospitalId", "commercialCents" AS commercial, "medicareCents" AS medicare, "cashCents" AS cash
     FROM "PriceIndex"
     WHERE code = '27766'
     ORDER BY "hospitalId"`,
  );

  console.log(`PriceIndex rebuilt: ${inserted.rowCount} CPT/HCPCS rows`);
  console.log("27766 payer-class sample:");
  for (const r of sample.rows) {
    console.log(
      `  ${r.hospitalId} commercial=${r.commercial ?? "—"} medicare=${r.medicare ?? "—"} cash=${r.cash ?? "—"}`,
    );
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
