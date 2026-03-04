"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PriceApiEntry } from "@/lib/price-transparency/types";

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const PRICE_TYPE_BADGE: Record<string, string> = {
  gross: "bg-neutral-100 text-neutral-600",
  negotiated: "bg-blue-50 text-blue-700",
  discounted: "bg-green-50 text-green-700",
  min: "bg-violet-50 text-violet-700",
  max: "bg-orange-50 text-orange-700",
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** One entry per selected hospital (the cheapest entry for that hospital) */
  entries: PriceApiEntry[];
  procedureName: string;
}

export function CompareDrawer({ open, onClose, entries, procedureName }: Props) {
  if (!open) return null;

  const minPrice = Math.min(...entries.map((e) => e.priceUsd));

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-neutral-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Side-by-Side Comparison
            </p>
            <h2 className="mt-0.5 text-base font-bold text-neutral-900">{procedureName}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Cards */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {entries.length === 0 ? (
            <p className="text-sm text-neutral-400">No hospitals selected.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map((entry) => {
                const isBest = entry.priceUsd === minPrice;
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "relative flex flex-col rounded-xl border p-4 transition-shadow",
                      isBest
                        ? "border-green-300 bg-green-50 shadow-md"
                        : "border-neutral-200 bg-white"
                    )}
                  >
                    {isBest && (
                      <span className="mb-2 inline-flex w-fit items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                        ✓ Best Value
                      </span>
                    )}
                    <p className="font-semibold leading-snug text-neutral-900">
                      {entry.hospital.name}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-400">{entry.hospital.address}</p>

                    <div className="mt-4 flex items-end justify-between">
                      <span
                        className={cn(
                          "text-2xl font-bold",
                          isBest ? "text-green-700" : "text-neutral-900"
                        )}
                      >
                        {fmt.format(entry.priceUsd)}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                          PRICE_TYPE_BADGE[entry.priceType] ?? "bg-neutral-100 text-neutral-600"
                        )}
                      >
                        {entry.priceType}
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-neutral-500">{entry.payerName}</p>

                    {!isBest && (
                      <p className="mt-3 text-xs text-neutral-400">
                        +{fmt.format(entry.priceUsd - minPrice)} vs best
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-neutral-100 px-6 py-3 text-xs text-neutral-400">
          Prices shown are the lowest available rate for each selected hospital.
        </div>
      </div>
    </>
  );
}
