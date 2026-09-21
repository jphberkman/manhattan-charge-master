/**
 * CDC/NCHS ICD-10-CM official files (no API key).
 * Listing: https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Publications/ICD10CM/{fy}/
 *
 * This client lists files CDC actually published. Code validation against the
 * downloaded codebook is optional via data/authoritative/icd10cm-codes.json.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const CDC_FY_LISTING =
  "https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Publications/ICD10CM";

export const DEFAULT_ICD10CM_FY = "2026";

export interface CdcIcd10CmFile {
  fy: string;
  name: string;
  href: string;
  bytes: number | null;
}

export interface CdcIcd10CmCode {
  code: string;
  billable: boolean;
  description: string;
  fy: string;
}

function parseListingHtml(html: string, fy: string): CdcIcd10CmFile[] {
  const files: CdcIcd10CmFile[] = [];
  const hrefRe = /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  const sizeByHref = new Map<string, number>();
  const sizeLine = /(\d+)\s*<a href="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = sizeLine.exec(html))) {
    sizeByHref.set(m[2], Number(m[1]));
  }
  while ((m = hrefRe.exec(html))) {
    const href = m[1];
    const name = m[2].trim();
    if (!name || name.includes("Parent Directory")) continue;
    const absolute = href.startsWith("http")
      ? href
      : `https://ftp.cdc.gov${href.startsWith("/") ? "" : "/"}${href}`;
    files.push({
      fy,
      name,
      href: absolute,
      bytes: sizeByHref.get(href) ?? null,
    });
  }
  return files;
}

export async function listCdcIcd10CmFiles(fy = DEFAULT_ICD10CM_FY): Promise<CdcIcd10CmFile[]> {
  const url = `${CDC_FY_LISTING}/${fy}/`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(`CDC ICD-10-CM listing HTTP ${res.status} for FY${fy}`);
  }
  const html = await res.text();
  return parseListingHtml(html, fy);
}

export function parseIcd10CmOrderLine(line: string, fy: string): CdcIcd10CmCode | null {
  // CDC order file: order(5) + space + code(7 padded) + space + header/billable + rest description
  // Example: "00001 A00     0 Cholera"
  const trimmed = line.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^\d+\s+([A-Z][0-9][0-9A-Z]{1,5})\s+([01])\s+(.+)$/i);
  if (!m) return null;
  const raw = m[1].toUpperCase();
  const billable = m[2] === "1";
  const description = m[3].trim();
  const code = raw.length > 3 ? `${raw.slice(0, 3)}.${raw.slice(3)}` : raw;
  return { code, billable, description, fy };
}

export async function loadLocalIcd10CmCodebook(): Promise<CdcIcd10CmCode[] | null> {
  const file = path.join(process.cwd(), "data/authoritative/icd10cm-codes.json");
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as CdcIcd10CmCode[] | { codes?: CdcIcd10CmCode[] };
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.codes)) return parsed.codes;
    return null;
  } catch {
    return null;
  }
}

export async function lookupLocalIcd10Cm(code: string): Promise<CdcIcd10CmCode | null> {
  const book = await loadLocalIcd10CmCodebook();
  if (!book) return null;
  const needle = code.trim().toUpperCase().replace(/\s+/g, "");
  const compact = needle.replace(/\./g, "");
  return (
    book.find((r) => r.code.toUpperCase() === needle) ??
    book.find((r) => r.code.toUpperCase().replace(/\./g, "") === compact) ??
    null
  );
}

export function parseCdcListingHtmlForTest(html: string, fy: string): CdcIcd10CmFile[] {
  return parseListingHtml(html, fy);
}
