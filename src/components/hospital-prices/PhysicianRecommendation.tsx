"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Star, Building2, TrendingDown, Sparkles,
  ChevronDown, ChevronUp, BadgeCheck, Trophy, ShieldCheck, ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PhysicianRecommendation, PhysicianHospital } from "@/app/api/physicians/recommend/route";
import type { HospitalComparisonEntry } from "@/app/api/hospitals/compare/route";
import type { InsuranceSelection } from "./InsuranceSelector";

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

interface Props {
  procedureName: string;
  cptCode: string | null;
  insurance: InsuranceSelection | null;
  coinsurance: number;
  hospitalPrices: HospitalComparisonEntry[];
}

export function PhysicianRecommendations({ procedureName, cptCode, insurance, coinsurance, hospitalPrices }: Props) {
  const [physicians, setPhysicians] = useState<PhysicianRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const load = useCallback(async (prices: HospitalComparisonEntry[]) => {
    setLoading(true);
    setError(null);
    setPhysicians([]);
    try {
      const res = await fetch("/api/physicians/recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          procedureName,
          cptCode,
          insurerName: insurance?.insurer ?? null,
          payerType: insurance?.payerType ?? null,
          coinsurance,
          hospitalPrices: prices,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setPhysicians(data.physicians ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load physician recommendations");
    } finally {
      setLoading(false);
    }
  }, [procedureName, cptCode, insurance, coinsurance]);

  // Wait until hospital prices are loaded, then fetch physicians
  useEffect(() => {
    if (hospitalPrices.length > 0) {
      load(hospitalPrices);
    }
  }, [hospitalPrices, load]);

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">

      {/* ── Header ── */}
      <div className="border-b border-neutral-100 bg-gradient-to-r from-violet-700 to-indigo-700 px-6 py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">Find a doctor</p>
            <h3 className="mt-0.5 text-lg font-bold text-white">Top surgeons for {procedureName}</h3>
            <p className="mt-0.5 text-sm text-violet-200">
              Recommended specialists · where they work · what it would cost you there
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5">
            <Sparkles className="size-3.5 text-violet-200" />
            <span className="text-xs font-semibold text-white">AI-curated · verify with your insurer</span>
          </div>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="space-y-3 px-6 py-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-start gap-4 rounded-2xl border border-neutral-100 p-4" style={{ opacity: 1 - i * 0.25 }}>
              <div className="size-12 shrink-0 animate-pulse rounded-full bg-neutral-100" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 animate-pulse rounded bg-neutral-100" />
                <div className="h-3 w-56 animate-pulse rounded bg-neutral-100" />
                <div className="flex gap-2 mt-2">
                  <div className="h-8 w-36 animate-pulse rounded-xl bg-neutral-100" />
                  <div className="h-8 w-36 animate-pulse rounded-xl bg-neutral-100" />
                </div>
              </div>
              <div className="h-10 w-24 animate-pulse rounded-xl bg-neutral-100 shrink-0" />
            </div>
          ))}
          <div className="flex items-center gap-2 pb-2">
            <Loader2 className="size-4 animate-spin text-violet-500" />
            <p className="text-sm text-neutral-500">Finding top specialists in Manhattan…</p>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <p className="px-6 py-6 text-sm text-red-600">{error}</p>
      )}

      {/* ── Results ── */}
      {!loading && !error && physicians.length > 0 && (
        <>
          <div className="divide-y divide-neutral-100">
            {physicians.map((doc, idx) => {
              const isExpanded = expandedIdx === idx;
              const isBest = idx === 0;
              const cheapest = doc.cheapestHospital;

              return (
                <div key={doc.name} className={cn(isBest && "bg-violet-50/40")}>
                  <div className="px-6 py-4">
                    <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">

                      {/* Avatar + rank */}
                      <div className="relative shrink-0">
                        <div className={cn(
                          "flex size-12 items-center justify-center rounded-full text-lg font-bold text-white",
                          isBest ? "bg-violet-600" : "bg-neutral-300"
                        )}>
                          {doc.name.split(" ").at(-1)?.[0] ?? "?"}
                        </div>
                        {isBest && (
                          <div className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-amber-400 shadow">
                            <Trophy className="size-3 text-white" />
                          </div>
                        )}
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-neutral-900">{doc.name}</p>
                          <span className="text-xs font-medium text-neutral-500">{doc.credentials}</span>
                          {isBest && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">
                              <Star className="size-3" /> Top pick
                            </span>
                          )}
                          {doc.npiVerified ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                              <ShieldCheck className="size-3" /> NPI Verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              <ShieldAlert className="size-3" /> Unverified
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="mt-0.5 text-sm text-neutral-600">{doc.npiSpecialty || doc.specialty}</p>
                          {doc.npi && (
                            <p className="mt-0.5 text-xs text-neutral-400">NPI {doc.npi}</p>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-neutral-500 leading-snug">{doc.whyRecommended}</p>

                        {/* Highlights */}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {doc.highlights.map((h) => (
                            <span key={h} className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-xs text-neutral-600">
                              <BadgeCheck className="size-3 text-green-500" /> {h}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Best price callout */}
                      {cheapest && (
                        <div className={cn(
                          "shrink-0 rounded-xl border p-3 text-center min-w-[120px]",
                          isBest ? "border-violet-200 bg-violet-50" : "border-neutral-200 bg-neutral-50"
                        )}>
                          <p className="text-xs text-neutral-500 mb-0.5">Best price with</p>
                          <p className="text-xs font-semibold text-neutral-600 truncate max-w-[110px]">
                            {cheapest.hospitalName.replace("NYP / Columbia University Irving Medical Center", "NYP / Columbia").replace("NewYork-Presbyterian / Weill Cornell", "NYP / Weill Cornell").replace("NYU Langone Health (Tisch Hospital)", "NYU Langone")}
                          </p>
                          {cheapest.yourCost != null ? (
                            <>
                              <p className={cn("mt-1 text-lg font-extrabold", isBest ? "text-violet-700" : "text-neutral-800")}>
                                {fmt.format(cheapest.yourCost)}
                              </p>
                              <p className="text-xs text-neutral-400">your cost</p>
                            </>
                          ) : cheapest.cashPrice != null ? (
                            <>
                              <p className={cn("mt-1 text-lg font-extrabold", isBest ? "text-violet-700" : "text-neutral-800")}>
                                {fmt.format(cheapest.cashPrice)}
                              </p>
                              <p className="text-xs text-neutral-400">cash price</p>
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Hospital list toggle */}
                    <button
                      onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                      className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors"
                    >
                      <Building2 className="size-3.5" />
                      {isExpanded ? "Hide" : "See"} all {doc.hospitals.length} hospitals this doctor uses
                      {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    </button>
                  </div>

                  {/* Expanded hospital price list */}
                  {isExpanded && (
                    <div className="border-t border-neutral-100 bg-neutral-50 px-6 pb-4 pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-3">
                        Price at each hospital this doctor uses
                      </p>
                      <div className="space-y-2">
                        {[...doc.hospitals]
                          .sort((a, b) => (a.yourCost ?? a.cashPrice ?? Infinity) - (b.yourCost ?? b.cashPrice ?? Infinity))
                          .map((h) => (
                            <HospitalRow key={h.hospitalId} h={h} showIns={!!insurance && insurance.payerType !== "cash"} />
                          ))
                        }
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer disclaimer */}
          <div className="border-t border-neutral-100 bg-neutral-50 px-6 py-3 space-y-1.5">
            <p className="text-xs text-neutral-400">
              <ShieldCheck className="inline size-3 mr-1 text-green-500" />
              <span className="font-semibold text-neutral-500">NPI Verified</span> doctors are confirmed in the CMS National Provider Identifier registry as licensed NY physicians.
              Unverified doctors are AI-suggested but could not be confirmed — verify before booking.
            </p>
            <p className="text-xs text-neutral-400">
              <Sparkles className="inline size-3 mr-1 text-violet-400" />
              Always confirm your doctor is in-network with your insurance. Prices are estimates — your actual cost depends on your specific plan and remaining deductible.
            </p>
          </div>
        </>
      )}

      {!loading && !error && physicians.length === 0 && (
        <p className="py-10 text-center text-sm text-neutral-400">
          No physician recommendations available for this procedure.
        </p>
      )}
    </div>
  );
}

// ── Hospital price row ─────────────────────────────────────────────────────────
function HospitalRow({ h, showIns }: { h: PhysicianHospital; showIns: boolean }) {
  return (
    <div className={cn(
      "flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5",
      h.isLowestCost
        ? "border-green-200 bg-green-50"
        : "border-neutral-200 bg-white"
    )}>
      <div className="flex items-center gap-2 min-w-0">
        {h.isLowestCost && <TrendingDown className="size-4 shrink-0 text-green-600" />}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-800 truncate">{h.hospitalName}</p>
          {h.isLowestCost && (
            <p className="text-xs font-semibold text-green-600">Lowest price for this doctor</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0 text-right">
        {showIns && h.yourCost != null && (
          <div>
            <p className={cn("font-bold text-sm", h.isLowestCost ? "text-green-700" : "text-violet-700")}>
              {fmt.format(h.yourCost)}
            </p>
            <p className="text-xs text-neutral-400">your cost</p>
          </div>
        )}
        {h.cashPrice != null && (
          <div>
            <p className="font-semibold text-sm text-neutral-600">{fmt.format(h.cashPrice)}</p>
            <p className="text-xs text-neutral-400">no insurance</p>
          </div>
        )}
      </div>
    </div>
  );
}
