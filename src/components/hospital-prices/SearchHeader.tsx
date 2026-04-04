"use client";

import { Search, ShieldCheck } from "lucide-react";
import { EditableText } from "./EditableText";

export function SearchHeader() {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2">
        <Search className="size-5 text-violet-400" />
        <EditableText
          contentKey="search.header.title"
          defaultValue="Search for a Procedure"
          as="h1"
          className="text-2xl font-bold tracking-tight text-white"
        />
      </div>
      <EditableText
        contentKey="search.header.description"
        defaultValue="Describe what you need in plain English. We'll find matching procedures and show you real hospital prices."
        as="p"
        className="mt-2 max-w-2xl text-sm leading-relaxed text-white/50"
        multiline
      />
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-900/20 px-3 py-1.5 text-xs font-medium text-emerald-400">
        <ShieldCheck className="size-3.5" />
        AI helps us understand your search terms. All prices shown come from hospital transparency files.
      </div>
    </div>
  );
}
