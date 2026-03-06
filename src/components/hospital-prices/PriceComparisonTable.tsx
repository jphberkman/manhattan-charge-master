"use client";

import { useState, useMemo } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PriceApiEntry } from "@/lib/price-transparency/types";

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const PRICE_TYPE_BADGE: Record<string, string> = {
  gross: "bg-neutral-100 text-neutral-600",
  negotiated: "bg-violet-50 text-violet-700",
  discounted: "bg-green-50 text-green-700",
  min: "bg-violet-50 text-violet-700",
  max: "bg-orange-50 text-orange-700",
};

type SortKey = "priceUsd" | "hospitalName" | "payerName" | "priceType";

interface Props {
  prices: PriceApiEntry[];
  loading: boolean;
  selectedHospitalIds?: Set<string>;
  onToggleHospital?: (hospitalId: string, entry: PriceApiEntry) => void;
}

export function PriceComparisonTable({
  prices,
  loading,
  selectedHospitalIds,
  onToggleHospital,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("priceUsd");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => {
    return [...prices].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "priceUsd") cmp = a.priceUsd - b.priceUsd;
      else if (sortKey === "hospitalName")
        cmp = a.hospital.name.localeCompare(b.hospital.name);
      else if (sortKey === "payerName")
        cmp = a.payerName.localeCompare(b.payerName);
      else if (sortKey === "priceType")
        cmp = a.priceType.localeCompare(b.priceType);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [prices, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col)
      return <ArrowUpDown className="ml-1.5 inline size-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1.5 inline size-3" />
    ) : (
      <ArrowDown className="ml-1.5 inline size-3" />
    );
  };

  const showCheckboxes = !!onToggleHospital;

  if (loading) {
    return (
      <div className="rounded-lg border border-neutral-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              {showCheckboxes && <th className="w-8 px-3 py-3" />}
              {["Hospital", "Payer", "Price", "Type"].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-neutral-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-neutral-100">
                {showCheckboxes && <td className="px-3 py-3" />}
                {[200, 160, 80, 60].map((w, j) => (
                  <td key={j} className="px-4 py-3">
                    <div
                      className="h-4 animate-pulse rounded bg-neutral-100"
                      style={{ width: w }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (prices.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-neutral-200 py-12 text-center text-sm text-neutral-400">
        No price data found for this selection.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              {showCheckboxes && (
                <Th className="w-8">
                  <span className="sr-only">Compare</span>
                </Th>
              )}
              <Th onClick={() => toggleSort("hospitalName")}>
                Hospital <SortIcon col="hospitalName" />
              </Th>
              <Th onClick={() => toggleSort("payerName")}>
                Payer <SortIcon col="payerName" />
              </Th>
              <Th onClick={() => toggleSort("priceUsd")} className="text-right">
                Price <SortIcon col="priceUsd" />
              </Th>
              <Th onClick={() => toggleSort("priceType")}>
                Type <SortIcon col="priceType" />
              </Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry, i) => {
              const isSelected = selectedHospitalIds?.has(entry.hospital.id) ?? false;
              return (
                <tr
                  key={entry.id}
                  className={cn(
                    "border-b border-neutral-100 transition-colors hover:bg-neutral-50",
                    i === sorted.length - 1 && "border-b-0",
                    isSelected && "bg-violet-50 hover:bg-violet-50"
                  )}
                >
                  {showCheckboxes && (
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleHospital?.(entry.hospital.id, entry)}
                        className="size-4 cursor-pointer rounded border-neutral-300 accent-violet-600"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium text-neutral-900 max-w-[220px]">
                    <span className="block truncate" title={entry.hospital.name}>
                      {entry.hospital.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-600 max-w-[200px]">
                    <span className="block truncate" title={entry.payerName}>
                      {entry.payerName}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-neutral-900">
                    {fmt.format(entry.priceUsd)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                        PRICE_TYPE_BADGE[entry.priceType] ?? "bg-neutral-100 text-neutral-600"
                      )}
                    >
                      {entry.priceType}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-neutral-100 px-4 py-2 text-xs text-neutral-400">
        {prices.length} entries
        {showCheckboxes && (
          <span className="ml-2 text-neutral-400">— check hospitals to compare side-by-side</span>
        )}
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <th
      onClick={onClick}
      className={cn(
        "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500",
        onClick && "cursor-pointer select-none hover:text-neutral-900",
        className
      )}
    >
      {children}
    </th>
  );
}
