import { createReadStream } from "fs";
import { createInterface } from "readline";
import { Readable } from "stream";
import {
  TARGET_CPT_CODES,
  classifyPayerType,
  normalizeCptCode,
  dollarsToCents,
} from "../hospital-registry";
import type { NormalizedPriceEntry } from "../types";

/**
 * Streaming CMS-standard JSON parser.
 * Handles both v2.0 (with payers_information) and v2.2 (gross+cash only).
 * Uses readline to avoid loading multi-GB files into memory.
 */
export async function parseCmsJsonStream(
  source: string | Readable,
  onEntry: (entry: NormalizedPriceEntry) => void
): Promise<number> {
  const stream =
    typeof source === "string"
      ? createReadStream(source, { encoding: "utf-8" })
      : source;

  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  type State = "seeking" | "in_array" | "in_item";
  let state: State = "seeking";
  let depth = 0;
  let buffer = "";
  let itemsFound = 0;

  // Per-line string-aware brace counter state
  let inString = false;
  let escape = false;

  for await (const line of rl) {
    const trimmed = line.trim();

    if (state === "seeking") {
      if (trimmed.includes('"standard_charge_information"')) {
        state = "in_array";
      }
      continue;
    }

    if (state === "in_array") {
      if (trimmed === "{") {
        state = "in_item";
        depth = 1;
        inString = false;
        escape = false;
        buffer = "{\n";
        continue;
      }
      // End of array or outer object
      if (trimmed.startsWith("]") || trimmed === "}") break;
      continue;
    }

    if (state === "in_item") {
      buffer += line + "\n";

      // Count braces while respecting string context
      for (const ch of line) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === "\\" && inString) {
          escape = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }

      if (depth === 0) {
        // Strip trailing comma and parse
        const json = buffer.trimEnd().replace(/,$/, "");
        try {
          const item = JSON.parse(json) as CmsChargeItem;
          itemsFound += extractFromItem(item, onEntry);
        } catch {
          // Malformed item — skip
        }
        buffer = "";
        inString = false;
        escape = false;
        state = "in_array";
      }
    }
  }

  return itemsFound;
}

// ── Types for the CMS JSON schema ────────────────────────────────────────────

interface CmsCodeInfo {
  code: string;
  type: string;
}

interface CmsPayerInfo {
  payer_name: string;
  plan_name?: string;
  standard_charge_dollar?: number | null;
  methodology?: string;
}

interface CmsStandardCharge {
  setting?: string;
  gross_charge?: number | null;
  discounted_cash?: number | null;
  minimum?: number | null;
  maximum?: number | null;
  payers_information?: CmsPayerInfo[];
}

interface CmsChargeItem {
  description?: string;
  code_information?: CmsCodeInfo[];
  standard_charges?: CmsStandardCharge[];
}

// ── Extraction logic ─────────────────────────────────────────────────────────

function extractFromItem(
  item: CmsChargeItem,
  onEntry: (e: NormalizedPriceEntry) => void
): number {
  const codes = item.code_information ?? [];
  let count = 0;

  // Find the first matching CPT or HCPCS code
  for (const codeInfo of codes) {
    const type = (codeInfo.type ?? "").toUpperCase();
    if (type !== "CPT" && type !== "HCPCS") continue;

    const rawCode = codeInfo.code ?? "";
    const cptCode = normalizeCptCode(rawCode);
    if (!TARGET_CPT_CODES.has(cptCode)) continue;

    // Process all standard_charges entries
    for (const charge of item.standard_charges ?? []) {
      count += extractFromCharge(charge, cptCode, rawCode, onEntry);
    }

    break; // Only use the first matching CPT/HCPCS code per item
  }

  return count;
}

function extractFromCharge(
  charge: CmsStandardCharge,
  cptCode: string,
  rawCode: string,
  onEntry: (e: NormalizedPriceEntry) => void
): number {
  let count = 0;

  const emit = (
    payerName: string,
    payerType: NormalizedPriceEntry["payerType"],
    priceInCents: number | null,
    priceType: NormalizedPriceEntry["priceType"]
  ) => {
    if (priceInCents === null) return;
    onEntry({ cptCode, rawCode, payerName, payerType, priceInCents, priceType });
    count++;
  };

  emit("Gross Charge", "other", dollarsToCents(charge.gross_charge), "gross");
  emit("Cash / Self-Pay", "cash", dollarsToCents(charge.discounted_cash), "discounted");
  emit("Min Charge", "other", dollarsToCents(charge.minimum), "min");
  emit("Max Charge", "other", dollarsToCents(charge.maximum), "max");

  for (const payer of charge.payers_information ?? []) {
    const payerName =
      payer.plan_name
        ? `${payer.payer_name} — ${payer.plan_name}`
        : payer.payer_name;
    emit(
      payerName,
      classifyPayerType(payer.payer_name),
      dollarsToCents(payer.standard_charge_dollar),
      "negotiated"
    );
  }

  return count;
}
