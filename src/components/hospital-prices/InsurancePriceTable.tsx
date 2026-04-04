"use client";

import { useState, useMemo } from "react";
import { TrendingDown, TrendingUp, Minus, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronUp, ShieldCheck, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PriceApiEntry } from "@/lib/price-transparency/types";

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(0)}%`;

const SOURCE_BADGE: Record<string, { label: string; icon: typeof ShieldCheck; className: string }> = {
  mrf:     { label: "Hospital published",  icon: ShieldCheck, className: "text-emerald-600 bg-emerald-50" },
  cms:     { label: "CMS data",            icon: Info,        className: "text-blue-600 bg-blue-50" },
  upload:  { label: "Uploaded",            icon: Info,        className: "text-violet-600 bg-violet-50" },
  dolthub: { label: "DoltHub open data",   icon: Info,        className: "text-amber-600 bg-amber-50" },
};

const COINSURANCE_OPTIONS = [
  { label: "Insurance pays almost everything", sublabel: "I pay ~10%", value: 0.10 },
  { label: "Insurance pays most of it",        sublabel: "I pay ~20%", value: 0.20 },
  { label: "We split it",                      sublabel: "I pay ~30%", value: 0.30 },
  { label: "I pay a bigger share",             sublabel: "I pay ~40%", value: 0.40 },
  { label: "I have no insurance / pay myself", sublabel: "I pay 100%", value: 1.0  },
];

export interface HospitalPriceRow {
  hospital: { id: string; name: string; address: string };
  negotiated: number | null;
  negotiatedPayerName: string | null;
  cash: number | null;
  diff: number | null;      // cash - negotiated (negative = cash is cheaper)
  diffPct: number | null;
  source: string | null;
  dataLastUpdated: string | null;
}

function buildRows(
  insurancePrices: PriceApiEntry[],
  cashPrices: PriceApiEntry[]
): HospitalPriceRow[] {
  // Group by hospital id — take the lowest price per hospital per type
  const insMap = new Map<string, PriceApiEntry>();
  for (const e of insurancePrices) {
    const existing = insMap.get(e.hospital.id);
    if (!existing || e.priceUsd < existing.priceUsd) insMap.set(e.hospital.id, e);
  }
  const cashMap = new Map<string, PriceApiEntry>();
  for (const e of cashPrices) {
    const existing = cashMap.get(e.hospital.id);
    if (!existing || e.priceUsd < existing.priceUsd) cashMap.set(e.hospital.id, e);
  }

  // Union of all hospital ids
  const allIds = new Set([...insMap.keys(), ...cashMap.keys()]);
  const rows: HospitalPriceRow[] = [];

  for (const id of allIds) {
    const ins = insMap.get(id);
    const cash = cashMap.get(id);
    const hospital = (ins ?? cash)!.hospital;
    const negotiated = ins?.priceUsd ?? null;
    const cashPrice = cash?.priceUsd ?? null;
    let diff: number | null = null;
    let diffPct: number | null = null;
    if (negotiated !== null && cashPrice !== null) {
      diff = cashPrice - negotiated;
      diffPct = (diff / negotiated) * 100;
    }
    // Prefer source info from insurance entry, fall back to cash entry
    const primary = ins ?? cash;
    rows.push({
      hospital,
      negotiated,
      negotiatedPayerName: ins?.payerName ?? null,
      cash: cashPrice,
      diff,
      diffPct,
      source: primary?.source ?? null,
      dataLastUpdated: primary?.dataLastUpdated ?? null,
    });
  }

  return rows;
}

type SortKey = "hospital" | "negotiated" | "cash" | "diff" | "patientCost";

interface Props {
  insurancePrices: PriceApiEntry[];
  cashPrices: PriceApiEntry[];
  insuranceLabel: string;
  loading: boolean;
}

export function InsurancePriceTable({ insurancePrices, cashPrices, insuranceLabel, loading }: Props) {
  const [coinsurance, setCoinsurance] = useState(0.20);
  const [sortKey, setSortKey] = useState<SortKey>("patientCost");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showExplainer, setShowExplainer] = useState(false);

  const rows = useMemo(() => buildRows(insurancePrices, cashPrices), [insurancePrices, cashPrices]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let cmp = 0;
      const nullLast = (v: number | null) => (v === null ? Infinity : v);
      if (sortKey === "hospital") cmp = a.hospital.name.localeCompare(b.hospital.name);
      else if (sortKey === "negotiated") cmp = nullLast(a.negotiated) - nullLast(b.negotiated);
      else if (sortKey === "cash") cmp = nullLast(a.cash) - nullLast(b.cash);
      else if (sortKey === "diff") cmp = nullLast(a.diff) - nullLast(b.diff);
      else if (sortKey === "patientCost")
        cmp = nullLast(a.negotiated !== null ? a.negotiated * coinsurance : (a.cash ?? null))
            - nullLast(b.negotiated !== null ? b.negotiated * coinsurance : (b.cash ?? null));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir, coinsurance]);

  // Savings summary data
  const savingsSummary = useMemo(() => {
    const patientCosts = sorted
      .map((r) => r.negotiated !== null ? r.negotiated * coinsurance : r.cash)
      .filter((v): v is number => v !== null);
    if (patientCosts.length < 2) return null;
    const min = Math.min(...patientCosts);
    const max = Math.max(...patientCosts);
    return { min, max, savings: max - min };
  }, [sorted, coinsurance]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 inline size-3 opacity-30" />;
    return sortDir === "asc"
      ? <ArrowUp className="ml-1 inline size-3" />
      : <ArrowDown className="ml-1 inline size-3" />;
  };

  if (loading) {
    return (
      <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            {[200, 100, 100, 100, 120].map((w, j) => (
              <div key={j} className="h-5 animate-pulse rounded bg-neutral-100" style={{ width: w }} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-neutral-200 py-14 text-center text-sm text-neutral-400">
        No price data found for this selection.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Savings summary banner */}
      {savingsSummary && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <TrendingDown className="size-4 shrink-0 text-green-600" />
          <p className="text-sm text-green-800">
            <span className="font-semibold">
              Prices range from {fmt.format(savingsSummary.min)} to {fmt.format(savingsSummary.max)}
            </span>
            {" "}— choosing the most affordable hospital saves you{" "}
            <span className="font-bold">{fmt.format(savingsSummary.savings)}</span>.
          </p>
        </div>
      )}

      {/* Coinsurance selector */}
      <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 space-y-2">
        <p className="text-xs font-semibold text-neutral-700">How does your insurance work? <span className="font-normal text-neutral-400">(pick the one that sounds like your plan)</span></p>
        <div className="flex flex-wrap gap-1.5">
          {COINSURANCE_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => setCoinsurance(opt.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5",
                coinsurance === opt.value
                  ? "border-violet-500 bg-violet-50 text-violet-700"
                  : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
              )}
            >
              {opt.label}
              <span className={cn("text-xs", coinsurance === opt.value ? "text-violet-400" : "text-neutral-300")}>
                {opt.sublabel}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50">
                <Th onClick={() => toggleSort("hospital")}>
                  Hospital <SortIcon col="hospital" />
                </Th>
                <Th onClick={() => toggleSort("negotiated")} className="text-right">
                  {insuranceLabel} pays hospital <SortIcon col="negotiated" />
                </Th>
                <Th onClick={() => toggleSort("patientCost")} className="text-right">
                  Your cost <SortIcon col="patientCost" />
                </Th>
                <Th className="text-right">Insurance pays</Th>
                <Th onClick={() => toggleSort("cash")} className="text-right">
                  No insurance (cash) <SortIcon col="cash" />
                </Th>
                <Th onClick={() => toggleSort("diff")} className="text-center text-green-700">
                  Insurance saves <SortIcon col="diff" />
                </Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const patientCost = row.negotiated !== null ? row.negotiated * coinsurance : null;
                const insurerPays = row.negotiated !== null ? row.negotiated * (1 - coinsurance) : null;
                const isLast = i === sorted.length - 1;
                const isBestValue = i === 0;

                // Savings badge: positive pct = insurance is cheaper than cash
                const insSavingsPct = patientCost != null && row.cash != null && row.cash > 0
                  ? Math.round(((row.cash - patientCost) / row.cash) * 100)
                  : null;

                let diffBadge: React.ReactNode = null;
                if (insSavingsPct != null) {
                  if (insSavingsPct > 0) {
                    diffBadge = (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">
                        <ShieldCheck className="size-3" />
                        Save {insSavingsPct}% with insurance
                      </span>
                    );
                  } else if (insSavingsPct < 0) {
                    diffBadge = (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        <TrendingDown className="size-3" />
                        Cash is {Math.abs(insSavingsPct)}% cheaper
                      </span>
                    );
                  } else {
                    diffBadge = (
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-500">
                        <Minus className="size-3" /> Same price
                      </span>
                    );
                  }
                } else if (row.diff !== null && row.diffPct !== null) {
                  // fallback if patientCost not available but raw diff is
                  const savings = -row.diff;
                  if (savings > 0) {
                    diffBadge = (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        <TrendingDown className="size-3" />
                        Cash saves {fmt.format(savings)} ({fmtPct(-row.diffPct)})
                      </span>
                    );
                  } else if (savings < 0) {
                    diffBadge = (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">
                        <ShieldCheck className="size-3" />
                        Insurance saves {fmt.format(-savings)} ({fmtPct(-row.diffPct)})
                      </span>
                    );
                  } else {
                    diffBadge = (
                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-500">
                        <Minus className="size-3" /> Same price
                      </span>
                    );
                  }
                }

                return (
                  <tr
                    key={row.hospital.id}
                    className={cn(
                      "transition-colors hover:bg-neutral-50",
                      !isLast && "border-b border-neutral-100",
                      isBestValue && "bg-green-50 border-l-2 border-l-green-500"
                    )}
                  >
                    {/* Hospital */}
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-neutral-900 leading-tight">{row.hospital.name}</p>
                            {isBestValue && (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                                Best Value
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-neutral-400 truncate max-w-[200px]">{row.hospital.address}</p>
                          {row.negotiatedPayerName && (
                            <p className="mt-0.5 text-xs text-violet-500">{row.negotiatedPayerName}</p>
                          )}
                          <div className="mt-0.5 flex items-center gap-2">
                            {row.source && (() => {
                              const badge = SOURCE_BADGE[row.source] ?? SOURCE_BADGE.mrf;
                              const Icon = badge.icon;
                              return (
                                <span className={cn("shrink-0 inline-flex items-center gap-1 text-[10px] font-medium rounded px-1.5 py-0.5", badge.className)}>
                                  <Icon className="size-2.5" /> {badge.label}
                                </span>
                              );
                            })()}
                            {row.dataLastUpdated && (
                              <span className="shrink-0 text-[10px] text-neutral-300">
                                {new Date(row.dataLastUpdated).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Negotiated rate */}
                    <td className="px-4 py-3 text-right">
                      {row.negotiated !== null ? (
                        <span className="font-mono font-semibold text-neutral-900">
                          {fmt.format(row.negotiated)}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-300">—</span>
                      )}
                    </td>

                    {/* You pay (patient responsibility) */}
                    <td className="px-4 py-3 text-right">
                      {patientCost !== null ? (
                        <div>
                          <span className="font-mono font-bold text-violet-700">
                            {fmt.format(patientCost)}
                          </span>
                          <p className="text-xs text-neutral-400">after deductible</p>
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-300">—</span>
                      )}
                    </td>

                    {/* Insurer pays */}
                    <td className="px-4 py-3 text-right">
                      {insurerPays !== null ? (
                        <div>
                          <span className="font-mono text-sm font-semibold text-neutral-600">
                            {fmt.format(insurerPays)}
                          </span>
                          <p className="text-xs text-neutral-400">
                            {Math.round((1 - coinsurance) * 100)}% covered
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-300">—</span>
                      )}
                    </td>

                    {/* Cash price */}
                    <td className="px-4 py-3 text-right">
                      {row.cash !== null ? (
                        <span className={cn(
                          "font-mono font-semibold",
                          row.diff !== null && row.diff < 0 ? "text-green-700" : "text-neutral-700"
                        )}>
                          {fmt.format(row.cash)}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-300">—</span>
                      )}
                    </td>

                    {/* Comparison badge */}
                    <td className="px-4 py-3 text-center">
                      {diffBadge ?? <span className="text-xs text-neutral-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-2.5 text-xs text-neutral-400">
          {rows.length} hospitals · &quot;Your cost&quot; = what you owe after insurance pays its share · Assumes you&apos;ve already paid your annual deductible · Your actual bill may vary
        </div>

        {/* Transparency explainer */}
        <div className="border-t border-neutral-100">
          <button
            onClick={() => setShowExplainer((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-neutral-500 hover:text-neutral-700 transition-colors"
          >
            <span>What do these numbers mean? (plain language guide)</span>
            {showExplainer
              ? <ChevronUp className="size-3.5" />
              : <ChevronDown className="size-3.5" />
            }
          </button>
          {showExplainer && (
            <div className="px-4 pb-4 space-y-3 text-xs text-neutral-600 bg-neutral-50 border-t border-neutral-100">
              <dl className="mt-3 space-y-2.5">
                <div>
                  <dt className="font-semibold text-neutral-800">Negotiated rate (what insurance pays the hospital)</dt>
                  <dd className="mt-0.5 text-neutral-500">Hospitals have a secret deal with each insurance company. Instead of paying the full price, your insurer pays a much lower negotiated amount. This is that agreed-upon number — not what you personally pay.</dd>
                </div>
                <div>
                  <dt className="font-semibold text-neutral-800">Your cost</dt>
                  <dd className="mt-0.5 text-neutral-500">This is what you actually owe out of your own pocket. After your insurance pays its share, you cover the rest. This assumes you&apos;ve already met your deductible for the year — if you haven&apos;t, your cost may be higher.</dd>
                </div>
                <div>
                  <dt className="font-semibold text-neutral-800">Insurance pays</dt>
                  <dd className="mt-0.5 text-neutral-500">The portion your insurance company pays directly to the hospital on your behalf. You never see this money — it goes straight from insurer to hospital.</dd>
                </div>
                <div>
                  <dt className="font-semibold text-neutral-800">Cash price (no insurance)</dt>
                  <dd className="mt-0.5 text-neutral-500">What the hospital charges if you pay entirely on your own. Surprisingly, this is sometimes cheaper than using insurance — especially if you have a high deductible or your insurance doesn&apos;t cover the procedure well.</dd>
                </div>
                <div>
                  <dt className="font-semibold text-neutral-800">What is a deductible?</dt>
                  <dd className="mt-0.5 text-neutral-500">A deductible is the amount you pay each year before your insurance kicks in. For example, with a $2,000 deductible, you pay the first $2,000 of medical bills yourself each year. After that, your insurance starts sharing the cost.</dd>
                </div>
                <div>
                  <dt className="font-semibold text-neutral-800">Where do these prices come from?</dt>
                  <dd className="mt-0.5 text-neutral-500">Hospitals are required by federal law to publish their prices online. We pull from those official files. When a hospital hasn&apos;t published a specific price, we use AI to estimate based on comparable data.</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Th({
  children, onClick, className,
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
        onClick && "cursor-pointer select-none hover:text-neutral-800",
        className
      )}
    >
      {children}
    </th>
  );
}
