"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Loader2, CheckCircle, XCircle, AlertCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ValidateResult, ValidationSample } from "@/app/api/validate/route";

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtRange = (lo: number, hi: number) => lo === hi ? fmt.format(lo) : `${fmt.format(lo)} – ${fmt.format(hi)}`;

type Status = "idle" | "uploading" | "done" | "error";

export default function ValidatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ValidateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (!/\.(csv|xlsx|xls|xlsm|json|zip)$/i.test(f.name)) {
      setError("Unsupported file type. Upload CSV, Excel (.xlsx), JSON, or ZIP.");
      return;
    }
    setFile(f);
    setError(null);
    setResult(null);
    setStatus("idle");
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setStatus("uploading");
    setError(null);
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "x-filename": file.name, "content-type": "application/octet-stream" },
        body: file,
      });
      if (res.status === 413) throw new Error("File is too large for a single upload. Try splitting it into smaller files (e.g. one hospital at a time).");
      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch { throw new Error(`Server error: ${text.slice(0, 200)}`); }
      if (!res.ok) throw new Error(json.error ?? "Validation failed");
      setResult(json);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed");
      setStatus("error");
    }
  };

  const accuracyColor = (pct: number) =>
    pct >= 80 ? "text-green-700" : pct >= 50 ? "text-amber-700" : "text-red-700";

  const accuracyBg = (pct: number) =>
    pct >= 80 ? "bg-green-50 border-green-200" : pct >= 50 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";

  const sampleAccuracy = (s: ValidationSample) =>
    s.accurate ? "green" : s.errorPct <= 50 ? "amber" : "red";

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-4xl px-4 py-10">

        {/* Header */}
        <Link href="/hospital-prices" className="mb-6 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800">
          ← Back to Marketplace
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Validate & Improve AI Pricing</h1>
        <p className="mt-2 text-sm text-neutral-500 max-w-2xl">
          Upload real hospital price transparency files to check how accurate our AI estimates are.
          Your data is saved to the database and immediately used to show real prices to all users.
        </p>

        {/* What this does */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { icon: "📥", title: "Import real prices", desc: "Your file is parsed and saved to the shared database — improving accuracy for every user." },
            { icon: "🤖", title: "Benchmark AI estimates", desc: "We compare a sample of real prices to what the AI would have guessed, and show you the difference." },
            { icon: "📊", title: "Measure accuracy", desc: "See which procedures the AI gets right, which it inflates, and which it underestimates." },
          ].map((card) => (
            <div key={card.title} className="rounded-xl border border-neutral-200 bg-white px-4 py-4">
              <p className="text-2xl mb-2">{card.icon}</p>
              <p className="text-sm font-semibold text-neutral-800">{card.title}</p>
              <p className="text-xs text-neutral-500 mt-1">{card.desc}</p>
            </div>
          ))}
        </div>

        {/* Supported formats */}
        <div className="mt-6 flex flex-wrap gap-2 items-center">
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Accepted formats:</span>
          {["CSV", "Excel (.xlsx)", "JSON (CMS 2.0)", "ZIP (multiple files)"].map((f) => (
            <span key={f} className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600">{f}</span>
          ))}
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "mt-6 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors",
            dragOver ? "border-violet-400 bg-violet-50"
              : file ? "border-green-400 bg-green-50"
              : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.xlsm,.json,.zip"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {file ? (
            <>
              <span className="text-3xl">{/\.zip$/i.test(file.name) ? "🗜️" : /\.json$/i.test(file.name) ? "📋" : /\.xlsx?/i.test(file.name) ? "📊" : "📄"}</span>
              <p className="mt-2 font-medium text-neutral-800">{file.name}</p>
              <p className="text-sm text-neutral-400">{(file.size / 1024).toFixed(1)} KB — click to change</p>
            </>
          ) : (
            <>
              <span className="text-3xl">⬆️</span>
              <p className="mt-2 font-medium text-neutral-700">Drop your file here</p>
              <p className="text-sm text-neutral-400">CSV, Excel, JSON, or ZIP — click to browse</p>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <AlertCircle className="size-4 shrink-0 text-red-500 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Upload button */}
        {file && status !== "done" && status !== "uploading" && (
          <button
            onClick={handleSubmit}
            className="mt-4 w-full rounded-xl bg-violet-700 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-violet-800"
          >
            Validate & Import Data
          </button>
        )}

        {/* Loading */}
        {status === "uploading" && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-4">
            <Loader2 className="size-5 animate-spin text-violet-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-neutral-800">Processing file…</p>
              <p className="text-xs text-neutral-400 mt-0.5">
                AI is detecting structure, importing prices, and benchmarking estimates. This may take a minute for large files.
              </p>
            </div>
          </div>
        )}

        {/* Results */}
        {status === "done" && result && (
          <div className="mt-6 space-y-5">

            {/* Import summary */}
            <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="size-5 text-green-600 shrink-0" />
                <p className="font-semibold text-green-800">Import complete</p>
                {result.filesProcessed > 1 && (
                  <span className="ml-auto text-xs text-green-600">{result.filesProcessed} files processed</span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Hospitals", value: result.hospitalsUpserted, icon: "🏥" },
                  { label: "Procedures", value: result.proceduresUpserted, icon: "🩺" },
                  { label: "Price entries", value: result.pricesInserted.toLocaleString(), icon: "💰" },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg bg-white border border-green-100 px-3 py-2.5 text-center">
                    <p className="text-lg">{stat.icon}</p>
                    <p className="text-lg font-bold text-green-800">{stat.value}</p>
                    <p className="text-xs text-green-600">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Accuracy overview */}
            {result.validationSamples.length > 0 && (
              <>
                <div className={cn("rounded-xl border px-5 py-4", accuracyBg(result.overallAccuracyPct))}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">AI accuracy report</p>
                  <div className="flex items-end gap-6 flex-wrap">
                    <div>
                      <p className={cn("text-4xl font-extrabold", accuracyColor(result.overallAccuracyPct))}>
                        {result.overallAccuracyPct}%
                      </p>
                      <p className="text-sm text-neutral-600 mt-0.5">
                        of sampled procedures within 30% of real price
                      </p>
                    </div>
                    <div className="text-sm text-neutral-600">
                      <p>Average error: <span className="font-bold">{result.avgErrorPct}%</span></p>
                      <p className="text-xs text-neutral-400 mt-0.5">{result.validationSamples.length} procedures sampled</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-neutral-500">
                    Real prices from your file are now used directly — AI estimates are only shown as fallback for procedures not in the database.
                  </p>
                </div>

                {/* Per-procedure table */}
                <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
                  <div className="border-b border-neutral-100 bg-neutral-50 px-5 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Procedure-by-procedure comparison</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-neutral-100">
                          <th className="px-5 py-2.5 text-left text-xs font-semibold text-neutral-500">Procedure</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-neutral-500">Real price (your data)</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-neutral-500">AI estimate</th>
                          <th className="px-4 py-2.5 text-center text-xs font-semibold text-neutral-500">Accuracy</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-50">
                        {[...result.validationSamples]
                          .sort((a, b) => a.errorPct - b.errorPct)
                          .map((sample) => {
                            const acc = sampleAccuracy(sample);
                            const aiMid = (sample.aiEstimateLow + sample.aiEstimateHigh) / 2;
                            const realMid = (sample.realPriceLow + sample.realPriceHigh) / 2;
                            const overUnder = aiMid > realMid ? "over" : "under";
                            return (
                              <tr key={sample.cptCode} className={cn(
                                "transition-colors hover:bg-neutral-50",
                                acc === "green" && "bg-green-50/30",
                                acc === "red" && "bg-red-50/30",
                              )}>
                                <td className="px-5 py-3">
                                  <p className="font-medium text-neutral-800">{sample.procedureName}</p>
                                  <p className="text-xs text-neutral-400">CPT {sample.cptCode}</p>
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-neutral-700">
                                  {fmtRange(sample.realPriceLow, sample.realPriceHigh)}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-sm text-neutral-500">
                                  {fmtRange(sample.aiEstimateLow, sample.aiEstimateHigh)}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-col items-center gap-1">
                                    {acc === "green" ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">
                                        <CheckCircle className="size-3" /> {sample.errorPct}% off
                                      </span>
                                    ) : acc === "amber" ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                        <Minus className="size-3" /> {sample.errorPct}% off
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                                        <XCircle className="size-3" /> {sample.errorPct}% off
                                      </span>
                                    )}
                                    <span className={cn("flex items-center gap-0.5 text-xs", overUnder === "over" ? "text-red-500" : "text-blue-500")}>
                                      {overUnder === "over"
                                        ? <><TrendingUp className="size-3" /> AI overestimates</>
                                        : <><TrendingDown className="size-3" /> AI underestimates</>
                                      }
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-3">
                    <p className="text-xs text-neutral-400">
                      ✅ Within 30% = accurate &nbsp;·&nbsp; ⚠️ 30–50% off = close &nbsp;·&nbsp; ❌ &gt;50% off = needs real data
                      &nbsp;·&nbsp; All prices are now saved and used as real data going forward.
                    </p>
                  </div>
                </div>

                {/* CTA */}
                <div className="flex gap-3">
                  <Link href="/hospital-prices" className="flex-1 rounded-xl bg-violet-700 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-violet-800 transition-colors">
                    View marketplace with real data →
                  </Link>
                  <button
                    onClick={() => { setFile(null); setResult(null); setStatus("idle"); }}
                    className="rounded-xl border border-neutral-200 bg-white px-5 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
                  >
                    Upload another file
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
