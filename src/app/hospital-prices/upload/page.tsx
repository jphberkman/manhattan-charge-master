"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type FileStatus = "pending" | "uploading" | "done" | "error";

interface FileItem {
  id: string;
  file: File;
  status: FileStatus;
  error?: string;
  result?: { hospitalsUpserted: number; proceduresUpserted: number; pricesInserted: number };
}

export default function UploadPage() {
  const [queue, setQueue] = useState<FileItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const valid: FileItem[] = [];
    for (const file of Array.from(files)) {
      if (!/\.(csv|xlsx|xls|xlsm|json|zip)$/i.test(file.name)) continue;
      valid.push({ id: `${file.name}-${Date.now()}-${Math.random()}`, file, status: "pending" });
    }
    setQueue((q) => [...q, ...valid]);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const removeItem = (id: string) => setQueue((q) => q.filter((f) => f.id !== id));

  const updateItem = (id: string, patch: Partial<FileItem>) =>
    setQueue((q) => q.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const processAll = async () => {
    const pending = queue.filter((f) => f.status === "pending");
    if (pending.length === 0) return;
    setRunning(true);

    for (const item of pending) {
      updateItem(item.id, { status: "uploading" });
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "x-filename": item.file.name, "content-type": "application/octet-stream" },
          body: item.file,
        });
        if (res.status === 413) throw new Error("File too large — try splitting it into smaller files.");
        const text = await res.text();
        let json: any;
        try { json = JSON.parse(text); } catch { throw new Error(`Server error: ${text.slice(0, 200)}`); }
        if (!res.ok) throw new Error(json.error ?? "Upload failed");
        updateItem(item.id, { status: "done", result: json });
      } catch (e) {
        updateItem(item.id, { status: "error", error: e instanceof Error ? e.message : "Upload failed" });
      }
    }

    setRunning(false);
  };

  const total = queue.reduce(
    (acc, f) => ({
      hospitals: acc.hospitals + (f.result?.hospitalsUpserted ?? 0),
      procedures: acc.procedures + (f.result?.proceduresUpserted ?? 0),
      prices: acc.prices + (f.result?.pricesInserted ?? 0),
    }),
    { hospitals: 0, procedures: 0, prices: 0 }
  );

  const pendingCount = queue.filter((f) => f.status === "pending").length;
  const doneCount = queue.filter((f) => f.status === "done").length;
  const errorCount = queue.filter((f) => f.status === "error").length;

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/hospital-prices" className="mb-6 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800">
          ← Back to Marketplace
        </Link>

        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Upload Price Transparency Data</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Upload hospital price transparency files — CSV, Excel, JSON (CMS 2.0), or ZIP.
          AI detects structure automatically. All data is saved to the shared database.
        </p>

        <div className="mt-4 flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <span className="mt-0.5 text-base">✨</span>
          <div>
            <p className="font-medium">AI-powered structure detection</p>
            <p className="mt-0.5 text-xs text-blue-500">
              Works with CMS standard files, custom hospital exports, pivot tables, and any other layout. Select multiple files at once.
            </p>
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "mt-6 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragOver ? "border-blue-400 bg-blue-50" : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".csv,.xlsx,.xls,.xlsm,.json,.zip"
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }}
          />
          <span className="text-3xl">⬆️</span>
          <p className="mt-2 font-medium text-neutral-700">Drop files here or click to browse</p>
          <p className="text-sm text-neutral-400">CSV, Excel (.xlsx), JSON (CMS 2.0), or ZIP — multiple files OK</p>
        </div>

        {/* File queue */}
        {queue.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {queue.length} file{queue.length !== 1 ? "s" : ""}
                {doneCount > 0 && <span className="ml-2 text-green-600">{doneCount} done</span>}
                {errorCount > 0 && <span className="ml-2 text-red-500">{errorCount} failed</span>}
              </p>
              {pendingCount > 0 && !running && (
                <button
                  onClick={(e) => { e.stopPropagation(); setQueue((q) => q.filter((f) => f.status !== "done")); }}
                  className="text-xs text-neutral-400 hover:text-neutral-600"
                >
                  Clear done
                </button>
              )}
            </div>

            <ul className="divide-y divide-neutral-50">
              {queue.map((item) => (
                <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                  {/* Icon */}
                  <span className="mt-0.5 text-lg shrink-0">
                    {/\.zip$/i.test(item.file.name) ? "🗜️"
                      : /\.json$/i.test(item.file.name) ? "📋"
                      : /\.xlsx?/i.test(item.file.name) ? "📊"
                      : "📄"}
                  </span>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-800">{item.file.name}</p>
                    <p className="text-xs text-neutral-400">{(item.file.size / 1024 / 1024).toFixed(1)} MB</p>
                    {item.status === "done" && item.result && (
                      <p className="mt-1 text-xs text-green-600">
                        🏥 {item.result.hospitalsUpserted} hospitals · 🩺 {item.result.proceduresUpserted} procedures · 💰 {item.result.pricesInserted.toLocaleString()} prices
                      </p>
                    )}
                    {item.status === "error" && (
                      <p className="mt-1 text-xs text-red-500">{item.error}</p>
                    )}
                  </div>

                  {/* Status */}
                  <div className="shrink-0 flex items-center gap-2">
                    {item.status === "uploading" && <Loader2 className="size-4 animate-spin text-blue-500" />}
                    {item.status === "done" && <CheckCircle className="size-4 text-green-500" />}
                    {item.status === "error" && <XCircle className="size-4 text-red-500" />}
                    {item.status === "pending" && !running && (
                      <button
                        onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                        className="text-neutral-300 hover:text-neutral-500 text-lg leading-none"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Summary after all done */}
        {doneCount > 0 && doneCount === queue.filter((f) => f.status !== "error").length && pendingCount === 0 && !running && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="size-5 text-green-600 shrink-0" />
              <p className="font-semibold text-green-800">Import complete</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Hospitals", value: total.hospitals, icon: "🏥" },
                { label: "Procedures", value: total.procedures, icon: "🩺" },
                { label: "Price entries", value: total.prices.toLocaleString(), icon: "💰" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg bg-white border border-green-100 px-3 py-2.5 text-center">
                  <p className="text-lg">{stat.icon}</p>
                  <p className="text-lg font-bold text-green-800">{stat.value}</p>
                  <p className="text-xs text-green-600">{stat.label}</p>
                </div>
              ))}
            </div>
            <Link
              href="/hospital-prices"
              className="mt-3 inline-block text-sm font-medium text-green-800 underline underline-offset-2 hover:text-green-900"
            >
              View marketplace with real data →
            </Link>
          </div>
        )}

        {/* Error summary */}
        {errorCount > 0 && pendingCount === 0 && !running && (
          <div className="mt-3 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <AlertCircle className="size-4 shrink-0 text-red-500 mt-0.5" />
            <p className="text-sm text-red-700">
              {errorCount} file{errorCount !== 1 ? "s" : ""} failed. Check the errors above and try re-uploading.
            </p>
          </div>
        )}

        {/* Upload button */}
        {pendingCount > 0 && !running && (
          <button
            onClick={processAll}
            className="mt-4 w-full rounded-xl bg-violet-700 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-violet-800"
          >
            Import {pendingCount} file{pendingCount !== 1 ? "s" : ""}
          </button>
        )}

        {running && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-4">
            <Loader2 className="size-5 animate-spin text-violet-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-neutral-800">Processing files…</p>
              <p className="text-xs text-neutral-400 mt-0.5">AI is detecting structure and importing prices. Large files may take several minutes each.</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
