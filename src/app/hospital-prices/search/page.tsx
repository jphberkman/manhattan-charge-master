import { HospitalPricesClient } from "@/components/hospital-prices/HospitalPricesClient";
import { Search, ShieldCheck } from "lucide-react";

export const metadata = {
  title: "Search for a Procedure — Shop for Care",
  description:
    "Describe what you need in plain English. We'll find matching procedures and show you real hospital prices from transparency files.",
};

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <Search className="size-5 text-violet-600" />
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Search for a Procedure
          </h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
          Describe what you need in plain English. We&apos;ll find matching
          procedures and show you real hospital prices.
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
          <ShieldCheck className="size-3.5" />
          AI helps us understand your search terms. All prices shown come from
          hospital transparency files.
        </div>
      </div>

      {/* Existing marketplace component */}
      <HospitalPricesClient />
    </div>
  );
}
