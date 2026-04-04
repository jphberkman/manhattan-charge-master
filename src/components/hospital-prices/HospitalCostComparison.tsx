"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown, Building2, Trophy, ShieldCheck, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlossaryTip } from "./GlossaryTip";
import type { HospitalComparisonEntry, CompareResponse } from "@/app/api/hospitals/compare/route";
import type { MedicareBenchmark } from "@/lib/medicare";
import type { InsuranceSelection } from "./InsuranceSelector";
import { calculatePatientCost, type PlanDetails, type CostBreakdown } from "@/lib/cost-calculator";

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtNull = (v: number | null) => (v == null ? "—" : fmt.format(v));

type SortKey = "rank" | "patientCost" | "cash" | "insurance" | "savings";

interface Props {
  cptCode: string;
  procedureName: string;
  insurance: InsuranceSelection | null;
  coinsurance: number;
  allCptCodes?: string[];
  planDetails?: PlanDetails | null;
  onPricesLoaded?: (entries: HospitalComparisonEntry[]) => void;
}

export function HospitalCostComparison({ cptCode, procedureName, insurance, coinsurance, allCptCodes, planDetails, onPricesLoaded }: Props) {
  const [entries, setEntries] = useState<HospitalComparisonEntry[]>([]);
  const [medicare, setMedicare] = useState<MedicareBenchmark | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ cptCode, coinsurance: String(coinsurance) });
      if (insurance?.payerType) params.set("payerType", insurance.payerType);
      if (insurance?.insurer) params.set("payerName", insurance.insurer);
      if (allCptCodes?.length) params.set("allCptCodes", allCptCodes.join(","));
      const res = await fetch(`/api/hospitals/compare?${params}`);
      const data: CompareResponse = await res.json();
      if (!res.ok) throw new Error((data as unknown as { error: string }).error ?? "Failed");
      setEntries(data.entries);
      setMedicare(data.medicare ?? null);
      onPricesLoaded?.(data.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load hospital prices");
    } finally {
      setLoading(false);
    }
  }, [cptCode, coinsurance, insurance, allCptCodes, onPricesLoaded]);

  useEffect(() => { load(); }, [load]);

  // When planDetails is provided, recalculate patient costs client-side
  const getPatientCost = (entry: HospitalComparisonEntry): number | null => {
    if (planDetails && entry.insuranceRate != null) {
      const result = calculatePatientCost(entry.insuranceRate, planDetails);
      return result.patientCost;
    }
    return entry.patientCost;
  };

  const getCostBreakdown = (entry: HospitalComparisonEntry): CostBreakdown | null => {
    if (planDetails && entry.insuranceRate != null) {
      return calculatePatientCost(entry.insuranceRate, planDetails);
    }
    return null;
  };

  const showIns = insurance != null && insurance.payerType !== "cash";

  // Per-entry savings % with insurance vs cash (positive = insurance is cheaper)
  // Capped to avoid nonsensical values (e.g. >100% or extreme negatives)
  const savingsPct = (e: HospitalComparisonEntry): number | null => {
    const cost = getPatientCost(e);
    if (cost != null && e.cashPrice != null && e.cashPrice > 0) {
      const raw = Math.round(((e.cashPrice - cost) / e.cashPrice) * 100);
      return Math.max(-99, Math.min(99, raw));
    }
    return null;
  };

  const sortVal = (e: HospitalComparisonEntry) => {
    if (sortKey === "rank") return e.rank;
    if (sortKey === "patientCost") return getPatientCost(e) ?? Infinity;
    if (sortKey === "cash") return e.cashPrice ?? Infinity;
    if (sortKey === "insurance") return e.insuranceRate ?? Infinity;
    if (sortKey === "savings") { const pct = savingsPct(e); return pct != null ? -pct : Infinity; }
    return e.rank;
  };

  const sorted = [...entries].sort((a, b) => {
    const d = sortVal(a) - sortVal(b);
    return sortDir === "asc" ? d : -d;
  });

  const withIns  = entries.filter((e) => getPatientCost(e) != null && (getPatientCost(e) ?? 0) > 0).sort((a, b) => (getPatientCost(a) ?? 0) - (getPatientCost(b) ?? 0));
  const withCash = entries.filter((e) => e.cashPrice != null && e.cashPrice > 0).sort((a, b) => (a.cashPrice ?? 0) - (b.cashPrice ?? 0));

  const cheapestIns   = withIns[0] ?? null;
  const costliestIns  = withIns.at(-1) ?? null;
  const cheapestCash  = withCash[0] ?? null;
  const costliestCash = withCash.at(-1) ?? null;

  const insSavings  = cheapestIns && costliestIns  ? (getPatientCost(costliestIns) ?? 0) - (getPatientCost(cheapestIns) ?? 0) : 0;
  const cashSavings = cheapestCash && costliestCash ? (costliestCash.cashPrice   ?? 0) - (cheapestCash.cashPrice   ?? 0) : 0;

  const maxPatient = Math.max(...entries.map((e) => getPatientCost(e) ?? 0), 1);
  const maxCash    = Math.max(...entries.map((e) => e.cashPrice ?? 0), 1);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const insuranceLabel = insurance?.displayLabel ?? "Insurance";

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">

      {/* ── Header ── */}
      <div className="border-b border-neutral-100 bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Hospital price comparison
            </p>
            <h3 className="mt-0.5 text-lg font-bold text-white">{procedureName}</h3>
            <p className="mt-0.5 text-sm text-slate-400">
              Ranked cheapest to most expensive — with your insurance and without
            </p>
          </div>
          {showIns && !loading && entries.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 shrink-0">
              <ShieldCheck className="size-4 text-violet-300" />
              <span className="text-xs font-semibold text-white">{insuranceLabel}</span>
              <span className="text-xs text-slate-400">· {Math.round(coinsurance * 100)}% coinsurance</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Medicare benchmark banner ── */}
      {!loading && medicare && (
        <div className="border-b border-blue-100 bg-blue-50 px-6 py-3">
          <div className="flex flex-wrap items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0 text-blue-500" />
            <div className="text-xs text-blue-800">
              <span className="font-semibold">Medicare benchmark ({medicare.episodeType}):</span>{" "}
              Medicare pays ~{fmt.format(medicare.episodeRate ?? medicare.physicianFee)} for this procedure.
              Commercial insurance typically pays{" "}
              <span className="font-semibold">
                {fmt.format(Math.round((medicare.episodeRate ?? medicare.physicianFee) * medicare.commercialMultiplierLow))}–
                {fmt.format(Math.round((medicare.episodeRate ?? medicare.physicianFee) * medicare.commercialMultiplierHigh))}
              </span>{" "}
              ({medicare.commercialMultiplierLow}–{medicare.commercialMultiplierHigh}× Medicare).{" "}
              <span className="text-blue-600">{medicare.notes}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center gap-3 py-10 text-sm text-neutral-400">
          <Loader2 className="size-5 animate-spin text-violet-500" />
          Looking up prices at each hospital…
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <p className="px-6 py-4 text-sm text-red-600">{error}</p>
      )}

      {/* ── Results ── */}
      {!loading && !error && entries.length > 0 && (
        <>
          {/* ── Savings banner ── */}
          {showIns && insSavings > 500 && (
            <div className="border-b border-green-100 bg-green-50 px-6 py-3">
              <div className="flex items-center gap-3">
                <TrendingDown className="size-5 text-green-600 shrink-0" />
                <p className="text-sm text-green-800">
                  Choosing <strong>{cheapestIns?.hospital.name}</strong> over <strong>{costliestIns?.hospital.name}</strong> saves you{" "}
                  <strong className="text-green-700 text-base">{fmt.format(insSavings)}</strong> out of pocket with your insurance.
                  {planDetails && " (calculated with your plan details)"}
                </p>
              </div>
            </div>
          )}
          {!showIns && cashSavings > 500 && (
            <div className="border-b border-green-100 bg-green-50 px-6 py-3">
              <div className="flex items-center gap-3">
                <TrendingDown className="size-5 text-green-600 shrink-0" />
                <p className="text-sm text-green-800">
                  Choosing <strong>{cheapestCash?.hospital.name}</strong> over <strong>{costliestCash?.hospital.name}</strong> saves you{" "}
                  <strong className="text-green-700 text-base">{fmt.format(cashSavings)}</strong> paying cash.
                </p>
              </div>
            </div>
          )}

          {/* ── Top 3 winner cards ── */}
          {sorted.length >= 2 && (
            <div className="grid gap-3 border-b border-neutral-100 px-6 py-4 sm:grid-cols-3">
              {sorted.slice(0, 3).map((entry, i) => {
                const isWinner = i === 0;
                const isBestIns  = showIns && cheapestIns?.hospital.id === entry.hospital.id;
                const isBestCash = cheapestCash?.hospital.id === entry.hospital.id;
                const pct = savingsPct(entry);
                const entryPatientCost = getPatientCost(entry);
                const entryBreakdown = getCostBreakdown(entry);
                const savingsVsWorstIns = (getPatientCost(costliestIns!) ?? 0) - (entryPatientCost ?? 0);
                const savingsVsWorstCash = (costliestCash?.cashPrice ?? 0) - (entry.cashPrice ?? 0);

                return (
                  <div
                    key={entry.hospital.id}
                    className={cn(
                      "relative rounded-xl border p-4 transition-all",
                      isWinner ? "border-green-300 bg-green-50 ring-1 ring-green-300" : "border-neutral-200 bg-neutral-50"
                    )}
                  >
                    {isWinner && (
                      <div className="absolute -top-2.5 left-4 flex items-center gap-1 rounded-full bg-green-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
                        <Trophy className="size-3" /> Best price
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-2 mt-1">
                      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white border border-neutral-200 text-xs font-bold text-neutral-500">
                        {i + 1}
                      </div>
                      </div>
                    <p className="mt-2 text-xs font-semibold text-neutral-600 leading-tight line-clamp-2">
                      {entry.hospital.name}
                    </p>

                    {showIns && entryPatientCost != null ? (
                      <>
                        <p className={cn("mt-1 font-bold", isWinner ? "text-2xl text-green-700" : "text-xl text-neutral-800")}>
                          {fmt.format(entryPatientCost)}
                        </p>
                        <p className="text-xs text-neutral-400">your estimated cost after insurance pays</p>
                        {entryBreakdown && (
                          <p className="mt-0.5 text-[10px] text-violet-600">
                            {entryBreakdown.oopCapApplied
                              ? "Capped at OOP max"
                              : `Deductible: ${fmt.format(entryBreakdown.deductiblePortion)} + Coinsurance: ${fmt.format(entryBreakdown.coinsurancePortion)}`}
                          </p>
                        )}
                        {entry.cashPrice != null && (
                          <p className="mt-1 text-xs text-neutral-500">Without insurance: {fmt.format(entry.cashPrice)}</p>
                        )}
                        {pct != null && pct > 0 && (
                          <p className="mt-1 text-xs font-bold text-green-600">
                            Insurance saves you {pct}% vs cash
                          </p>
                        )}
                        {pct != null && pct < 0 && (
                          <p className="mt-1 text-xs font-semibold text-amber-600">
                            Cash is {Math.abs(pct)}% cheaper here
                          </p>
                        )}
                        {isWinner && savingsVsWorstIns > 100 && (
                          <p className="mt-1 text-xs text-green-600 font-semibold">
                            Save {fmt.format(savingsVsWorstIns)} vs. most expensive
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className={cn("mt-1 font-bold", isWinner ? "text-2xl text-green-700" : "text-xl text-neutral-800")}>
                          {fmtNull(entry.cashPrice)}
                        </p>
                        <p className="text-xs text-neutral-400">paying without insurance</p>
                        {isBestCash && savingsVsWorstCash > 100 && (
                          <p className="mt-1 text-xs font-semibold text-green-600">
                            Save {fmt.format(savingsVsWorstCash)} vs most expensive
                          </p>
                        )}
                      </>
                    )}
                    {showIns && !isWinner && isBestCash && (
                      <div className="mt-1.5"><Badge color="blue">Cheapest cash</Badge></div>
                    )}
                    {showIns && isBestIns && !isWinner && (
                      <div className="mt-1.5"><Badge color="green">Cheapest with insurance</Badge></div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Full comparison table ── */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50">
                  <Th onClick={() => toggleSort("rank")} className="w-10 text-center pl-6">
                    # <SortIcon col="rank" s={sortKey} d={sortDir} />
                  </Th>
                  <Th>Hospital</Th>
                  <Th onClick={() => toggleSort("cash")} className="text-right">
                    <span className="inline-flex items-center justify-end gap-1">
                      No insurance <GlossaryTip glossaryKey="cashPrice" side="top" /> <SortIcon col="cash" s={sortKey} d={sortDir} />
                    </span>
                  </Th>
                  {showIns && (
                    <Th onClick={() => toggleSort("insurance")} className="text-right">
                      <span className="inline-flex items-center justify-end gap-1">
                        Negotiated rate <GlossaryTip glossaryKey="negotiated" side="top" /> <SortIcon col="insurance" s={sortKey} d={sortDir} />
                      </span>
                    </Th>
                  )}
                  {showIns && (
                    <Th onClick={() => toggleSort("patientCost")} className="text-right text-violet-600">
                      <span className="inline-flex items-center justify-end gap-1">
                        Your cost <GlossaryTip glossaryKey="yourCost" side="top" /> <SortIcon col="patientCost" s={sortKey} d={sortDir} />
                      </span>
                    </Th>
                  )}
                  {showIns && (
                    <Th onClick={() => toggleSort("savings")} className="text-center text-green-700">
                      Insurance saves you <SortIcon col="savings" s={sortKey} d={sortDir} />
                    </Th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sorted.map((entry, i) => {
                  const isBestIns  = showIns && cheapestIns?.hospital.id === entry.hospital.id;
                  const isBestCash = cheapestCash?.hospital.id === entry.hospital.id;
                  const isHighlight = showIns ? isBestIns : isBestCash;
                  const pct = savingsPct(entry);
                  const rowPatientCost = getPatientCost(entry);
                  const rowBreakdown = getCostBreakdown(entry);

                  const patientBarPct = rowPatientCost != null ? Math.round((rowPatientCost / maxPatient) * 100) : 0;
                  const cashBarPct    = entry.cashPrice   != null ? Math.round((entry.cashPrice   / maxCash)    * 100) : 0;

                  return (
                    <tr
                      key={entry.hospital.id + i}
                      className={cn(
                        "border-b border-neutral-100 last:border-b-0 transition-colors hover:bg-neutral-50/80",
                        isHighlight && "bg-green-50/50 hover:bg-green-50"
                      )}
                    >
                      {/* Rank */}
                      <td className="py-3 pl-6 text-center">
                        <span className={cn(
                          "inline-flex size-7 items-center justify-center rounded-full text-xs font-bold",
                          isHighlight ? "bg-green-500 text-white" : "bg-neutral-100 text-neutral-500"
                        )}>
                          {entry.rank}
                        </span>
                      </td>

                      {/* Hospital name */}
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <Building2 className="mt-0.5 size-4 shrink-0 text-neutral-300" />
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold text-neutral-900">{entry.hospital.name}</span>
                              {isBestIns && showIns && <Badge color="green">Cheapest with insurance</Badge>}
                              {isBestCash && !showIns && <Badge color="green">Cheapest cash</Badge>}
                              {isBestCash && showIns && !isBestIns && <Badge color="blue">Cheapest cash</Badge>}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2">
                              <p className="max-w-[200px] truncate text-xs text-neutral-400">{entry.hospital.address}</p>
                              {entry.dataSource === "chargemaster" && entry.dataQuality === "real" ? (
                                <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5">
                                  <ShieldCheck className="size-2.5" /> Hospital published
                                </span>
                              ) : entry.dataSource === "chargemaster" && entry.insuranceRate != null ? (
                                <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5">
                                  <ShieldCheck className="size-2.5" /> Hospital published · no cash price listed
                                </span>
                              ) : entry.dataSource === "chargemaster" ? (
                                <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">
                                  Hospital published · no insurer rate for this procedure
                                </span>
                              ) : entry.dataSource === "cms-avg" ? (
                                <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">
                                  <Info className="size-2.5" /> CMS average · not from hospital file
                                </span>
                              ) : (
                                <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium text-neutral-400 bg-neutral-100 rounded px-1.5 py-0.5">
                                  No chargemaster data found
                                </span>
                              )}
                              {entry.dataLastUpdated && (
                                <p className="shrink-0 text-[10px] text-neutral-300">
                                  {new Date(entry.dataLastUpdated).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Cash price */}
                      <td className="px-4 py-3 text-right">
                        <div>
                          <span className={cn(
                            "font-mono font-semibold",
                            isBestCash && !showIns ? "text-green-700 text-base" : "text-neutral-700 text-sm"
                          )}>
                            {fmtNull(entry.cashPrice)}
                          </span>
                          {entry.cashPrice != null && (
                            <div className="mt-1.5 h-1.5 w-20 ml-auto rounded-full bg-neutral-100">
                              <div
                                className={cn("h-1.5 rounded-full transition-all", isBestCash && !showIns ? "bg-green-400" : "bg-neutral-300")}
                                style={{ width: `${cashBarPct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Negotiated rate */}
                      {showIns && (
                        <td className="px-4 py-3 text-right">
                          <span className="font-mono text-sm text-neutral-600">{fmtNull(entry.insuranceRate)}</span>
                        </td>
                      )}

                      {/* Your cost */}
                      {showIns && (
                        <td className="px-4 py-3 text-right">
                          <div>
                            <span className={cn(
                              "font-mono font-bold",
                              isBestIns ? "text-green-700 text-base" : "text-violet-700 text-sm"
                            )}>
                              {fmtNull(rowPatientCost)}
                            </span>
                            {rowBreakdown && (
                              <p className="mt-0.5 text-[10px] text-violet-500 text-right">
                                {rowBreakdown.oopCapApplied
                                  ? "Capped at OOP max"
                                  : `Ded: ${fmt.format(rowBreakdown.deductiblePortion)} + Coins: ${fmt.format(rowBreakdown.coinsurancePortion)}`}
                              </p>
                            )}
                            {rowPatientCost != null && (
                              <div className="mt-1.5 h-1.5 w-20 ml-auto rounded-full bg-neutral-100">
                                <div
                                  className={cn("h-1.5 rounded-full transition-all", isBestIns ? "bg-green-500" : "bg-violet-400")}
                                  style={{ width: `${patientBarPct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Insurance saves % */}
                      {showIns && (
                        <td className="px-4 py-3 text-center">
                          {pct != null ? (
                            pct > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">
                                <TrendingDown className="size-3" />
                                Save {pct}%
                              </span>
                            ) : pct < 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                Cash {Math.abs(pct)}% cheaper
                              </span>
                            ) : (
                              <span className="text-xs text-neutral-400">Same price</span>
                            )
                          ) : (
                            <span className="text-xs text-neutral-300">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="border-t border-neutral-100 bg-neutral-50 px-6 py-3 space-y-1.5">
            <p className="text-xs text-neutral-400">
              &quot;Your cost&quot; = what you owe after your insurance pays its share ·
              &quot;Insurance saves&quot; = how much less you pay vs paying the full cash price yourself
              {planDetails && (
                <span className="block mt-1 text-violet-500 font-medium">
                  Costs calculated using your plan details (deductible, coinsurance, OOP max)
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-neutral-400">
              <span>
                <ShieldCheck className="inline size-2.5 text-emerald-500 mr-0.5" />
                <strong>Hospital published</strong> = directly from the hospital&apos;s price transparency file
              </span>
              <span>
                <Info className="inline size-2.5 text-blue-400 mr-0.5" />
                <strong>CMS average</strong> = Medicare claims average, not from the hospital&apos;s own file
              </span>
              <span>
                <span className="inline-block size-2.5 rounded-full bg-neutral-300 mr-0.5 align-middle" />
                <strong>No data</strong> = hospital did not publish pricing for this procedure
              </span>
            </div>
          </div>
        </>
      )}

      {!loading && !error && entries.length === 0 && (
        <div className="py-10 text-center">
          <p className="text-sm font-semibold text-neutral-600">No chargemaster data found for this CPT code</p>
          <p className="mt-1 text-xs text-neutral-400 max-w-md mx-auto">
            None of the uploaded hospital price transparency files contain pricing for this specific procedure.
            The AI cost breakdown above is based on clinical guidelines and market rates.
          </p>
        </div>
      )}
    </div>
  );
}

// ── small helpers ─────────────────────────────────────────────────────────────
function Badge({ color, children }: { color: "green" | "blue" | "amber"; children: React.ReactNode }) {
  return (
    <span className={cn(
      "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold",
      color === "green" && "bg-green-100 text-green-700",
      color === "blue"  && "bg-violet-100 text-violet-700",
      color === "amber" && "bg-amber-100 text-amber-700",
    )}>
      {children}
    </span>
  );
}

function Th({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <th onClick={onClick} className={cn(
      "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500",
      onClick && "cursor-pointer select-none hover:text-neutral-800",
      className
    )}>
      {children}
    </th>
  );
}

function SortIcon({ col, s, d }: { col: SortKey; s: SortKey; d: "asc" | "desc" }) {
  if (s !== col) return <ArrowUpDown className="ml-1 inline size-3 opacity-30" />;
  return d === "asc" ? <ArrowUp className="ml-1 inline size-3" /> : <ArrowDown className="ml-1 inline size-3" />;
}
