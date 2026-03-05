"use client";

import { useState, useRef, useEffect } from "react";
import {
  Search, Loader2, ChevronDown, ChevronUp, CircleDot,
  Stethoscope, Wrench, AlertCircle, ListCollapse,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProcedureBreakdown, BreakdownComponent } from "@/app/api/procedure-breakdown/route";
import type { InsuranceSelection } from "./InsuranceSelector";
import { HospitalCostComparison } from "./HospitalCostComparison";

export type { ProcedureBreakdown };

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtRange = (lo: number | null | undefined, hi: number | null | undefined) => {
  if (lo == null || hi == null) return "—";
  if (lo === hi || hi === 0) return fmt.format(lo);
  return `${fmt.format(lo)} – ${fmt.format(hi)}`;
};

// ── Category styles ───────────────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<string, { headerBg: string; text: string; dot: string; icon: string }> = {
  "Professional Services":      { headerBg: "bg-blue-50",    text: "text-blue-700",   dot: "bg-blue-500",   icon: "👨‍⚕️" },
  "Facility & OR":              { headerBg: "bg-purple-50",  text: "text-purple-700", dot: "bg-purple-500", icon: "🏥" },
  "Anesthesia":                 { headerBg: "bg-indigo-50",  text: "text-indigo-700", dot: "bg-indigo-500", icon: "💉" },
  "Diagnostics & Imaging":      { headerBg: "bg-amber-50",   text: "text-amber-700",  dot: "bg-amber-500",  icon: "🔬" },
  "Medical Devices & Implants": { headerBg: "bg-slate-100",  text: "text-slate-700",  dot: "bg-slate-500",  icon: "🔩" },
  "Medications & Consumables":  { headerBg: "bg-green-50",   text: "text-green-700",  dot: "bg-green-500",  icon: "💊" },
  "Rehabilitation":             { headerBg: "bg-teal-50",    text: "text-teal-700",   dot: "bg-teal-500",   icon: "🏋️" },
  "Follow-up Care":             { headerBg: "bg-rose-50",    text: "text-rose-700",   dot: "bg-rose-500",   icon: "📅" },
};
const catCfg = (cat: string) => CATEGORY_CONFIG[cat] ?? { headerBg: "bg-neutral-50", text: "text-neutral-600", dot: "bg-neutral-400", icon: "📋" };

// ── Loading phases ────────────────────────────────────────────────────────────
const LOADING_PHASES = [
  "Figuring out what procedure you need…",
  "Looking up surgical components and materials…",
  "Pulling real hospital price data…",
  "Calculating what you'd actually pay…",
];

// ── Coinsurance options ───────────────────────────────────────────────────────
const COINSURANCE_OPTIONS = [
  { label: "10%", value: 0.10 },
  { label: "20%", value: 0.20 },
  { label: "30%", value: 0.30 },
  { label: "40%", value: 0.40 },
  { label: "I pay it all", value: 1.0 },
];

// ── Suggestions ───────────────────────────────────────────────────────────────
const SUGGESTIONS: { label: string; query: string }[] = [
  { label: "Non-union ankle fracture", query: "I have a non-union ankle fracture and need surgery" },
  { label: "Torn ACL", query: "I tore my ACL and need reconstruction surgery" },
  { label: "Gallstones", query: "I have gallstones and my doctor recommends gallbladder removal" },
  { label: "Knee replacement", query: "Total knee replacement surgery" },
  { label: "Herniated disc", query: "I have a herniated disc causing leg pain and need surgery" },
  { label: "Hip replacement", query: "Total hip replacement" },
  { label: "Colonoscopy", query: "Routine colonoscopy screening" },
  { label: "Rotator cuff tear", query: "I have a full thickness rotator cuff tear needing repair" },
  { label: "Appendectomy", query: "Appendectomy for appendicitis" },
  { label: "Cataract surgery", query: "Cataract surgery on my right eye" },
];

interface Props {
  insurance?: InsuranceSelection | null;
  onBreakdownReady?: (breakdown: ProcedureBreakdown) => void;
}

