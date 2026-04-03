"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronUp, Calculator, RotateCcw } from "lucide-react";
import type { PlanDetails } from "@/lib/cost-calculator";

interface Props {
  planDetails: PlanDetails | null;
  onChange: (plan: PlanDetails | null) => void;
  /** Pre-fill defaults from selected insurance plan */
  defaultCoinsurance?: number;
}

const DEFAULT_PLAN: PlanDetails = {
  annualDeductible: 2500,
  deductibleMet: 0,
  coinsurancePercent: 20,
  oopMax: 8500,
  oopSpent: 0,
};

function formatDollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents);
}

export function CustomPlanInput({ planDetails, onChange, defaultCoinsurance }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<PlanDetails>({
    ...DEFAULT_PLAN,
    coinsurancePercent: defaultCoinsurance ?? DEFAULT_PLAN.coinsurancePercent,
  });

  // Sync coinsurance default when insurance selection changes
  useEffect(() => {
    if (defaultCoinsurance != null) {
      setForm((prev) => ({ ...prev, coinsurancePercent: defaultCoinsurance }));
    }
  }, [defaultCoinsurance]);

  // If parent already has plan details, populate form
  useEffect(() => {
    if (planDetails) {
      setForm(planDetails);
    }
  }, [planDetails]);

  const deductibleRemaining = Math.max(0, form.annualDeductible - form.deductibleMet);
  const oopRemaining = Math.max(0, form.oopMax - form.oopSpent);

  const updateField = useCallback((field: keyof PlanDetails, value: string) => {
    const num = parseFloat(value) || 0;
    setForm((prev) => ({ ...prev, [field]: num }));
  }, []);

  const handleApply = () => {
    onChange({ ...form });
  };

  const handleReset = () => {
    onChange(null);
    setForm({
      ...DEFAULT_PLAN,
      coinsurancePercent: defaultCoinsurance ?? DEFAULT_PLAN.coinsurancePercent,
    });
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-violet-50">
            <Calculator className="size-3.5 text-violet-600" strokeWidth={2} />
          </span>
          <div>
            <p className="text-sm font-semibold text-neutral-800">
              Enter your plan details for accurate estimates
            </p>
            {planDetails && !expanded && (
              <p className="text-[11px] text-violet-600 font-medium mt-0.5">
                Custom plan active — {formatDollars(planDetails.annualDeductible)} deductible,{" "}
                {planDetails.coinsurancePercent}% coinsurance
              </p>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="size-4 shrink-0 text-neutral-400" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-neutral-400" />
        )}
      </button>

      {/* Expanded form */}
      {expanded && (
        <div className="border-t border-neutral-100 px-4 pb-4 pt-3 space-y-4">
          {/* Input grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <PlanField
              label="Annual Deductible"
              helper="Your yearly deductible amount"
              prefix="$"
              value={form.annualDeductible}
              onChange={(v) => updateField("annualDeductible", v)}
            />
            <PlanField
              label="Deductible Met This Year"
              helper="How much you've paid toward your deductible"
              prefix="$"
              value={form.deductibleMet}
              onChange={(v) => updateField("deductibleMet", v)}
            />
            <PlanField
              label="Your Coinsurance"
              helper="Check your plan summary or insurance card"
              suffix="%"
              value={form.coinsurancePercent}
              onChange={(v) => updateField("coinsurancePercent", v)}
            />
            <PlanField
              label="Out-of-Pocket Maximum"
              helper="The most you'll pay in a year"
              prefix="$"
              value={form.oopMax}
              onChange={(v) => updateField("oopMax", v)}
            />
            <PlanField
              label="OOP Spent This Year"
              helper="How much you've spent toward your OOP max"
              prefix="$"
              value={form.oopSpent}
              onChange={(v) => updateField("oopSpent", v)}
            />
          </div>

          {/* Live summary */}
          <div className="flex flex-wrap gap-3">
            <div className="rounded-lg bg-neutral-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                Deductible remaining
              </p>
              <p className="mt-0.5 text-sm font-bold text-neutral-800">
                {formatDollars(deductibleRemaining)}
              </p>
            </div>
            <div className="rounded-lg bg-neutral-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                OOP max remaining
              </p>
              <p className="mt-0.5 text-sm font-bold text-neutral-800">
                {formatDollars(oopRemaining)}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleApply}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 active:bg-violet-800"
            >
              Use these details
            </button>
            {planDetails && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-700 transition-colors"
              >
                <RotateCcw className="size-3" />
                Reset to quick estimate
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Individual field component ─────────────────────────────────────────── */

interface PlanFieldProps {
  label: string;
  helper: string;
  prefix?: string;
  suffix?: string;
  value: number;
  onChange: (value: string) => void;
}

function PlanField({ label, helper, prefix, suffix, value, onChange }: PlanFieldProps) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-neutral-700">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-neutral-400">
            {prefix}
          </span>
        )}
        <input
          type="number"
          min={0}
          step={label.includes("Coinsurance") ? 1 : 100}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-lg border border-neutral-200 py-2 text-sm text-neutral-800 placeholder:text-neutral-300 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 ${
            prefix ? "pl-7 pr-3" : suffix ? "pl-3 pr-7" : "px-3"
          }`}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-neutral-400">
            {suffix}
          </span>
        )}
      </div>
      <p className="text-[10px] text-neutral-400 leading-tight">{helper}</p>
    </div>
  );
}
