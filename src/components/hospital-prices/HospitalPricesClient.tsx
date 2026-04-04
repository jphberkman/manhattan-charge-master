"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Search, Upload } from "lucide-react";
import Link from "next/link";
import { InsurancePriceTable } from "./InsurancePriceTable";
import { ProcedureSearch } from "./ProcedureSearch";
import { AiProcedureSearch } from "./AiProcedureSearch";
import type { InsuranceSelection } from "./InsuranceSelector";
import type { PriceApiEntry } from "@/lib/price-transparency/types";

export interface Procedure {
  id: string;
  cptCode: string;
  name: string;
  category: string;
  description: string;
}

export function HospitalPricesClient() {
  const [selected, setSelected] = useState<Procedure | null>(null);

  const [insurancePrices, setInsurancePrices] = useState<PriceApiEntry[]>([]);
  const [cashPrices, setCashPrices] = useState<PriceApiEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAiEstimate, setIsAiEstimate] = useState(false);
  const [showCptBrowse, setShowCptBrowse] = useState(false);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [proceduresLoading, setProceduresLoading] = useState(false);
  // CPT browse still has its own insurance since it's a separate flow
  const [cptInsurance] = useState<InsuranceSelection | null>(null);

  const fetchPrices = useCallback(async (procedure: Procedure, ins: InsuranceSelection | null) => {
    setLoading(true);
    setError(null);
    setIsAiEstimate(false);

    try {
      const cashParams = new URLSearchParams({ procedureId: procedure.id, payerType: "cash" });
      const cashRes = await fetch(`/api/prices?${cashParams}`);
      const cashData: PriceApiEntry[] = cashRes.ok ? await cashRes.json() : [];

      let insData: PriceApiEntry[] = [];

      if (ins && ins.payerType !== "cash") {
        const insParams = new URLSearchParams({ procedureId: procedure.id, payerType: ins.payerType, payerName: ins.insurer });
        const insRes = await fetch(`/api/prices?${insParams}`);
        insData = insRes.ok ? await insRes.json() : [];

        if (insData.length === 0) {
          const broadParams = new URLSearchParams({ procedureId: procedure.id, payerType: ins.payerType });
          const broadRes = await fetch(`/api/prices?${broadParams}`);
          insData = broadRes.ok ? await broadRes.json() : [];
        }
      } else if (!ins) {
        const allParams = new URLSearchParams({ procedureId: procedure.id, payerType: "commercial" });
        const allRes = await fetch(`/api/prices?${allParams}`);
        insData = allRes.ok ? await allRes.json() : [];
      }

      setCashPrices(cashData);
      setInsurancePrices(insData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load prices");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleProcedureSelect = (p: Procedure) => {
    setSelected(p);
    fetchPrices(p, cptInsurance);
  };

  const handleOpenCptBrowse = async () => {
    const next = !showCptBrowse;
    setShowCptBrowse(next);
    if (next && procedures.length === 0) {
      setProceduresLoading(true);
      try {
        const res = await fetch("/api/procedures");
        if (res.ok) setProcedures(await res.json());
      } finally {
        setProceduresLoading(false);
      }
    }
  };

  const insuranceLabel = cptInsurance ? cptInsurance.displayLabel : "Typical insurance";

  return (
    <div className="space-y-4">

      {/* ── Main AI search (self-contained with inline insurance) ── */}
      <AiProcedureSearch />

      {/* ── Admin: upload / validate data ── */}
      <div className="flex gap-2">
        <Link
          href="/hospital-prices/upload"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-600 shadow-sm transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
        >
          <Upload className="size-4 shrink-0" />
          Upload price data
        </Link>
        <Link
          href="/hospital-prices/validate"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-600 shadow-sm transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
        >
          <span className="text-sm">📊</span>
          Validate & improve AI
        </Link>
      </div>

      {/* ── CPT code browse (for power users) ── */}
      <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-white">
        <button
          onClick={handleOpenCptBrowse}
          className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left hover:bg-neutral-50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Search className="size-4 text-neutral-300 shrink-0" />
            <p className="text-sm text-neutral-400">
              Know your procedure code? Browse by CPT code
            </p>
          </div>
          {showCptBrowse
            ? <ChevronUp className="size-4 shrink-0 text-neutral-300" />
            : <ChevronDown className="size-4 shrink-0 text-neutral-300" />
          }
        </button>

        {showCptBrowse && (
          <div className="border-t border-neutral-100 px-5 pb-5 pt-4 space-y-4">
            {proceduresLoading ? (
              <div className="flex items-center gap-2 py-4">
                <div className="size-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                <p className="text-sm text-neutral-400">Loading procedures…</p>
              </div>
            ) : (
            <>
            <ProcedureSearch
              procedures={procedures}
              selected={selected}
              onSelect={handleProcedureSelect}
            />

            {procedures.length === 0 && (
              <p className="text-xs text-neutral-400">
                No procedures loaded — upload a hospital price file or use the AI search above.
              </p>
            )}

            {selected && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">
                      CPT&nbsp;{selected.cptCode}&ensp;·&ensp;{selected.name}
                    </p>
                    {selected.description && (
                      <p className="mt-0.5 text-xs text-neutral-500">{selected.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isAiEstimate && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                        AI Estimates
                      </span>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <InsurancePriceTable
                  insurancePrices={insurancePrices}
                  cashPrices={cashPrices}
                  insuranceLabel={insuranceLabel}
                  loading={loading}
                />
              </div>
            )}
            </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
