"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PayerTypeFilter = "all" | "commercial" | "medicare" | "medicaid" | "cash";

const OPTIONS: { value: PayerTypeFilter; label: string }[] = [
  { value: "all", label: "All Payers" },
  { value: "commercial", label: "Commercial" },
  { value: "medicare", label: "Medicare" },
  { value: "medicaid", label: "Medicaid" },
  { value: "cash", label: "Cash" },
];

interface Props {
  value: PayerTypeFilter;
  onChange: (v: PayerTypeFilter) => void;
}

export function PayerTypeFilter({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {OPTIONS.map((opt) => (
        <Button
          key={opt.value}
          size="sm"
          variant={value === opt.value ? "default" : "outline"}
          className={cn("h-8 text-xs", value === opt.value && "shadow-none")}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
