"use client";

import { useState } from "react";
import { Check, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InsuranceSelection {
  insurer: string;
  planType: string;
  payerType: "commercial" | "medicare" | "medicaid" | "cash";
  displayLabel: string;
}

interface Plan {
  name: string;
  description: string;         // plain English
  typicalDeductible: string;   // e.g. "$1,500 – $4,000 / year"
  network: string;             // e.g. "Large — most NYC hospitals"
  yourShare: string;           // e.g. "Usually 20% after deductible"
}

interface Insurer {
  name: string;
  shortName: string;
  payerType: InsuranceSelection["payerType"];
  logo: string;
  tagline: string;
  plans: Plan[];
}

const INSURERS: Insurer[] = [
  {
    name: "Aetna",
    shortName: "Aetna",
    payerType: "commercial",
    logo: "🔵",
    tagline: "Large national network",
    plans: [
      { name: "PPO",  description: "See any doctor, no referral needed. Most flexible.", typicalDeductible: "$1,500 – $3,500/yr", network: "Very large — almost all NYC hospitals", yourShare: "Usually 20% after deductible" },
      { name: "HMO",  description: "Pick a primary care doctor who coordinates your care. Lower premiums.", typicalDeductible: "$500 – $2,000/yr", network: "Limited to HMO network", yourShare: "Low copays, often $20–$50/visit" },
      { name: "EPO",  description: "No referrals needed but must stay in-network.", typicalDeductible: "$1,000 – $3,000/yr", network: "In-network only", yourShare: "Usually 20% after deductible" },
      { name: "POS",  description: "Blend of HMO and PPO — primary doctor required but can go out-of-network.", typicalDeductible: "$1,000 – $3,500/yr", network: "Large, with out-of-network option", yourShare: "Higher if out-of-network" },
    ],
  },
  {
    name: "Cigna",
    shortName: "Cigna",
    payerType: "commercial",
    logo: "🟠",
    tagline: "Strong in employer plans",
    plans: [
      { name: "PPO",  description: "See any doctor, no referral needed.", typicalDeductible: "$1,500 – $4,000/yr", network: "Very large — most NYC hospitals in-network", yourShare: "Usually 20% after deductible" },
      { name: "HMO",  description: "Coordinated care through a primary doctor. Lower cost.", typicalDeductible: "$500 – $1,500/yr", network: "HMO network only", yourShare: "Low copays per visit" },
      { name: "EPO",  description: "No referrals, but in-network only.", typicalDeductible: "$1,000 – $3,000/yr", network: "In-network only", yourShare: "Usually 20% after deductible" },
      { name: "OAP",  description: "Open Access Plus — like a PPO but with some HMO features.", typicalDeductible: "$1,000 – $3,000/yr", network: "Large, some out-of-network coverage", yourShare: "Usually 20–30% after deductible" },
    ],
  },
  {
    name: "UnitedHealthcare",
    shortName: "United",
    payerType: "commercial",
    logo: "🟡",
    tagline: "Largest US insurer",
    plans: [
      { name: "PPO",           description: "Maximum flexibility — no referrals, any doctor.", typicalDeductible: "$1,500 – $4,500/yr", network: "Enormous — all major NYC hospitals", yourShare: "Usually 20% after deductible" },
      { name: "HMO",           description: "Coordinated care, lower premiums.", typicalDeductible: "$500 – $2,000/yr", network: "HMO network", yourShare: "Low copays" },
      { name: "EPO",           description: "In-network only, no referrals needed.", typicalDeductible: "$1,000 – $3,500/yr", network: "In-network only", yourShare: "Usually 20% after deductible" },
      { name: "Choice Plus",   description: "Preferred network with some out-of-network coverage.", typicalDeductible: "$1,000 – $3,500/yr", network: "Large preferred network", yourShare: "20% in-network, more out-of-network" },
    ],
  },
  {
    name: "Empire Blue Cross Blue Shield",
    shortName: "Empire BCBS",
    payerType: "commercial",
    logo: "🔷",
    tagline: "New York's BCBS plan",
    plans: [
      { name: "PPO",          description: "Full flexibility, no referrals needed.", typicalDeductible: "$1,500 – $4,000/yr", network: "Very large NY & national network", yourShare: "Usually 20% after deductible" },
      { name: "HMO",          description: "Lower-cost coordinated care plan.", typicalDeductible: "$500 – $2,000/yr", network: "HMO network only", yourShare: "Low copays" },
      { name: "EPO",          description: "No referrals, in-network only.", typicalDeductible: "$1,000 – $3,000/yr", network: "In-network only", yourShare: "Usually 20% after deductible" },
      { name: "BlueCard PPO", description: "BCBS PPO recognized nationwide — great for travel.", typicalDeductible: "$1,500 – $4,000/yr", network: "All BCBS network hospitals nationally", yourShare: "Usually 20% after deductible" },
    ],
  },
  {
    name: "Oxford Health Plans",
    shortName: "Oxford",
    payerType: "commercial",
    logo: "🟤",
    tagline: "Strong NYC hospital access",
    plans: [
      { name: "PPO",          description: "See any doctor anywhere, no referrals.", typicalDeductible: "$1,500 – $4,000/yr", network: "Large NYC-focused network", yourShare: "Usually 20% after deductible" },
      { name: "HMO",          description: "Low-cost coordinated care.", typicalDeductible: "$500 – $1,500/yr", network: "Oxford HMO hospitals", yourShare: "Low copays" },
      { name: "Freedom Plan", description: "Hybrid: choose any doctor but pay less in-network.", typicalDeductible: "$1,000 – $3,500/yr", network: "Large with out-of-network option", yourShare: "Lower in-network, higher out" },
    ],
  },
  {
    name: "Emblem Health",
    shortName: "Emblem",
    payerType: "commercial",
    logo: "🟣",
    tagline: "NYC-based, strong local network",
    plans: [
      { name: "PPO",         description: "Flexible, no referrals required.", typicalDeductible: "$1,500 – $3,500/yr", network: "Strong NYC hospital network", yourShare: "Usually 20% after deductible" },
      { name: "HMO",         description: "Coordinated care, very low premiums.", typicalDeductible: "$0 – $1,500/yr", network: "EmblemHealth HMO network", yourShare: "Copays only, often $0–$30" },
      { name: "Select Care", description: "Narrower network but significantly lower cost.", typicalDeductible: "$0 – $1,000/yr", network: "Select NYC hospitals & doctors", yourShare: "Very low — designed for affordability" },
    ],
  },
  {
    name: "Oscar Health",
    shortName: "Oscar",
    payerType: "commercial",
    logo: "🩷",
    tagline: "Modern, app-based, NYC-friendly",
    plans: [
      { name: "PPO", description: "Full flexibility, concierge-style support app.", typicalDeductible: "$1,500 – $4,000/yr", network: "Good NYC coverage", yourShare: "Usually 20% after deductible" },
      { name: "HMO", description: "Low-cost with virtual care included.", typicalDeductible: "$500 – $2,000/yr", network: "Oscar HMO network", yourShare: "Low copays, free virtual visits" },
      { name: "EPO", description: "In-network only, no referrals.", typicalDeductible: "$1,000 – $3,000/yr", network: "In-network only", yourShare: "Usually 20% after deductible" },
    ],
  },
  {
    name: "Humana",
    shortName: "Humana",
    payerType: "commercial",
    logo: "🟢",
    tagline: "Strong Medicare Advantage options",
    plans: [
      { name: "PPO",        description: "Flexible, no referrals needed.", typicalDeductible: "$1,500 – $4,000/yr", network: "Large national network", yourShare: "Usually 20% after deductible" },
      { name: "HMO",        description: "Coordinated care at lower cost.", typicalDeductible: "$500 – $2,000/yr", network: "HMO network", yourShare: "Low copays" },
      { name: "Choice Care",description: "Humana's preferred-provider option.", typicalDeductible: "$1,000 – $3,500/yr", network: "Preferred network + out-of-network", yourShare: "20% in-network" },
    ],
  },
  {
    name: "Medicare",
    shortName: "Medicare",
    payerType: "medicare",
    logo: "🏛️",
    tagline: "Federal insurance for 65+",
    plans: [
      { name: "Original Medicare (Parts A & B)", description: "Hospital (Part A) + doctor visits (Part B). Works everywhere Medicare is accepted.", typicalDeductible: "$1,632/yr (Part A), $240/yr (Part B)", network: "Almost all US hospitals & doctors", yourShare: "20% of most services after deductible" },
      { name: "Medicare Advantage (Part C)",     description: "Private plan that bundles Parts A, B, and usually D. Often lower out-of-pocket.", typicalDeductible: "Varies by plan, often $0–$500", network: "Plan's network (usually large in NYC)", yourShare: "Varies — often lower copays than Original" },
    ],
  },
  {
    name: "Medicaid",
    shortName: "Medicaid",
    payerType: "medicaid",
    logo: "🏥",
    tagline: "Free/low-cost for qualifying New Yorkers",
    plans: [
      { name: "NY Medicaid", description: "Full coverage for qualifying low-income adults. No or very low cost to you.", typicalDeductible: "$0", network: "Most NYC hospitals accept Medicaid", yourShare: "Little to nothing — typically $0–$3 copays" },
    ],
  },
  {
    name: "Self-Pay / Cash",
    shortName: "No insurance",
    payerType: "cash",
    logo: "💵",
    tagline: "No insurance — pay directly",
    plans: [
      { name: "Cash Pay", description: "No insurance. You pay the hospital's self-pay (cash) price directly. Sometimes surprisingly affordable — especially for elective procedures.", typicalDeductible: "N/A", network: "Any hospital", yourShare: "100% — but cash prices can be negotiated" },
    ],
  },
];

interface Props {
  value: InsuranceSelection | null;
  onChange: (selection: InsuranceSelection | null) => void;
  onDone?: () => void;  // called when the user is done selecting
}

export function InsuranceSelector({ value, onChange, onDone }: Props) {
  const [showAll, setShowAll] = useState(false);
  // step: "insurer" = picking insurer, "plan" = picking plan for selected insurer
  const [step, setStep] = useState<"insurer" | "plan">("insurer");
  const [pendingInsurer, setPendingInsurer] = useState<Insurer | null>(null);

  const visible = showAll ? INSURERS : INSURERS.slice(0, 9);
  const currentInsurer = pendingInsurer ?? (value ? INSURERS.find((i) => i.name === value.insurer) ?? null : null);

  const handleInsurerClick = (insurer: Insurer) => {
    if (insurer.plans.length === 1) {
      // Single plan — select immediately and done
      const plan = insurer.plans[0];
      onChange({
        insurer: insurer.name,
        planType: plan.name,
        payerType: insurer.payerType,
        displayLabel: insurer.payerType === "cash" || insurer.payerType === "medicaid"
          ? insurer.name
          : `${insurer.shortName} ${plan.name}`,
      });
      onDone?.();
    } else {
      // Multiple plans — go to plan selection step
      setPendingInsurer(insurer);
      setStep("plan");
    }
  };

  const handlePlanClick = (insurer: Insurer, plan: Plan) => {
    onChange({
      insurer: insurer.name,
      planType: plan.name,
      payerType: insurer.payerType,
      displayLabel: insurer.payerType === "cash" || insurer.payerType === "medicaid"
        ? insurer.name
        : `${insurer.shortName} ${plan.name}`,
    });
    onDone?.();
  };

  const handleBack = () => {
    setStep("insurer");
    setPendingInsurer(null);
  };

  // ── Insurer grid ──────────────────────────────────────────────────────────
  if (step === "insurer") {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium text-neutral-500">
          Pick your insurance company — then we&apos;ll ask which plan type you have.
        </p>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {visible.map((insurer) => {
            const isSelected = value?.insurer === insurer.name;
            return (
              <button
                key={insurer.name}
                onClick={() => handleInsurerClick(insurer)}
                className={cn(
                  "relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-all",
                  isSelected
                    ? "border-violet-500 bg-violet-50 shadow-sm ring-1 ring-violet-500"
                    : "border-neutral-200 bg-white hover:border-violet-200 hover:bg-violet-50/40"
                )}
              >
                {isSelected && (
                  <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-violet-500">
                    <Check className="size-2.5 text-white" strokeWidth={3} />
                  </span>
                )}
                <span className="text-xl leading-none">{insurer.logo}</span>
                <span className={cn(
                  "text-xs font-semibold leading-tight",
                  isSelected ? "text-violet-700" : "text-neutral-700"
                )}>
                  {insurer.shortName}
                </span>
                <span className="text-[10px] text-neutral-400 leading-tight hidden sm:block">
                  {insurer.tagline}
                </span>
              </button>
            );
          })}

          {!showAll && INSURERS.length > 9 && (
            <button
              onClick={() => setShowAll(true)}
              className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-neutral-200 px-2 py-3 text-center hover:border-neutral-300 hover:bg-neutral-50"
            >
              <span className="text-xs font-medium text-neutral-400">See all</span>
            </button>
          )}
        </div>

        {value && (
          <div className="flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2">
            <Check className="size-3.5 shrink-0 text-violet-600" />
            <p className="text-xs font-medium text-violet-700">
              Currently showing prices for <strong>{value.displayLabel}</strong>
              <button
                onClick={() => { onChange(null); setStep("insurer"); }}
                className="ml-2 text-violet-400 hover:text-violet-600 underline"
              >
                Remove
              </button>
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Plan picker ───────────────────────────────────────────────────────────
  if (step === "plan" && currentInsurer) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 transition-colors"
          >
            <ChevronLeft className="size-3.5" /> Back
          </button>
          <div className="flex items-center gap-2">
            <span className="text-lg">{currentInsurer.logo}</span>
            <p className="text-sm font-bold text-neutral-800">{currentInsurer.name}</p>
          </div>
        </div>

        <p className="text-xs text-neutral-500">
          Which type of plan do you have? Check your insurance card — it&apos;s usually printed on the front.
        </p>

        <div className="space-y-2">
          {currentInsurer.plans.map((plan) => {
            const isSelected = value?.insurer === currentInsurer.name && value?.planType === plan.name;
            return (
              <button
                key={plan.name}
                onClick={() => handlePlanClick(currentInsurer, plan)}
                className={cn(
                  "w-full rounded-xl border p-4 text-left transition-all",
                  isSelected
                    ? "border-violet-500 bg-violet-50 ring-1 ring-violet-400"
                    : "border-neutral-200 bg-white hover:border-violet-200 hover:bg-violet-50/30"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "inline-block rounded-full px-2.5 py-0.5 text-xs font-bold",
                        isSelected ? "bg-violet-600 text-white" : "bg-neutral-100 text-neutral-700"
                      )}>
                        {plan.name}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-700">{plan.description}</p>
                  </div>
                  {isSelected && (
                    <Check className="size-5 shrink-0 text-violet-600 mt-0.5" />
                  )}
                </div>

                {/* Plan details grid */}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <PlanDetail label="Yearly deductible" value={plan.typicalDeductible} />
                  <PlanDetail label="Network" value={plan.network} />
                  <PlanDetail label="Your share after deductible" value={plan.yourShare} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}

function PlanDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-0.5 text-xs font-medium text-neutral-700 leading-snug">{value}</p>
    </div>
  );
}
