"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown, Sparkles, Building2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HospitalComparisonEntry } from "@/app/api/hospitals/compare/route";
import type { InsuranceSelection } from "./InsuranceSelector";

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtNull = (v: number | null) => (v == null ? "—" : fmt.format(v));

type SortKey = "rank" | "patientCost" | "cash" | "insurance";
type View = "insurance" | "cash";

interface Props {
  cptCode: string;
  procedureName: string;
  insurance: InsuranceSelection | null;
  coinsurance: number;
}

export function HospitalCostComparison({ cptCode, procedureName, insurance, coinsurance }: Props) {
  const [entries, setEntries] = useState<HospitalComparisonEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("insurance");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ cptCode, coinsurance: String(coinsurance) });
      if (insurance?.payerType) params.set("payerType", insurance.payerType);
      if (insurance?.insurer) params.set("payerName", insurance.insurer);
      const res = await fetch(`/api/hospitals/compare?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setEntries(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load hospital prices");
    } finally {
      setLoading(false);
    }
  }, [cptCode, coinsurance, insurance]);

  useEffect(() => { load(); }, [load]);

  const showIns = !insurance || insurance.payerType !== "cash";

  // Active sort value per row
  const sortVal = (e: HospitalComparisonEntry) => {
    if (sortKey === "rank") return e.rank;
    if (sortKey === "patientCost") return e.patientCost ?? Infinity;
    if (sortKey === "cash") return e.cashPrice ?? Infinity;
    if (sortKey === "insurance") return e.insuranceRate ?? Infinity;
    return e.rank;
  };
  const sorted = [...entries].sort((a, b) => {
    const d = sortVal(a) - sortVal(b);
    return sortDir === "asc" ? d : -d;
  });

  // Summary helpers
  const withIns  = entries.filter((e) => e.patientCost != null).sort((a, b) => (a.patientCost ?? 0) - (b.patientCost ?? 0));
  const withCash = entries.filter((e) => e.cashPrice != null).sort((a, b) => (a.cashPrice ?? 0) - (b.cashPrice ?? 0));

  const cheapestIns   = withIns[0] ?? null;
  const costliestIns  = withIns.at(-1) ?? null;
  const cheapestCash  = withCash[0] ?? null;
  const costliestCash = withCash.at(-1) ?? null;

  const insSavings  = cheapestIns && costliestIns  ? (costliestIns.patientCost  ?? 0) - (cheapestIns.patientCost  ?? 0) : 0;
  const cashSavings = cheapestCash && costliestCash ? (costliestCash.cashPrice   ?? 0) - (cheapestCash.cashPrice   ?? 0) : 0;

  // Max values for proportional bars
  const maxPatient = Math.max(...entries.map((e) => e.patientCost ?? 0), 1);
  const maxCash    = Math.max(...entries.map((e) => e.cashPrice ?? 0), 1);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">

      {/* ── Header ── */}
      <div className="border-b border-neutral-100 bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Compare hospitals
            </p>
            <h3 className="mt-0.5 text-lg font-bold text-white">{procedureName}</h3>
            <p className="mt-0.5 text-sm text-slate-400">
              Ranked from lowest to highest cost — pick the best hospital for you
            </p>
          </div>
          {showIns && !loading && entries.length > 0 && (
            <div className="flex rounded-xl border border-white/20 bg-white/10 p-1 gap-1 shrink-0">
              {(["insurance", "cash"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-lg px-4 py-1.5 text-xs font-semibold transition-all",
                    view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-300 hover:text-white"
                  )}
                >
                  {v === "insurance" ? "With my insurance" : "Paying myself (cash)"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center gap-3 py-10 text-sm text-neutral-400">
          <Loader2 className="size-5 animate-spin text-blue-500" />
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
          {((view === "insurance" && insSavings > 500) || (view === "cash" && cashSavings > 500)) && (
            <div className="border-b border-green-100 bg-green-50 px-6 py-3">
              <div className="flex items-center gap-3">
                <TrendingDown className="size-5 text-green-600 shrink-0" />
                <p className="text-sm text-green-800">
                  {view === "insurance" ? (
                    <>
                      Choosing <strong>{cheapestIns?.hospital.name}</strong> over <strong>{costliestIns?.hospital.name}</strong> saves you{" "}
                      <strong className="text-green-700 text-base">{fmt.format(insSavings)}</strong> out of pocket.
                    </>
                  ) : (
                    <>
                      Choosing <strong>{cheapestCash?.hospital.name}</strong> over <strong>{costliestCash?.hospital.name}</strong> saves you{" "}
                      <strong className="text-green-700 text-base">{fmt.format(cashSavings)}</strong> paying cash.
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* ── Top 3 winner cards ── */}
          {sorted.length >= 2 && (
            <div className="grid gap-3 border-b border-neutral-100 px-6 py-4 sm:grid-cols-3">
              {sorted.slice(0, 3).map((entry, i) => {
                const primaryAmt = view === "insurance" ? entry.patientCost : entry.cashPrice;
                const isWinner = i === 0;
                const savingsVsWorst = view === "insurance"
                  ? (costliestIns?.patientCost ?? 0) - (entry.patientCost ?? 0)
                  : (costliestCash?.cashPrice ?? 0) - (entry.cashPrice ?? 0);

                return (
                  <div
                    key={entry.hospital.id}
                    className={cn(
                      "relative rounded-xl border p-4 transition-all",
                      isWinner
                        ? "border-green-300 bg-green-50 ring-1 ring-green-300"
                        : "border-neutral-200 bg-neutral-50"
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
                      {entry.isAiEstimate && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          <Sparkles className="size-2.5" /> Est.
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs font-semibold text-neutral-600 leading-tight line-clamp-2">
                      {entry.hospital.name}
                    </p>
                    <p className={cn(
                      "mt-1 font-bold",
                      isWinner ? "text-2xl text-green-700" : "text-xl text-neutral-800"
                    )}>
                      {fmtNull(primaryAmt)}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {view === "insurance" ? `you pay (${Math.round(coinsurance * 100)}% of the bill)` : "no insurance"}
                    </p>
                    {savingsVsWorst > 100 && !isWinner && (
                      <p className="mt-1 text-xs text-green-600 font-medium">
                        Save {fmt.format(savingsVsWorst)} vs. most expensive
                      </p>
                    )}
                    {isWinner && savingsVsWorst > 100 && (
                      <p className="mt-1 text-xs text-green-600 font-semibold">
                        Save {fmt.format(savingsVsWorst)} vs. most expensive
                      </p>
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
                  {showIns && (
                    <Th onClick={() => toggleSort("insurance")} className="text-right">
                      {insurance ? insurance.displayLabel : "Insurance"} pays hospital <SortIcon col="insurance" s={sortKey} d={sortDir} />
                    </Th>
                  )}
                  {showIns && (
                    <Th onClick={() => toggleSort("patientCost")} className="text-right text-blue-600 font-bold">
                      You pay ({Math.round(coinsurance * 100)}%) <SortIcon col="patientCost" s={sortKey} d={sortDir} />
                    </Th>
                  )}
                  {showIns && <Th className="text-right">Insurance picks up</Th>}
                  <Th onClick={() => toggleSort("cash")} className="text-right">
                    No insurance (cash) <SortIcon col="cash" s={sortKey} d={sortDir} />
                  </Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((entry, i) => {
                  const isBestIns  = showIns && cheapestIns?.hospital.id === entry.hospital.id;
                  const isBestCash = cheapestCash?.hospital.id === entry.hospital.id;
                  const isHighlight = (view === "insurance" && isBestIns) || (view === "cash" && isBestCash);

                  const patientBarPct = entry.patientCost != null ? Math.round((entry.patientCost / maxPatient) * 100) : 0;
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
                              {isBestCash && !showIns && <Badge color="green">Cheapest cash price</Badge>}
                              {isBestCash && showIns && !isBestIns && <Badge color="blue">Cheapest cash</Badge>}
                              {entry.isAiEstimate && <Badge color="amber"><Sparkles className="size-2.5 mr-0.5" />Estimated</Badge>}
                            </div>
                            <p className="mt-0.5 max-w-[220px] truncate text-xs text-neutral-400">{entry.hospital.address}</p>
                          </div>
                        </div>
                      </td>

                      {/* Insurance rate */}
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
                              isBestIns ? "text-green-700 text-base" : "text-neutral-900 text-sm"
                            )}>
                              {fmtNull(entry.patientCost)}
                            </span>
                            {entry.patientCost != null && (
                              <div className="mt-1.5 h-1.5 w-24 ml-auto rounded-full bg-neutral-100">
                                <div
                                  className={cn("h-1.5 rounded-full transition-all", isBestIns ? "bg-green-500" : "bg-blue-400")}
                                  style={{ width: `${patientBarPct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Insurance covers */}
                      {showIns && (
                        <td className="px-4 py-3 text-right">
                          <span className="font-mono text-sm text-neutral-500">{fmtNull(entry.insurerPays)}</span>
                        </td>
                      )}

                      {/* Cash price */}
                      <td className="px-4 py-3 text-right">
                        <div>
                          <span className={cn(
                            "font-mono font-semibold",
                            isBestCash ? "text-green-700 text-base" : "text-neutral-700 text-sm"
                          )}>
                            {fmtNull(entry.cashPrice)}
                          </span>
                          {entry.cashPrice != null && (
                            <div className="mt-1.5 h-1.5 w-24 ml-auto rounded-full bg-neutral-100">
                              <div
                                className={cn("h-1.5 rounded-full transition-all", isBestCash ? "bg-green-500" : "bg-neutral-300")}
                                style={{ width: `${cashBarPct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="border-t border-neutral-100 bg-neutral-50 px-6 py-3 text-xs text-neutral-400">
            {entries.filter((e) => !e.isAiEstimate).length} hospitals with real price data ·{" "}
            {entries.filter((e) => e.isAiEstimate).length} estimated ·
            &quot;You pay&quot; = the price your insurance negotiated × your {Math.round(coinsurance * 100)}% share, once your deductible is met
          </div>
        </>
      )}

      {!loading && !error && entries.length === 0 && (
        <p className="py-10 text-center text-sm text-neutral-400">
          No hospital prices found for this procedure. Try the cash price view or search a different procedure.
        </p>
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
      color === "blue"  && "bg-blue-100 text-blue-700",
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
