/**
 * One-shot accuracy check against the live Neon read models.
 *   npx tsx scripts/verify-accuracy.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { PrismaClient } from "../src/generated/prisma";
import { scoreDescriptionMatch } from "../src/lib/price-transparency/search-text";

const prisma = new PrismaClient();
const query = "I have a non-union ankle fracture and need surgery";

async function main() {
  const [mappings, cpts, summaries, indexRows] = await Promise.all([
    prisma.conditionMapping.findMany({
      where: {
        OR: [
          { condition: { contains: "ankle", mode: "insensitive" } },
          { condition: { contains: "nonunion", mode: "insensitive" } },
          { condition: { contains: "non-union", mode: "insensitive" } },
        ],
      },
    }),
    prisma.cptCode.findMany({ where: { code: { in: ["27720", "27726", "27766"] } } }),
    prisma.priceSummary.findMany({
      where: { code: "27766", codeKind: { in: ["cpt-shaped", "hcpcs-level-2"] } },
    }),
    prisma.priceIndex.findMany({ where: { code: "27766" } }),
  ]);

  const ranked = [
    ...mappings.map((m) => ({
      code: m.cptCode,
      source: `map:${m.condition}`,
      text: m.procedureName,
      ...scoreDescriptionMatch(query, m.procedureName, { weight: m.weight }),
    })),
    ...cpts.map((c) => ({
      code: c.code,
      source: "cpt",
      text: c.description,
      ...scoreDescriptionMatch(query, c.description),
    })),
  ].sort((a, b) => b.confidence - a.confidence);

  console.log("Ranked CPT candidates for:", query);
  for (const r of ranked.slice(0, 8)) {
    console.log(`  ${r.code}  ${r.confidence}  [${r.source}] ${r.text}`);
  }
  if (ranked[0]?.code === "27766") {
    throw new Error("FAIL: acute 27766 still ranked first");
  }

  console.log("\n27766 PriceSummary commercial vs cash:");
  const byH = new Map<string, { commercial?: number; cash?: number; medicare?: number }>();
  for (const s of summaries) {
    const h = byH.get(s.hospitalId) ?? {};
    const dollars = Math.round(s.medianCents / 100);
    if (s.priceType === "cash") h.cash = dollars;
    if (s.priceType === "negotiated" && s.payerClass === "commercial") h.commercial = dollars;
    if (s.priceType === "negotiated" && s.payerClass === "medicare") h.medicare = dollars;
    byH.set(s.hospitalId, h);
  }
  for (const [id, h] of [...byH.entries()].sort()) {
    console.log(`  ${id} commercial=${h.commercial ?? "—"} medicare=${h.medicare ?? "—"} cash=${h.cash ?? "—"}`);
  }
  const nyu = byH.get("nyu-langone")?.commercial;
  const bellevueCash = byH.get("hhc-bellevue")?.cash;
  if (nyu == null || bellevueCash == null) throw new Error("FAIL: missing NYU commercial or Bellevue cash");
  if (nyu === bellevueCash) throw new Error(`FAIL: NYU commercial still equals Bellevue cash ($${nyu})`);

  console.log("\n27766 PriceIndex commercialCents:");
  for (const r of indexRows.sort((a, b) => a.hospitalId.localeCompare(b.hospitalId))) {
    console.log(
      `  ${r.hospitalId} commercial=${r.commercialCents ?? "—"} negotiated=${r.negotiatedCents ?? "—"} medicare=${r.medicareCents ?? "—"} cash=${r.cashCents ?? "—"}`,
    );
  }
  const nyuIdx = indexRows.find((r) => r.hospitalId === "nyu-langone");
  if (nyuIdx && nyuIdx.commercialCents === nyuIdx.medicareCents) {
    throw new Error("FAIL: NYU PriceIndex commercial still equals medicare");
  }

  console.log("\nOK");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
