"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";
import type { PriceApiEntry } from "@/lib/price-transparency/types";

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

interface Props {
  prices: PriceApiEntry[];
  loading: boolean;
}

interface HospitalSummary {
  hospitalId: string;
  name: string;
  shortName: string;
  min: number;
  max: number;
  avg: number;
}

export function PriceBarChart({ prices, loading }: Props) {
  const data = useMemo<HospitalSummary[]>(() => {
    const byHospital = new Map<string, { name: string; prices: number[] }>();
    for (const entry of prices) {
      if (entry.priceUsd <= 0) continue;
      const existing = byHospital.get(entry.hospital.id);
      if (existing) {
        existing.prices.push(entry.priceUsd);
      } else {
        byHospital.set(entry.hospital.id, {
          name: entry.hospital.name,
          prices: [entry.priceUsd],
        });
      }
    }

    return Array.from(byHospital.entries())
      .map(([id, { name, prices: vals }]) => {
        const sorted = [...vals].sort((a, b) => a - b);
        const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
        return {
          hospitalId: id,
          name,
          shortName: shortenName(name),
          min: sorted[0],
          max: sorted[sorted.length - 1],
          avg: Math.round(avg),
        };
      })
      .sort((a, b) => a.avg - b.avg);
  }, [prices]);

  if (loading) {
    return (
      <div className="flex h-[350px] items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50">
        <p className="text-sm text-neutral-400 animate-pulse">Loading chart…</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-[350px] items-center justify-center rounded-lg border-2 border-dashed border-neutral-200">
        <p className="text-sm text-neutral-400">No data to display</p>
      </div>
    );
  }

  const chartHeight = Math.max(250, data.length * 60);

  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      <p className="mb-4 text-xs text-neutral-500">
        Price range (min – max) and average across all payers per hospital
      </p>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 80, left: 0, bottom: 0 }}
          barCategoryGap="30%"
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
          <XAxis
            type="number"
            tickFormatter={(v) => fmt.format(v)}
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="shortName"
            width={160}
            tick={{ fontSize: 11, fill: "#374151" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="square"
            iconSize={10}
            formatter={(v) =>
              v === "min"
                ? "Minimum"
                : v === "max"
                  ? "Maximum"
                  : "Average"
            }
          />
          <Bar dataKey="min" name="min" fill="#bfdbfe" radius={[3, 0, 0, 3]} />
          <Bar dataKey="avg" name="avg" fill="#3b82f6" radius={0} />
          <Bar dataKey="max" name="max" fill="#1e3a8a" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 shadow-md text-sm">
      <p className="font-semibold text-neutral-900 mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-6 text-neutral-600">
          <span className="capitalize">{p.name === "avg" ? "Average" : p.name === "min" ? "Minimum" : "Maximum"}</span>
          <span className="font-mono font-medium text-neutral-900">
            {fmt.format(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function shortenName(name: string): string {
  return name
    .replace("Memorial Sloan Kettering Cancer Center", "MSK")
    .replace("NYU Langone Health (Tisch Hospital)", "NYU Langone")
    .replace("Hospital", "Hosp.")
    .replace("Medical Center", "Med. Ctr.")
    .replace("Health System", "Health Sys.");
}
