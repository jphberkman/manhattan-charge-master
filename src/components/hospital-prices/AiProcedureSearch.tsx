"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Search, Loader2, ChevronDown, ChevronUp, CircleDot,
  Stethoscope, Wrench, AlertCircle, ListCollapse,
  DatabaseZap, FileX, ShieldCheck, X, Receipt, Calculator, ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProcedureBreakdown, BreakdownComponent, AlternativeProcedure } from "@/app/api/procedure-breakdown/route";
import { ProcedureAlternatives } from "./ProcedureAlternatives";
import type { ProcedureSearchResponse, ProcedureSearchResult } from "@/app/api/procedure-search/route";
import type { HospitalComparisonEntry } from "@/app/api/hospitals/compare/route";
import { InsuranceSelector, type InsuranceSelection } from "./InsuranceSelector";
import { HospitalCostComparison } from "./HospitalCostComparison";
import { PhysicianRecommendations } from "./PhysicianRecommendation";
import { GlossaryTip } from "./GlossaryTip";
import type { PlanDetails } from "@/lib/cost-calculator";
import { CustomPlanInput } from "./CustomPlanInput";
import { PlanComparisonMode } from "./PlanComparisonMode";

export type { ProcedureBreakdown };

// ── Types ──────────────────────────────────────────────────────────────────────

type Phase =
  | "idle"
  | "db-searching"    // fast DB lookup in progress
  | "db-results"      // real chargemaster data found — show hospital comparison
  | "no-data"         // nothing in DB — AI started automatically
  | "ai-loading"      // AI breakdown in progress
  | "ai-results";     // full AI breakdown ready

// ── Constants ─────────────────────────────────────────────────────────────────

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtRange = (lo: number | null | undefined, hi: number | null | undefined) => {
  if (lo == null || hi == null) return "—";
  if (lo === hi || hi === 0) return fmt.format(lo);
  return `${fmt.format(lo)} – ${fmt.format(hi)}`;
};

const CATEGORY_CONFIG: Record<string, { headerBg: string; text: string; icon: string }> = {
  "Professional Services":      { headerBg: "bg-violet-50",  text: "text-violet-700",  icon: "👨‍⚕️" },
  "Facility & OR":              { headerBg: "bg-purple-50",  text: "text-purple-700",  icon: "🏥" },
  "Anesthesia":                 { headerBg: "bg-indigo-50",  text: "text-indigo-700",  icon: "💉" },
  "Diagnostics & Imaging":      { headerBg: "bg-amber-50",   text: "text-amber-700",   icon: "🔬" },
  "Medical Devices & Implants": { headerBg: "bg-slate-100",  text: "text-slate-700",   icon: "🔩" },
  "Medications & Consumables":  { headerBg: "bg-green-50",   text: "text-green-700",   icon: "💊" },
  "Rehabilitation":             { headerBg: "bg-violet-50",  text: "text-violet-700",  icon: "🏋️" },
  "Follow-up Care":             { headerBg: "bg-rose-50",    text: "text-rose-700",    icon: "📅" },
};
const catCfg = (cat: string) =>
  CATEGORY_CONFIG[cat] ?? { headerBg: "bg-neutral-50", text: "text-neutral-600", icon: "📋" };

const CATEGORY_ORDER = [
  "Professional Services", "Facility & OR", "Anesthesia",
  "Diagnostics & Imaging", "Medical Devices & Implants",
  "Medications & Consumables", "Rehabilitation", "Follow-up Care",
];

const COINSURANCE_OPTIONS = [
  { label: "Insurance covers most", sublabel: "~20% on me", value: 0.20 },
  { label: "We split it",           sublabel: "~30% on me", value: 0.30 },
  { label: "Paying myself",         sublabel: "100% on me", value: 1.0  },
];

const SUGGESTIONS: { label: string; query: string }[] = [
  { label: "Non-union ankle fracture", query: "I have a non-union ankle fracture and need surgery" },
  { label: "Torn ACL",                 query: "I tore my ACL and need reconstruction surgery" },
  { label: "Gallstones",              query: "I have gallstones and my doctor recommends gallbladder removal" },
  { label: "Knee replacement",        query: "Total knee replacement surgery" },
  { label: "Herniated disc",          query: "I have a herniated disc causing leg pain and need surgery" },
  { label: "Hip replacement",         query: "Total hip replacement" },
  { label: "Colonoscopy",             query: "Routine colonoscopy screening" },
  { label: "Rotator cuff tear",       query: "I have a full thickness rotator cuff tear needing repair" },
  { label: "Appendectomy",            query: "Appendectomy for appendicitis" },
  { label: "Cataract surgery",        query: "Cataract surgery on my right eye" },
];

