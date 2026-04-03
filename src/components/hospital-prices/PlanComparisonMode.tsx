"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Trophy, Plus, X, ShieldCheck, ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InsuranceSelector, type InsuranceSelection } from "./InsuranceSelector";
import { CustomPlanInput } from "./CustomPlanInput";
import { calculatePatientCost, type PlanDetails } from "@/lib/cost-calculator";
import type { HospitalComparisonEntry, CompareResponse } from "@/app/api/hospitals/compare/route";

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtNull = (v: number | null) => (v == null ? "\u2014" : fmt.format(v));

interface PlanSlot {
  id: string;
  insurance: InsuranceSelection | null;
  planDetails: PlanDetails | null;
  entries: HospitalComparisonEntry[];
  loading: boolean;
  error: string | null;
}

interface Props {
  cptCode: string;
  procedureName: string;
  coinsurance: number;
  allCptCodes?: string[];
}

let slotIdCounter = 0;
function nextSlotId() { return `plan-${++slotIdCounter}`; }

export function PlanComparisonMode({ cptCode, procedureName, coinsurance, allCptCodes }: Props) {
  const [slots, setSlots] = useState<PlanSlot[]>([
    { id: nextSlotId(), insurance: null, planDetails: null, entries: [], loading: false, error: null },
    { id: nextSlotId(), insurance: null, planDetails: null, entries: [], loading: false, error: null },
  ]);
  const [configuringSlot, setConfiguringSlot] = useState<string | null>(slots[0].id);

  const canAddSlot = slots.length < 3;

  const addSlot = () => {
    if (!canAddSlot) return;
    const newSlot: PlanSlot = { id: nextSlotId(), insurance: null, planDetails: null, entries: [], loading: false, error: null };
    setSlots((prev) => [...prev, newSlot]);
    setConfiguringSlot(newSlot.id);
  };

  const removeSlot = (slotId: string) => {
    if (slots.length <= 2) return;
    setSlots((prev) => prev.filter((s) => s.id !== slotId));
    if (configuringSlot === slotId) setConfiguringSlot(null);
  };

  const updateSlotInsurance = (slotId: string, ins: InsuranceSelection | null) => {
    setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, insurance: ins } : s));
  };

  const updateSlotPlanDetails = (slotId: string, plan: PlanDetails | null) => {
    setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, planDetails: plan } : s));
  };

  // Fetch prices for a specific slot
  const fetchForSlot = useCallback(async (slot: PlanSlot) => {
    if (!slot.insurance) return;
    setSlots((prev) => prev.map((s) => s.id === slot.id ? { ...s, loading: true, error: null } : s));
    try {
      const params = new URLSearchParams({ cptCode, coinsurance: String(coinsurance) });
      if (slot.insurance.payerType) params.set("payerType", slot.insurance.payerType);
      if (slot.insurance.insurer) params.set("payerName", slot.insurance.insurer);
      if (allCptCodes?.length) params.set("allCptCodes", allCptCodes.join(","));
      const res = await fetch(`/api/hospitals/compare?${params}`);
      const data: CompareResponse = await res.json();
      if (!res.ok) throw new Error((data as unknown as { error: string }).error ?? "Failed");
      setSlots((prev) => prev.map((s) => s.id === slot.id ? { ...s, entries: data.entries, loading: false } : s));
    } catch (e) {
      setSlots((prev) => prev.map((s) => s.id === slot.id ? { ...s, error: e instanceof Error ? e.message : "Failed", loading: false } : s));
    }
  }, [cptCode, coinsurance, allCptCodes]);

  // Auto-fetch when insurance changes
  useEffect(() => {
    for (const slot of slots) {
      if (slot.insurance && slot.entries.length === 0 && !slot.loading && !slot.error) {
        void fetchForSlot(slot);
      }
    }
  }, [slots, fetchForSlot]);

  // Compute patient cost for an entry given a slot's plan details
  const getSlotPatientCost = (slot: PlanSlot, entry: HospitalComparisonEntry): number | null => {
    if (slot.planDetails && entry.insuranceRate != null) {
      return calculatePatientCost(entry.insuranceRate, slot.planDetails).patientCost;
    }
    return entry.patientCost;
  };

  // Merge entries across all configured slots by hospital ID
  const configuredSlots = slots.filter((s) => s.insurance && s.entries.length > 0);
  const allHospitalIds = new Set<string>();
  for (const slot of configuredSlots) {
    for (const entry of slot.entries) allHospitalIds.add(entry.hospital.id);
  }

  type MergedRow = {
    hospitalId: string;
    hospitalName: string;
    hospitalAddress: string;
    costs: (number | null)[];  // one per configured slot
    cashPrice: number | null;
    bestSlotIndex: number | null;
  };

  const mergedRows: MergedRow[] = [];
  for (const hId of allHospitalIds) {
    const costs: (number | null)[] = [];
    let cashPrice: number | null = null;
    let hospitalName = "";
    let hospitalAddress = "";

    for (const slot of configuredSlots) {
      const entry = slot.entries.find((e) => e.hospital.id === hId);
      if (entry) {
        hospitalName = entry.hospital.name;
        hospitalAddress = entry.hospital.address;
        costs.push(getSlotPatientCost(slot, entry));
        if (entry.cashPrice != null) cashPrice = entry.cashPrice;
      } else {
        costs.push(null);
      }
    }

    // Determine cheapest plan
    let bestSlotIndex: number | null = null;
    let minCost = Infinity;
    costs.forEach((c, idx) => {
      if (c != null && c < minCost) { minCost = c; bestSlotIndex = idx; }
    });
    // Also check cash
    if (cashPrice != null && cashPrice < minCost) {
      bestSlotIndex = null; // cash is cheapest
    }

    mergedRows.push({ hospitalId: hId, hospitalName, hospitalAddress, costs, cashPrice, bestSlotIndex });
  }

  // Sort by first plan's cost
  mergedRows.sort((a, b) => (a.costs[0] ?? Infinity) - (b.costs[0] ?? Infinity));

  // Calculate average savings summary
  const summaryBySlot: { slotIndex: number; label: string; avgCost: number; count: number }[] = configuredSlots.map((slot, idx) => {
    const validCosts = mergedRows.map((r) => r.costs[idx]).filter((c): c is number => c != null);
    const avg = validCosts.length > 0 ? validCosts.reduce((a, b) => a + b, 0) / validCosts.length : 0;
    return { slotIndex: idx, label: slot.insurance?.displayLabel ?? `Plan ${idx + 1}`, avgCost: avg, count: validCosts.length };
  });
  const cheapestAvgSlot = summaryBySlot.length > 1
    ? summaryBySlot.reduce((a, b) => a.avgCost < b.avgCost ? a : b)
    : null;
  const secondCheapestAvgSlot = summaryBySlot.length > 1
    ? summaryBySlot.filter((s) => s.slotIndex !== cheapestAvgSlot?.slotIndex).reduce((a, b) => a.avgCost < b.avgCost ? a : b, summaryBySlot[0])
    : null;
  const avgSavings = cheapestAvgSlot && secondCheapestAvgSlot
    ? Math.round(secondCheapestAvgSlot.avgCost - cheapestAvgSlot.avgCost)
    : 0;

  const anyLoading = slots.some((s) => s.loading);
  const anyConfigured = configuredSlots.length > 0;

  const SLOT_STYLES = [
    { border: "border-violet-300", bg: "bg-violet-50", text: "text-violet-600", icon: "text-violet-600" },
    { border: "border-blue-300",   bg: "bg-blue-50",   text: "text-blue-600",   icon: "text-blue-600"   },
    { border: "border-emerald-300", bg: "bg-emerald-50", text: "text-emerald-600", icon: "text-emerald-600" },
  ] as const;
  const slotStyle = (idx: number) => SLOT_STYLES[idx % SLOT_STYLES.length];

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-neutral-100 bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="size-4 text-violet-400" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Plan comparison
            </p>
            <h3 className="mt-0.5 text-lg font-bold text-white">{procedureName}</h3>
          </div>
        </div>
      </div>

      {/* Plan slots */}
      <div className="border-b border-neutral-100 px-6 py-4 space-y-3">
        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Select plans to compare</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {slots.map((slot, idx) => {
            const style = slotStyle(idx);
            const isConfiguring = configuringSlot === slot.id;

            return (
              <div
                key={slot.id}
                className={cn(
                  "rounded-xl border p-3 transition-all",
                  slot.insurance
                    ? cn(style.border, style.bg)
                    : isConfiguring
                      ? "border-violet-300 bg-violet-50/50 ring-1 ring-violet-200"
                      : "border-dashed border-neutral-300 bg-neutral-50",
                )}
              >
                {slot.insurance ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className={cn("size-4", style.icon)} />
                        <span className="text-sm font-semibold text-neutral-800">{slot.insurance.displayLabel}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setConfiguringSlot(isConfiguring ? null : slot.id)}
                          className="text-xs text-neutral-400 hover:text-neutral-600"
                        >
                          {isConfiguring ? "Done" : "Edit"}
                        </button>
                        {slots.length > 2 && (
                          <button
                            onClick={() => removeSlot(slot.id)}
                            className="text-neutral-300 hover:text-red-500 transition-colors"
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    {slot.loading && (
                      <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                        <Loader2 className="size-3 animate-spin" /> Loading prices...
                      </div>
                    )}
                    {slot.error && <p className="text-xs text-red-500">{slot.error}</p>}
                    {slot.entries.length > 0 && !slot.loading && (
                      <p className="text-xs text-neutral-400">{slot.entries.length} hospitals loaded</p>
                    )}
                    {slot.planDetails && (
                      <p className="text-[10px] text-violet-600 font-medium">
                        Custom plan: ${slot.planDetails.annualDeductible} ded, {slot.planDetails.coinsurancePercent}% coins
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setConfiguringSlot(isConfiguring ? null : slot.id)}
                    className="flex items-center gap-2 w-full text-left py-2"
                  >
                    <Plus className="size-4 text-neutral-400" />
                    <span className="text-sm font-medium text-neutral-500">
                      Select Plan {String.fromCharCode(65 + idx)}
                    </span>
                  </button>
                )}

                {isConfiguring && (
                  <div className="mt-3 border-t border-neutral-200 pt-3 space-y-3">
                    <InsuranceSelector
                      value={slot.insurance}
                      onChange={(ins) => {
                        updateSlotInsurance(slot.id, ins);
                        if (ins) {
                          // Trigger a refetch
                          setSlots((prev) => prev.map((s) => s.id === slot.id ? { ...s, insurance: ins, entries: [], error: null } : s));
                        }
                      }}
                      onDone={() => setConfiguringSlot(null)}
                    />
                    <CustomPlanInput
                      planDetails={slot.planDetails}
                      onChange={(plan) => updateSlotPlanDetails(slot.id, plan)}
                      defaultCoinsurance={Math.round(coinsurance * 100)}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {canAddSlot && (
            <button
              onClick={addSlot}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 p-4 text-sm font-medium text-neutral-400 hover:border-violet-300 hover:text-violet-600 transition-all"
            >
              <Plus className="size-4" /> Add plan
            </button>
          )}
        </div>
      </div>

      {/* Summary banner */}
      {!anyLoading && cheapestAvgSlot && avgSavings > 100 && configuredSlots.length >= 2 && (
        <div className="border-b border-green-100 bg-green-50 px-6 py-3">
          <p className="text-sm text-green-800">
            <strong>{cheapestAvgSlot.label}</strong> saves you an average of{" "}
            <strong className="text-green-700 text-base">{fmt.format(avgSavings)}</strong>{" "}
            for this procedure across {cheapestAvgSlot.count} hospitals.
          </p>
        </div>
      )}

      {/* Loading state */}
      {anyLoading && (
        <div className="flex items-center justify-center gap-3 py-8 text-sm text-neutral-400">
          <Loader2 className="size-5 animate-spin text-violet-500" />
          Loading hospital prices for your plans...
        </div>
      )}

      {/* Comparison table */}
      {!anyLoading && anyConfigured && mergedRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Hospital
                </th>
                {configuredSlots.map((slot, idx) => (
                  <th key={slot.id} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">
                    <span className={cn(
                      idx === 0 ? "text-violet-600" : idx === 1 ? "text-blue-600" : "text-emerald-600"
                    )}>
                      {slot.insurance?.displayLabel ?? `Plan ${String.fromCharCode(65 + idx)}`}
                    </span>
                    {slot.planDetails && (
                      <span className="block text-[10px] font-normal text-neutral-400">Custom plan</span>
                    )}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Cash
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Best deal
                </th>
              </tr>
            </thead>
            <tbody>
              {mergedRows.map((row) => {
                // Determine overall cheapest (including cash)
                const allPrices = [...row.costs, row.cashPrice].filter((c): c is number => c != null);
                const overallMin = allPrices.length > 0 ? Math.min(...allPrices) : null;
                const isCashCheapest = row.cashPrice != null && row.cashPrice === overallMin && !row.costs.some((c) => c === overallMin);
                const bestPlanIdx = row.costs.findIndex((c) => c === overallMin);

                return (
                  <tr key={row.hospitalId} className="border-b border-neutral-50 hover:bg-neutral-50/80 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-neutral-900 text-sm">{row.hospitalName}</p>
                      <p className="text-xs text-neutral-400 truncate max-w-[200px]">{row.hospitalAddress}</p>
                    </td>
                    {row.costs.map((cost, idx) => {
                      const isCheapest = cost === overallMin && cost != null;
                      return (
                        <td key={idx} className="px-4 py-3 text-right">
                          <span className={cn(
                            "font-mono font-semibold",
                            isCheapest ? "text-green-700 text-base" : "text-neutral-700 text-sm"
                          )}>
                            {fmtNull(cost)}
                          </span>
                          {isCheapest && (
                            <span className="block text-[10px] text-green-600 font-medium mt-0.5">Lowest</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "font-mono font-semibold",
                        isCashCheapest ? "text-green-700 text-base" : "text-neutral-500 text-sm"
                      )}>
                        {fmtNull(row.cashPrice)}
                      </span>
                      {isCashCheapest && (
                        <span className="block text-[10px] text-green-600 font-medium mt-0.5">Lowest</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isCashCheapest ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                          Cash
                        </span>
                      ) : bestPlanIdx >= 0 ? (
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold",
                          bestPlanIdx === 0 ? "bg-violet-100 text-violet-700"
                            : bestPlanIdx === 1 ? "bg-blue-100 text-blue-700"
                            : "bg-emerald-100 text-emerald-700"
                        )}>
                          <Trophy className="size-3" />
                          {configuredSlots[bestPlanIdx]?.insurance?.displayLabel ?? `Plan ${String.fromCharCode(65 + bestPlanIdx)}`}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-300">{"\u2014"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!anyLoading && !anyConfigured && (
        <div className="py-10 text-center">
          <p className="text-sm font-semibold text-neutral-600">Select at least two insurance plans above to compare</p>
          <p className="mt-1 text-xs text-neutral-400">
            Click a plan slot and pick your insurer to see side-by-side cost comparisons
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-neutral-100 bg-neutral-50 px-6 py-3">
        <p className="text-xs text-neutral-400">
          Costs shown are estimates based on each plan&apos;s negotiated rates.
          Actual costs may vary based on your specific plan details and care received.
        </p>
      </div>
    </div>
  );
}
