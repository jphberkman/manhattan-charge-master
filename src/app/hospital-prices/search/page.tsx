import { HospitalPricesClient } from "@/components/hospital-prices/HospitalPricesClient";
import { SearchHeader } from "@/components/hospital-prices/SearchHeader";

export const metadata = {
  title: "Search for a Procedure — Shop for Care",
  description:
    "Describe what you need in plain English. We'll find matching procedures and show you real hospital prices from transparency files.",
};

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <SearchHeader />
      <HospitalPricesClient />
    </div>
  );
}
