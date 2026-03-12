"use client";

import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const GLOSSARY: Record<string, { term: string; definition: string; example?: string }> = {
  chargemaster: {
    term: "Chargemaster (List Price)",
    definition:
      "The hospital's official sticker price for every service — set internally and almost never what anyone actually pays. Insurance plans negotiate it down by 60–80%, and cash prices are similarly discounted.",
    example: "A $40,000 chargemaster price for knee replacement typically negotiates down to ~$12,000 with insurance.",
  },
  negotiated: {
    term: "Negotiated Rate",
    definition:
      "The pre-agreed price your insurance company has locked in with this hospital. Your insurer negotiated this discount before you ever walked in the door — it's always lower than the list price.",
    example: "If the list price is $40,000 and your insurer negotiated 70% off, the negotiated rate is $12,000.",
  },
  yourCost: {
    term: "Your Cost (Coinsurance)",
    definition:
      "What you actually owe after your insurance pays its share. Calculated as: negotiated rate × your coinsurance percentage. This assumes you've already met your deductible — if not, you may owe more.",
    example: "At 20% coinsurance on a $12,000 negotiated rate, you pay $2,400. Your insurer covers the remaining $9,600.",
  },
  coinsurance: {
    term: "Coinsurance",
    definition:
      "The percentage of costs you share with your insurer after meeting your deductible. Common plans split 80/20 — insurer pays 80%, you pay 20%.",
    example: "20% coinsurance on a $10,000 bill = $2,000 out of pocket for you.",
  },
  deductible: {
    term: "Deductible",
    definition:
      "The amount you must pay out-of-pocket before your insurance starts covering costs. Until you hit this threshold, you typically owe the full negotiated rate — not just your coinsurance %.",
    example: "With a $3,000 deductible and $0 spent so far, you'd owe the first $3,000 of any procedure yourself.",
  },
  cptCode: {
    term: "CPT Code",
    definition:
      "Current Procedural Terminology — a standardized 5-digit code that identifies every medical procedure. Hospitals and insurers use these codes to bill and price services consistently.",
    example: "CPT 27447 = Total knee replacement. Every hospital uses the same code for the same procedure.",
  },
  cashPrice: {
    term: "Cash / Self-Pay Price",
    definition:
      "The discounted price hospitals offer to uninsured patients or those paying directly without filing an insurance claim. Typically 15–30% above the negotiated insurance rate, but far below the chargemaster list price.",
    example: "A $40,000 list price may have a cash price of $14,000 — still much lower than what's on the chargemaster.",
  },
  episodeOfCare: {
    term: "Episode of Care",
    definition:
      "The total cost of a procedure from start to finish — including pre-op tests, the procedure itself, anesthesia, facility fees, implants, and follow-up visits. Prices shown here reflect the full episode, not just one line item.",
  },
};

interface Props {
  glossaryKey: keyof typeof GLOSSARY;
  /** Optional: override the trigger label. Defaults to an icon. */
  label?: string;
  side?: "top" | "bottom" | "left" | "right";
}

export function GlossaryTip({ glossaryKey, label, side = "top" }: Props) {
  const entry = GLOSSARY[glossaryKey];
  if (!entry) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 cursor-help focus:outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          {label && <span className="underline decoration-dotted underline-offset-2">{label}</span>}
          <HelpCircle className="size-3 text-neutral-400 hover:text-violet-500 transition-colors shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent side={side} className="w-80 p-4 text-sm shadow-lg">
        <p className="font-semibold text-neutral-900 mb-1">{entry.term}</p>
        <p className="text-neutral-600 leading-relaxed text-xs">{entry.definition}</p>
        {entry.example && (
          <p className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-700 leading-relaxed">
            <span className="font-semibold">Example: </span>{entry.example}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
