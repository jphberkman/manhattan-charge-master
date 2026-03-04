"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InsuranceSelection {
  insurer: string;
  planType: string;
  payerType: "commercial" | "medicare" | "medicaid" | "cash";
  displayLabel: string; // e.g. "Aetna PPO"
}

interface Insurer {
  name: string;
  shortName: string;
  payerType: InsuranceSelection["payerType"];
  logo: string; // emoji fallback
  plans: string[];
}

const INSURERS: Insurer[] = [
  {
    name: "Aetna",
    shortName: "Aetna",
    payerType: "commercial",
    logo: "🔵",
    plans: ["PPO", "HMO", "EPO", "POS"],
  },
  {
    name: "Cigna",
    shortName: "Cigna",
    payerType: "commercial",
    logo: "🟠",
    plans: ["PPO", "HMO", "EPO", "OAP"],
  },
  {
    name: "UnitedHealthcare",
    shortName: "United",
    payerType: "commercial",
    logo: "🟡",
    plans: ["PPO", "HMO", "EPO", "Choice Plus"],
  },
  {
    name: "Empire Blue Cross Blue Shield",
    shortName: "Empire BCBS",
    payerType: "commercial",
    logo: "🔷",
    plans: ["PPO", "HMO", "EPO", "BlueCard PPO"],
  },
  {
    name: "Oxford Health Plans",
    shortName: "Oxford",
    payerType: "commercial",
    logo: "🟤",
    plans: ["PPO", "HMO", "Freedom Plan"],
  },
  {
    name: "Emblem Health",
    shortName: "Emblem",
    payerType: "commercial",
    logo: "🟣",
    plans: ["PPO", "HMO", "Select Care"],
  },
  {
    name: "Oscar Health",
    shortName: "Oscar",
    payerType: "commercial",
    logo: "🩷",
    plans: ["PPO", "HMO", "EPO"],
  },
  {
    name: "Humana",
    shortName: "Humana",
    payerType: "commercial",
    logo: "🟢",
    plans: ["PPO", "HMO", "Choice Care"],
  },
  {
    name: "Medicare",
    shortName: "Medicare",
    payerType: "medicare",
    logo: "🏛️",
    plans: ["Original Medicare (Parts A & B)", "Medicare Advantage (Part C)"],
  },
  {
    name: "Medicaid",
    shortName: "Medicaid",
    payerType: "medicaid",
    logo: "🏥",
    plans: ["NY Medicaid"],
  },
  {
    name: "Self-Pay / Cash",
    shortName: "Cash",
    payerType: "cash",
    logo: "💵",
    plans: ["Cash Pay"],
  },
];

interface Props {
  value: InsuranceSelection | null;
  onChange: (selection: InsuranceSelection | null) => void;
}

export function InsuranceSelector({ value, onChange }: Props) {
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? INSURERS : INSURERS.slice(0, 8);
  const selectedInsurer = value ? INSURERS.find((i) => i.name === value.insurer) : null;

  const handleInsurerClick = (insurer: Insurer) => {
    if (value?.insurer === insurer.name) {
      // Deselect
      onChange(null);
      return;
    }
    const plan = insurer.plans[0];
    onChange({
      insurer: insurer.name,
      planType: plan,
      payerType: insurer.payerType,
      displayLabel: insurer.payerType === "cash" || insurer.payerType === "medicaid"
        ? insurer.name
        : `${insurer.shortName} ${plan}`,
    });
  };

  const handlePlanChange = (plan: string) => {
    if (!selectedInsurer || !value) return;
    onChange({
      ...value,
      planType: plan,
      displayLabel: selectedInsurer.payerType === "cash" || selectedInsurer.payerType === "medicaid"
        ? selectedInsurer.name
        : `${selectedInsurer.shortName} ${plan}`,
    });
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Step 1</p>
          <h2 className="text-base font-bold text-neutral-900">Select Your Insurance</h2>
        </div>
        {value && (
          <button
            onClick={() => onChange(null)}
            className="text-xs text-neutral-400 hover:text-neutral-600"
          >
            Clear
          </button>
        )}
      </div>

      {/* Insurer grid */}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        {visible.map((insurer) => {
          const isSelected = value?.insurer === insurer.name;
          return (
            <button
              key={insurer.name}
              onClick={() => handleInsurerClick(insurer)}
              className={cn(
                "relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-all",
                isSelected
                  ? "border-blue-500 bg-blue-50 shadow-sm ring-1 ring-blue-500"
                  : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
              )}
            >
              {isSelected && (
                <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-blue-500">
                  <Check className="size-2.5 text-white" strokeWidth={3} />
                </span>
              )}
              <span className="text-xl leading-none">{insurer.logo}</span>
              <span
                className={cn(
                  "text-xs font-medium leading-tight",
                  isSelected ? "text-blue-700" : "text-neutral-700"
                )}
              >
                {insurer.shortName}
              </span>
            </button>
          );
        })}

        {/* Show more toggle */}
        {!showAll && INSURERS.length > 8 && (
          <button
            onClick={() => setShowAll(true)}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-neutral-200 px-2 py-3 text-center hover:border-neutral-300 hover:bg-neutral-50"
          >
            <ChevronDown className="size-5 text-neutral-400" />
            <span className="text-xs font-medium text-neutral-400">More</span>
          </button>
        )}
      </div>

      {/* Plan type selector */}
      {selectedInsurer && selectedInsurer.plans.length > 1 && (
        <div className="mt-4 border-t border-neutral-100 pt-4">
          <p className="mb-2 text-xs font-medium text-neutral-500">Plan type</p>
          <div className="flex flex-wrap gap-2">
            {selectedInsurer.plans.map((plan) => (
              <button
                key={plan}
                onClick={() => handlePlanChange(plan)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  value?.planType === plan
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50"
                )}
              >
                {plan}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected summary */}
      {value && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2">
          <Check className="size-3.5 shrink-0 text-blue-600" />
          <p className="text-xs font-medium text-blue-700">
            Showing prices for <strong>{value.displayLabel}</strong>
          </p>
        </div>
      )}
    </div>
  );
}
