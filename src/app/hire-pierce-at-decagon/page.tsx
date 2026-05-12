"use client";

import type { Metadata } from "next";
import { useState } from "react";

export default function HirePierceAtDecagonPage() {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <main className="min-h-screen bg-white text-[#0A0A23] antialiased relative overflow-hidden">
      {/* Soft gradient blobs (Decagon-style decoration) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full blur-3xl opacity-50"
        style={{
          background:
            "radial-gradient(closest-side, rgba(0,212,184,0.55), rgba(0,212,184,0))",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 -left-48 h-[420px] w-[420px] rounded-full blur-3xl opacity-40"
        style={{
          background:
            "radial-gradient(closest-side, rgba(99,102,241,0.45), rgba(99,102,241,0))",
        }}
      />

      {/* Nav */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <DecagonMark />
          <span className="text-lg font-semibold tracking-tight">
            Hire Pierce
          </span>
        </div>
        <a
          href="mailto:jphberkman@gmail.com"
          className="rounded-full bg-[#00D4B8] px-5 py-2 text-sm font-semibold text-[#0A0A23] transition hover:bg-[#00bfa6]"
        >
          Get in touch
        </a>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-12 md:pt-20">
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
          {/* Photo */}
          <div className="order-1 md:order-2 flex justify-center md:justify-end">
            <div className="relative">
              <div
                aria-hidden
                className="absolute -inset-3 rounded-3xl bg-gradient-to-tr from-[#00D4B8] to-[#6366F1] opacity-80 blur-2xl"
              />
              <div className="relative h-72 w-72 overflow-hidden rounded-3xl bg-[#0A0A23] shadow-xl ring-1 ring-black/5 md:h-96 md:w-96">
                {!imgFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src="/pierce.jpg"
                    alt="Pierce Berkman"
                    className="h-full w-full object-cover"
                    onError={() => setImgFailed(true)}
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center text-white/70">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-2xl font-semibold text-white">
                      PB
                    </div>
                    <p className="text-sm">
                      Drop a photo at{" "}
                      <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">
                        /public/pierce.jpg
                      </code>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Heading + blurb */}
          <div className="order-2 md:order-1">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#0A0A23]/5 px-3 py-1 text-xs font-medium tracking-wide text-[#0A0A23]/70">
              <span className="h-1.5 w-1.5 rounded-full bg-[#00D4B8]" />
              Built for the Decagon team
            </p>
            <h1 className="text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              Hi, I&apos;m Pierce.
              <br />
              <span className="text-[#0A0A23]/60">
                Here&apos;s why I want to work at Decagon.
              </span>
            </h1>

            <div className="mt-8 max-w-xl text-lg leading-relaxed text-[#0A0A23]/75">
              {/*
                Replace this placeholder paragraph with your real blurb.
                Keep it 2–4 short paragraphs for the cleanest read.
              */}
              <p className="italic text-[#0A0A23]/50">
                [Your blurb goes here. Tell Decagon why you want to join — what
                drew you to AI agents for customer experience, what you&apos;d
                bring to the team, and the kind of problems you want to be
                solving next. Replace this paragraph in{" "}
                <code className="not-italic rounded bg-[#0A0A23]/5 px-1.5 py-0.5 text-sm">
                  src/app/hire-pierce-at-decagon/page.tsx
                </code>
                .]
              </p>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <a
                href="mailto:jphberkman@gmail.com"
                className="rounded-full bg-[#0A0A23] px-6 py-3 text-sm font-semibold text-white transition hover:bg-black"
              >
                Email me
              </a>
              <a
                href="https://decagon.ai"
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-[#0A0A23]/15 px-6 py-3 text-sm font-semibold text-[#0A0A23] transition hover:border-[#0A0A23]/40"
              >
                Visit Decagon →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 mx-auto max-w-6xl px-6 pb-10 text-sm text-[#0A0A23]/50">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#0A0A23]/10 pt-6">
          <span>© {new Date().getFullYear()} Pierce Berkman</span>
          <span>
            Not affiliated with Decagon — a personal pitch from a fan of the
            product.
          </span>
        </div>
      </footer>
    </main>
  );
}

function DecagonMark() {
  // Minimal decagon geometric mark in the brand teal
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <polygon
        points="50,4 78.5,15.5 96,40 96,60 78.5,84.5 50,96 21.5,84.5 4,60 4,40 21.5,15.5"
        fill="#0A0A23"
      />
      <polygon
        points="50,22 68,30 80,46 80,54 68,70 50,78 32,70 20,54 20,46 32,30"
        fill="#00D4B8"
      />
    </svg>
  );
}
