"use client";

import { cn } from "@/lib/utils";
import { ArrowRight, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import type { AlternativeProcedure } from "@/app/api/procedure-breakdown/route";

interface Props {
  primaryProcedure: string;
  primaryCptCode: string;
  alternatives: AlternativeProcedure[];
  onSelectAlternative: (name: string) => void;
}

export function ProcedureAlternatives({
  primaryProcedure,
  primaryCptCode,
  alternatives,
  onSelectAlternative,
}: Props) {
  if (!alternatives.length) return null;

  return (
    <div className="mt-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-neutral-700">
          Alternative approaches
        </h3>
        <p className="text-xs text-neutral-500 mt-0.5">
          Different surgical options for treating the same condition, each with
          trade-offs in recovery and outcomes. Click to view real hospital prices.
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {/* Primary procedure card */}
        <div
          className={cn(
            "flex-shrink-0 w-72 rounded-xl border-2 border-violet-300 bg-gradient-to-b from-violet-50 to-white p-4 shadow-sm",
            "snap-start"
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700">
              Most common
            </span>
          </div>
          <p className="text-sm font-bold text-neutral-900 leading-snug">
            {primaryProcedure}
          </p>
          {primaryCptCode && (
            <p className="text-[11px] text-neutral-400 mt-0.5">
              CPT {primaryCptCode}
            </p>
          )}
        </div>

        {/* Alternative cards */}
        {alternatives.map((alt) => (
          <div
            key={alt.cptCode || alt.name}
            className={cn(
              "flex-shrink-0 w-72 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md",
              "snap-start"
            )}
          >
            <p className="text-sm font-bold text-neutral-900 leading-snug">
              {alt.name}
            </p>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              {alt.approach}
              {alt.cptCode ? ` \u00B7 CPT ${alt.cptCode}` : ""}
            </p>

            <div className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500">
              <Clock className="size-3.5 shrink-0" />
              <span>Recovery: {alt.typicalRecovery}</span>
            </div>

            <div className="mt-2 space-y-1">
              <div className="flex items-start gap-1.5 text-xs text-green-700">
                <CheckCircle2 className="size-3.5 shrink-0 mt-0.5" />
                <span>{alt.pros}</span>
              </div>
              <div className="flex items-start gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                <span>{alt.cons}</span>
              </div>
            </div>

            <button
              onClick={() => onSelectAlternative(alt.name)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-700 transition-colors hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700"
            >
              View hospital prices
              <ArrowRight className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
