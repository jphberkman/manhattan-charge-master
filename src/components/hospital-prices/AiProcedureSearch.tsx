"use client";

import { useState, useRef } from "react";
import { Search, Loader2, ChevronDown, ChevronUp, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProcedureBreakdown, BreakdownComponent } from "@/app/api/procedure-breakdown/route";

export type { ProcedureBreakdown };

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const CATEGORY_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  "Professional Services": { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-400" },
  "Facility & OR":         { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-400" },
  "Anesthesia":            { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-400" },
  "Diagnostics & Imaging": { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-400" },
  "Medications & Supplies":{ bg: "bg-green-50", text: "text-green-700", dot: "bg-green-400" },
  "Rehabilitation":        { bg: "bg-teal-50", text: "text-teal-700", dot: "bg-teal-400" },
  "Follow-up Care":        { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-400" },
};

function categoryStyle(cat: string) {
  return CATEGORY_STYLES[cat] ?? { bg: "bg-neutral-50", text: "text-neutral-600", dot: "bg-neutral-400" };
}

const SUGGESTIONS = [
  "Total knee replacement",
  "Colonoscopy",
  "Hip replacement",
  "Appendectomy",
  "ACL reconstruction",
  "Gallbladder removal",
  "Cataract surgery",
  "Spinal fusion",
];

interface Props {
  onBreakdownReady?: (breakdown: ProcedureBreakdown) => void;
}

export function AiProcedureSearch({ onBreakdownReady }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [breakdown, setBreakdown] = useState<ProcedureBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const submit = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setBreakdown(null);
    setExpandedIds(new Set());
    try {
      const res = await fetch("/api/procedure-breakdown", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setBreakdown(data);
      onBreakdownReady?.(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate breakdown");
    } finally {
      setLoading(false);
    }
  };

  const groupedComponents = breakdown
    ? breakdown.components.reduce<Record<string, BreakdownComponent[]>>((acc, c) => {
        (acc[c.category] ??= []).push(c);
        return acc;
      }, {})
    : {};

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm transition-all",
            loading ? "border-blue-300 ring-2 ring-blue-100" : "border-neutral-200 hover:border-neutral-300"
          )}
        >
          {loading ? (
            <Loader2 className="size-5 shrink-0 animate-spin text-blue-500" />
          ) : (
            <Search className="size-5 shrink-0 text-neutral-400" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit(query)}
            placeholder="Describe the procedure (e.g. knee replacement, appendectomy, colonoscopy…)"
            className="flex-1 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
            disabled={loading}
          />
          <button
            onClick={() => submit(query)}
            disabled={loading || !query.trim()}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Analyzing…" : "Get Full Breakdown"}
          </button>
        </div>

        {/* Suggestion chips */}
        {!breakdown && !loading && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => { setQuery(s); submit(s); }}
                className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="space-y-3">
            <div className="h-5 w-48 animate-pulse rounded bg-neutral-100" />
            <div className="h-4 w-96 animate-pulse rounded bg-neutral-100" />
            <div className="mt-4 grid gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-neutral-100 p-3">
                  <div className="space-y-1.5">
                    <div className="h-4 w-48 animate-pulse rounded bg-neutral-100" />
                    <div className="h-3 w-32 animate-pulse rounded bg-neutral-100" />
                  </div>
                  <div className="h-4 w-28 animate-pulse rounded bg-neutral-100" />
                </div>
              ))}
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-neutral-400">
            AI is analyzing all services and supplies needed…
          </p>
        </div>
      )}

      {/* Breakdown results */}
      {breakdown && !loading && (
        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          {/* Header */}
          <div className="border-b border-neutral-100 bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-200">
                  Complete Cost Breakdown
                </p>
                <h3 className="mt-1 text-xl font-bold text-white">{breakdown.procedureName}</h3>
                {breakdown.cptCode && (
                  <p className="mt-0.5 text-sm text-blue-200">CPT {breakdown.cptCode}</p>
                )}
                <p className="mt-2 text-sm text-blue-100">{breakdown.description}</p>
              </div>
              <div className="shrink-0 rounded-xl bg-white/15 px-5 py-3 text-right">
                <p className="text-xs font-medium text-blue-200">Total Estimate</p>
                <p className="mt-0.5 text-2xl font-bold text-white">
                  {fmt.format(breakdown.totalEstimateLow)}
                </p>
                <p className="text-sm text-blue-200">– {fmt.format(breakdown.totalEstimateHigh)}</p>
              </div>
            </div>
          </div>

          {/* Components by category */}
          <div className="divide-y divide-neutral-50">
            {Object.entries(groupedComponents).map(([category, components]) => {
              const style = categoryStyle(category);
              const categoryTotal = components.reduce((s, c) => s + c.estimatedLow, 0);
              const categoryTotalHigh = components.reduce((s, c) => s + c.estimatedHigh, 0);

              return (
                <div key={category}>
                  {/* Category header */}
                  <div className={cn("flex items-center justify-between px-6 py-2.5", style.bg)}>
                    <div className="flex items-center gap-2">
                      <span className={cn("size-2 rounded-full", style.dot)} />
                      <span className={cn("text-xs font-semibold uppercase tracking-wide", style.text)}>
                        {category}
                      </span>
                    </div>
                    <span className={cn("text-xs font-medium", style.text)}>
                      {fmt.format(categoryTotal)} – {fmt.format(categoryTotalHigh)}
                    </span>
                  </div>

                  {/* Component rows */}
                  {components.map((comp) => {
                    const expanded = expandedIds.has(comp.id);
                    const hasDetail = !!(comp.description || comp.notes || comp.cptCode);
                    return (
                      <div key={comp.id} className="border-b border-neutral-50 last:border-b-0">
                        <div
                          className={cn(
                            "flex items-center gap-4 px-6 py-3",
                            hasDetail && "cursor-pointer hover:bg-neutral-50",
                            (comp as any).hasRealData && "bg-green-50/30"
                          )}
                          onClick={() => hasDetail && toggleExpand(comp.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-neutral-900 truncate">
                                {comp.name}
                              </span>
                              {(comp as any).hasRealData && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                  <CircleDot className="size-3" /> Real data
                                </span>
                              )}
                            </div>
                            {comp.cptCode && (
                              <span className="text-xs text-neutral-400">CPT {comp.cptCode}</span>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="text-sm font-semibold text-neutral-900">
                              {fmt.format(comp.estimatedLow)}
                            </span>
                            <span className="text-xs text-neutral-400">
                              {" "}– {fmt.format(comp.estimatedHigh)}
                            </span>
                          </div>
                          {hasDetail && (
                            <div className="shrink-0 text-neutral-300">
                              {expanded ? (
                                <ChevronUp className="size-4" />
                              ) : (
                                <ChevronDown className="size-4" />
                              )}
                            </div>
                          )}
                        </div>

                        {/* Expanded detail */}
                        {expanded && hasDetail && (
                          <div className="border-t border-neutral-50 bg-neutral-50/60 px-6 py-3 text-sm text-neutral-600">
                            {comp.description && <p>{comp.description}</p>}
                            {comp.notes && (
                              <p className={cn("mt-1 text-xs text-neutral-500", comp.description && "mt-1.5")}>
                                💡 {comp.notes}
                              </p>
                            )}
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
          <div className="flex items-center justify-between border-t-2 border-neutral-200 bg-neutral-50 px-6 py-4">
            <span className="font-semibold text-neutral-900">Total Estimated Cost</span>
            <div className="text-right">
              <span className="text-lg font-bold text-neutral-900">
                {fmt.format(breakdown.totalEstimateLow)}
              </span>
              <span className="text-sm text-neutral-500">
                {" "}– {fmt.format(breakdown.totalEstimateHigh)}
              </span>
            </div>
          </div>

          {/* Assumptions + notes */}
          <div className="border-t border-neutral-100 px-6 py-4 space-y-3">
            {breakdown.assumptions && (
              <p className="text-xs text-neutral-500">
                <span className="font-semibold text-neutral-600">Assumptions: </span>
                {breakdown.assumptions}
              </p>
            )}
            {breakdown.importantNotes?.length > 0 && (
              <ul className="space-y-1">
                {breakdown.importantNotes.map((note, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-neutral-500">
                    <span className="mt-0.5 shrink-0 text-neutral-300">•</span>
                    {note}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-neutral-400 italic">
              Estimates are for informational purposes only. Actual costs vary based on your specific
              insurance, hospital, and clinical circumstances. Components marked "Real data" use
              actual Manhattan hospital price transparency data.
            </p>
          </div>

          {/* New search */}
          <div className="border-t border-neutral-100 px-6 py-3">
            <button
              onClick={() => { setBreakdown(null); setQuery(""); inputRef.current?.focus(); }}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              ← Search another procedure
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
