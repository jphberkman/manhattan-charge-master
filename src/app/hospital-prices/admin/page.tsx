"use client";

import { useState, useEffect, FormEvent, useCallback } from "react";
import {
  Shield,
  Loader2,
  Save,
  RotateCcw,
  Clock,
  ChevronRight,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  History,
  FileText,
  Home,
  Search,
  Compass,
  Info,
  LayoutTemplate,
  X,
} from "lucide-react";
import type { ContentField } from "@/lib/content-registry";

// ── Types ────────────────────────────────────────────────────────────────────

interface FieldWithValue extends ContentField {
  value: string;
  updatedAt: string | null;
}

interface HistoryEntry {
  id: string;
  key: string;
  oldValue: string;
  newValue: string;
  changedAt: string;
  changedBy: string;
}

// ── Page icons for sidebar ───────────────────────────────────────────────────

const PAGE_ICONS: Record<string, typeof Home> = {
  "Home Page": Home,
  "Search Page": Search,
  "Concern Explorer": Compass,
  "About Page": Info,
  "Footer": LayoutTemplate,
};

// ── Main export ──────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  // Check if already authenticated
  useEffect(() => {
    const isAdmin = document.cookie
      .split(";")
      .some((c) => c.trim().startsWith("admin-session=authenticated"));
    setAuthed(isAdmin);
    setChecking(false);
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "linear-gradient(135deg, #2d0606 0%, #3b0a50 50%, #0a0820 100%)" }}>
        <Loader2 className="size-8 animate-spin text-violet-400" />
      </div>
    );
  }

  if (!authed) {
    return <LoginForm onSuccess={() => setAuthed(true)} />;
  }

  return <AdminDashboard onLogout={() => setAuthed(false)} />;
}

