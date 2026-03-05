export type PayerType = "commercial" | "medicare" | "medicaid" | "cash" | "other";
export type PriceType = "gross" | "discounted" | "min" | "max" | "negotiated";

export interface NormalizedPriceEntry {
  cptCode: string;
  rawCode: string;
  payerName: string;
  payerType: PayerType;
  priceInCents: number;
  priceType: PriceType;
}

export interface HospitalConfig {
  id: string;
  name: string;
  address: string;
  sourceFile: string; // local path or URL
  format: "cms-json" | "nyu-csv" | "hhc-csv";
}

export interface PriceApiEntry {
  id: string;
  hospital: { id: string; name: string; address: string };
  payerName: string;
  payerType: PayerType;
  priceUsd: number;
  priceType: PriceType;
}
