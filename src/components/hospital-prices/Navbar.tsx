"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HeartPulse,
  Search,
  Compass,
  Info,
  ShieldCheck,
  Menu,
  X,
  BadgeCheck,
} from "lucide-react";

const navLinks = [
  { href: "/hospital-prices/search", label: "Search", icon: Search },
  { href: "/hospital-prices/explore", label: "Concern Explorer", icon: Compass },
  { href: "/hospital-prices/about", label: "About", icon: Info },
  { href: "/hospital-prices/audit", label: "Data Quality", icon: ShieldCheck },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand */}
        <Link
          href="/hospital-prices"
          className="flex items-center gap-2 text-lg font-bold tracking-tight text-gray-900"
        >
          <HeartPulse className="size-5 text-violet-600" strokeWidth={2.5} />
          <span>Shop for Care</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-violet-50 text-violet-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </div>

        {/* Trust badge — desktop */}
        <div className="hidden items-center gap-1.5 text-xs text-gray-400 lg:flex">
          <BadgeCheck className="size-3.5 text-emerald-500" />
          <span>Prices from hospital transparency files</span>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-gray-100 bg-white px-4 pb-4 pt-2 md:hidden">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-violet-50 text-violet-700"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
          <div className="mt-3 flex items-center gap-1.5 px-3 text-xs text-gray-400">
            <BadgeCheck className="size-3.5 text-emerald-500" />
            <span>Prices from hospital transparency files</span>
          </div>
        </div>
      )}
    </nav>
  );
}
