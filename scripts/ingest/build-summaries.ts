/**
 * Build read models from fresh (sourceFileId IS NOT NULL) PriceEntry rows:
 *   - ServiceDescription (distinct hospital/code/description) + FTS/trigram indexes
 *   - PriceSummary (per hospital/code/payerClass/priceType aggregates)
 *
 *   DATABASE_URL=… npx tsx scripts/ingest/build-summaries.ts [hospitalId…]
 */
import { Client } from "pg";
import { SHOPPER_HOSPITALS } from "../../src/lib/price-transparency/shopper-hospitals";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const only = process.argv.slice(2);
  const hospitalIds = only.length ? only : SHOPPER_HOSPITALS.map((h) => h.id);

  const client = new Client({ connectionString: url, statement_timeout: 0 });
  await client.connect();

  for (const hid of hospitalIds) {
    const t0 = Date.now();
    console.log(`[${hid}] service descriptions…`);
    await client.query(`DELETE FROM "ServiceDescription" WHERE "hospitalId" = $1`, [hid]);
    const sd = await client.query(
      `INSERT INTO "ServiceDescription" (id, "hospitalId", code, "codeKind", description, "sourceFileId")
       SELECT gen_random_uuid()::text, "hospitalId", code, MIN("codeKind"), description, MIN("sourceFileId")
       FROM "PriceEntry"
       WHERE "hospitalId" = $1 AND "sourceFileId" IS NOT NULL AND code IS NOT NULL AND description IS NOT NULL
       GROUP BY "hospitalId", code, description`,
      [hid],
    );

    console.log(`[${hid}] price summaries…`);
    await client.query(`DELETE FROM "PriceSummary" WHERE "hospitalId" = $1`, [hid]);
    const ps = await client.query(
      `INSERT INTO "PriceSummary" (id, "hospitalId", code, "codeKind", "payerClass", "priceType", "minCents", "medianCents", "maxCents", count, "latestAsOf")
       SELECT gen_random_uuid()::text, "hospitalId", code, MIN("codeKind"), "payerType", "priceType",
              MIN("priceInCents"),
              (percentile_cont(0.5) WITHIN GROUP (ORDER BY "priceInCents"))::int,
              MAX("priceInCents"), COUNT(*), MAX("asOf")
       FROM "PriceEntry"
       WHERE "hospitalId" = $1 AND "sourceFileId" IS NOT NULL AND code IS NOT NULL
       GROUP BY "hospitalId", code, "payerType", "priceType"`,
      [hid],
    );
    console.log(`[${hid}] descriptions=${sd.rowCount} summaries=${ps.rowCount} in ${Math.round((Date.now() - t0) / 1000)}s`);
  }

  console.log("ensuring search indexes…");
  await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  await client.query(
    `CREATE INDEX IF NOT EXISTS servicedescription_fts_idx ON "ServiceDescription" USING GIN (to_tsvector('english', description))`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS servicedescription_trgm_idx ON "ServiceDescription" USING GIN (description gin_trgm_ops)`,
  );
  console.log("done");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
