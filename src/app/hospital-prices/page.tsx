import Link from "next/link";
import {
  Search,
  Compass,
  ShieldCheck,
  Database,
  Brain,
  HeartPulse,
  ArrowRight,
  Building2,
  CheckCircle2,
  BadgeCheck,
} from "lucide-react";

export const metadata = {
  title: "Shop for Care — Know What You'll Pay Before You Go",
  description:
    "Compare real hospital prices from federally mandated transparency files. No AI estimates — just real data from Manhattan hospitals.",
};

export default function HospitalPricesPage() {
  return (
    <div>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950">
        {/* Subtle grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle, #fff 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        {/* Accent glow */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(124,58,237,0.15),transparent)]" />

        <div className="relative mx-auto max-w-4xl px-4 pb-20 pt-24 text-center sm:px-6 sm:pt-32">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-sm">
            <BadgeCheck className="size-3.5 text-emerald-400" />
            <span className="text-xs font-medium text-white/70">
              Real prices from hospital transparency files
            </span>
          </div>

          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
            Know what you&apos;ll pay
            <br />
            <span className="text-violet-400">before you go</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
            Compare real hospital prices from federally mandated transparency
            files. No AI estimates&nbsp;&mdash; just real data.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/hospital-prices/search"
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:bg-violet-500"
            >
              <Search className="size-4" />
              Search by Procedure
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/hospital-prices/explore"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/10"
            >
              <Compass className="size-4" />
              Explore a Health Concern
            </Link>
          </div>
        </div>
      </section>

      {/* ── Trust section ── */}
      <section className="border-b border-gray-100 bg-white py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-400">
            Why trust our data
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TrustCard
              icon={<Database className="size-5 text-violet-600" />}
              title="Real hospital data"
              body="All prices come from hospital chargemaster files required by federal law."
            />
            <TrustCard
              icon={<Brain className="size-5 text-violet-600" />}
              title="Not AI-generated"
              body="We never fabricate or estimate prices. If data is missing, we tell you."
            />
            <TrustCard
              icon={<Building2 className="size-5 text-violet-600" />}
              title="44M+ price entries"
              body="Covering 10 Manhattan hospitals with comprehensive procedure data."
            />
            <TrustCard
              icon={<HeartPulse className="size-5 text-violet-600" />}
              title="Your insurance, your cost"
              body="Enter your plan details for accurate out-of-pocket estimates."
            />
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold tracking-tight text-gray-900">
            How it works
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-sm text-gray-500">
            Three simple steps to find the best price for your procedure.
          </p>

          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            <StepCard
              step="1"
              icon={<Search className="size-5 text-violet-600" />}
              title="Search"
              body="Describe what you need in plain English. Our AI identifies the right procedure codes for you."
            />
            <StepCard
              step="2"
              icon={<ShieldCheck className="size-5 text-violet-600" />}
              title="Compare"
              body="See real prices across hospitals — insurance negotiated rates and cash prices side by side."
            />
            <StepCard
              step="3"
              icon={<CheckCircle2 className="size-5 text-violet-600" />}
              title="Save"
              body="Choose the best option and walk in knowing exactly what you'll pay. No surprises."
            />
          </div>
        </div>
      </section>

      {/* ── Data transparency ── */}
      <section className="border-t border-gray-100 bg-white py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold tracking-tight text-gray-900">
            Where does our data come from?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-sm text-gray-500">
            Every price comes from publicly available files that hospitals are
            legally required to publish under the{" "}
            <span className="font-medium text-gray-700">
              Hospital Price Transparency Rule
            </span>
            .
          </p>

          <div className="mt-8 rounded-xl border border-gray-100 bg-slate-50 p-6">
            <ul className="space-y-3">
              {[
                "NYU Langone Health",
                "Mount Sinai Hospital",
                "NewYork-Presbyterian",
                "Memorial Sloan Kettering",
                "Hospital for Special Surgery",
                "Lenox Hill Hospital",
                "NYC Health + Hospitals / Bellevue",
                "Weill Cornell Medical Center",
                "Columbia University Irving Medical Center",
                "Beth Israel Mount Sinai",
              ].map((name) => (
                <li
                  key={name}
                  className="flex items-center gap-2 text-sm text-gray-700"
                >
                  <Building2 className="size-3.5 text-gray-400" />
                  {name}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/hospital-prices/audit"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-500"
            >
              View full data quality report
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── Helper components ── */

function TrustCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-slate-50 p-5">
      <div className="mb-3 inline-flex rounded-lg border border-violet-100 bg-violet-50 p-2">
        {icon}
      </div>
      <p className="font-semibold text-gray-900">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{body}</p>
    </div>
  );
}

function StepCard({
  step,
  icon,
  title,
  body,
}: {
  step: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="relative rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">
          {step}
        </span>
        {icon}
      </div>
      <p className="text-lg font-semibold text-gray-900">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">{body}</p>
    </div>
  );
}
