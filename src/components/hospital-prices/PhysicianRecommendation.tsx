"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Star, Building2, Sparkles,
  BadgeCheck, Trophy, ShieldCheck, DatabaseZap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PhysicianRecommendation, PhysicianResponse } from "@/app/api/physicians/recommend/route";
import type { HospitalComparisonEntry } from "@/app/api/hospitals/compare/route";
import type { InsuranceSelection } from "./InsuranceSelector";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  procedureName: string;
  cptCode: string | null;
  insurance: InsuranceSelection | null;
  hospitalPrices: HospitalComparisonEntry[];
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PhysicianRecommendations({ procedureName, cptCode, insurance, hospitalPrices }: Props) {
  const [physicians, setPhysicians] = useState<PhysicianRecommendation[]>([]);
  const [sourceNote, setSourceNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (prices: HospitalComparisonEntry[]) => {
    setLoading(true);
    setError(null);
    setPhysicians([]);
    setSourceNote(null);
    try {
      const res = await fetch("/api/physicians/recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          procedureName,
          cptCode,
          insurerName: insurance?.insurer ?? null,
          payerType:   insurance?.payerType ?? null,
          hospitalPrices: prices,
        }),
      });
      const data: PhysicianResponse = await res.json();
      if (!res.ok) throw new Error((data as any).error ?? "Failed");
      setPhysicians(data.physicians ?? []);
      setSourceNote(data.sourceNote ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load physician recommendations");
    } finally {
      setLoading(false);
    }
  }, [procedureName, cptCode, insurance]);

  useEffect(() => {
    load(hospitalPrices);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procedureName, cptCode, insurance]);

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">

      {/* ── Header ── */}
      <div className="border-b border-neutral-100 bg-gradient-to-r from-violet-700 to-indigo-700 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">Find a doctor</p>
            <h3 className="mt-0.5 text-lg font-bold text-white">Top surgeons for {procedureName}</h3>
            <p className="mt-0.5 text-sm text-violet-200">
              Recommended specialists · hospital affiliations · in-network status
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5">
            <Sparkles className="size-3.5 text-violet-200" />
            <span className="text-xs font-semibold text-white">AI-ranked · verify with your insurer</span>
          </div>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="space-y-3 px-6 py-5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-start gap-4 rounded-2xl border border-neutral-100 p-4"
              style={{ opacity: 1 - i * 0.25 }}
            >
              <div className="size-12 shrink-0 animate-pulse rounded-full bg-neutral-100" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 animate-pulse rounded bg-neutral-100" />
                <div className="h-3 w-56 animate-pulse rounded bg-neutral-100" />
                <div className="flex gap-2 mt-2">
                  <div className="h-8 w-36 animate-pulse rounded-xl bg-neutral-100" />
                  <div className="h-8 w-36 animate-pulse rounded-xl bg-neutral-100" />
                </div>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 pb-2">
            <Loader2 className="size-4 animate-spin text-violet-500" />
            <p className="text-sm text-neutral-500">Finding top specialists in Manhattan…</p>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <p className="px-6 py-6 text-sm text-red-600">{error}</p>
      )}

      {/* ── Results ── */}
      {!loading && !error && physicians.length > 0 && (
        <>
          <div className="divide-y divide-neutral-100">
            {physicians.map((doc, idx) => {
              const isBest = idx === 0;

              return (
                <div key={doc.name} className={cn(isBest && "bg-violet-50/40")}>
                  <div className="px-6 py-4">
                    <div className="flex items-start gap-4">

                      {/* Avatar + rank */}
                      <div className="relative shrink-0">
                        <div className={cn(
                          "flex size-12 items-center justify-center rounded-full text-lg font-bold text-white",
                          isBest ? "bg-violet-600" : "bg-neutral-300",
                        )}>
                          {doc.name.split(" ").at(-1)?.[0] ?? "?"}
                        </div>
                        {isBest && (
                          <div className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-amber-400 shadow">
                            <Trophy className="size-3 text-white" />
                          </div>
                        )}
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-neutral-900">{doc.name}</p>
                          <span className="text-xs font-medium text-neutral-500">{doc.credentials}</span>
                          {isBest && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">
                              <Star className="size-3" /> Top pick
                            </span>
                          )}
                          {doc.npiSource && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                              <DatabaseZap className="size-3" /> NPI Registry
                            </span>
                          )}
                          {!doc.npiSource && doc.npiVerified && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                              <ShieldCheck className="size-3" /> NPI Verified
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <p className="mt-0.5 text-sm text-neutral-600">{doc.npiSpecialty || doc.specialty}</p>
                          {doc.npi && (
                            <p className="mt-0.5 text-xs text-neutral-400">NPI {doc.npi}</p>
                          )}
                        </div>

                        <p className="mt-1 text-xs text-neutral-500 leading-snug">{doc.whyRecommended}</p>

                        {/* Highlights */}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {doc.highlights.map((h) => (
                            <span
                              key={h}
                              className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-xs text-neutral-600"
                            >
                              <BadgeCheck className="size-3 text-green-500" /> {h}
                            </span>
                          ))}
                        </div>

                        {/* Hospital affiliations */}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {doc.hospitals.map((h) => (
                            <span
                              key={h.hospitalId || h.hospitalName}
                              className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-xs font-medium text-neutral-700"
                            >
                              <Building2 className="size-3 text-neutral-400" /> {h.hospitalName}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-neutral-100 bg-neutral-50 px-6 py-3 space-y-1">
            {sourceNote && (
              <p className="text-xs text-neutral-500">
                <DatabaseZap className="inline size-3 mr-1 text-blue-500" />
                {sourceNote}
              </p>
            )}
            <p className="text-xs text-neutral-400">
              <ShieldCheck className="inline size-3 mr-1 text-green-500" />
              <span className="font-semibold text-neutral-500">NPI Registry</span> = sourced directly from the CMS National Provider Identifier database.{" "}
              <span className="font-semibold text-neutral-500">NPI Verified</span> = AI-recommended name matched in the registry.
            </p>
            <p className="text-xs text-neutral-400">
              <Sparkles className="inline size-3 mr-1 text-violet-400" />
              Always confirm your doctor is in-network with your insurance before booking.
            </p>
          </div>
        </>
      )}

      {!loading && !error && physicians.length === 0 && (
        <p className="py-10 text-center text-sm text-neutral-400">
          No physician recommendations available for this procedure.
        </p>
      )}
    </div>
  );
}
