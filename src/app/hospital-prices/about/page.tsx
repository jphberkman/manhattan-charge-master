import { Info, Database, Brain, ShieldAlert, Building2 } from "lucide-react";

export const metadata = {
  title: "About Our Data — Shop for Care",
  description:
    "Learn where our hospital price data comes from, our methodology, and how AI is and isn't used.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex items-center gap-2">
        <Info className="size-5 text-violet-600" />
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          About Our Data
        </h1>
      </div>

      <div className="mt-8 space-y-8">
        {/* Where data comes from */}
        <Section
          icon={<Database className="size-5 text-violet-600" />}
          title="Where the data comes from"
        >
          <p>
            Every price on this site comes from publicly available machine-readable
            files that hospitals are legally required to publish under the{" "}
            <strong>Hospital Price Transparency Rule</strong> (CMS-1717-F2),
            which took effect January 1, 2021.
          </p>
          <p>
            We collect, parse, and normalize these files from 10 Manhattan
            hospitals. Each file contains chargemaster rates, cash/self-pay
            prices, and negotiated rates for specific insurance plans.
          </p>
        </Section>

        {/* What AI does */}
        <Section
          icon={<Brain className="size-5 text-violet-600" />}
          title="How AI is used"
        >
          <p>
            AI is used in <strong>two limited ways</strong>:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Search understanding:</strong> When you describe a
              procedure in plain English, AI maps your description to the
              correct CPT/procedure codes.
            </li>
            <li>
              <strong>Data upload parsing:</strong> When hospital files use
              non-standard formats, AI helps detect column mappings during
              import.
            </li>
          </ul>
          <p className="mt-3">
            AI is <strong>never</strong> used to generate, estimate, or
            fabricate prices. If a price is not in our database, we tell you
            it&apos;s missing rather than guessing.
          </p>
        </Section>

        {/* Hospitals */}
        <Section
          icon={<Building2 className="size-5 text-violet-600" />}
          title="Covered hospitals"
        >
          <ul className="mt-2 space-y-1.5">
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
              <li key={name} className="flex items-center gap-2 text-sm">
                <Building2 className="size-3.5 text-gray-400" />
                {name}
              </li>
            ))}
          </ul>
        </Section>

        {/* Disclaimer */}
        <Section
          icon={<ShieldAlert className="size-5 text-amber-600" />}
          title="Disclaimer"
        >
          <p>
            This tool provides price information from publicly available
            hospital transparency files for educational and informational
            purposes only. It is <strong>not medical advice</strong>.
          </p>
          <p>
            Actual costs may vary based on your specific treatment, insurance
            benefits, deductibles, co-pays, and provider agreements. Always
            verify final costs with your healthcare provider and insurance
            company before making decisions.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="space-y-3 text-sm leading-relaxed text-gray-600">
        {children}
      </div>
    </div>
  );
}
