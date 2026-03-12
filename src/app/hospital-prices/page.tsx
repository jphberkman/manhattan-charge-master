import { prisma } from "@/lib/prisma";
import { HospitalPricesClient } from "@/components/hospital-prices/HospitalPricesClient";
import { Search, TrendingDown, ShieldCheck, Activity, Lock } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manhattan Medical Marketplace",
  description:
    "Find the true cost of any procedure at Manhattan hospitals. Compare insurance rates and cash prices — before you go.",
};

export default async function HospitalPricesPage() {
  // Only fetch the count for the hero stat — procedures are lazy-loaded client-side
  const [hospitals, priceCount] = await Promise.all([
    prisma.hospital.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, lastSeeded: true },
    }),
    prisma.priceEntry.count(),
  ]);

  return (
    <main className="min-h-screen bg-white">

      {/* ── Hero ── */}
      <div
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #2d0606 0%, #3b0a50 50%, #0a0820 100%)" }}
      >

        {/* Subtle plus / cross background pattern — medical feel */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-rule='evenodd'%3E%3Crect x='17' y='8' width='6' height='24'/%3E%3Crect x='8' y='17' width='24' height='6'/%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: "40px 40px",
          }}
        />

        {/* Crimson glow bottom-left */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 60% at 10% 80%, rgba(120,10,10,0.35) 0%, transparent 70%)",
          }}
        />

        {/* Violet glow top-right */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 85% 20%, rgba(100,30,160,0.30) 0%, transparent 70%)",
          }}
        />

        <div className="relative mx-auto max-w-4xl px-6 pb-16 pt-20 text-center sm:pt-28">

          {/* Badge */}
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 backdrop-blur-sm">
            <Activity className="size-3.5 text-violet-300" strokeWidth={2.5} />
            <span className="text-xs font-semibold tracking-wide text-white/80">
              Real hospital prices · Manhattan · Updated 2025
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-[2.75rem] font-bold leading-[1.12] tracking-[-0.02em] text-white sm:text-6xl">
            Know what you&apos;ll pay<br />
            <span className="text-violet-300">before you go.</span>
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-white/65">
            Compare real prices at Manhattan hospitals — with your insurance or without.
            No surprises. No medical jargon. Just the number that matters to you.
          </p>

          {/* Trust stats */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            <Stat value={`10+`} label="Manhattan hospitals" />
            <Divider />
            <Stat value={priceCount > 0 ? priceCount.toLocaleString() : "30,000+"} label="price records" />
            <Divider />
            <Stat value="AI" label="procedure identification" />
          </div>

          {/* Compliance note */}
          <div className="mt-8 inline-flex items-center gap-1.5 text-xs text-white/35">
            <Lock className="size-3" />
            Prices sourced from federally mandated hospital price transparency files
          </div>
        </div>

        {/* ECG / heartbeat decorative line */}
        <div className="relative mx-auto max-w-5xl px-6 pb-2">
          <svg
            viewBox="0 0 900 60"
            fill="none"
            className="w-full opacity-[0.25]"
            preserveAspectRatio="none"
          >
            <polyline
              points="0,30 120,30 150,30 165,8 180,52 195,8 210,52 225,30 270,30 300,30 330,30 360,30 450,30 500,30 530,30 545,8 560,52 575,8 590,52 605,30 650,30 680,30 900,30"
              stroke="#c4b5fd"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Bottom border */}
        <div className="border-b border-white/10" />
      </div>

      {/* ── How it works ── */}
      <div className="bg-neutral-50 border-b border-neutral-100">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="grid gap-4 sm:grid-cols-3">
            <FeatureCard
              icon={<Search className="size-4 text-violet-600" />}
              title="Describe what you need"
              body='Type "knee replacement" or "I have gallstones" — no medical codes needed. Our AI identifies the procedure instantly.'
            />
            <FeatureCard
              icon={<TrendingDown className="size-4 text-violet-600" />}
              title="See your real out-of-pocket cost"
              body="We show what you'd pay with insurance and without — side by side — so you can choose the most affordable option."
            />
            <FeatureCard
              icon={<ShieldCheck className="size-4 text-violet-600" />}
              title="Find the best hospital and doctor"
              body="The same procedure can cost thousands more at one hospital. We rank all options and recommend top surgeons for each."
            />
          </div>
        </div>
      </div>

      {/* ── Main marketplace ── */}
      <div className="mx-auto max-w-5xl px-6 py-10 pb-20">
        <HospitalPricesClient />
      </div>
    </main>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold tracking-tight text-white">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-white/45 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function Divider() {
  return <div className="hidden h-8 w-px bg-white/20 sm:block" />;
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 inline-flex rounded-xl border border-violet-100 bg-violet-50 p-2.5">
        {icon}
      </div>
      <p className="font-semibold text-gray-900">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{body}</p>
    </div>
  );
}
