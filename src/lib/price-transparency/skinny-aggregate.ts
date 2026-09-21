/** Streaming aggregator: many charge rows → one skinny row per billing code. */

export interface ChargeSample {
  code: string;
  codeKind: string;
  description: string;
  priceType: "gross" | "cash" | "negotiated";
  priceCents: number;
}

export interface SkinnyRow {
  code: string;
  codeKind: string;
  description: string;
  listCents: number | null;
  cashCents: number | null;
  negotiatedCents: number | null;
  negotiatedMinCents: number | null;
  negotiatedMaxCents: number | null;
  sampleCount: number;
}

interface Acc {
  codeKind: string;
  description: string;
  list: number[];
  cash: number[];
  negotiated: number[];
}

const MAX_SAMPLES = 4000;

export function medianCents(values: number[]): number | null {
  if (!values.length) return null;
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function pushCapped(arr: number[], v: number) {
  if (arr.length < MAX_SAMPLES) {
    arr.push(v);
    return;
  }
  // Reservoir: keep a uniform sample so the median stays meaningful on huge files.
  const i = Math.floor(Math.random() * (arr.length + 1));
  if (i < arr.length) arr[i] = v;
}

export class SkinnyAggregator {
  private byCode = new Map<string, Acc>();
  discovered = 0;
  accepted = 0;

  add(sample: ChargeSample): void {
    this.discovered++;
    const code = sample.code.trim();
    if (!code || sample.priceCents <= 0) return;
    this.accepted++;
    let acc = this.byCode.get(code);
    if (!acc) {
      acc = { codeKind: sample.codeKind, description: sample.description, list: [], cash: [], negotiated: [] };
      this.byCode.set(code, acc);
    }
    if (sample.description && sample.description.length > acc.description.length) acc.description = sample.description;
    if (sample.codeKind && acc.codeKind === "unknown") acc.codeKind = sample.codeKind;
    if (sample.priceType === "gross") pushCapped(acc.list, sample.priceCents);
    else if (sample.priceType === "cash") pushCapped(acc.cash, sample.priceCents);
    else pushCapped(acc.negotiated, sample.priceCents);
  }

  toRows(): SkinnyRow[] {
    const rows: SkinnyRow[] = [];
    for (const [code, acc] of this.byCode) {
      const nmin = acc.negotiated.length ? Math.min(...acc.negotiated) : null;
      const nmax = acc.negotiated.length ? Math.max(...acc.negotiated) : null;
      rows.push({
        code,
        codeKind: acc.codeKind,
        description: acc.description.slice(0, 800),
        listCents: medianCents(acc.list),
        cashCents: medianCents(acc.cash),
        negotiatedCents: medianCents(acc.negotiated),
        negotiatedMinCents: nmin,
        negotiatedMaxCents: nmax,
        sampleCount: acc.list.length + acc.cash.length + acc.negotiated.length,
      });
    }
    return rows;
  }
}
