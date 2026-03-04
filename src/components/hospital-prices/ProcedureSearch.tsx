"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface Procedure {
  id: string;
  cptCode: string;
  name: string;
  category: string;
  description: string;
}

interface Props {
  procedures: Procedure[];
  selected: Procedure | null;
  onSelect: (p: Procedure) => void;
}

export function ProcedureSearch({ procedures, selected, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // All unique categories sorted
  const allCategories = Array.from(new Set(procedures.map((p) => p.category))).sort();

  // Filter procedures by active category
  const filtered = activeCategory
    ? procedures.filter((p) => p.category === activeCategory)
    : procedures;

  // Group filtered procedures by category
  const groups = filtered.reduce<Record<string, Procedure[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});
  const categories = Object.keys(groups).sort();

  return (
    <div className="space-y-3">
      {/* Category filter chips */}
      {allCategories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveCategory(null)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              activeCategory === null
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50"
            )}
          >
            All
          </button>
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                activeCategory === cat
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Combobox */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {selected ? (
              <span className="truncate">
                <span className="text-muted-foreground mr-1.5 text-xs">
                  CPT {selected.cptCode}
                </span>
                {selected.name}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {activeCategory ? `Search ${activeCategory}…` : "Search procedures…"}
              </span>
            )}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search by name or CPT code…" />
            <CommandList>
              <CommandEmpty>No procedures found.</CommandEmpty>
              {categories.map((category, idx) => (
                <span key={category}>
                  {idx > 0 && <CommandSeparator />}
                  <CommandGroup heading={category}>
                    {groups[category].map((p) => (
                      <CommandItem
                        key={p.id}
                        value={`${p.cptCode} ${p.name} ${p.category}`}
                        onSelect={() => {
                          onSelect(p);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 size-4",
                            selected?.id === p.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="text-muted-foreground mr-2 font-mono text-xs">
                          {p.cptCode}
                        </span>
                        {p.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </span>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
