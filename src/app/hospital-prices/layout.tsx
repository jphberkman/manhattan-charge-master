import { Navbar } from "@/components/hospital-prices/Navbar";
import Link from "next/link";

export default function HospitalPricesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-3">
          {/* Brand */}
          <div>
            <p className="text-sm font-semibold text-gray-900">Shop for Care</p>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              Helping you understand hospital prices using federally mandated
              transparency data.
            </p>
          </div>

          {/* Links */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Resources
            </p>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li>
                <Link href="/hospital-prices/about" className="hover:text-gray-900">
                  About &amp; Methodology
                </Link>
              </li>
              <li>
                <Link href="/hospital-prices/audit" className="hover:text-gray-900">
                  Data Quality
                </Link>
              </li>
              <li>
                <Link href="/hospital-prices/explore" className="hover:text-gray-900">
                  Concern Explorer
                </Link>
              </li>
            </ul>
          </div>

          {/* Disclaimer */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Disclaimer
            </p>
            <p className="mt-3 text-xs leading-relaxed text-gray-400">
              This tool provides price information from publicly available
              hospital transparency files. It is not medical advice. Actual costs
              may vary based on your specific treatment, insurance benefits, and
              provider agreements. Always verify with your provider and insurer
              before making decisions.
            </p>
          </div>
        </div>

        <div className="mt-8 border-t border-gray-100 pt-6 text-center text-xs text-gray-400">
          Data sourced from hospital price transparency files required under the
          Hospital Price Transparency Rule (CMS-1717-F2).
        </div>
      </div>
    </footer>
  );
}
