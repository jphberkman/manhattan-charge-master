"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { AuditReport } from "@/app/api/admin/data-audit/route";

// ── Formatting helpers ──────────────────────────────────────────────────────
function compactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Status badge ────────────────────────────────────────────────────────────
function StalenessBadge({ s }: { s: "fresh" | "aging" | "stale" }) {
  const cls =
    s === "fresh"
      ? "bg-emerald-100 text-emerald-700"
      : s === "aging"
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {s === "fresh" ? "Fresh" : s === "aging" ? "Aging" : "Stale"}
    </span>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-neutral-200 ${className}`} />;
}

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="h-8 w-20" />
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function DataAuditPage() {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/data-audit")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setReport(data as AuditReport))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">Data Quality Audit</h1>
              <p className="mt-1 text-sm text-neutral-500">
                Hospital pricing data coverage, quality metrics, and recent activity
              </p>
            </div>
            <div className="flex items-center gap-4">
              {report && (
                <p className="text-xs text-neutral-400">
                  Generated {new Date(report.generatedAt).toLocaleString()}
                </p>
              )}
              <Link
                href="/hospital-prices/about"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-500"
              >
                Data sources
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* ── Error state ── */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-4">
            <p className="text-sm font-semibold text-red-700">Failed to load audit report</p>
            <p className="mt-1 text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* ── Summary cards ── */}
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            Overview
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {loading ? (
              <>
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
              </>
            ) : report ? (
              <>
                <SummaryCard
                  label="Hospitals"
                  value={String(report.summary.totalHospitals)}
                  icon={
                    <svg className="size-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                    </svg>
                  }
                />
                <SummaryCard
                  label="Procedures"
                  value={compactNum(report.summary.totalProcedures)}
                  icon={
                    <svg className="size-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                    </svg>
                  }
                />
                <SummaryCard
                  label="Price Entries"
                  value={compactNum(report.summary.totalPriceEntries)}
                  icon={
                    <svg className="size-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                />
                <SummaryCard
                  label="Data Freshness"
                  value={
                    report.hospitals.length > 0
                      ? (() => {
                          const counts = { fresh: 0, aging: 0, stale: 0 };
                          report.hospitals.forEach((h) => counts[h.staleness]++);
                          if (counts.stale > counts.fresh) return "Needs attention";
                          if (counts.aging > counts.fresh) return "Mixed";
                          return "Healthy";
                        })()
                      : "No data"
                  }
                  icon={
                    <svg className="size-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                  sub={
                    report.hospitals.length > 0
                      ? `${report.hospitals.filter((h) => h.staleness === "fresh").length} fresh / ${report.hospitals.filter((h) => h.staleness === "aging").length} aging / ${report.hospitals.filter((h) => h.staleness === "stale").length} stale`
                      : undefined
                  }
                />
              </>
            ) : null}
          </div>
        </section>

        {/* ── Source breakdown ── */}
        {report && (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Entries by Source
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(report.summary.entriesBySource).map(([source, count]) => (
                <div key={source} className="rounded-xl border border-neutral-200 bg-white p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{source}</p>
                  <p className="mt-1 text-2xl font-bold text-neutral-800">{compactNum(count)}</p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {((count / report.summary.totalPriceEntries) * 100).toFixed(1)}% of total
                  </p>
                </div>
              ))}
              {Object.keys(report.summary.entriesBySource).length === 0 && (
                <p className="text-sm text-neutral-400">No source data available</p>
              )}
            </div>
          </section>
        )}

        {/* ── Payer type breakdown ── */}
        {report && Object.keys(report.summary.entriesByPayerType).length > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Entries by Payer Type
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(report.summary.entriesByPayerType).map(([payer, count]) => (
                <div key={payer} className="rounded-xl border border-neutral-200 bg-white p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{payer}</p>
                  <p className="mt-1 text-2xl font-bold text-neutral-800">{compactNum(count)}</p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {((count / report.summary.totalPriceEntries) * 100).toFixed(1)}% of total
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Hospital coverage table ── */}
        {report && (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Hospital Coverage
            </h2>
            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 bg-neutral-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Hospital
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Last Updated
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Entries
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Procedures
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Neg. Rates
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Cash Prices
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.hospitals.map((h, i) => (
                      <tr
                        key={h.name + i}
                        className={`border-b border-neutral-50 ${i % 2 === 1 ? "bg-neutral-50/50" : ""} hover:bg-neutral-50`}
                      >
                        <td className="px-4 py-3">
                          <div>
                            <span className="font-semibold text-neutral-800">{h.name}</span>
                            {h.cmsProviderId && (
                              <span className="ml-2 text-xs text-neutral-400">CMS #{h.cmsProviderId}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-500">{h.dataAge}</td>
                        <td className="px-4 py-3 text-right font-mono text-neutral-700">
                          {compactNum(h.totalEntries)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-neutral-700">
                          {compactNum(h.procedureCount)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {h.hasNegotiatedRates ? (
                            <span className="text-emerald-600 font-medium">Yes</span>
                          ) : (
                            <span className="text-red-400">No</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {h.hasCashPrices ? (
                            <span className="text-emerald-600 font-medium">Yes</span>
                          ) : (
                            <span className="text-red-400">No</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StalenessBadge s={h.staleness} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ── Data quality ── */}
        {report && (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Data Quality
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <QualityCard
                label="Missing Cash Prices"
                count={report.dataQuality.missingCashPrices}
                total={report.summary.totalHospitals}
                unit="hospitals"
                color={report.dataQuality.missingCashPrices > 0 ? "amber" : "green"}
              />
              <QualityCard
                label="Missing Neg. Rates"
                count={report.dataQuality.missingNegotiatedRates}
                total={report.summary.totalHospitals}
                unit="hospitals"
                color={report.dataQuality.missingNegotiatedRates > 0 ? "amber" : "green"}
              />
              <QualityCard
                label="Suspicious Outliers"
                count={report.dataQuality.suspiciousOutliers}
                total={report.summary.totalPriceEntries}
                unit="entries"
                color={report.dataQuality.suspiciousOutliers > 0 ? "red" : "green"}
              />
              <QualityCard
                label="Duplicate Entries"
                count={report.dataQuality.duplicateEntries}
                total={report.summary.totalPriceEntries}
                unit="groups"
                color={report.dataQuality.duplicateEntries > 0 ? "amber" : "green"}
              />
              <QualityCard
                label="Malformed CPT Codes"
                count={report.dataQuality.malformedCptCodes}
                total={report.summary.totalProcedures}
                unit="procedures"
                color={report.dataQuality.malformedCptCodes > 0 ? "red" : "green"}
              />
            </div>
          </section>
        )}

        {/* ── Recent searches ── */}
        {report && report.recentSearches.length > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Recent Searches
            </h2>
            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 bg-neutral-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Query
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Endpoint
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Results
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        CPT Code
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        When
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.recentSearches.map((s, i) => (
                      <tr
                        key={i}
                        className={`border-b border-neutral-50 ${i % 2 === 1 ? "bg-neutral-50/50" : ""}`}
                      >
                        <td className="px-4 py-3 max-w-[300px] truncate font-medium text-neutral-800">
                          {s.query}
                        </td>
                        <td className="px-4 py-3 text-neutral-500">
                          <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">
                            {s.endpoint}
                          </code>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-neutral-700">
                          {s.resultCount}
                        </td>
                        <td className="px-4 py-3 text-neutral-500">
                          {s.cptCode ? (
                            <code className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                              {s.cptCode}
                            </code>
                          ) : (
                            <span className="text-neutral-300">--</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-neutral-400">
                          {timeAgo(s.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ── Warnings ── */}
        {report && report.warnings.length > 0 && (
          <section>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Warnings
            </h2>
            <div className="space-y-3">
              {report.warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4"
                >
                  <svg
                    className="mt-0.5 size-5 shrink-0 text-amber-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                    />
                  </svg>
                  <p className="text-sm text-amber-800">{w}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Loading state (tables) ── */}
        {loading && !error && (
          <div className="space-y-8">
            <section>
              <Skeleton className="mb-4 h-4 w-32" />
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon,
  sub,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</span>
      </div>
      <p className="mt-2 text-3xl font-bold text-neutral-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-neutral-400">{sub}</p>}
    </div>
  );
}

function QualityCard({
  label,
  count,
  total,
  unit,
  color,
}: {
  label: string;
  count: number;
  total: number;
  unit: string;
  color: "green" | "amber" | "red";
}) {
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
  const cls =
    color === "green"
      ? "border-emerald-200 bg-emerald-50"
      : color === "amber"
        ? "border-amber-200 bg-amber-50"
        : "border-red-200 bg-red-50";
  const textCls =
    color === "green" ? "text-emerald-700" : color === "amber" ? "text-amber-700" : "text-red-700";

  return (
    <div className={`rounded-xl border p-5 ${cls}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${textCls}`}>{label}</p>
      <p className={`mt-1 text-2xl font-bold ${textCls}`}>{compactNum(count)}</p>
      <p className={`mt-1 text-xs ${textCls} opacity-70`}>
        {pct}% of {compactNum(total)} {unit}
      </p>
    </div>
  );
}
