/** Streaming aggregator: many charge rows → one skinny row per billing code. */

export interface ChargeSample {
  code: string;
  codeKind: string;
  description: string;
  priceType: "gross" | "cash" | "negotiated";
  /** gross | cash | commercial | medicare | medicaid | other — used for negotiated splits. */
  payerClass?: string;
  priceCents: number;
}

export interface SkinnyRow {
  code: string;
  codeKind: string;
  description: string;
  listCents: number | null;
  cashCents: number | null;
  negotiatedCents: number | null;
  commercialCents: number | null;
  medicareCents: number | null;
  medicaidCents: number | null;
  negotiatedMinCents: number | null;
  negotiatedMaxCents: number | null;
  sampleCount: number;
}

interface Acc {
  codeKind: string;
  description: string;
  list: number[];
  cash: number[];
  commercial: number[];
  medicare: number[];
  medicaid: number[];
}

const MAX_SAMPLES = 4000;
const INDEX_KINDS = new Set(["cpt-shaped", "hcpcs-level-2"]);

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
    if (sample.codeKind && !INDEX_KINDS.has(sample.codeKind) && sample.codeKind !== "unknown") {
      return;
    }
    this.accepted++;
    let acc = this.byCode.get(code);
    if (!acc) {
      acc = {
        codeKind: sample.codeKind,
        description: sample.description,
        list: [],
        cash: [],
        commercial: [],
        medicare: [],
        medicaid: [],
      };
      this.byCode.set(code, acc);
    }
    if (sample.description && sample.description.length > acc.description.length) acc.description = sample.description;
    if (sample.codeKind && INDEX_KINDS.has(sample.codeKind)) acc.codeKind = sample.codeKind;
    if (sample.priceType === "gross") pushCapped(acc.list, sample.priceCents);
    else if (sample.priceType === "cash") pushCapped(acc.cash, sample.priceCents);
    else {
      const cls = sample.payerClass ?? "commercial";
      if (cls === "medicare") pushCapped(acc.medicare, sample.priceCents);
      else if (cls === "medicaid") pushCapped(acc.medicaid, sample.priceCents);
      else pushCapped(acc.commercial, sample.priceCents);
    }
  }

  toRows(): SkinnyRow[] {
    const rows: SkinnyRow[] = [];
    for (const [code, acc] of this.byCode) {
      if (!INDEX_KINDS.has(acc.codeKind)) continue;
      const commercial = medianCents(acc.commercial);
      rows.push({
        code,
        codeKind: acc.codeKind,
        description: acc.description.slice(0, 800),
        listCents: medianCents(acc.list),
        cashCents: medianCents(acc.cash),
        negotiatedCents: commercial,
        commercialCents: commercial,
        medicareCents: medianCents(acc.medicare),
        medicaidCents: medianCents(acc.medicaid),
        negotiatedMinCents: acc.commercial.length ? Math.min(...acc.commercial) : null,
        negotiatedMaxCents: acc.commercial.length ? Math.max(...acc.commercial) : null,
        sampleCount: acc.list.length + acc.cash.length + acc.commercial.length + acc.medicare.length + acc.medicaid.length,
      });
    }
    return rows;
  }
}
