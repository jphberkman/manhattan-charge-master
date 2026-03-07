"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type UploadStatus = "idle" | "parsing" | "uploading" | "done" | "error";

interface SchemaDetected {
  format: string;
  bestSheet: string;
  headerRow: number;
  hospitalSource: string;
  hospitalNameFromFilename: string | null;
  notes: string;
}

interface UploadResult {
  hospitalsUpserted: number;
  proceduresUpserted: number;
  pricesInserted: number;
  schemaDetected?: SchemaDetected;
}

const STATUS_MESSAGES: Record<string, string> = {
  uploading: "Analyzing file structure with AI…",
  done: "Import complete",
};

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isXlsx = (f: File) => /\.(xlsx|xls|xlsm)$/i.test(f.name);

  const parsePreview = useCallback((text: string) => {
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
    if (lines.length === 0) return;
    const parseRow = (line: string): string[] => {
      const cols: string[] = [];
      let cur = "";
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
          else inQuote = !inQuote;
        } else if (ch === "," && !inQuote) {
          cols.push(cur.trim()); cur = "";
        } else cur += ch;
      }
      cols.push(cur.trim());
      return cols;
    };
    setHeaders(parseRow(lines[0]));
    setPreview(lines.slice(1, 4).map(parseRow));
  }, []);

  const handleFile = useCallback(
    (f: File) => {
      if (!/\.(csv|xlsx|xls|xlsm)$/i.test(f.name)) {
        setError("Please upload a CSV or Excel (.xlsx) file.");
        return;
      }
      setFile(f);
      setError(null);
      setResult(null);
      setHeaders([]);
      setPreview([]);

      if (isXlsx(f)) {
        setStatus("idle");
        return;
      }
      setStatus("parsing");
      const reader = new FileReader();
      reader.onload = (e) => {
        parsePreview(e.target?.result as string);
        setStatus("idle");
      };
      reader.readAsText(f);
    },
    [parsePreview]
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setStatus("uploading");
    setError(null);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "x-filename": file.name, "content-type": "application/octet-stream" },
        body: file,
      });
      if (res.status === 413) throw new Error("File is too large for a single upload. Try splitting it into smaller files (e.g. one hospital at a time).");
      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch { throw new Error(`Server error: ${text.slice(0, 200)}`); }
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setResult(json);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setStatus("error");
    }
  };

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link
          href="/hospital-prices"
          className="mb-6 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"
        >
          ← Back to Marketplace
        </Link>

        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          Upload Price Transparency Data
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Upload any <strong>CSV</strong> or <strong>Excel (.xlsx)</strong> price transparency file —
          regardless of format. AI will automatically detect the structure, column names, and layout
          (including wide/pivot formats) and map it correctly.
        </p>

        {/* AI detection callout */}
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <span className="mt-0.5 text-base">✨</span>
          <div>
            <p className="font-medium">AI-powered structure detection</p>
            <p className="mt-0.5 text-xs text-blue-500">
              Works with CMS standard files, custom hospital exports, pivot tables, per-hospital
              files, and any other layout. No manual column mapping required.
            </p>
          </div>
        </div>

        {/* Expected format reference */}
        <details className="mt-4 rounded-lg border border-neutral-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-700">
            Example column formats (click to expand)
          </summary>
          <div className="border-t border-neutral-100 px-4 py-3">
            <p className="mb-2 text-xs text-neutral-500">
              These are just examples — the AI handles many variations automatically.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-100">
                    {["hospital_name","address","cpt_code","procedure_name","category","payer_name","payer_type","price","price_type"].map(
                      (h) => (
                        <th key={h} className="px-2 py-1.5 text-left font-mono font-medium text-neutral-500">
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {["NYU Langone","550 1st Ave","27447","Knee Replacement","Orthopedics","Aetna PPO","commercial","32500","negotiated"].map(
                      (v, i) => (
                        <td key={i} className="px-2 py-1.5 font-mono text-neutral-400">{v}</td>
                      )
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-neutral-400">
              Required fields: <code className="rounded bg-neutral-100 px-1">hospital_name</code>,{" "}
              <code className="rounded bg-neutral-100 px-1">cpt_code</code>,{" "}
              <code className="rounded bg-neutral-100 px-1">price</code> — but column names can vary widely.
            </p>
          </div>
        </details>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
            dragOver
              ? "border-blue-400 bg-blue-50"
              : file
              ? "border-green-400 bg-green-50"
              : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {file ? (
            <>
              <span className="text-2xl">{isXlsx(file) ? "📊" : "📄"}</span>
              <p className="mt-2 font-medium text-neutral-800">{file.name}</p>
              <p className="text-sm text-neutral-400">
                {(file.size / 1024).toFixed(1)} KB — click to change
              </p>
            </>
          ) : (
            <>
              <span className="text-3xl">⬆️</span>
              <p className="mt-2 font-medium text-neutral-700">Drop your file here</p>
              <p className="text-sm text-neutral-400">CSV or Excel (.xlsx) — click to browse</p>
            </>
          )}
        </div>

        {/* XLSX notice */}
        {file && isXlsx(file) && headers.length === 0 && status !== "done" && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            <span className="text-lg">📊</span>
            <div>
              <p className="font-medium">Excel file ready</p>
              <p className="text-xs text-blue-500">
                AI will analyze all sheets and detect the correct structure automatically.
              </p>
            </div>
          </div>
        )}

        {/* CSV preview */}
        {headers.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <p className="border-b border-neutral-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Preview (first 3 rows)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50">
                    {headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left font-medium text-neutral-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-b border-neutral-50">
                      {row.map((cell, j) => (
                        <td key={j} className="max-w-[140px] truncate px-3 py-2 text-neutral-700">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Upload in progress */}
        {status === "uploading" && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-4 text-sm text-neutral-600">
            <Loader2 className="size-4 animate-spin text-blue-500" />
            <div>
              <p className="font-medium text-neutral-800">Analyzing file structure with AI…</p>
              <p className="text-xs text-neutral-400">
                Detecting column layout, format type, and payer information
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Success */}
        {status === "done" && result && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-4">
              <p className="font-semibold text-green-800">Import complete!</p>
              <ul className="mt-2 space-y-1 text-sm text-green-700">
                <li>🏥 {result.hospitalsUpserted} hospital{result.hospitalsUpserted !== 1 ? "s" : ""} added / updated</li>
                <li>🩺 {result.proceduresUpserted} procedure{result.proceduresUpserted !== 1 ? "s" : ""} added / updated</li>
                <li>💰 {result.pricesInserted} price entr{result.pricesInserted !== 1 ? "ies" : "y"} inserted</li>
              </ul>
              <Link
                href="/hospital-prices"
                className="mt-3 inline-block text-sm font-medium text-green-800 underline underline-offset-2 hover:text-green-900"
              >
                View marketplace →
              </Link>
            </div>

            {/* What AI detected */}
            {result.schemaDetected && (
              <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  What AI detected
                </p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <dt className="text-neutral-400">Format</dt>
                  <dd className="font-medium text-neutral-700 capitalize">{result.schemaDetected.format}</dd>
                  <dt className="text-neutral-400">Sheet used</dt>
                  <dd className="font-medium text-neutral-700">{result.schemaDetected.bestSheet}</dd>
                  <dt className="text-neutral-400">Header row</dt>
                  <dd className="font-medium text-neutral-700">Row {result.schemaDetected.headerRow + 1}</dd>
                  <dt className="text-neutral-400">Hospital source</dt>
                  <dd className="font-medium text-neutral-700 capitalize">
                    {result.schemaDetected.hospitalSource === "filename"
                      ? `Filename (${result.schemaDetected.hospitalNameFromFilename})`
                      : "Column in file"}
                  </dd>
                </dl>
                {result.schemaDetected.notes && (
                  <p className="mt-2 text-xs text-neutral-500 italic">&quot;{result.schemaDetected.notes}&quot;</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Upload button */}
        {file && status !== "done" && status !== "uploading" && (
          <Button onClick={handleUpload} className="mt-4 w-full">
            Import Price Data
          </Button>
        )}
      </div>
    </main>
  );
}
