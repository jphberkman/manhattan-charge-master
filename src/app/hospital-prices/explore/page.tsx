"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import {
  Search,
  Loader2,
  AlertTriangle,
  Brain,
  Stethoscope,
  ClipboardList,
  ShieldAlert,
  HelpCircle,
  ArrowRight,
  Pill,
  Scissors,
  Heart,
  Activity,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConcernExploreResponse } from "@/app/api/concern-explore/route";

// ── Constants ─────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  { label: "Knee pain", query: "knee pain" },
  { label: "Acid reflux", query: "acid reflux" },
  { label: "Shoulder injury", query: "shoulder injury" },
  { label: "Sinus issues", query: "sinus issues" },
  { label: "Lower back pain", query: "lower back pain" },
  { label: "Carpal tunnel", query: "carpal tunnel syndrome" },
  { label: "Gallstones", query: "gallstones" },
  { label: "Hernia", query: "hernia" },
];

const TREATMENT_ICONS: Record<string, typeof Pill> = {
  conservative: Activity,
  surgical: Scissors,
  medication: Pill,
  other: Heart,
};

// ── Page component ────────────────────────────────────────────────────────────

export default function ConcernExplorePage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConcernExploreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;

    setQuery(trimmed);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/concern-explore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load results");
      }

      const data: ConcernExploreResponse = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const AiBadge = () => (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
      <Sparkles className="size-2.5" /> AI-generated
    </span>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50/50 to-white">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Brain className="size-7 text-violet-600" />
            <h1 className="text-3xl font-black text-neutral-900">Concern Explorer</h1>
          </div>
          <p className="text-neutral-500 text-sm max-w-lg mx-auto">
            Learn about health conditions, treatment options, and what to ask your doctor
          </p>
        </div>

        {/* Disclaimer -- top */}
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Educational content only</p>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                This content is AI-generated for educational purposes only. It is not medical advice,
                diagnosis, or treatment recommendation. Always consult your healthcare provider for
                medical decisions.
              </p>
            </div>
          </div>
        </div>

        {/* Search input */}
        <div className={cn(
          "flex items-center gap-3 rounded-2xl border-2 bg-white px-5 py-4 shadow-md transition-all",
          loading
            ? "border-violet-400 ring-4 ring-violet-100"
            : "border-gray-200 focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100 hover:border-violet-300",
        )}>
          {loading
            ? <Loader2 className="size-5 shrink-0 animate-spin text-violet-500" />
            : <Search className="size-5 shrink-0 text-gray-400" />
          }
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search(query)}
            placeholder="Describe your health concern..."
            className="flex-1 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
            disabled={loading}
          />
          <button
            onClick={() => search(query)}
            disabled={loading || !query.trim()}
            className="shrink-0 rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Searching..." : "Explore"}
          </button>
        </div>

        {/* Suggestions */}
        {!result && !loading && (
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                onClick={() => { setQuery(s.query); search(s.query); }}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Back to pricing link */}
        {!result && !loading && (
          <div className="mt-8 text-center">
            <Link
              href="/hospital-prices"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-500"
            >
              Search for procedure pricing instead
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="mt-6 space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
                <div className="h-5 w-48 animate-pulse rounded bg-neutral-200 mb-3" />
                <div className="space-y-2">
                  <div className="h-3 w-full animate-pulse rounded bg-neutral-100" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-neutral-100" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="mt-6 space-y-5">

            {/* Section 1: What is this condition? */}
            <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-violet-100">
                    <Stethoscope className="size-4 text-violet-600" />
                  </div>
                  <h2 className="text-base font-bold text-neutral-900">What is this condition?</h2>
                </div>
                <AiBadge />
              </div>
              <p className="text-sm text-neutral-700 leading-relaxed">{result.description}</p>
            </section>

            {/* Section 2: Common causes */}
            <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-violet-100">
                    <ClipboardList className="size-4 text-violet-600" />
                  </div>
                  <h2 className="text-base font-bold text-neutral-900">Common causes</h2>
                </div>
                <AiBadge />
              </div>
              <ul className="space-y-2">
                {result.causes.map((cause, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-700">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-violet-400" />
                    {cause}
                  </li>
                ))}
              </ul>
            </section>

            {/* Section 3: Treatment options */}
            <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-violet-100">
                    <Heart className="size-4 text-violet-600" />
                  </div>
                  <h2 className="text-base font-bold text-neutral-900">Common treatment options</h2>
                </div>
                <AiBadge />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {result.treatments.map((tx, i) => {
                  const Icon = TREATMENT_ICONS[tx.type] ?? Heart;
                  const typeColors: Record<string, string> = {
                    conservative: "bg-green-50 border-green-200 text-green-700",
                    surgical: "bg-rose-50 border-rose-200 text-rose-700",
                    medication: "bg-blue-50 border-blue-200 text-blue-700",
                    other: "bg-neutral-50 border-neutral-200 text-neutral-700",
                  };
                  const color = typeColors[tx.type] ?? typeColors.other;
                  return (
                    <div key={i} className={cn("rounded-xl border p-4", color)}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="size-4" />
                        <span className="text-xs font-bold uppercase tracking-wide">{tx.type}</span>
                      </div>
                      <p className="text-sm font-semibold text-neutral-900 mb-1">{tx.name}</p>
                      <p className="text-xs text-neutral-600 leading-relaxed">{tx.description}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Section 4: When to seek care */}
            <section className="rounded-2xl border border-red-100 bg-red-50/50 p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-red-100">
                    <ShieldAlert className="size-4 text-red-600" />
                  </div>
                  <h2 className="text-base font-bold text-neutral-900">When to seek care</h2>
                </div>
                <AiBadge />
              </div>
              <ul className="space-y-2">
                {result.whenToSeekCare.map((sign, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-700">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-400" />
                    {sign}
                  </li>
                ))}
              </ul>
            </section>

            {/* Section 5: Questions for your doctor */}
            <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-violet-100">
                    <HelpCircle className="size-4 text-violet-600" />
                  </div>
                  <h2 className="text-base font-bold text-neutral-900">Questions to ask your doctor</h2>
                </div>
                <AiBadge />
              </div>
              <ul className="space-y-2.5">
                {result.questionsForDoctor.map((q, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-700">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">
                      {i + 1}
                    </span>
                    {q}
                  </li>
                ))}
              </ul>
            </section>

            {/* Section 6: Related procedures */}
            {result.relatedProcedures.length > 0 && (
              <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-violet-100">
                      <Search className="size-4 text-violet-600" />
                    </div>
                    <h2 className="text-base font-bold text-neutral-900">Look up real hospital prices</h2>
                  </div>
                  <AiBadge />
                </div>
                <p className="text-xs text-neutral-500 mb-3">
                  These related procedures may have pricing data from hospital chargemaster files.
                </p>
                <div className="space-y-2">
                  {result.relatedProcedures.map((proc, i) => (
                    <Link
                      key={i}
                      href={`/hospital-prices?q=${encodeURIComponent(proc.searchQuery)}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 transition-all hover:border-violet-300 hover:bg-violet-50"
                    >
                      <span className="text-sm font-medium text-neutral-800">{proc.name}</span>
                      <ArrowRight className="size-4 shrink-0 text-violet-500" />
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Disclaimer -- bottom */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Important disclaimer</p>
                  <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">{result.disclaimer}</p>
                </div>
              </div>
            </div>

            {/* Search again */}
            <div className="text-center">
              <button
                onClick={() => { setResult(null); setQuery(""); inputRef.current?.focus(); }}
                className="rounded-xl border border-neutral-200 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-600 shadow-sm transition-all hover:border-violet-300 hover:text-violet-700"
              >
                Explore another concern
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