const AI_LOADING_PHASES = [
  "Assessing your condition and identifying procedure…",
  "Researching clinical guidelines and surgical components…",
  "Matching components to chargemaster data…",
  "Calculating your estimated costs…",
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onBreakdownReady?: (breakdown: ProcedureBreakdown) => void;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AiProcedureSearch({ onBreakdownReady }: Props) {
  const [query, setQuery]               = useState("");
  const [phase, setPhase]               = useState<Phase>("idle");
  const [dbMatches, setDbMatches]       = useState<ProcedureSearchResult[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<ProcedureSearchResult | null>(null);
  const [breakdown, setBreakdown]       = useState<ProcedureBreakdown | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError]               = useState<string | null>(null);
  const [coinsurance, setCoinsurance]   = useState(0.20);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [expandedIds, setExpandedIds]   = useState<Set<string>>(new Set());
  const [hospitalPrices, setHospitalPrices] = useState<HospitalComparisonEntry[]>([]);
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [elapsed, setElapsed]           = useState(0);
  const [progress, setProgress]         = useState(0);

  // Insurance — managed internally, shown inline after search
  const [insurance, setInsurance]       = useState<InsuranceSelection | null>(null);
  const [showInsurancePicker, setShowInsurancePicker] = useState(false);
  const [insurancePickerExpanded, setInsurancePickerExpanded] = useState(false);

  // Custom plan details — overrides flat coinsurance when set
  const [planDetails, setPlanDetails]   = useState<PlanDetails | null>(null);
  const [showPlanInput, setShowPlanInput] = useState(false);

  // Plan comparison mode toggle
  const [showComparison, setShowComparison] = useState(false);

  // Background AI status — separate from phase so it never blocks hospital prices
  const [aiStatus, setAiStatus] = useState<"idle" | "loading" | "done" | "error">("idle");


  const inputRef      = useRef<HTMLInputElement>(null);
  const phaseTimers   = useRef<ReturnType<typeof setTimeout>[]>([]);
  const elapsedTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef      = useRef<AbortController | null>(null);
  const searchStartRef = useRef<number>(0);

  useEffect(() => () => {
    phaseTimers.current.forEach(clearTimeout);
    if (elapsedTimer.current)  clearInterval(elapsedTimer.current);
    if (progressTimer.current) clearInterval(progressTimer.current);
    abortRef.current?.abort();
  }, []);

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
    setDbMatches([]);
    setSelectedMatch(null);
    setBreakdown(null);
    setStreamingText("");
    setError(null);
    setShowBreakdown(false);
    setExpandedIds(new Set());
    setHospitalPrices([]);
    setShowInsurancePicker(false);
    setInsurancePickerExpanded(false);
    setPlanDetails(null);
    setShowPlanInput(false);
    setShowComparison(false);
    setAiStatus("idle");
    phaseTimers.current.forEach(clearTimeout);
    if (elapsedTimer.current)  { clearInterval(elapsedTimer.current);  elapsedTimer.current  = null; }
    if (progressTimer.current) { clearInterval(progressTimer.current); progressTimer.current = null; }
  };

  // ── Phase 1: fast DB search ────────────────────────────────────────────────

  const searchDb = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    reset();
    searchStartRef.current = Date.now();
    setQuery(trimmed);
    setPhase("db-searching");
    setError(null);
    // Show insurance picker immediately as soon as search starts
    setShowInsurancePicker(true);
    setInsurancePickerExpanded(true);

    try {
      const res  = await fetch("/api/procedure-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data: ProcedureSearchResponse = await res.json();

      if (!res.ok || data.noData || !data.procedures.length) {
        dbMatchesRef.current = [];
        setPhase("no-data");

        // Track search with no DB results (AI fallback)
        window.gtag?.("event", "procedure_search", {
          search_term: trimmed,
          result_count: 0,
          search_duration_ms: Date.now() - searchStartRef.current,
          source: "ai_fallback",
        });

        // No DB data — AI is the only source, show full loading UI
        void runAiBreakdown(trimmed, insurance);
      } else {
        dbMatchesRef.current = data.procedures;
        setDbMatches(data.procedures);
        setSelectedMatch(data.procedures[0]);
        setPhase("db-results");

        // Track successful procedure search
        window.gtag?.("event", "procedure_search", {
          search_term: trimmed,
          cpt_code: data.procedures[0]?.cptCode ?? "",
          result_count: data.procedures.length,
          search_duration_ms: Date.now() - searchStartRef.current,
          source: "database",
        });

        // DB data found — hospital prices show immediately, AI enriches in background
        void runAiBackground(trimmed, insurance);
      }
    } catch {
      dbMatchesRef.current = [];
      setPhase("no-data");
      void runAiBreakdown(trimmed, insurance);
    }
  };

  // ── AI loading animation ───────────────────────────────────────────────────

  const startAiPhases = useCallback(() => {
    phaseTimers.current.forEach(clearTimeout);
    phaseTimers.current = [];
    setLoadingPhase(0);
    setElapsed(0);
    setProgress(0);

    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    elapsedTimer.current = setInterval(() => setElapsed((s) => s + 1), 1000);

    if (progressTimer.current) clearInterval(progressTimer.current);
    const start = Date.now();
    progressTimer.current = setInterval(() => {
      const t = (Date.now() - start) / 12000;
      setProgress(Math.min(90, Math.round(90 * (1 - Math.exp(-3 * t)))));
    }, 200);

    [3500, 7000, 10500].forEach((delay, i) => {
      const t = setTimeout(() => setLoadingPhase(i + 1), delay);
      phaseTimers.current.push(t);
    });
  }, []);

  // Keep a ref so stale closures in runAiBreakdown can read current dbMatches
  const dbMatchesRef = useRef<ProcedureSearchResult[]>([]);

  // ── Background AI — runs silently when DB data exists, never blocks hospital prices ──

  const runAiBackground = async (q: string, ins: InsuranceSelection | null) => {
    const trimmed = q.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const isActive = () => abortRef.current === controller;

    setAiStatus("loading");
    setBreakdown(null);
    setExpandedIds(new Set());

    const timeoutId = setTimeout(() => controller.abort(), 90_000);
    let got = false;

    try {
      const res = await fetch("/api/procedure-breakdown", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: trimmed,
          insurerName: ins?.insurer  ?? null,
          payerType:   ins?.payerType ?? null,
          coinsurance,
        }),
        signal: controller.signal,
      });
      if (!res.body) return;

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent === "result") {
            try {
              const parsed = JSON.parse(line.slice(6).trim());
              if (isActive()) {
                got = true;
                setBreakdown(parsed as ProcedureBreakdown);
                onBreakdownReady?.(parsed as ProcedureBreakdown);
                setAiStatus("done");
                setInsurancePickerExpanded(false);
              }
            } catch { /* ignore malformed */ }
          }
        }
      }

      if (!got && isActive()) setAiStatus("error");
    } catch {
      if (isActive()) setAiStatus("error");
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // ── Phase 2: AI breakdown (primary — only used when no DB data) ──────────

  const runAiBreakdown = async (q: string, ins: InsuranceSelection | null) => {
    const trimmed = q.trim();
    if (!trimmed) return;

    // Abort any in-flight AI call
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Helper: is this still the active call? (guards against stale finally/catch)
    const isActive = () => abortRef.current === controller;

    setPhase("ai-loading");
    setStreamingText("");
    setBreakdown(null);
    setShowBreakdown(false);
    setExpandedIds(new Set());
    setHospitalPrices([]);
    startAiPhases();

    // Client-side timeout: abort after 90s so the UI never hangs indefinitely
    const timeoutId = setTimeout(() => controller.abort(), 90_000);

    let resultReceived = false;

    try {
      const res = await fetch("/api/procedure-breakdown", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: trimmed,
          insurerName: ins?.insurer  ?? null,
          payerType:   ins?.payerType ?? null,
          coinsurance,
        }),
        signal: controller.signal,
      });
      if (!res.body) throw new Error("No response body");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6).trim());
              if (currentEvent === "chunk")  setStreamingText((p) => p + (parsed.text as string));
              if (currentEvent === "result") {
                resultReceived = true;
                setStreamingText("");
                setBreakdown(parsed as ProcedureBreakdown);
                onBreakdownReady?.(parsed as ProcedureBreakdown);
                setPhase("ai-results");
                setInsurancePickerExpanded(false);
              }
              if (currentEvent === "error") throw new Error((parsed as { message: string }).message);
            } catch (e) {
              if (currentEvent === "error") throw e;
            }
          }
        }
      }

      // Stream closed without sending a result (server timeout, crash, etc.)
      if (!resultReceived && isActive()) {
        setError("Analysis timed out — please try again.");
        setPhase(dbMatchesRef.current.length ? "db-results" : "no-data");
      }
    } catch (e) {
      // AbortError = intentional cancel (insurance change or client timeout)
      if (e instanceof Error && e.name === "AbortError") {
        if (isActive()) {
          // This was our own 55s timeout, not a user-triggered abort
          setError("Analysis timed out — please try again.");
          setPhase(dbMatchesRef.current.length ? "db-results" : "no-data");
        }
        return;
      }
      if (isActive()) {
        setError(e instanceof Error ? e.message : "Failed to generate breakdown");
        setPhase(dbMatchesRef.current.length ? "db-results" : "no-data");
      }
    } finally {
      clearTimeout(timeoutId);
      // Only clean up timers if this is still the active call.
      // If not, a newer call already took ownership of elapsedTimer/progressTimer.
      if (isActive()) {
        setProgress(100);
        setTimeout(() => {
          phaseTimers.current.forEach(clearTimeout);
          if (elapsedTimer.current)  { clearInterval(elapsedTimer.current);  elapsedTimer.current  = null; }
          if (progressTimer.current) { clearInterval(progressTimer.current); progressTimer.current = null; }
        }, 300);
      }
    }
  };

  // ── Insurance change handler ───────────────────────────────────────────────

  const handleInsuranceChange = (ins: InsuranceSelection | null) => {
    setInsurance(ins);

    // Track insurance selection
    if (ins) {
      window.gtag?.("event", "insurance_selected", {
        insurer_name: ins.insurer ?? "none",
        plan_type: ins.payerType ?? "unknown",
      });
    }

    if (!query.trim() || phase === "idle" || phase === "db-searching") return;
    // DB-results: HospitalCostComparison re-fetches automatically via prop change.
    // Re-run AI in background to update the itemized breakdown with insurer-specific rates.
    if (phase === "db-results") {
      void runAiBackground(query, ins);
    } else {
      // no-data / ai-* — AI is the only source, re-run full primary flow
      void runAiBreakdown(query, ins);
    }
  };

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const showInsurance = !insurance || insurance.payerType !== "cash";
  const insuranceLabel = insurance ? insurance.displayLabel : "Typical insurance";

  const grouped = breakdown
    ? breakdown.components.reduce<Record<string, BreakdownComponent[]>>((acc, c) => {
        (acc[c.category] ??= []).push(c); return acc;
      }, {})
    : {};
  const orderedCategories = [
    ...CATEGORY_ORDER.filter((c) => grouped[c]),
    ...Object.keys(grouped).filter((c) => !CATEGORY_ORDER.includes(c)),
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Search bar ── */}
      <div className={cn(
        "flex items-center gap-3 rounded-2xl border-2 bg-white px-5 py-4 shadow-md transition-all",
        phase === "db-searching" || phase === "ai-loading"
          ? "border-violet-400 ring-4 ring-violet-100"
          : "border-gray-200 focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100 hover:border-violet-300",
      )}>
        {phase === "db-searching" || phase === "ai-loading"
          ? <Loader2 className="size-5 shrink-0 animate-spin text-violet-500" />
          : <Search className="size-5 shrink-0 text-gray-400" />
        }
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchDb(query)}
          placeholder="Describe your condition or procedure — e.g. 'non-union ankle fracture', 'torn ACL', 'colonoscopy'…"
          className="flex-1 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
          disabled={phase === "db-searching"}
        />
        <button
          onClick={() => searchDb(query)}
          disabled={phase === "db-searching" || !query.trim()}
          className="shrink-0 rounded-xl bg-violet-700 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {phase === "db-searching" ? "Searching…" : "Search"}
        </button>
      </div>

      {/* ── Suggestions (idle only) ── */}
      {phase === "idle" && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              onClick={() => searchDb(s.query)}
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Inline insurance picker (appears immediately on search) ── */}
      {showInsurancePicker && phase !== "idle" && (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <button
            onClick={() => setInsurancePickerExpanded((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-neutral-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <ShieldCheck className={cn("size-5 shrink-0", insurance ? "text-violet-600" : "text-neutral-300")} />
              <div>
                {insurance ? (
                  <>
                    <p className="text-xs text-neutral-400 font-medium">Insurance selected</p>
                    <p className="text-sm font-semibold text-violet-700">{insurance.displayLabel}</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-violet-700">Add your insurance while we work</p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {phase === "ai-loading"
                        ? "AI is analyzing your case — add insurance to see what you'd actually pay"
                        : "We'll update your costs once you select a plan"}
                    </p>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {insurance && (
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); handleInsuranceChange(null); }}
                  className="flex items-center gap-1 rounded-full border border-neutral-200 px-2.5 py-0.5 text-xs text-neutral-400 hover:text-red-500 hover:border-red-200"
                >
                  <X className="size-3" /> Remove
                </span>
              )}
              {!insurance && (
                <span className="rounded-full bg-violet-600 px-3 py-1 text-xs font-semibold text-white">
                  Add insurance
                </span>
              )}
              {insurancePickerExpanded
                ? <ChevronUp className="size-4 text-neutral-400" />
                : <ChevronDown className="size-4 text-neutral-400" />
              }
            </div>
          </button>

          {insurancePickerExpanded && (
            <div className="border-t border-neutral-100 px-5 pb-5 pt-4">
              <InsuranceSelector
                value={insurance}
                onChange={handleInsuranceChange}
                onDone={() => setInsurancePickerExpanded(false)}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ── DB searching skeleton ── */}
      {phase === "db-searching" && (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 bg-slate-800 px-6 py-4">
            <div className="flex items-center gap-2">
              <DatabaseZap className="size-4 text-violet-400 animate-pulse" />
              <p className="text-sm font-semibold text-white">Searching chargemaster files…</p>
            </div>
            <p className="mt-1 text-xs text-white/40">Looking up real hospital prices for your procedure</p>
          </div>
          <div className="px-6 py-5 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl bg-neutral-100" style={{ opacity: 1 - i * 0.25 }} />
            ))}
          </div>
        </div>
      )}

      {/* ── No data state — AI already started ── */}
      {phase === "no-data" && (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex flex-col items-center gap-3 px-8 py-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-neutral-100">
              <FileX className="size-7 text-neutral-400" />
            </div>
            <div>
              <p className="text-base font-bold text-neutral-800">No exact chargemaster match</p>
              <p className="mt-1 max-w-sm text-sm text-neutral-500 leading-relaxed">
                Our uploaded hospital files don&apos;t have a direct match for &ldquo;{query}&rdquo;.
                AI is identifying the procedure and its components to check for available pricing data.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Results — DB match path ── */}
      {selectedMatch && phase !== "idle" && phase !== "db-searching" && (
        <>

          {/* Coinsurance selector */}
          {showInsurance && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-xs font-medium text-neutral-500 shrink-0">How much does your plan cover?</p>
                <div className="flex flex-wrap gap-1.5 ml-auto">
                  {planDetails ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500 bg-violet-600 px-3 py-1 text-xs font-semibold text-white">
                        <Calculator className="size-3" /> Using your plan details
                      </span>
                      <button
                        onClick={() => { setPlanDetails(null); setShowPlanInput(false); }}
                        className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-400 hover:text-red-500 hover:border-red-200 transition-colors"
                      >
                        <X className="size-3" /> Clear
                      </button>
                    </div>
                  ) : (
                    <>
                      {COINSURANCE_OPTIONS.map((opt) => (
                        <button
                          key={opt.label}
                          onClick={() => { setCoinsurance(opt.value); setShowPlanInput(false); }}
                          className={cn(
                            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all",
                            coinsurance === opt.value && !showPlanInput
                              ? "border-violet-500 bg-violet-600 text-white"
                              : "border-neutral-200 bg-white text-neutral-600 hover:border-violet-300",
                          )}
                        >
                          {opt.label}
                          <span className={cn("font-normal", coinsurance === opt.value && !showPlanInput ? "text-violet-200" : "text-neutral-400")}>
                            {opt.sublabel}
                          </span>
                        </button>
                      ))}
                      <button
                        onClick={() => setShowPlanInput((v) => !v)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all",
                          showPlanInput
                            ? "border-violet-500 bg-violet-600 text-white"
                            : "border-neutral-200 bg-white text-neutral-600 hover:border-violet-300",
                        )}
                      >
                        <Calculator className="size-3" />
                        Enter my plan details
                      </button>
                    </>
                  )}
                </div>
              </div>
              {showPlanInput && !planDetails && (
                <CustomPlanInput
                  planDetails={planDetails}
                  onChange={(plan) => { setPlanDetails(plan); if (plan) setShowPlanInput(false); }}
                  defaultCoinsurance={Math.round(coinsurance * 100)}
                />
              )}
            </div>
          )}

          {/* Background AI status indicator */}
          {aiStatus === "loading" && (
            <div className="flex items-center gap-2 rounded-xl border border-violet-100 bg-violet-50 px-4 py-2.5">
              <Loader2 className="size-3.5 shrink-0 animate-spin text-violet-500" />
              <p className="text-xs text-violet-700">Building itemized cost breakdown in background…</p>
            </div>
          )}

          {/* Hospital comparison — loads immediately, upgrades silently when AI breakdown arrives */}
          {showComparison ? (
            <PlanComparisonMode
              cptCode={breakdown?.cptCode ?? selectedMatch.cptCode}
              procedureName={breakdown?.procedureName ?? selectedMatch.name}
              coinsurance={coinsurance}
              allCptCodes={breakdown ? [breakdown.cptCode ?? selectedMatch.cptCode] : undefined}
            />
          ) : (
            <HospitalCostComparison
              cptCode={breakdown?.cptCode ?? selectedMatch.cptCode}
              procedureName={breakdown?.procedureName ?? selectedMatch.name}
              insurance={insurance}
              coinsurance={coinsurance}
              planDetails={planDetails}
              onPricesLoaded={setHospitalPrices}
            />
          )}

          {/* Compare plans toggle */}
          <button
            onClick={() => setShowComparison((v) => !v)}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all",
              showComparison
                ? "border-violet-500 bg-violet-600 text-white hover:bg-violet-700"
                : "border-neutral-200 bg-white text-neutral-600 hover:border-violet-300 hover:text-violet-700",
            )}
          >
            <ArrowLeftRight className="size-4" />
            {showComparison ? "Back to single plan view" : "Compare insurance plans"}
          </button>

          {/* Physician recommendations */}
          <PhysicianRecommendations
            procedureName={breakdown?.procedureName ?? selectedMatch.name}
            cptCode={breakdown?.cptCode ?? selectedMatch.cptCode}
            insurance={insurance}
            hospitalPrices={hospitalPrices}
          />
        </>
      )}

      {/* ── AI loading ── */}
      {phase === "ai-loading" && (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 bg-slate-800 px-6 py-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-violet-400 shrink-0" />
                <p className="text-sm font-semibold text-white">
                  {streamingText ? "Building your cost estimate…" : AI_LOADING_PHASES[loadingPhase]}
                </p>
              </div>
              <span className="text-xs text-white/40 tabular-nums">{elapsed}s</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-violet-400 transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            {streamingText ? (
              <div className="mt-3 max-h-28 overflow-hidden rounded-lg bg-white/5 px-3 py-2">
                <p className="font-mono text-xs text-white/60 leading-relaxed line-clamp-5 break-all">
                  {streamingText}
                  <span className="inline-block w-1.5 h-3 bg-violet-400 animate-pulse ml-0.5 align-middle" />
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-white/40">
                {insurance
                  ? `Applying ${insurance.displayLabel} rates to your estimate…`
                  : "Add insurance above to see what you'd actually pay — we'll update instantly when you do"}
              </p>
            )}
          </div>
          <div className="px-6 py-5 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={cn("flex items-center gap-4 rounded-xl border p-4", i === 0 ? "border-green-200 bg-green-50/50" : "border-neutral-100 bg-neutral-50")}
                style={{ opacity: 1 - i * 0.12 }}
              >
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

      {/* ── AI-only results (no-data path) — hospital comparison + physicians ── */}
      {phase === "ai-results" && breakdown && !selectedMatch && (
        <>
          {showComparison ? (
            <PlanComparisonMode
              cptCode={breakdown.cptCode ?? ""}
              procedureName={breakdown.procedureName}
              coinsurance={coinsurance}
            />
          ) : (
            <HospitalCostComparison
              cptCode={breakdown.cptCode ?? ""}
              procedureName={breakdown.procedureName}
              insurance={insurance}
              coinsurance={coinsurance}
              planDetails={planDetails}
              onPricesLoaded={setHospitalPrices}
            />
          )}

          {/* Compare plans toggle */}
          <button
            onClick={() => setShowComparison((v) => !v)}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all",
              showComparison
                ? "border-violet-500 bg-violet-600 text-white hover:bg-violet-700"
                : "border-neutral-200 bg-white text-neutral-600 hover:border-violet-300 hover:text-violet-700",
            )}
          >
            <ArrowLeftRight className="size-4" />
            {showComparison ? "Back to single plan view" : "Compare insurance plans"}
          </button>

          <PhysicianRecommendations
            procedureName={breakdown.procedureName}
            cptCode={breakdown.cptCode ?? null}
            insurance={insurance}
            hospitalPrices={hospitalPrices}
          />
        </>
      )}

      {/* ── AI breakdown card — appears below hospital prices in both paths ── */}
      {breakdown && (
        <>
          {/* Procedure identification card */}
          <div className={cn(
            "rounded-2xl border px-5 py-4",
            breakdown.conditionAnalysis?.isConditionDescription
              ? "border-violet-200 bg-gradient-to-r from-violet-700 to-indigo-700"
              : "border-neutral-200 bg-slate-800",
          )}>
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <Stethoscope className="size-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                {breakdown.conditionAnalysis?.isConditionDescription && (
                  <p className="text-xs font-semibold uppercase tracking-wider text-violet-200 mb-0.5">
                    Based on what you described, you likely need:
                  </p>
                )}
                <div className="flex items-baseline gap-3 flex-wrap">
                  <p className="text-lg font-bold text-white">{breakdown.procedureName}</p>
                  {breakdown.cptCode && (
                    <span className="inline-flex items-center rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-xs font-semibold text-violet-200">
                      CPT {breakdown.cptCode}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-white/80 leading-relaxed max-w-2xl">
                  {breakdown.conditionAnalysis?.isConditionDescription
                    ? breakdown.conditionAnalysis.reasoning
                    : breakdown.description}
                </p>
                {breakdown.conditionAnalysis?.alternatives?.length ? (
                  <ProcedureAlternatives
                    primaryProcedure={breakdown.procedureName}
                    primaryCptCode={breakdown.cptCode}
                    alternatives={breakdown.conditionAnalysis.alternatives as AlternativeProcedure[]}
                    onSelectAlternative={(name) => {
                      setQuery(name);
                      searchDb(name);
                    }}
                  />
                ) : null}
              </div>
              <button
                onClick={() => { reset(); setQuery(""); inputRef.current?.focus(); }}
                className="shrink-0 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/20"
              >
                Search again
              </button>
            </div>
          </div>

          {/* Coinsurance selector */}
          {showInsurance && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-xs font-medium text-neutral-500 shrink-0">How much does your plan cover?</p>
                <div className="flex flex-wrap gap-1.5 ml-auto">
                  {planDetails ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500 bg-violet-600 px-3 py-1 text-xs font-semibold text-white">
                        <Calculator className="size-3" /> Using your plan details
                      </span>
                      <button
                        onClick={() => { setPlanDetails(null); setShowPlanInput(false); }}
                        className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs text-neutral-400 hover:text-red-500 hover:border-red-200 transition-colors"
                      >
                        <X className="size-3" /> Clear
                      </button>
                    </div>
                  ) : (
                    <>
                      {COINSURANCE_OPTIONS.map((opt) => (
                        <button
                          key={opt.label}
                          onClick={() => { setCoinsurance(opt.value); setShowPlanInput(false); }}
                          className={cn(
                            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all",
                            coinsurance === opt.value && !showPlanInput
                              ? "border-violet-500 bg-violet-600 text-white"
                              : "border-neutral-200 bg-white text-neutral-600 hover:border-violet-300",
                          )}
                        >
                          {opt.label}
                          <span className={cn("font-normal", coinsurance === opt.value && !showPlanInput ? "text-violet-200" : "text-neutral-400")}>
                            {opt.sublabel}
                          </span>
                        </button>
                      ))}
                      <button
                        onClick={() => setShowPlanInput((v) => !v)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all",
                          showPlanInput
                            ? "border-violet-500 bg-violet-600 text-white"
                            : "border-neutral-200 bg-white text-neutral-600 hover:border-violet-300",
                        )}
                      >
                        <Calculator className="size-3" />
                        Enter my plan details
                      </button>
                    </>
                  )}
                </div>
                <p className="w-full text-xs text-neutral-400 mt-0.5">
                  Not sure? Most employer plans are &ldquo;Insurance covers most.&rdquo;
                </p>
              </div>
              {showPlanInput && !planDetails && (
                <CustomPlanInput
                  planDetails={planDetails}
                  onChange={(plan) => { setPlanDetails(plan); if (plan) setShowPlanInput(false); }}
                  defaultCoinsurance={Math.round(coinsurance * 100)}
                />
              )}
            </div>
          )}

          {/* ── Bill Summary Card — only show totals when data is sufficient ── */}
          <div className="overflow-hidden rounded-2xl border-2 border-violet-200 bg-white shadow-md">

            {/* Total header */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Receipt className="size-4 text-violet-400" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
                      {(breakdown.dataCompleteness ?? 0) >= 0.5 ? "Your Estimated Bill" : "Procedure Breakdown"}
                    </p>
                    {breakdown.dataCompleteness != null && breakdown.dataCompleteness >= 0.5 && (
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        breakdown.dataCompleteness >= 0.7
                          ? "bg-green-500/20 text-green-300"
                          : "bg-amber-500/20 text-amber-300"
                      )}>
                        {Math.round(breakdown.dataCompleteness * 100)}% real data
                      </span>
                    )}
                  </div>

                  {(breakdown.dataCompleteness ?? 0) < 0.5 ? (
                    <>
                      <p className="text-xl font-bold text-white/70">
                        Insufficient chargemaster data for a reliable total
                      </p>
                      <p className="text-sm text-white/50 mt-1">
                        Only {Math.round((breakdown.dataCompleteness ?? 0) * 100)}% of procedure components have real hospital pricing.
                        The hospital comparison table above shows actual per-hospital prices — use that for the most accurate estimates.
                      </p>
                      <p className="text-xs text-white/40 mt-2">
                        The itemized breakdown below shows which components have real data and which are missing.
                      </p>
                    </>
                  ) : showInsurance && breakdown.insuranceTotalLow != null ? (
                    <>
                      <p className="text-3xl font-black text-white">
                        {fmtRange(
                          Math.round(breakdown.insuranceTotalLow  * coinsurance),
                          Math.round((breakdown.insuranceTotalHigh ?? 0) * coinsurance),
                        )}
                      </p>
                      <p className="text-sm text-white/60 mt-1">
                        your estimated out-of-pocket cost
                        {insurance ? ` with ${insurance.displayLabel}` : ""}
                        {breakdown.dataCompleteness != null && breakdown.dataCompleteness < 1
                          ? ` (based on ${Math.round(breakdown.dataCompleteness * 100)}% of components with real data)`
                          : ""}
                      </p>
                    </>
                  ) : breakdown.cashTotalLow > 0 ? (
                    <>
                      <p className="text-3xl font-black text-white">
                        {fmtRange(breakdown.cashTotalLow, breakdown.cashTotalHigh)}
                      </p>
                      <p className="text-sm text-white/60 mt-1">
                        {insurance?.payerType === "cash" ? "cash / self-pay price" : "cash price from chargemaster data — add insurance for personalized pricing"}
                        {breakdown.dataCompleteness != null && breakdown.dataCompleteness < 1
                          ? ` (${Math.round(breakdown.dataCompleteness * 100)}% of components have data)`
                          : ""}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xl font-bold text-white/70">
                        Limited pricing data
                      </p>
                      <p className="text-sm text-white/50 mt-1">
                        Only partial chargemaster data is available. The hospital comparison table above is your best source for pricing.
                      </p>
                    </>
                  )}
                </div>

                {!insurance && (
                  <button
                    onClick={() => { setInsurancePickerExpanded(true); }}
                    className="shrink-0 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/20 transition-colors"
                  >
                    Add insurance →
                  </button>
                )}
              </div>
            </div>

            {/* Three-column price summary — only when data is sufficient */}
            {(breakdown.dataCompleteness ?? 0) >= 0.5 && (
              <div className={cn(
                "grid divide-x divide-neutral-100 border-b border-neutral-100",
                showInsurance ? "grid-cols-3" : "grid-cols-2"
              )}>
                <div className="px-5 py-4">
                  <p className="text-xs text-neutral-400 mb-1">List price (chargemaster)</p>
                  <p className="font-mono text-sm font-bold text-neutral-600">
                    {fmtRange(breakdown.chargemasterTotalLow, breakdown.chargemasterTotalHigh)}
                  </p>
                </div>
                {showInsurance && (
                  <div className="px-5 py-4">
                    <p className="text-xs text-neutral-400 mb-1">Insurance pays</p>
                    <p className="font-mono text-sm font-bold text-violet-700">
                      {breakdown.insuranceTotalLow != null
                        ? fmtRange(
                            Math.round(breakdown.insuranceTotalLow  * (1 - coinsurance)),
                            Math.round((breakdown.insuranceTotalHigh ?? 0) * (1 - coinsurance)),
                          )
                        : <span className="text-neutral-300">Add insurance above</span>
                      }
                    </p>
                  </div>
                )}
                <div className="px-5 py-4">
                  <p className="text-xs text-neutral-400 mb-1">Without insurance</p>
                  <p className="font-mono text-sm font-bold text-neutral-600">
                    {fmtRange(breakdown.cashTotalLow, breakdown.cashTotalHigh)}
                  </p>
                </div>
              </div>
            )}

            {/* Insurance covers callout — only when data is sufficient */}
            {showInsurance && breakdown.insuranceTotalLow != null && coinsurance < 1 && (breakdown.dataCompleteness ?? 0) >= 0.5 && (
              <div className="mx-5 my-4 flex items-center justify-between gap-4 rounded-xl border border-violet-200 bg-violet-50 px-5 py-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Your insurance picks up</p>
                  <p className="text-xl font-bold text-violet-800 mt-0.5">
                    {fmtRange(
                      Math.round((breakdown.insuranceTotalLow  ?? 0) * (1 - coinsurance)),
                      Math.round((breakdown.insuranceTotalHigh ?? 0) * (1 - coinsurance)),
                    )}
                  </p>
                </div>
                <p className="text-sm text-violet-600 text-right">
                  {Math.round((1 - coinsurance) * 100)}% covered
                  {breakdown.insurerName ? ` by ${breakdown.insurerName}` : ""}
                </p>
              </div>
            )}

            {/* Expand itemized button */}
            <button
              onClick={() => setShowBreakdown((v) => !v)}
              className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-neutral-50 border-t border-neutral-100"
            >
              <div className="flex items-center gap-3">
                <ListCollapse className="size-4 text-neutral-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-neutral-800">
                    {showBreakdown ? "Hide" : "See"} itemized breakdown
                  </p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {breakdown.components.length} line items — surgeon, anesthesia, implants, medications, follow-up
                  </p>
                </div>
              </div>
              {showBreakdown
                ? <ChevronUp className="size-4 shrink-0 text-neutral-400" />
                : <ChevronDown className="size-4 shrink-0 text-neutral-400" />
              }
            </button>

            {/* Expandable itemized table */}
            {showBreakdown && (
              <div className="border-t border-neutral-100">
                {/* Chargemaster explainer */}
                <div className="border-b border-amber-100 bg-amber-50 px-6 py-3">
                  <p className="text-xs text-amber-800 leading-relaxed">
                    <span className="font-semibold">What is the &ldquo;List price&rdquo;?</span>{" "}
                    The hospital&apos;s chargemaster sticker price — almost nobody pays this.
                    Insurance negotiates it down 60–80%. The number that matters is <span className="font-semibold">Your cost</span>.
                  </p>
                </div>

                {/* Column headers */}
                <div
                  className="grid items-center gap-0 border-b border-neutral-100 bg-neutral-50 px-6 py-2.5"
                  style={{ gridTemplateColumns: showInsurance ? "1fr 130px 130px 120px 120px" : "1fr 140px 140px" }}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">What&apos;s included</span>
                  <span className="flex items-center justify-end gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">List price <GlossaryTip glossaryKey="chargemaster" side="top" /></span>
                  {showInsurance && <span className="flex items-center justify-end gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Insurance pays <GlossaryTip glossaryKey="negotiated" side="top" /></span>}
                  {showInsurance && <span className="flex items-center justify-end gap-1 text-xs font-semibold uppercase tracking-wide text-violet-600">Your cost <GlossaryTip glossaryKey="yourCost" side="top" /></span>}
                  <span className="flex items-center justify-end gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">No insurance <GlossaryTip glossaryKey="cashPrice" side="top" /></span>
                </div>

                {/* Category rows */}
                <div className="divide-y divide-neutral-50">
                  {orderedCategories.map((category) => {
                    const components = grouped[category];
                    const cfg = catCfg(category);
                    const totals = components.reduce(
                      (acc, c) => ({
                        cmLo:  acc.cmLo  + (c.chargemasterLow ?? 0),
                        cmHi:  acc.cmHi  + (c.chargemasterHigh ?? 0),
                        insLo: acc.insLo + (c.insuranceLow  ?? 0),
                        insHi: acc.insHi + (c.insuranceHigh ?? 0),
                        cashLo: acc.cashLo + (c.cashLow ?? 0),
                        cashHi: acc.cashHi + (c.cashHigh ?? 0),
                      }),
                      { cmLo: 0, cmHi: 0, insLo: 0, insHi: 0, cashLo: 0, cashHi: 0 },
                    );
                    const hasIns = components.some((c) => c.insuranceLow != null);
                    const hasCm = components.some((c) => c.chargemasterLow != null);
                    const hasCash = components.some((c) => c.cashLow != null);

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
                          <span className={cn("text-right text-xs font-semibold", cfg.text)}>{hasCm ? fmtRange(totals.cmLo, totals.cmHi) : "—"}</span>
                          {showInsurance && <span className={cn("text-right text-xs font-semibold", cfg.text)}>{hasIns ? fmtRange(totals.insLo, totals.insHi) : "—"}</span>}
                          {showInsurance && <span className={cn("text-right text-xs font-semibold", cfg.text)}>{hasIns ? fmtRange(Math.round(totals.insLo * coinsurance), Math.round(totals.insHi * coinsurance)) : "—"}</span>}
                          <span className={cn("text-right text-xs font-semibold", cfg.text)}>{hasCash ? fmtRange(totals.cashLo, totals.cashHi) : "—"}</span>
                        </div>

                        {/* Component rows */}
                        {components.map((comp) => {
                          const expanded = expandedIds.has(comp.id);
                          const hasDetail = !!(comp.description || comp.notes);
                          const yourLo = comp.insuranceLow  != null ? Math.round(comp.insuranceLow  * coinsurance) : null;
                          const yourHi = comp.insuranceHigh != null ? Math.round(comp.insuranceHigh * coinsurance) : null;

                          return (
                            <div key={comp.id} className="border-b border-neutral-50 last:border-b-0">
                              <div
                                className={cn(
                                  "grid items-center gap-0 px-6 py-3 transition-colors",
                                  hasDetail && "cursor-pointer hover:bg-neutral-50",
                                  comp.dataSource === "real" && "bg-green-50/40",
                                )}
                                style={{ gridTemplateColumns: showInsurance ? "1fr 130px 130px 120px 120px" : "1fr 140px 140px" }}
                                onClick={() => hasDetail && toggleExpand(comp.id)}
                              >
                                <div className="min-w-0 pr-4">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-sm font-medium text-neutral-900">{comp.name}</span>
                                    {comp.dataSource === "real" && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                                        <CircleDot className="size-2.5" /> Real data
                                      </span>
                                    )}
                                    {comp.dataSource === "unavailable" && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-500">
                                        <FileX className="size-2.5" /> No data
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
                                <div className="text-right">{comp.chargemasterLow != null ? <span className="font-mono text-sm text-neutral-500">{fmtRange(comp.chargemasterLow, comp.chargemasterHigh)}</span> : <span className="text-xs text-neutral-300 italic">No data</span>}</div>
                                {showInsurance && <div className="text-right">{comp.insuranceLow != null ? <span className="font-mono text-sm font-semibold text-violet-700">{fmtRange(comp.insuranceLow, comp.insuranceHigh)}</span> : <span className="text-xs text-neutral-300 italic">No data</span>}</div>}
                                {showInsurance && <div className="text-right">{yourLo != null ? <span className="font-mono text-sm font-bold text-neutral-900">{fmtRange(yourLo, yourHi)}</span> : <span className="text-xs text-neutral-300 italic">No data</span>}</div>}
                                <div className="text-right">{comp.cashLow != null ? <span className="font-mono text-sm text-neutral-500">{fmtRange(comp.cashLow, comp.cashHigh)}</span> : <span className="text-xs text-neutral-300 italic">No data</span>}</div>
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

                {/* Disclaimer */}
                <div className="border-t border-neutral-100 bg-neutral-50 px-6 py-4">
                  {breakdown.assumptions && (
                    <p className="text-xs text-neutral-500 mb-2">
                      <span className="font-semibold text-neutral-700">Assumptions: </span>{breakdown.assumptions}
                    </p>
                  )}
                  <p className="text-xs text-neutral-400 italic">
                    Items marked <span className="font-semibold text-green-700 not-italic">Real data</span> use prices from hospitals&apos; official published chargemaster files.{" "}
                    Items marked <span className="font-semibold text-neutral-500 not-italic">No data</span> do not have chargemaster pricing in our database.{" "}
                    {breakdown.dataCompleteness != null && (
                      <>{Math.round(breakdown.dataCompleteness * 100)}% of components backed by real chargemaster data. </>
                    )}
                    Your final bill will differ based on your specific plan, deductible status, and care details.
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
