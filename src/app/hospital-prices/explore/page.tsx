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
import { EditableText } from "@/components/hospital-prices/EditableText";
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

      // Track concern exploration
      window.gtag?.("event", "concern_explored", {
        search_term: trimmed,
        treatment_count: data.treatments?.length ?? 0,
        related_procedures: data.relatedProcedures?.length ?? 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const AiBadge = () => (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
      <Sparkles className="size-2.5" /> AI-generated
    </span>
  );

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #2d0606 0%, #3b0a50 50%, #0a0820 100%)" }}>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Brain className="size-7 text-violet-400" />
            <EditableText
              contentKey="explore.header.title"
              defaultValue="Concern Explorer"
              as="h1"
              className="text-3xl font-black text-white"
            />
          </div>
          <EditableText
            contentKey="explore.header.subtitle"
            defaultValue="Learn about health conditions, treatment options, and what to ask your doctor"
            as="p"
            className="text-white/50 text-sm max-w-lg mx-auto"
            multiline
          />
        </div>

        {/* Disclaimer -- top */}
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-900/20 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-amber-300">Educational content only</p>
              <EditableText
                contentKey="explore.disclaimer"
                defaultValue="This content is AI-generated for educational purposes only. It is not medical advice, diagnosis, or treatment recommendation. Always consult your healthcare provider for medical decisions."
                as="p"
                className="text-xs text-amber-300/70 mt-0.5 leading-relaxed"
                multiline
              />
            </div>
          </div>
        </div>

        {/* Search input */}
        <div className={cn(
          "flex items-center gap-3 rounded-2xl border-2 bg-white/10 px-5 py-4 shadow-md backdrop-blur-sm transition-all",
          loading
            ? "border-violet-400 ring-4 ring-violet-400/20"
            : "border-white/20 focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-400/20 hover:border-violet-400/50",
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
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
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
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 shadow-sm transition-all hover:border-violet-400/50 hover:bg-violet-600/20 hover:text-violet-300"
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
              className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-400 hover:text-violet-300"
            >
              Search for procedure pricing instead
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-900/20 px-4 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="mt-6 space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-sm">
                <div className="h-5 w-48 animate-pulse rounded bg-white/20 mb-3" />
                <div className="space-y-2">
                  <div className="h-3 w-full animate-pulse rounded bg-white/10" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="mt-6 space-y-5">

            {/* Section 1: What is this condition? */}
            <section className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-violet-500/20">
                    <Stethoscope className="size-4 text-violet-400" />
                  </div>
                  <EditableText contentKey="explore.section.condition" defaultValue="What is this condition?" as="h2" className="text-base font-bold text-white" />
                </div>
                <AiBadge />
              </div>
              <p className="text-sm text-white/70 leading-relaxed">{result.description}</p>
            </section>

            {/* Section 2: Common causes */}
            <section className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-violet-500/20">
                    <ClipboardList className="size-4 text-violet-400" />
                  </div>
                  <EditableText contentKey="explore.section.causes" defaultValue="Common causes" as="h2" className="text-base font-bold text-white" />
                </div>
                <AiBadge />
              </div>
              <ul className="space-y-2">
                {result.causes.map((cause, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-white/70">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-violet-400" />
                    {cause}
                  </li>
                ))}
              </ul>
            </section>

            {/* Section 3: Treatment options */}
            <section className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-violet-500/20">
                    <Heart className="size-4 text-violet-400" />
                  </div>
                  <EditableText contentKey="explore.section.treatments" defaultValue="Common treatment options" as="h2" className="text-base font-bold text-white" />
                </div>
                <AiBadge />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {result.treatments.map((tx, i) => {
                  const Icon = TREATMENT_ICONS[tx.type] ?? Heart;
                  const typeColors: Record<string, string> = {
                    conservative: "bg-green-900/20 border-green-500/30 text-green-400",
                    surgical: "bg-rose-900/20 border-rose-500/30 text-rose-400",
                    medication: "bg-blue-900/20 border-blue-500/30 text-blue-400",
                    other: "bg-white/10 border-white/20 text-white/70",
                  };
                  const color = typeColors[tx.type] ?? typeColors.other;
                  return (
                    <div key={i} className={cn("rounded-xl border p-4", color)}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="size-4" />
                        <span className="text-xs font-bold uppercase tracking-wide">{tx.type}</span>
                      </div>
                      <p className="text-sm font-semibold text-white mb-1">{tx.name}</p>
                      <p className="text-xs text-white/60 leading-relaxed">{tx.description}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Section 4: When to seek care */}
            <section className="rounded-2xl border border-red-500/30 bg-red-900/20 p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-red-500/20">
                    <ShieldAlert className="size-4 text-red-400" />
                  </div>
                  <EditableText contentKey="explore.section.seekCare" defaultValue="When to seek care" as="h2" className="text-base font-bold text-white" />
                </div>
                <AiBadge />
              </div>
              <ul className="space-y-2">
                {result.whenToSeekCare.map((sign, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-white/70">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-400" />
                    {sign}
                  </li>
                ))}
              </ul>
            </section>

            {/* Section 5: Questions for your doctor */}
            <section className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-violet-500/20">
                    <HelpCircle className="size-4 text-violet-400" />
                  </div>
                  <EditableText contentKey="explore.section.questions" defaultValue="Questions to ask your doctor" as="h2" className="text-base font-bold text-white" />
                </div>
                <AiBadge />
              </div>
              <ul className="space-y-2.5">
                {result.questionsForDoctor.map((q, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-white/70">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-700">
                      {i + 1}
                    </span>
                    {q}
                  </li>
                ))}
              </ul>
            </section>

            {/* Section 6: Related procedures */}
            {result.relatedProcedures.length > 0 && (
              <section className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-violet-500/20">
                      <Search className="size-4 text-violet-400" />
                    </div>
                    <EditableText contentKey="explore.section.relatedPrices" defaultValue="Look up real hospital prices" as="h2" className="text-base font-bold text-white" />
                  </div>
                  <AiBadge />
                </div>
                <p className="text-xs text-white/50 mb-3">
                  These related procedures may have pricing data from hospital chargemaster files.
                </p>
                <div className="space-y-2">
                  {result.relatedProcedures.map((proc, i) => (
                    <Link
                      key={i}
                      href={`/hospital-prices?q=${encodeURIComponent(proc.searchQuery)}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/20 bg-white/5 px-4 py-3 transition-all hover:border-violet-400/50 hover:bg-violet-600/20"
                    >
                      <span className="text-sm font-medium text-white">{proc.name}</span>
                      <ArrowRight className="size-4 shrink-0 text-violet-500" />
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Disclaimer -- bottom */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-900/20 px-5 py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400" />
                <div>
                  <EditableText contentKey="explore.disclaimer.footer.title" defaultValue="Important disclaimer" as="p" className="text-sm font-semibold text-amber-300" />
                  <p className="text-xs text-amber-300/70 mt-0.5 leading-relaxed">{result.disclaimer}</p>
                </div>
              </div>
            </div>

            {/* Search again */}
            <div className="text-center">
              <button
                onClick={() => { setResult(null); setQuery(""); inputRef.current?.focus(); }}
                className="rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white/70 shadow-sm backdrop-blur-sm transition-all hover:border-violet-400/50 hover:text-violet-300"
              >
                <EditableText contentKey="explore.searchAgain" defaultValue="Explore another concern" as="span" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
