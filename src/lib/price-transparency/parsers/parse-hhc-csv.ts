import Papa from "papaparse";
import type { Readable } from "stream";
import {
  TARGET_CPT_CODES,
  classifyPayerType,
  normalizeCptCode,
  dollarsToCents,
} from "../hospital-registry";
import type { NormalizedPriceEntry } from "../types";

/**
 * Streaming parser for NYC Health + Hospitals (HHC) tall/long-format CSVs.
 * Accepts a Node.js Readable stream — never loads the full file into memory.
 *
 * Format: one row per payer per procedure.
 * Headers (row 1):
 *   Procedure, Code Type, Code, NDC, Rev Code, Procedure Description,
 *   Payer, Contract, IP Price, OP Price, Discounted Cash Price,
 *   IP Negotiated Charge, OP Negotiated Charge, PB Negotiated Charge,
 *   De-Identified Minimum Negotiated Charge (IP),
 *   De-Identified Maximum Negotiated Charge (IP),
 *   De-Identified Minimum Negotiated Charge (OP),
 *   De-Identified Maximum Negotiated Charge (OP)
 */
export function parseHhcCsvStream(
  stream: Readable,
  onEntry: (entry: NormalizedPriceEntry) => void
): Promise<number> {
  return new Promise((resolve, reject) => {
    let count = 0;

    Papa.parse(stream, {
      header: true,        // row 1 is the real header
      skipEmptyLines: true,
      step: (row) => {
        const data = row.data as Record<string, string>;
        count += processHhcRow(data, onEntry);
      },
      complete: () => resolve(count),
      error: (err: Error) => reject(err),
    });
  });
}

function processHhcRow(
  data: Record<string, string>,
  onEntry: (entry: NormalizedPriceEntry) => void
): number {
  // Only process CPT / HCPCS coded rows
  const codeType = (data["Code Type"] ?? "").toUpperCase().trim();
  if (codeType !== "CPT" && codeType !== "HCPCS") return 0;

  const rawCode = (data["Code"] ?? "").trim();
  const cptCode = normalizeCptCode(rawCode);
  if (!TARGET_CPT_CODES.has(cptCode)) return 0;

  const payerRaw = (data["Payer"] ?? "").trim();
  const contractRaw = (data["Contract"] ?? "").trim();

  // Build a descriptive payer label
  const payerLabel = contractRaw && contractRaw !== payerRaw
    ? `${payerRaw} — ${contractRaw}`
    : payerRaw || "Self-Pay";

  // For empty Payer the row typically represents the cash/self-pay price
  const isCashRow = !payerRaw || classifyPayerType(payerRaw) === "cash";
  const payerType = isCashRow ? "cash" : classifyPayerType(payerRaw);

  let count = 0;
  const emit = (
    name: string,
    pt: NormalizedPriceEntry["payerType"],
    cents: number | null,
    priceType: NormalizedPriceEntry["priceType"]
  ) => {
    if (cents === null) return;
    onEntry({ cptCode, rawCode, payerName: name, payerType: pt, priceInCents: cents, priceType });
    count++;
  };

  // Gross / list price — use IP Price as the chargemaster
  const ipPrice = dollarsToCents(data["IP Price"]);
  const opPrice = dollarsToCents(data["OP Price"]);
  if (ipPrice !== null) emit("Gross Charge (IP)", "other", ipPrice, "gross");
  else if (opPrice !== null) emit("Gross Charge (OP)", "other", opPrice, "gross");

  // Cash / discounted self-pay
  emit("Cash / Self-Pay", "cash", dollarsToCents(data["Discounted Cash Price"]), "discounted");

  // Negotiated rates (skip if this is a cash row — already captured above)
  if (!isCashRow) {
    const ipNeg = dollarsToCents(data["IP Negotiated Charge"]);
    const opNeg = dollarsToCents(data["OP Negotiated Charge"]);
    const pbNeg = dollarsToCents(data["PB Negotiated Charge"]);

    // Prefer inpatient, fall back to outpatient, then professional billing
    const negotiated = ipNeg ?? opNeg ?? pbNeg ?? null;
    emit(payerLabel, payerType, negotiated, "negotiated");
  }

  // De-identified min / max (inpatient preferred)
  const minIp = dollarsToCents(data["De-Identified Minimum Negotiated Charge (IP)"]);
  const maxIp = dollarsToCents(data["De-Identified Maximum Negotiated Charge (IP)"]);
  const minOp = dollarsToCents(data["De-Identified Minimum Negotiated Charge (OP)"]);
  const maxOp = dollarsToCents(data["De-Identified Maximum Negotiated Charge (OP)"]);

  emit("Min Charge", "other", minIp ?? minOp, "min");
  emit("Max Charge", "other", maxIp ?? maxOp, "max");

  return count;
}
