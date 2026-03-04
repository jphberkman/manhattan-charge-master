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
 * Streaming parser for NYU Langone-style wide-format CSVs.
 * Accepts a Node.js Readable stream — never loads the full file into memory.
 *
 * Format quirks:
 * - Row 1: metadata column names (hospital_name, last_updated_on, …)
 * - Row 2: metadata values
 * - Row 3: actual charge-data column headers
 * - Row 4+: one charge item per row
 *
 * Payer columns: standard_charge|{PAYER}|{PLAN}|negotiated_dollar
 */
export function parseNyuCsvStream(
  stream: Readable,
  onEntry: (entry: NormalizedPriceEntry) => void
): Promise<number> {
  return new Promise((resolve, reject) => {
    let rowIndex = 0;
    let headers: string[] = [];
    let payerCols: PayerColumn[] = [];
    let count = 0;

    Papa.parse(stream, {
      header: false, // manual header management: row 3 is the real header
      skipEmptyLines: true,
      step: (row) => {
        rowIndex++;
        const rowData = row.data as string[];

        if (rowIndex === 3) {
          // Row 3 = actual column header row
          headers = rowData;
          payerCols = resolvePayerColumns(headers);
          return;
        }
        if (rowIndex < 4 || headers.length === 0) return;

        // Build named object from positional data
        const data: Record<string, string> = {};
        headers.forEach((h, i) => {
          data[h] = rowData[i] ?? "";
        });

        count += processRow(data, payerCols, onEntry);
      },
      complete: () => resolve(count),
      error: (err: Error) => reject(err),
    });
  });
}

// ── Shared row processing ─────────────────────────────────────────────────────

function processRow(
  data: Record<string, string>,
  payerCols: PayerColumn[],
  onEntry: (entry: NormalizedPriceEntry) => void
): number {
  // Resolve CPT/HCPCS code from code|1, code|2, code|3 columns
  let cptCode: string | null = null;
  let rawCode = "";
  for (let i = 1; i <= 3; i++) {
    const type = (data[`code|${i}|type`] ?? "").toUpperCase();
    if (type === "CPT" || type === "HCPCS") {
      rawCode = data[`code|${i}`] ?? "";
      cptCode = normalizeCptCode(rawCode);
      if (TARGET_CPT_CODES.has(cptCode)) break;
      cptCode = null;
    }
  }
  if (!cptCode) return 0;

  let count = 0;
  const emit = (
    payerName: string,
    payerType: NormalizedPriceEntry["payerType"],
    priceInCents: number | null,
    priceType: NormalizedPriceEntry["priceType"]
  ) => {
    if (priceInCents === null) return;
    onEntry({ cptCode: cptCode!, rawCode, payerName, payerType, priceInCents, priceType });
    count++;
  };

  emit("Gross Charge", "other", dollarsToCents(data["standard_charge|gross"]), "gross");
  emit("Cash / Self-Pay", "cash", dollarsToCents(data["standard_charge|discounted_cash"]), "discounted");
  emit("Min Charge", "other", dollarsToCents(data["standard_charge|min"]), "min");
  emit("Max Charge", "other", dollarsToCents(data["standard_charge|max"]), "max");

  for (const col of payerCols) {
    emit(col.payerLabel, col.payerType, dollarsToCents(data[col.columnName]), "negotiated");
  }

  return count;
}

// ── Payer column resolution ───────────────────────────────────────────────────

interface PayerColumn {
  columnName: string;
  payerLabel: string;
  payerType: NormalizedPriceEntry["payerType"];
}

/**
 * Scans the header row to find all negotiated-dollar payer columns.
 * Column pattern: "standard_charge|{PAYER}|{PLAN}|negotiated_dollar"
 */
function resolvePayerColumns(fields: string[]): PayerColumn[] {
  const cols: PayerColumn[] = [];
  for (const field of fields) {
    const parts = field.split("|");
    if (
      parts.length >= 4 &&
      parts[0] === "standard_charge" &&
      parts[parts.length - 1] === "negotiated_dollar"
    ) {
      const payerName = parts[1];
      const planName = parts.slice(2, -1).join("|");
      const payerLabel = planName ? `${payerName} — ${planName}` : payerName;
      cols.push({
        columnName: field,
        payerLabel,
        payerType: classifyPayerType(payerName),
      });
    }
  }
  return cols;
}
