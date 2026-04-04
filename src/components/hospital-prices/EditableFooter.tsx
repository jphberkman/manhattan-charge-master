"use client";

import Link from "next/link";
import { EditableText } from "./EditableText";

export function EditableFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#0a0820]">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-3">
          {/* Brand */}
          <div>
            <p className="text-sm font-semibold text-white">Shop for Care</p>
            <EditableText
              contentKey="footer.brand"
              defaultValue="Helping you understand hospital prices using federally mandated transparency data."
              as="p"
              className="mt-2 text-sm leading-relaxed text-white/50"
              multiline
            />
          </div>

          {/* Links */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/30">
              Resources
            </p>
            <ul className="mt-3 space-y-2 text-sm text-white/50">
              <li>
                <Link href="/hospital-prices/about" className="hover:text-white">
                  About &amp; Methodology
                </Link>
              </li>
              <li>
                <Link href="/hospital-prices/explore" className="hover:text-white">
                  Concern Explorer
                </Link>
              </li>
            </ul>
          </div>

          {/* Disclaimer */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/30">
              Disclaimer
            </p>
            <EditableText
              contentKey="footer.disclaimer"
              defaultValue="This tool provides price information from publicly available hospital transparency files. It is not medical advice. Actual costs may vary based on your specific treatment, insurance benefits, and provider agreements. Always verify with your provider and insurer before making decisions."
              as="p"
              className="mt-3 text-xs leading-relaxed text-white/30"
              multiline
            />
          </div>
        </div>

        <div className="mt-8 border-t border-white/10 pt-6 text-center text-xs text-white/30">
          Data sourced from hospital price transparency files required under the
          Hospital Price Transparency Rule (CMS-1717-F2).
        </div>
      </div>
    </footer>
  );
}
