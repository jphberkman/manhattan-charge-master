import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { HospitalPricesClient } from "@/components/hospital-prices/HospitalPricesClient";
import { Upload, Search, TrendingDown, ShieldCheck } from "lucide-react";

export const metadata = {
  title: "Manhattan Medical Marketplace",
  description:
    "Find the true cost of any procedure at Manhattan hospitals. Compare insurance rates, chargemaster prices, and cash prices — before you go.",
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

  const priceCount = await prisma.priceEntry.count();

  const lastUpdated =
    hospitals.length > 0
      ? hospitals.map((h) => h.lastSeeded).filter(Boolean).sort().at(-1)
      : null;

  return (
    <main className="min-h-screen bg-slate-50">

      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-800">
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />

        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">

            {/* Left — headline */}
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-1.5">
                <ShieldCheck className="size-3.5 text-blue-400" />
                <span className="text-xs font-semibold uppercase tracking-widest text-blue-300">
                  Federal Price Transparency Data
                </span>
              </div>

              <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
                Find the true cost of your care.{" "}
                <span className="text-blue-400">Before you go.</span>
              </h1>

              <p className="mt-4 text-lg leading-relaxed text-slate-300">
                Compare charge master prices, insurance negotiated rates, and cash prices
                across Manhattan hospitals — powered by real federal price transparency data
                and AI-driven cost analysis.
              </p>

              {/* Stats */}
              <div className="mt-8 flex flex-wrap gap-3">
                <Pill icon="🏥" label={`${hospitals.length > 0 ? hospitals.length : "—"} Manhattan Hospitals`} />
                <Pill icon="📋" label={`${priceCount > 0 ? priceCount.toLocaleString() : "—"} Price Points`} />
                <Pill icon="🤖" label="AI Procedure Analysis" />
                {lastUpdated && (
                  <Pill
                    icon="🕐"
                    label={`Updated ${new Date(lastUpdated).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}`}
                  />
                )}
              </div>
            </div>

            {/* Right — action card */}
            <div className="shrink-0 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm lg:w-72">
              <p className="mb-4 text-sm font-semibold text-white">Get started</p>
              <ol className="space-y-3">
                {[
                  { n: "1", text: "Select your insurance plan" },
                  { n: "2", text: "Describe your condition or procedure" },
                  { n: "3", text: "See charge master, insurance, and cash prices" },
                ].map((s) => (
                  <li key={s.n} className="flex items-start gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
                      {s.n}
                    </span>
                    <span className="text-sm text-slate-300 leading-snug">{s.text}</span>
                  </li>
                ))}
              </ol>
              <Link
                href="/hospital-prices/upload"
                className="mt-5 flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
              >
                <Upload className="size-4" />
                Upload hospital price data
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="h-8 bg-gradient-to-b from-transparent to-slate-50" />
      </div>

      {/* ── How it works ── */}
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <FeatureCard
            icon={<Search className="size-5 text-blue-600" />}
            bg="bg-blue-50"
            title="Describe in plain English"
            body='Type a condition like "non-union ankle fracture" or a procedure like "knee replacement" — AI identifies what you need.'
          />
          <FeatureCard
            icon={<TrendingDown className="size-5 text-green-600" />}
            bg="bg-green-50"
            title="See every cost tier"
            body="Charge master (what hospitals bill), your insurance negotiated rate, your out-of-pocket share, and the cash price side by side."
          />
          <FeatureCard
            icon={<ShieldCheck className="size-5 text-purple-600" />}
            bg="bg-purple-50"
            title="Materials & implants included"
            body="AI breaks down every billable component — surgeon fees, anesthesia, implants, screws, hardware — with real charge master codes."
          />
        </div>
      </div>

      {/* ── Main marketplace ── */}
      <div className="mx-auto max-w-6xl px-4 pb-16">
        <HospitalPricesClient procedures={procedures} />
      </div>
    </main>
  );
}

function Pill({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-sm">
      <span>{icon}</span>
      {label}
    </span>
  );
}

function FeatureCard({
  icon, bg, title, body,
}: {
  icon: React.ReactNode;
  bg: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm">
      <div className={`mb-3 inline-flex rounded-xl p-2.5 ${bg}`}>{icon}</div>
      <p className="font-semibold text-neutral-900">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">{body}</p>
    </div>
  );
}
