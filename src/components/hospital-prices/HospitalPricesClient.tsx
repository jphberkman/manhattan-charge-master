"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { InsuranceSelector, type InsuranceSelection } from "./InsuranceSelector";
import { InsurancePriceTable } from "./InsurancePriceTable";
import { ProcedureSearch } from "./ProcedureSearch";
import { CompareDrawer } from "./CompareDrawer";
import { AiProcedureSearch } from "./AiProcedureSearch";
import { cn } from "@/lib/utils";
import type { PriceApiEntry } from "@/lib/price-transparency/types";

export interface Procedure {
  id: string;
  cptCode: string;
  name: string;
  category: string;
  description: string;
}

interface Props {
  procedures: Procedure[];
}

export function HospitalPricesClient({ procedures }: Props) {
  const [insurance, setInsurance] = useState<InsuranceSelection | null>(null);
  const [selected, setSelected] = useState<Procedure | null>(null);

  const [insurancePrices, setInsurancePrices] = useState<PriceApiEntry[]>([]);
  const [cashPrices, setCashPrices] = useState<PriceApiEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAiEstimate, setIsAiEstimate] = useState(false);

  const [compareMap, setCompareMap] = useState<Map<string, PriceApiEntry>>(new Map());
  const [showCompare, setShowCompare] = useState(false);
  const [showBrowse, setShowBrowse] = useState(false);

  const fetchPrices = useCallback(async (procedure: Procedure, ins: InsuranceSelection | null) => {
    setLoading(true);
    setError(null);
    setIsAiEstimate(false);
    setCompareMap(new Map());

    try {
      const cashParams = new URLSearchParams({ procedureId: procedure.id, payerType: "cash" });
      const cashRes = await fetch(`/api/prices?${cashParams}`);
      const cashData: PriceApiEntry[] = cashRes.ok ? await cashRes.json() : [];

      let insData: PriceApiEntry[] = [];

      if (ins && ins.payerType !== "cash") {
        const insParams = new URLSearchParams({
          procedureId: procedure.id,
          payerType: ins.payerType,
          payerName: ins.insurer,
        });
        const insRes = await fetch(`/api/prices?${insParams}`);
        insData = insRes.ok ? await insRes.json() : [];

        if (insData.length === 0) {
          const broadParams = new URLSearchParams({ procedureId: procedure.id, payerType: ins.payerType });
          const broadRes = await fetch(`/api/prices?${broadParams}`);
          insData = broadRes.ok ? await broadRes.json() : [];
        }

        if (insData.length === 0) {
          const estParams = new URLSearchParams({ procedureId: procedure.id, payerType: ins.payerType });
          const estRes = await fetch(`/api/prices/estimate?${estParams}`);
          if (estRes.ok) {
            const est = await estRes.json();
            if (Array.isArray(est) && est.length > 0) {
              insData = est;
              setIsAiEstimate(true);
            }
          }
        }
      } else if (!ins) {
        const allParams = new URLSearchParams({ procedureId: procedure.id, payerType: "commercial" });
        const allRes = await fetch(`/api/prices?${allParams}`);
        insData = allRes.ok ? await allRes.json() : [];
      }

      if (cashData.length === 0 && insData.length > 0) {
        const estCashParams = new URLSearchParams({ procedureId: procedure.id, payerType: "cash" });
        const estCashRes = await fetch(`/api/prices/estimate?${estCashParams}`);
        if (estCashRes.ok) {
          const est = await estCashRes.json();
          if (Array.isArray(est)) setCashPrices(est);
        }
      } else {
        setCashPrices(cashData);
      }

      setInsurancePrices(insData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load prices");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInsuranceChange = (ins: InsuranceSelection | null) => {
    setInsurance(ins);
    if (selected) fetchPrices(selected, ins);
  };

  const handleProcedureSelect = (p: Procedure) => {
    setSelected(p);
    fetchPrices(p, insurance);
  };

  const handleToggleHospital = useCallback((hospitalId: string, entry: PriceApiEntry) => {
    setCompareMap((prev) => {
      const next = new Map(prev);
      if (next.has(hospitalId)) { next.delete(hospitalId); }
      else if (next.size < 3) { next.set(hospitalId, entry); }
      return next;
    });
  }, []);

  const compareEntries = Array.from(compareMap.values()).sort((a, b) => a.priceUsd - b.priceUsd);
  const insuranceLabel = insurance ? insurance.displayLabel : "Negotiated";

  return (
    <div className="space-y-5">

      {/* ── Step 1: Insurance ── */}
      <StepCard step={1} title="Select Your Insurance" subtitle="Personalize pricing to your plan">
        <InsuranceSelector value={insurance} onChange={handleInsuranceChange} />
      </StepCard>

      {/* ── Step 2: AI Search (primary) ── */}
      <StepCard
        step={2}
        title="Describe Your Condition or Procedure"
        subtitle="AI identifies what you need and breaks down every cost — surgeon fees, implants, hardware, and more"
        highlight
      >
        <AiProcedureSearch insurance={insurance} />
      </StepCard>

      {/* ── Divider ── */}
      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-neutral-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="flex items-center gap-2 bg-slate-50 px-4 text-xs font-semibold uppercase tracking-widest text-neutral-400">
            <Search className="size-3" /> or search by CPT code
          </span>
        </div>
      </div>

      {/* ── Step 3: CPT browse (secondary, collapsible) ── */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <button
          onClick={() => setShowBrowse((v) => !v)}
          className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-neutral-50"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-neutral-300 text-xs font-bold text-neutral-400">
              3
            </div>
            <div>
              <p className="text-sm font-bold text-neutral-800">Browse by Procedure Code</p>
              <p className="text-xs text-neutral-400">
                {procedures.length > 0
                  ? `${procedures.length.toLocaleString()} procedures in database — compare real hospital prices side by side`
                  : "Upload price data to enable CPT code search"}
              </p>
            </div>
          </div>
          {showBrowse
            ? <ChevronUp className="size-4 shrink-0 text-neutral-400" />
            : <ChevronDown className="size-4 shrink-0 text-neutral-400" />
          }
        </button>

        {showBrowse && (
          <div className="border-t border-neutral-100 px-6 pb-6 pt-5 space-y-4">
            <ProcedureSearch
              procedures={procedures}
              selected={selected}
              onSelect={handleProcedureSelect}
            />

            {procedures.length === 0 && (
              <p className="text-xs text-neutral-400">
                No procedures loaded — upload a hospital price file or use the AI breakdown above.
              </p>
            )}

            {selected && (
              <div className="space-y-3">
                {/* Selected procedure banner */}
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
                    {insurance && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                        {insurance.displayLabel}
                      </span>
                    )}
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
          </div>
        )}
      </div>

      <CompareDrawer
        open={showCompare}
        onClose={() => setShowCompare(false)}
        entries={compareEntries}
        procedureName={selected?.name ?? ""}
      />
    </div>
  );
}

// ── StepCard ─────────────────────────────────────────────────────────────────
function StepCard({
  step, title, subtitle, highlight = false, children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(
      "overflow-hidden rounded-2xl border shadow-sm",
      highlight
        ? "border-blue-200 bg-white ring-1 ring-blue-100"
        : "border-neutral-200 bg-white"
    )}>
      <div className={cn(
        "flex items-start gap-3 border-b px-6 py-4",
        highlight ? "border-blue-100 bg-blue-50/50" : "border-neutral-100 bg-neutral-50/70"
      )}>
        <div className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          highlight
            ? "bg-blue-600 text-white shadow-sm"
            : "border-2 border-neutral-300 text-neutral-500"
        )}>
          {step}
        </div>
        <div>
          <p className={cn("text-sm font-bold", highlight ? "text-blue-900" : "text-neutral-800")}>
            {title}
          </p>
          {subtitle && (
            <p className={cn("mt-0.5 text-xs", highlight ? "text-blue-600" : "text-neutral-400")}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}
