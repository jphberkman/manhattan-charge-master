import { Info, Database, Brain, ShieldAlert, Building2 } from "lucide-react";
import { AboutIntro } from "@/components/hospital-prices/AboutIntro";
import {
  AboutTitle,
  AboutDataTitle,
  AboutDataBody,
  AboutAiTitle,
  AboutAiBody,
  AboutHospitalsTitle,
  AboutDisclaimerTitle,
  AboutDisclaimerBody,
} from "@/components/hospital-prices/AboutSections";

export const revalidate = 3600; // ISR: revalidate every hour

export const metadata = {
  title: "About Our Data — Shop for Care",
  description:
    "Learn where our hospital price data comes from, our methodology, and how AI is and isn't used.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex items-center gap-2">
        <Info className="size-5 text-violet-400" />
        <AboutTitle />
      </div>

      <div className="mt-8 space-y-8">
        {/* Where data comes from */}
        <Section
          icon={<Database className="size-5 text-violet-400" />}
          title={<AboutDataTitle />}
        >
          <AboutIntro />
          <AboutDataBody />
        </Section>

        {/* What AI does */}
        <Section
          icon={<Brain className="size-5 text-violet-400" />}
          title={<AboutAiTitle />}
        >
          <AboutAiBody />
        </Section>

        {/* Hospitals */}
        <Section
          icon={<Building2 className="size-5 text-violet-400" />}
          title={<AboutHospitalsTitle />}
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
              <li key={name} className="flex items-center gap-2 text-sm text-white/70">
                <Building2 className="size-3.5 text-white/30" />
                {name}
              </li>
            ))}
          </ul>
        </Section>

        {/* Disclaimer */}
        <Section
          icon={<ShieldAlert className="size-5 text-amber-400" />}
          title={<AboutDisclaimerTitle />}
        >
          <AboutDisclaimerBody />
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
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/20 bg-white/10 p-6 backdrop-blur-sm">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        {title}
      </div>
      <div className="space-y-3 text-sm leading-relaxed text-white/60">
        {children}
      </div>
    </div>
  );
}