// ── Login Form ───────────────────────────────────────────────────────────────

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      onSuccess();
    } else {
      setError("Wrong password");
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, #2d0606 0%, #3b0a50 50%, #0a0820 100%)" }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10">
            <Shield className="size-6 text-violet-300" />
          </div>
          <h1 className="text-2xl font-bold text-white">Admin Portal</h1>
          <p className="mt-2 text-sm text-white/50">Enter admin password to manage site content</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            autoFocus
            className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white placeholder:text-white/30 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "Verifying..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Admin Dashboard ──────────────────────────────────────────────────────────

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [grouped, setGrouped] = useState<Record<string, FieldWithValue[]>>({});
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState("Home Page");
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pages = Object.keys(grouped);

  // Fetch content
  const fetchContent = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/content");
      const data = await res.json();
      setGrouped(data.grouped ?? {});
    } catch {
      setError("Failed to load content");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  // Fetch history
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/admin/content/history");
      const data = await res.json();
      setHistory(data.history ?? []);
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (historyOpen) fetchHistory();
  }, [historyOpen, fetchHistory]);

  // Save a single field
  const saveField = async (key: string) => {
    const value = editedValues[key];
    if (value === undefined) return;

    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) throw new Error("Save failed");

      // Update the grouped data locally
      setGrouped((prev) => {
        const copy = { ...prev };
        for (const page of Object.keys(copy)) {
          copy[page] = copy[page].map((f) =>
            f.key === key ? { ...f, value, updatedAt: new Date().toISOString() } : f,
          );
        }
        return copy;
      });

      // Clear edited state and show success
      setEditedValues((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
      setSavedKeys((prev) => new Set(prev).add(key));
      setTimeout(() => setSavedKeys((prev) => { const s = new Set(prev); s.delete(key); return s; }), 2000);
    } catch {
      setError(`Failed to save ${key}`);
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Revert a history entry
  const revertEntry = async (entry: HistoryEntry) => {
    try {
      const res = await fetch("/api/admin/content/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: entry.key, historyId: entry.id }),
      });
      if (!res.ok) throw new Error("Revert failed");

      // Refresh both content and history
      await Promise.all([fetchContent(), fetchHistory()]);
    } catch {
      setError(`Failed to revert ${entry.key}`);
    }
  };

  // Logout
  const handleLogout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    onLogout();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "linear-gradient(135deg, #2d0606 0%, #3b0a50 50%, #0a0820 100%)" }}>
        <div className="text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-violet-400" />
          <p className="mt-3 text-sm text-white/50">Loading content...</p>
        </div>
      </div>
    );
  }

  const activeFields = grouped[activePage] ?? [];

  // Group fields by section
  const sections: Record<string, FieldWithValue[]> = {};
  for (const f of activeFields) {
    if (!sections[f.section]) sections[f.section] = [];
    sections[f.section].push(f);
  }

  const hasUnsaved = Object.keys(editedValues).length > 0;

  return (
    <div className="flex min-h-screen" style={{ background: "linear-gradient(135deg, #2d0606 0%, #3b0a50 50%, #0a0820 100%)" }}>
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <div className="flex size-9 items-center justify-center rounded-xl border border-white/20 bg-white/10">
            <Shield className="size-4 text-violet-300" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Admin CMS</p>
            <p className="text-[11px] text-white/40">Content Management</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-white/30">Pages</p>
          {pages.map((page) => {
            const Icon = PAGE_ICONS[page] ?? FileText;
            const isActive = page === activePage;
            return (
              <button
                key={page}
                onClick={() => setActivePage(page)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-all ${
                  isActive
                    ? "bg-violet-600/30 text-white font-medium"
                    : "text-white/50 hover:bg-white/5 hover:text-white/80"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                {page}
                {isActive && <ChevronRight className="ml-auto size-3.5" />}
              </button>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-white/10 px-3 py-4">
          <button
            onClick={() => setHistoryOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/50 transition-all hover:bg-white/5 hover:text-white/80"
          >
            <History className="size-4" />
            Change History
          </button>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400/70 transition-all hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut className="size-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/30 px-6 py-4 backdrop-blur-md">
          <div>
            <h1 className="text-lg font-bold text-white">{activePage}</h1>
            <p className="text-xs text-white/40">{activeFields.length} editable fields</p>
          </div>
          {hasUnsaved && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-900/20 px-3 py-1.5 text-xs font-medium text-amber-300">
              <AlertTriangle className="size-3.5" />
              Unsaved changes
            </div>
          )}
        </div>

        {/* Error toast */}
        {error && (
          <div className="mx-6 mt-4 flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-900/20 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-red-300">
              <AlertTriangle className="size-4 shrink-0" />
              {error}
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Sections */}
        <div className="space-y-8 px-6 py-6">
          {Object.entries(sections).map(([sectionName, fields]) => (
            <div key={sectionName}>
              <div className="mb-4 flex items-center gap-2">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs font-semibold uppercase tracking-widest text-white/30">{sectionName}</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
              <div className="space-y-4">
                {fields.map((field) => {
                  const currentValue = editedValues[field.key] ?? field.value;
                  const isEdited = field.key in editedValues && editedValues[field.key] !== field.value;
                  const isSaving = saving[field.key];
                  const justSaved = savedKeys.has(field.key);

                  return (
                    <div
                      key={field.key}
                      className={`rounded-xl border p-4 transition-all ${
                        isEdited
                          ? "border-violet-500/50 bg-violet-500/5"
                          : "border-white/10 bg-white/5"
                      }`}
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                          <label className="text-sm font-medium text-white">{field.label}</label>
                          <p className="text-[11px] text-white/30">{field.key}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {field.updatedAt && (
                            <span className="flex items-center gap-1 text-[10px] text-white/20">
                              <Clock className="size-3" />
                              {new Date(field.updatedAt).toLocaleDateString()}
                            </span>
                          )}
                          {justSaved && (
                            <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                              <CheckCircle2 className="size-3.5" />
                              Saved
                            </span>
                          )}
                        </div>
                      </div>

                      {field.multiline ? (
                        <textarea
                          value={currentValue}
                          onChange={(e) =>
                            setEditedValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          rows={3}
                          maxLength={field.maxLength}
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none transition-all focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 resize-y"
                        />
                      ) : (
                        <input
                          type="text"
                          value={currentValue}
                          onChange={(e) =>
                            setEditedValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          maxLength={field.maxLength}
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none transition-all focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20"
                        />
                      )}

                      <div className="mt-2 flex items-center justify-between">
                        <span className={`text-[11px] ${currentValue.length > field.maxLength ? "text-red-400" : "text-white/20"}`}>
                          {currentValue.length} / {field.maxLength}
                        </span>
                        {isEdited && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                setEditedValues((prev) => {
                                  const copy = { ...prev };
                                  delete copy[field.key];
                                  return copy;
                                })
                              }
                              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-white/40 transition-all hover:bg-white/5 hover:text-white/70"
                            >
                              <RotateCcw className="size-3" />
                              Reset
                            </button>
                            <button
                              onClick={() => saveField(field.key)}
                              disabled={isSaving}
                              className="flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-violet-500 disabled:opacity-50"
                            >
                              {isSaving ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Save className="size-3" />
                              )}
                              Save
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* History Drawer */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setHistoryOpen(false)} />

          {/* Panel */}
          <div className="relative w-full max-w-md border-l border-white/10 bg-[#12102a] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <History className="size-5 text-violet-400" />
                <h2 className="text-base font-bold text-white">Change History</h2>
              </div>
              <button onClick={() => setHistoryOpen(false)} className="rounded-lg p-1.5 text-white/40 transition-all hover:bg-white/10 hover:text-white">
                <X className="size-5" />
              </button>
            </div>

            <div className="h-[calc(100vh-65px)] overflow-auto px-5 py-4">
              {historyLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-6 animate-spin text-violet-400" />
                </div>
              ) : history.length === 0 ? (
                <div className="py-12 text-center text-sm text-white/30">No changes recorded yet</div>
              ) : (
                <div className="space-y-3">
                  {history.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <p className="text-xs font-medium text-violet-300">{entry.key}</p>
                        <span className="shrink-0 text-[10px] text-white/25">
                          {new Date(entry.changedAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex gap-2">
                          <span className="shrink-0 font-medium text-red-400/70">Old:</span>
                          <span className="text-white/40 line-clamp-2">{entry.oldValue || "(empty)"}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="shrink-0 font-medium text-emerald-400/70">New:</span>
                          <span className="text-white/40 line-clamp-2">{entry.newValue}</span>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[10px] text-white/20">{entry.changedBy}</span>
                        <button
                          onClick={() => revertEntry(entry)}
                          className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/50 transition-all hover:border-violet-400/30 hover:bg-violet-500/10 hover:text-violet-300"
                        >
                          <RotateCcw className="size-3" />
                          Revert to old
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