export function AiProcedureSearch({ insurance, onBreakdownReady }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [breakdown, setBreakdown] = useState<ProcedureBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coinsurance, setCoinsurance] = useState(0.20);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const phaseTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => phaseTimers.current.forEach(clearTimeout), []);

  const startPhases = () => {
    phaseTimers.current.forEach(clearTimeout);
    phaseTimers.current = [];
    setLoadingPhase(0);
    [3000, 6000, 9000].forEach((delay, i) => {
      const t = setTimeout(() => setLoadingPhase(i + 1), delay);
      phaseTimers.current.push(t);
    });
  };

  const submit = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setBreakdown(null);
    setShowBreakdown(false);
    setExpandedIds(new Set());
    startPhases();
    try {
      const res = await fetch("/api/procedure-breakdown", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: trimmed,
          insurerName: insurance?.insurer ?? null,
          payerType: insurance?.payerType ?? null,
          coinsurance,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setBreakdown(data);
      onBreakdownReady?.(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate breakdown");
    } finally {
      setLoading(false);
      phaseTimers.current.forEach(clearTimeout);
    }
  };

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const grouped = breakdown
    ? breakdown.components.reduce<Record<string, BreakdownComponent[]>>((acc, c) => {
        (acc[c.category] ??= []).push(c); return acc;
      }, {})
    : {};

  const CATEGORY_ORDER = [
    "Professional Services", "Facility & OR", "Anesthesia",
    "Diagnostics & Imaging", "Medical Devices & Implants",
    "Medications & Consumables", "Rehabilitation", "Follow-up Care",
  ];
  const orderedCategories = [
    ...CATEGORY_ORDER.filter((c) => grouped[c]),
    ...Object.keys(grouped).filter((c) => !CATEGORY_ORDER.includes(c)),
  ];

  const showInsurance = !insurance || insurance.payerType !== "cash";
  const insuranceLabel = insurance ? insurance.displayLabel : "Typical insurance";

  return (
    <div className="space-y-4">

      {/* ── Search bar ── */}
      <div className={cn(
        "flex items-center gap-3 rounded-2xl border-2 bg-white px-5 py-4 shadow-md transition-all",
        loading
          ? "border-blue-400 ring-4 ring-blue-100"
          : "border-neutral-200 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100 hover:border-blue-300"
      )}>
        {loading
          ? <Loader2 className="size-5 shrink-0 animate-spin text-blue-500" />
          : <Search className="size-5 shrink-0 text-neutral-400" />
        }
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit(query)}
          placeholder="Describe what you need — e.g. 'non-union ankle fracture surgery', 'knee replacement', 'colonoscopy'…"
          className="flex-1 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
          disabled={loading}
        />
        <button
          onClick={() => submit(query)}
          disabled={loading || !query.trim()}
          className="shrink-0 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Searching…" : "Compare Hospitals"}
        </button>
      </div>

      {/* ── Suggestions ── */}
      {!breakdown && !loading && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              onClick={() => { setQuery(s.query); submit(s.query); }}
              className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="size-4 shrink-0 text-red-500 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 bg-slate-800 px-6 py-5">
            <div className="h-5 w-48 animate-pulse rounded-lg bg-white/10" />
            <div className="mt-2 h-4 w-72 animate-pulse rounded-lg bg-white/10" />
          </div>
          <div className="px-6 py-5 space-y-3">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="size-4 animate-spin text-blue-500 shrink-0" />
              <p className="text-sm font-medium text-neutral-700">{LOADING_PHASES[loadingPhase]}</p>
            </div>
            {/* Hospital skeleton rows */}
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={cn(
                "flex items-center gap-4 rounded-xl border p-4 transition-opacity",
                i === 0 ? "border-green-200 bg-green-50/50" : "border-neutral-100 bg-neutral-50",
              )} style={{ opacity: 1 - i * 0.12 }}>
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-48 animate-pulse rounded bg-neutral-200" />
                  <div className="h-3 w-32 animate-pulse rounded bg-neutral-200" />
                </div>
                <div className="h-8 w-20 animate-pulse rounded-lg bg-neutral-200" />
                <div className="h-8 w-20 animate-pulse rounded-lg bg-neutral-200" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {breakdown && !loading && (
        <>
          {/* ── Procedure identification card ── */}
          <div className={cn(
            "rounded-2xl border px-5 py-4",
            breakdown.conditionAnalysis?.isConditionDescription
              ? "border-blue-200 bg-gradient-to-r from-blue-600 to-blue-700"
              : "border-neutral-200 bg-slate-800"
          )}>
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <Stethoscope className="size-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                {breakdown.conditionAnalysis?.isConditionDescription && (
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-200 mb-0.5">
                    Based on what you described, you likely need:
                  </p>
                )}
                <p className="text-lg font-bold text-white">{breakdown.procedureName}</p>
                {breakdown.cptCode && (
                  <p className="text-xs text-white/60 mt-0.5">Medical code: {breakdown.cptCode}</p>
                )}
                <p className="mt-1 text-sm text-white/80 leading-relaxed max-w-2xl">
                  {breakdown.conditionAnalysis?.isConditionDescription
                    ? breakdown.conditionAnalysis.reasoning
                    : breakdown.description}
                </p>
                {breakdown.conditionAnalysis?.alternatives && breakdown.conditionAnalysis.alternatives.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2 items-center">
                    <span className="text-xs text-white/50">Also considered:</span>
                    {breakdown.conditionAnalysis.alternatives.map((alt) => (
                      <span key={alt} className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs text-white/80">{alt}</span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => { setBreakdown(null); setQuery(""); inputRef.current?.focus(); }}
                className="shrink-0 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/20"
              >
                Search again
              </button>
            </div>
          </div>

          {/* ── Your share selector ── */}
          {showInsurance && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-3 shadow-sm">
              <div>
                <p className="text-sm font-semibold text-neutral-800">What percentage does your insurance make you pay?</p>
                <p className="text-xs text-neutral-400">This is your share after your deductible is met (called coinsurance)</p>
              </div>
              <div className="flex flex-wrap gap-1.5 ml-auto">
                {COINSURANCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setCoinsurance(opt.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-semibold transition-all",
                      coinsurance === opt.value
                        ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                        : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Hospital comparison ─── PRIMARY CONTENT ── */}
          {breakdown.cptCode && (
            <HospitalCostComparison
              cptCode={breakdown.cptCode}
              procedureName={breakdown.procedureName}
              insurance={insurance ?? null}
              coinsurance={coinsurance}
            />
          )}

          {/* ── Component breakdown (expandable) ── */}
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <button
              onClick={() => setShowBreakdown((v) => !v)}
              className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-neutral-50"
            >
              <div className="flex items-center gap-3">
                <ListCollapse className="size-4 text-neutral-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-neutral-800">What does this procedure involve?</p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    See every charge broken down — surgeon fee, anesthesia, implants, medications, follow-up visits
                  </p>
                </div>
              </div>
              {showBreakdown
                ? <ChevronUp className="size-4 shrink-0 text-neutral-400" />
                : <ChevronDown className="size-4 shrink-0 text-neutral-400" />
              }
            </button>

            {showBreakdown && (
              <div className="border-t border-neutral-100">
                {/* Column header */}
                <div
                  className="grid items-center gap-0 border-b border-neutral-100 bg-neutral-50 px-6 py-2.5"
                  style={{ gridTemplateColumns: showInsurance ? "1fr 130px 130px 120px 120px" : "1fr 140px 140px" }}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Service / Item</span>
                  <span className="text-right text-xs font-semibold uppercase tracking-wide text-neutral-400">Hospital asks for</span>
                  {showInsurance && <span className="text-right text-xs font-semibold uppercase tracking-wide text-neutral-400">{insuranceLabel} pays hospital</span>}
                  {showInsurance && <span className="text-right text-xs font-semibold uppercase tracking-wide text-blue-600">You pay</span>}
                  <span className="text-right text-xs font-semibold uppercase tracking-wide text-neutral-400">No insurance</span>
                </div>

                {/* Rows */}
                <div className="divide-y divide-neutral-50">
                  {orderedCategories.map((category) => {
                    const components = grouped[category];
                    const cfg = catCfg(category);
                    const totals = components.reduce(
                      (acc, c) => ({
                        cmLo: acc.cmLo + c.chargemasterLow,
                        cmHi: acc.cmHi + c.chargemasterHigh,
                        insLo: acc.insLo + (c.insuranceLow ?? 0),
                        insHi: acc.insHi + (c.insuranceHigh ?? 0),
                        cashLo: acc.cashLo + c.cashLow,
                        cashHi: acc.cashHi + c.cashHigh,
                      }),
                      { cmLo: 0, cmHi: 0, insLo: 0, insHi: 0, cashLo: 0, cashHi: 0 }
                    );
                    const hasIns = components.some((c) => c.insuranceLow !== null);

                    return (
                      <div key={category}>
                        {/* Category header */}
                        <div
                          className={cn("grid items-center gap-0 px-6 py-2.5", cfg.headerBg)}
                          style={{ gridTemplateColumns: showInsurance ? "1fr 130px 130px 120px 120px" : "1fr 140px 140px" }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{cfg.icon}</span>
                            <span className={cn("text-xs font-bold uppercase tracking-wide", cfg.text)}>{category}</span>
                            <span className="text-xs text-neutral-400">({components.length})</span>
                          </div>
                          <span className={cn("text-right text-xs font-semibold", cfg.text)}>{fmtRange(totals.cmLo, totals.cmHi)}</span>
                          {showInsurance && <span className={cn("text-right text-xs font-semibold", cfg.text)}>{hasIns ? fmtRange(totals.insLo, totals.insHi) : "—"}</span>}
                          {showInsurance && <span className={cn("text-right text-xs font-semibold", cfg.text)}>{hasIns ? fmtRange(Math.round(totals.insLo * coinsurance), Math.round(totals.insHi * coinsurance)) : "—"}</span>}
                          <span className={cn("text-right text-xs font-semibold", cfg.text)}>{fmtRange(totals.cashLo, totals.cashHi)}</span>
                        </div>

                        {/* Component rows */}
                        {components.map((comp) => {
                          const expanded = expandedIds.has(comp.id);
                          const hasDetail = !!(comp.description || comp.notes);
                          const yourLo = comp.insuranceLow != null ? Math.round(comp.insuranceLow * coinsurance) : null;
                          const yourHi = comp.insuranceHigh != null ? Math.round(comp.insuranceHigh * coinsurance) : null;

                          return (
                            <div key={comp.id} className="border-b border-neutral-50 last:border-b-0">
                              <div
                                className={cn(
                                  "grid items-center gap-0 px-6 py-3 transition-colors",
                                  hasDetail && "cursor-pointer hover:bg-neutral-50",
                                  (comp as any).hasRealData && "bg-green-50/40"
                                )}
                                style={{ gridTemplateColumns: showInsurance ? "1fr 130px 130px 120px 120px" : "1fr 140px 140px" }}
                                onClick={() => hasDetail && toggleExpand(comp.id)}
                              >
                                <div className="min-w-0 pr-4">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-sm font-medium text-neutral-900">{comp.name}</span>
                                    {(comp as any).hasRealData && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                                        <CircleDot className="size-2.5" /> Real data
                                      </span>
                                    )}
                                    {hasDetail && (
                                      <span className="text-neutral-300">
                                        {expanded ? <ChevronUp className="inline size-3.5" /> : <ChevronDown className="inline size-3.5" />}
                                      </span>
                                    )}
                                  </div>
                                  {comp.cptCode && <span className="text-xs text-neutral-300">code {comp.cptCode}</span>}
                                </div>
                                <div className="text-right"><span className="font-mono text-sm text-neutral-500">{fmtRange(comp.chargemasterLow, comp.chargemasterHigh)}</span></div>
                                {showInsurance && <div className="text-right"><span className="font-mono text-sm font-semibold text-blue-700">{fmtRange(comp.insuranceLow, comp.insuranceHigh)}</span></div>}
                                {showInsurance && <div className="text-right"><span className="font-mono text-sm font-bold text-neutral-900">{fmtRange(yourLo, yourHi)}</span></div>}
                                <div className="text-right"><span className="font-mono text-sm text-neutral-500">{fmtRange(comp.cashLow, comp.cashHigh)}</span></div>
                              </div>
                              {expanded && hasDetail && (
                                <div className="border-t border-neutral-50 bg-neutral-50/60 px-6 py-3 space-y-1">
                                  {comp.description && <p className="text-sm text-neutral-700">{comp.description}</p>}
                                  {comp.notes && <p className="flex items-start gap-1.5 text-xs text-neutral-500"><Wrench className="mt-0.5 size-3 shrink-0" />{comp.notes}</p>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {/* Total row */}
                <div
                  className="grid items-end gap-0 border-t-2 border-neutral-200 bg-neutral-50 px-6 py-4"
                  style={{ gridTemplateColumns: showInsurance ? "1fr 130px 130px 120px 120px" : "1fr 140px 140px" }}
                >
                  <div>
                    <p className="text-sm font-bold text-neutral-900">Total estimate</p>
                    <p className="text-xs text-neutral-400">All components</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-neutral-400 mb-0.5">Hospital asks for</p>
                    <p className="font-mono text-sm font-bold text-neutral-600">{fmtRange(breakdown.chargemasterTotalLow, breakdown.chargemasterTotalHigh)}</p>
                  </div>
                  {showInsurance && (
                    <div className="text-right">
                      <p className="text-xs text-neutral-400 mb-0.5">Insurance pays hospital</p>
                      <p className="font-mono text-sm font-bold text-blue-700">{breakdown.insuranceTotalLow != null ? fmtRange(breakdown.insuranceTotalLow, breakdown.insuranceTotalHigh) : "—"}</p>
                    </div>
                  )}
                  {showInsurance && (
                    <div className="text-right">
                      <p className="text-xs text-blue-600 font-semibold mb-0.5">You pay ({Math.round(coinsurance * 100)}%)</p>
                      <p className="font-mono text-lg font-extrabold text-neutral-900">
                        {breakdown.insuranceTotalLow != null
                          ? fmtRange(Math.round(breakdown.insuranceTotalLow * coinsurance), Math.round((breakdown.insuranceTotalHigh ?? 0) * coinsurance))
                          : "—"}
                      </p>
                    </div>
                  )}
                  <div className="text-right">
                    <p className="text-xs text-neutral-400 mb-0.5">No insurance</p>
                    <p className="font-mono text-sm font-bold text-neutral-600">{fmtRange(breakdown.cashTotalLow, breakdown.cashTotalHigh)}</p>
                  </div>
                </div>

                {/* Insurer covers callout */}
                {showInsurance && breakdown.insuranceTotalLow != null && coinsurance < 1 && (
                  <div className="mx-6 mb-5 flex items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Your insurance picks up</p>
                      <p className="text-xl font-bold text-blue-800 mt-0.5">
                        {fmtRange(
                          Math.round((breakdown.insuranceTotalLow ?? 0) * (1 - coinsurance)),
                          Math.round((breakdown.insuranceTotalHigh ?? 0) * (1 - coinsurance))
                        )}
                      </p>
                    </div>
                    <p className="text-sm text-blue-600">
                      {Math.round((1 - coinsurance) * 100)}% of your bill paid by insurance{breakdown.insurerName ? ` (${breakdown.insurerName})` : ""}
                    </p>
                  </div>
                )}

                {/* Disclaimer */}
                <div className="border-t border-neutral-100 bg-neutral-50 px-6 py-4">
                  {breakdown.assumptions && (
                    <p className="text-xs text-neutral-500 mb-2"><span className="font-semibold text-neutral-700">Assumptions: </span>{breakdown.assumptions}</p>
                  )}
                  <p className="text-xs text-neutral-400 italic">
                    Prices are sourced from hospitals' official price lists (required by federal law) and AI estimates where data isn't available. Items marked "Real data" use actual hospital records. Your actual bill may differ based on your specific plan, whether you've met your deductible, and clinical details.
                  </p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
