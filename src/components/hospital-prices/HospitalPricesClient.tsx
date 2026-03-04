"use client";

import { useState, useCallback } from "react";
import { InsuranceSelector, type InsuranceSelection } from "./InsuranceSelector";
import { InsurancePriceTable } from "./InsurancePriceTable";
import { ProcedureSearch } from "./ProcedureSearch";
import { CompareDrawer } from "./CompareDrawer";
import { AiProcedureSearch } from "./AiProcedureSearch";
import { Separator } from "@/components/ui/separator";
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

  const fetchPrices = useCallback(async (procedure: Procedure, ins: InsuranceSelection | null) => {
    setLoading(true);
    setError(null);
    setIsAiEstimate(false);
    setCompareMap(new Map());

    try {
      // Always fetch cash prices
      const cashParams = new URLSearchParams({ procedureId: procedure.id, payerType: "cash" });
      const cashRes = await fetch(`/api/prices?${cashParams}`);
      const cashData: PriceApiEntry[] = cashRes.ok ? await cashRes.json() : [];

      let insData: PriceApiEntry[] = [];

      if (ins && ins.payerType !== "cash") {
        // Fetch insurer-specific prices — try name match first
        const insParams = new URLSearchParams({
          procedureId: procedure.id,
          payerType: ins.payerType,
          payerName: ins.insurer,
        });
        const insRes = await fetch(`/api/prices?${insParams}`);
        insData = insRes.ok ? await insRes.json() : [];

        // Widen to payerType only if no name matches
        if (insData.length === 0) {
          const broadParams = new URLSearchParams({
            procedureId: procedure.id,
            payerType: ins.payerType,
          });
          const broadRes = await fetch(`/api/prices?${broadParams}`);
          insData = broadRes.ok ? await broadRes.json() : [];
        }

        // AI estimate fallback for insurance prices
        if (insData.length === 0) {
          const estParams = new URLSearchParams({
            procedureId: procedure.id,
            payerType: ins.payerType,
          });
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
        // No insurance selected — fetch all negotiated rates as the reference price
        const allParams = new URLSearchParams({ procedureId: procedure.id, payerType: "commercial" });
        const allRes = await fetch(`/api/prices?${allParams}`);
        insData = allRes.ok ? await allRes.json() : [];
      }

      // If no cash prices in DB, AI-estimate them too
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
    <div className="space-y-6">
      {/* Step 1 — Insurance */}
      <InsuranceSelector value={insurance} onChange={handleInsuranceChange} />

      {/* Step 2 — Procedure search */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Step 2</p>
          <h2 className="text-base font-bold text-neutral-900">Find Your Procedure</h2>
        </div>
        <ProcedureSearch
          procedures={procedures}
          selected={selected}
          onSelect={handleProcedureSelect}
        />
        {procedures.length === 0 && (
          <p className="mt-3 text-xs text-neutral-400">
            No procedures loaded yet — upload price data or use the AI breakdown below.
          </p>
        )}
      </div>

      {/* Results */}
      {selected && (
        <div className="space-y-3">
          {/* Summary bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-neutral-900">
                CPT&nbsp;{selected.cptCode}&ensp;—&ensp;{selected.name}
              </p>
              {selected.description && (
                <p className="mt-0.5 text-xs text-neutral-500">{selected.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {insurance && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  🛡 {insurance.displayLabel}
                </span>
              )}
              {isAiEstimate && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                  ⚠ AI Estimates
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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

      <Separator />

      {/* AI full breakdown */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          AI Full Cost Breakdown
        </p>
        <AiProcedureSearch />
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
