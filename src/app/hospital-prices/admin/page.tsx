"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Shield, Loader2 } from "lucide-react";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
      router.push("/hospital-prices");
    } else {
      setError("Incorrect password.");
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-[80vh] items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, #2d0606 0%, #3b0a50 50%, #0a0820 100%)" }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10">
            <Shield className="size-6 text-violet-300" />
          </div>
          <h1 className="text-2xl font-bold text-white">Admin Access</h1>
          <p className="mt-2 text-sm text-white/50">
            Sign in to edit site content directly on the live pages
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white placeholder:text-white/30 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {loading ? "Signing in…" : "Sign in & edit site"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-white/30">
          After signing in you&apos;ll see the live site with editable text fields.
          Click any text to edit, then save. Changes go live instantly.
        </p>
      </div>
    </div>
  );
}
