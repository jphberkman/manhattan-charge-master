import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { HospitalPricesClient } from "@/components/hospital-prices/HospitalPricesClient";

export const metadata = {
  title: "Manhattan Medical Marketplace",
  description:
    "Find the best-priced Manhattan hospital for any procedure. Compare cash, insurance, Medicare, and Medicaid rates.",
};

export default async function HospitalPricesPage() {
  const procedures = await prisma.procedure.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: { id: true, cptCode: true, name: true, category: true, description: true },
  });

  const hospitals = await prisma.hospital.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, lastSeeded: true },
  });

  const lastUpdated =
    hospitals.length > 0
      ? hospitals.map((h) => h.lastSeeded).filter(Boolean).sort().at(-1)
      : null;

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Hero */}
      <div className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-blue-600">
                Price Transparency
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
                Find the Lowest Price for Your Procedure in Manhattan
              </h1>
              <p className="mt-3 text-base text-neutral-500">
                Compare negotiated insurance rates and cash prices across NYC hospitals.
                Prices are sourced from hospital price transparency filings required by federal law.
              </p>
              {/* Trust badges */}
              <div className="mt-5 flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700">
                  🏥 {hospitals.length > 0 ? `${hospitals.length} Manhattan Hospital${hospitals.length !== 1 ? "s" : ""}` : "Manhattan Hospitals"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700">
                  📋 Federal Price Transparency Data
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700">
                  🤖 AI Estimates Where Data Is Missing
                </span>
                {lastUpdated && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-500">
                    Updated {new Date(lastUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                )}
              </div>
            </div>
            <Link
              href="/hospital-prices/upload"
              className="shrink-0 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 hover:text-neutral-900"
            >
              Upload Price Data →
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <HospitalPricesClient procedures={procedures} />
      </div>
    </main>
  );
}
