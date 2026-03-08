#!/usr/bin/env node
/**
 * seed-prices.mjs — Import hospital price transparency files into Neon DB
 *
 * Usage:
 *   node scripts/seed-prices.mjs /path/to/folder/
 *   node scripts/seed-prices.mjs file1.csv file2.json folder/
 */

import { createReadStream, existsSync, statSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, extname, basename } from "node:path";
import { createInterface } from "node:readline";
import { createRequire } from "node:module";
import { config } from "dotenv";

// Support running from scripts/ subdirectory or directly from project root
const envPath = new URL("./.env", import.meta.url).pathname;
const envPathFallback = new URL("../.env", import.meta.url).pathname;
config({ path: existsSync(envPath) ? envPath : envPathFallback });

const require = createRequire(import.meta.url);
const prismaPath = existsSync(new URL("./prisma-client/index.js", import.meta.url).pathname)
  ? "./prisma-client/index.js"
  : "../src/generated/prisma/index.js";
const { PrismaClient } = require(prismaPath);
const XLSX = require("xlsx");
const JSZip = require("jszip");
const prisma = new PrismaClient();

// ─── Anthropic ───────────────────────────────────────────────────────────────

const MODELS = ["claude-haiku-4-5-20251001", "claude-3-5-haiku-20241022", "claude-3-haiku-20240307"];

async function anthropicCall({ system, messages, max_tokens = 1024 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  for (const model of MODELS) {
    for (let attempt = 0; attempt <= 3; attempt++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens, system, messages }),
      });
      if (res.ok) { const d = await res.json(); return d.content?.[0]?.text ?? ""; }
      if ((res.status === 529 || res.status === 503) && attempt < 3) { await new Promise(r => setTimeout(r, 2000 * 2 ** attempt)); continue; }
      if (res.status === 529 || res.status === 503) break;
      throw new Error(`Anthropic ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
  }
  throw new Error("All Anthropic models overloaded");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normalizePayerType = (r) => {
  const v = (r ?? "").toLowerCase();
  if (v.includes("cash") || v.includes("self")) return "cash";
  if (v.includes("medicare")) return "medicare";
  if (v.includes("medicaid")) return "medicaid";
  if (v.includes("commercial") || v.includes("private") || v.includes("insurance") || v.includes("aetna") || v.includes("cigna") || v.includes("united") || v.includes("blue") || v.includes("humana")) return "commercial";
  return "other";
};
const normalizePriceType = (r) => {
  const v = (r ?? "").toLowerCase();
  if (v.includes("gross")) return "gross";
  if (v.includes("discount")) return "discounted";
  if (v.includes("min")) return "min";
  if (v.includes("max")) return "max";
  if (v.includes("negotiated") || v.includes("contract")) return "negotiated";
  return "gross";
};
// Cap at $999,999 (prices above this are data errors or meaningless gross charges)
const MAX_PRICE_CENTS = 99999900;
const parsePrice = (r) => { const v = parseFloat(String(r ?? "").replace(/[$,\s]/g, "")); if (isNaN(v) || v <= 0) return 0; const cents = Math.round(v * 100); return cents > MAX_PRICE_CENTS ? 0 : cents; };

function parseCsvLine(line) {
  const cols = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i+1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === "," && !q) { cols.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  cols.push(cur.trim()); return cols;
}

// ─── Raw chunk sources ────────────────────────────────────────────────────────
// Each returns an async iterable of Buffers/Uint8Arrays

function chunksFromFile(filePath) {
  return async function* () { yield* createReadStream(filePath); };
}

function chunksFromBuffer(buffer) {
  return async function* () { yield buffer; };
}

function chunksFromZipEntry(entry) {
  // Use entry.async("uint8array") to avoid JSZip's string-based nodeStream
  return async function* () {
    const data = await entry.async("uint8array");
    // Yield in 64KB chunks to avoid string length limits
    const CHUNK = 64 * 1024;
    for (let offset = 0; offset < data.length; offset += CHUNK) {
      yield data.subarray(offset, offset + CHUNK);
    }
  };
}

// ─── Line reader from chunk source (for CSV) ─────────────────────────────────

function linesFromChunks(chunkSource) {
  return async function* () {
    const decoder = new TextDecoder("utf8");
    let buf = "";
    for await (const chunk of chunkSource()) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) yield line;
    }
    if (buf) yield buf;
  };
}

// ─── CMS 2.0 JSON streaming — chunk-based, no readline ───────────────────────
// Works for minified (entire file on one line) and pretty-printed JSON.
// Detects array key by scanning character-by-character without relying on newlines.

async function* streamJsonObjects(chunkSource) {
  // States:
  //   header     — scanning for hospital_name and the data array key
  //   seek_array — found the key, waiting for [
  //   in_array   — inside data array, collecting { } objects

  let phase = "header";
  let hospitalName = "";

  // For hospital_name extraction (only in header phase)
  let headerBuf = "";

  // For key detection in header phase — we match against these target strings
  const KEYS = ['"standard_charge_information"', '"standard_charges"'];
  let keyBuf = ""; // rolling buffer for key matching

  // For object collection in in_array phase
  let inStr = false, escaped = false, depth = 0, chars = [];

  const decoder = new TextDecoder("utf8");

  for await (const rawChunk of chunkSource()) {
    const chunk = typeof rawChunk === "string" ? rawChunk : decoder.decode(rawChunk, { stream: true });

    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];

      // ── header phase: scan for hospital_name and array key ────────────────
      if (phase === "header") {
        // Accumulate for hospital_name regex (keep small to avoid memory growth)
        headerBuf += ch;
        if (headerBuf.length > 1000) headerBuf = headerBuf.slice(-500);

        if (!hospitalName) {
          const m = headerBuf.match(/"(?:hospital_name|name)"\s*:\s*"([^"]+)"/);
          if (m) { hospitalName = m[1]; headerBuf = ""; }
        }

        // Rolling key detection — check if we just completed a target key
        keyBuf += ch;
        if (keyBuf.length > 40) keyBuf = keyBuf.slice(-40);

        const matched = KEYS.some(k => keyBuf.endsWith(k));
        if (matched) {
          phase = "seek_array";
          keyBuf = "";
        }
        // Also handle top-level flat array: first non-whitespace char is [
        // (handled below when we encounter [ in seek_array before any key)
        continue;
      }

      // ── seek_array: look for the [ that opens the data array ─────────────
      if (phase === "seek_array") {
        if (ch === "[") {
          phase = "in_array";
          depth = 0;
          chars = [];
        }
        continue;
      }

      // ── in_array: collect complete { } objects ────────────────────────────
      if (escaped) { escaped = false; if (depth > 0) chars.push(ch); continue; }
      if (ch === "\\" && inStr) { escaped = true; if (depth > 0) chars.push(ch); continue; }
      if (ch === '"') { inStr = !inStr; if (depth > 0) chars.push(ch); continue; }
      if (inStr) { if (depth > 0) chars.push(ch); continue; }

      if (ch === "{") {
        if (depth === 0) chars = ["{"];
        else chars.push(ch);
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth >= 0) chars.push(ch);
        if (depth === 0 && chars.length > 0) {
          try { yield { obj: JSON.parse(chars.join("")), hospitalName }; } catch { /* skip malformed */ }
          chars = [];
        }
      } else if (ch === "]" && depth === 0) {
        return; // end of data array
      } else {
        if (depth > 0) chars.push(ch);
      }
    }
  }
}

// ─── Handle top-level flat array (file starts with [) ────────────────────────

async function* streamJsonObjectsFlat(chunkSource) {
  let phase = "seek_array"; // jump straight to looking for [
  let inStr = false, escaped = false, depth = 0, chars = [];
  const decoder = new TextDecoder("utf8");

  for await (const rawChunk of chunkSource()) {
    const chunk = typeof rawChunk === "string" ? rawChunk : decoder.decode(rawChunk, { stream: true });
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];
      if (phase === "seek_array") { if (ch === "[") { phase = "in_array"; } continue; }
      if (escaped) { escaped = false; if (depth > 0) chars.push(ch); continue; }
      if (ch === "\\" && inStr) { escaped = true; if (depth > 0) chars.push(ch); continue; }
      if (ch === '"') { inStr = !inStr; if (depth > 0) chars.push(ch); continue; }
      if (inStr) { if (depth > 0) chars.push(ch); continue; }
      if (ch === "{") { if (depth === 0) chars = ["{"]; else chars.push(ch); depth++; }
      else if (ch === "}") {
        depth--; if (depth >= 0) chars.push(ch);
        if (depth === 0 && chars.length > 0) {
          try { yield { obj: JSON.parse(chars.join("")), hospitalName: "" }; } catch { }
          chars = [];
        }
      } else if (ch === "]" && depth === 0) { return; }
      else { if (depth > 0) chars.push(ch); }
    }
  }
}

// ─── CMS JSON object → normalized rows ───────────────────────────────────────

function cmsObjToRows(obj, hospitalName) {
  const codes = obj.codes ?? obj.code_information ?? [];
  const cpt = codes.find(c => /^CPT$/i.test(c.type))?.code
    ?? codes.find(c => /^HCPCS$/i.test(c.type))?.code
    ?? codes[0]?.code ?? "";
  const name = String(obj.description ?? cpt);
  if (!cpt && !name) return [];
  const rows = [];
  for (const charge of obj.standard_charges ?? []) {
    if (charge.gross_charge) rows.push({ hospitalName, address: "Manhattan, NY", cptCode: cpt, procedureName: name, category: "General", payerName: "Gross", payerType: "gross", priceInCents: Math.round(Number(charge.gross_charge) * 100), priceType: "gross" });
    if (charge.discounted_cash) rows.push({ hospitalName, address: "Manhattan, NY", cptCode: cpt, procedureName: name, category: "General", payerName: "Cash", payerType: "cash", priceInCents: Math.round(Number(charge.discounted_cash) * 100), priceType: "discounted" });
    for (const p of charge.payers_information ?? []) {
      const price = p.standard_charge_dollar ?? p.negotiated_rate ?? p.price;
      if (!price) continue;
      rows.push({ hospitalName, address: "Manhattan, NY", cptCode: cpt, procedureName: name, category: "General", payerName: String(p.payer_name ?? "Unknown"), payerType: normalizePayerType(String(p.payer_name ?? "")), priceInCents: Math.round(Number(price) * 100), priceType: normalizePriceType(String(p.billing_class ?? "negotiated")) });
    }
  }
  return rows.filter(r => r.priceInCents > 0);
}

function flatObjToRows(obj, fallback) {
  const cpt = String(obj.cpt_code ?? obj.cptCode ?? obj.code ?? obj.procedure_code ?? "").replace(/\s/g, "");
  const name = String(obj.procedure_name ?? obj.description ?? obj.name ?? cpt);
  if (!cpt && !name) return [];
  const price = parsePrice(String(obj.price ?? obj.standard_charge ?? obj.amount ?? obj.charge ?? ""));
  if (price <= 0) return [];
  const hosp = String(obj.hospital_name ?? obj.hospital ?? fallback);
  const payer = String(obj.payer_name ?? obj.payer ?? obj.insurance ?? "Standard");
  return [{ hospitalName: hosp, address: "Manhattan, NY", cptCode: cpt || name.slice(0, 10), procedureName: name, category: String(obj.category ?? "General"), payerName: payer, payerType: normalizePayerType(String(obj.payer_type ?? payer)), priceInCents: price, priceType: normalizePriceType(String(obj.price_type ?? "")) }];
}

// ─── CMS 2.0 standard CSV (no AI, direct parse) ───────────────────────────────

function detectCms20Csv(rows) {
  for (const row of rows.slice(0, 5)) {
    const s = row.join("|");
    if (s.includes("standard_charge|gross") && s.includes("code|1")) return true;
  }
  return false;
}

// KEY PAYERS to import negotiated rates for (keeps DB size manageable)
// Skip the hundreds of obscure plan variants — just the major insurers
const KEY_PAYER_KEYWORDS = ["aetna", "cigna", "united", "unitedhealthcare", "blue cross", "bluecross", "bcbs", "humana", "oxford", "empire", "anthem", "wellcare", "fidelis", "healthfirst", "metroplus", "emblem", "1199", "multiplan", "medicare", "medicaid"];
function isKeyPayer(name) {
  const v = name.toLowerCase();
  return KEY_PAYER_KEYWORDS.some(k => v.includes(k));
}

async function* parseCms20CsvRows(lineSource, hospitalNameOverride) {
  let rowNum = 0, headers = [], hospitalName = hospitalNameOverride ?? "";
  // Track how many payer cols we've imported per procedure to cap at 20
  for await (const line of lineSource()) {
    if (!line.trim()) { rowNum++; continue; }
    const cols = parseCsvLine(line);
    if (rowNum === 0) { if (!hospitalName && cols[0]) hospitalName = cols[0]; rowNum++; continue; }
    if (rowNum === 1) { rowNum++; continue; } // affirmation
    if (rowNum === 2) { headers = cols.map(h => h.trim()); rowNum++; continue; }
    if (cols.every(c => !c)) { rowNum++; continue; }

    let cpt = "";
    for (let i = 1; ; i++) {
      const ci = headers.indexOf(`code|${i}`), ti = headers.indexOf(`code|${i}|type`);
      if (ci === -1) break;
      const code = (cols[ci] ?? "").trim(), type = (cols[ti] ?? "").trim().toUpperCase();
      if (code && (type === "CPT" || type === "HCPCS")) { cpt = code; break; }
      if (code && !cpt) cpt = code;
    }
    const di = headers.indexOf("description");
    const procName = (cols[di] ?? "").trim() || cpt;
    if (!cpt && !procName) { rowNum++; continue; }

    const gi = headers.indexOf("standard_charge|gross");
    if (gi !== -1) { const p = parsePrice(cols[gi]); if (p > 0) yield { hospitalName, address: "Manhattan, NY", cptCode: cpt, procedureName: procName, category: "General", payerName: "Gross", payerType: "gross", priceInCents: p, priceType: "gross" }; }

    const cashi = headers.indexOf("standard_charge|discounted_cash");
    if (cashi !== -1) { const p = parsePrice(cols[cashi]); if (p > 0) yield { hospitalName, address: "Manhattan, NY", cptCode: cpt, procedureName: procName, category: "General", payerName: "Cash", payerType: "cash", priceInCents: p, priceType: "discounted" }; }

    // Only import up to 3 key payer negotiated rates per procedure
    let payerCount = 0;
    for (let i = 0; i < headers.length && payerCount < 3; i++) {
      const h = headers[i];
      if (!h.startsWith("standard_charge|") || !h.endsWith("|negotiated_dollar")) continue;
      const parts = h.split("|");
      if (parts.length < 4) continue;
      const payerName = parts.slice(2, parts.length - 1).join("|");
      if (!isKeyPayer(payerName)) continue;
      const p = parsePrice(cols[i]);
      if (p > 0) { yield { hospitalName, address: "Manhattan, NY", cptCode: cpt, procedureName: procName, category: "General", payerName, payerType: normalizePayerType(payerName), priceInCents: p, priceType: "negotiated" }; payerCount++; }
    }
    rowNum++;
  }
}

// ─── AI schema CSV parser ─────────────────────────────────────────────────────

function applySchema(cols, schema, fallback) {
  const { columns: c, format, widePayerColumns } = schema;
  const get = idx => idx !== null && idx >= 0 ? (cols[idx] ?? "").trim() : "";
  const hosp = get(c.hospital_name) || fallback, addr = get(c.address) || "Manhattan, NY";
  const cpt = get(c.cpt_code).replace(/\s/g, ""), proc = get(c.procedure_name) || cpt, cat = get(c.category) || "General";
  if (!cpt && !proc) return [];
  if (format === "wide") {
    return (widePayerColumns ?? []).flatMap(pc => {
      const p = parsePrice(get(pc.colIndex)); if (p <= 0) return [];
      return [{ hospitalName: hosp, address: addr, cptCode: cpt || proc.slice(0, 10), procedureName: proc, category: cat, payerName: pc.payerName, payerType: normalizePayerType(pc.payerType || pc.payerName), priceInCents: p, priceType: normalizePriceType(pc.payerName) }];
    });
  }
  const p = parsePrice(get(c.price)); if (p <= 0) return [];
  const payer = get(c.payer_name) || "Standard";
  return [{ hospitalName: hosp, address: addr, cptCode: cpt || proc.slice(0, 10), procedureName: proc, category: cat, payerName: payer, payerType: normalizePayerType(get(c.payer_type) || payer), priceInCents: p, priceType: normalizePriceType(get(c.price_type)) }];
}

// ─── DB flush ─────────────────────────────────────────────────────────────────

async function drainRows(rowGen, filename) {
  const hCache = new Map(), pCache = new Map();
  let hUp = 0, pUp = 0, priceIn = 0, batch = [];
  for await (const row of rowGen) {
    batch.push(row);
    if (batch.length >= 10000) {
      const s = await flush(batch, filename, hCache, pCache);
      hUp += s.h; pUp += s.p; priceIn += s.n;
      process.stdout.write(`\r  💾 ${priceIn.toLocaleString()} prices saved…`);
      batch = [];
    }
  }
  if (batch.length > 0) { const s = await flush(batch, filename, hCache, pCache); hUp += s.h; pUp += s.p; priceIn += s.n; }
  return { hospitalsUpserted: hUp, proceduresUpserted: pUp, pricesInserted: priceIn };
}

async function flush(batch, sourceFile, hCache, pCache) {
  let h = 0, p = 0;
  for (const row of batch) {
    const hKey = `${row.hospitalName}__${row.address}`;
    if (!hCache.has(hKey)) {
      const r = await prisma.hospital.upsert({ where: { id: hKey }, create: { id: hKey, name: row.hospitalName, address: row.address, borough: "Manhattan", sourceFile, lastSeeded: new Date() }, update: { lastSeeded: new Date() }, select: { id: true } });
      hCache.set(hKey, r.id); h++;
    }
    if (!pCache.has(row.cptCode)) {
      const r = await prisma.procedure.upsert({ where: { cptCode: row.cptCode }, create: { cptCode: row.cptCode, name: row.procedureName, category: row.category, description: "" }, update: {}, select: { id: true } });
      pCache.set(row.cptCode, r.id); p++;
    }
  }
  await prisma.priceEntry.createMany({
    data: batch.map(row => ({ hospitalId: hCache.get(`${row.hospitalName}__${row.address}`), procedureId: pCache.get(row.cptCode), payerName: row.payerName, payerType: row.payerType, priceInCents: row.priceInCents, priceType: row.priceType, rawCode: row.cptCode })),
    skipDuplicates: true,
  });
  return { h, p, n: batch.length };
}

// ─── File processors ──────────────────────────────────────────────────────────

// Fast line-based JSON parser for pretty-printed files (much faster than char-by-char)
async function* streamJsonObjectsLines(lineSource) {
  let phase = "header", hospitalName = "", depth = 0, objLines = [];
  let inStr = false, escaped = false;

  for await (const line of lineSource()) {
    if (!hospitalName) {
      const m = line.match(/"(?:hospital_name|name)"\s*:\s*"([^"]+)"/);
      if (m) hospitalName = m[1];
    }
    if (phase === "header") {
      if (line.includes('"standard_charge_information"') || line.includes('"standard_charges"') || line.trim() === "[") phase = "seek_array";
      else continue;
    }
    if (phase === "seek_array") {
      if (line.includes("[")) { phase = "in_array"; depth = 0; objLines = []; }
      continue;
    }
    // in_array: count braces per line (fast — no char-by-char needed for short lines)
    for (const ch of line) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\" && inStr) { escaped = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    if (depth > 0 || objLines.length > 0) objLines.push(line);
    if (depth === 0 && objLines.length > 0) {
      try { yield { obj: JSON.parse(objLines.join("\n")), hospitalName }; } catch { /* skip */ }
      objLines = [];
    }
  }
}

async function processJson(chunkSource, filename) {
  const fallback = filename.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");

  // Peek at first 512 bytes to detect minified vs pretty-printed
  let firstChunk = "";
  const peekSource = async function* () {
    for await (const c of chunkSource()) { firstChunk += Buffer.from(c).toString("utf8").slice(0, 512 - firstChunk.length); yield c; if (firstChunk.length >= 512) break; }
  };
  // Drain peek
  for await (const _ of peekSource()) break;

  const isMinified = firstChunk.split("\n").length <= 2; // minified = 1-2 very long lines
  const lineSource = linesFromChunks(chunkSource);

  let isCms = false, detected = false;
  async function* rows(objStream) {
    for await (const { obj, hospitalName } of objStream) {
      if (!detected) { isCms = "standard_charges" in obj || "codes" in obj || "code_information" in obj; detected = true; }
      yield* isCms ? cmsObjToRows(obj, hospitalName || fallback) : flatObjToRows(obj, fallback);
    }
  }

  const objStream = isMinified ? streamJsonObjects(chunkSource) : streamJsonObjectsLines(lineSource);
  const result = await drainRows(rows(objStream), filename);
  if (result.pricesInserted === 0) console.log(`  ⚠ 0 prices — check file structure`);
  return result;
}

async function processCsv(chunkSource, filename) {
  const lineSource = linesFromChunks(chunkSource);

  // Peek at first 5 lines (fresh read from chunkSource)
  const peek = [];
  for await (const line of lineSource()) { peek.push(parseCsvLine(line)); if (peek.length >= 5) break; }

  if (detectCms20Csv(peek)) {
    console.log(`  📐 CMS 2.0 standard CSV — parsing directly`);
    const hospitalName = peek[0]?.[0] ?? filename.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
    return await drainRows(parseCms20CsvRows(lineSource, hospitalName), filename);
  }

  console.log(`  🤖 Detecting schema with AI…`);
  const truncated = peek.map(r => r.slice(0, 30));
  const schemaText = await anthropicCall({
    max_tokens: 1024,
    system: "You are a data engineering expert for hospital price transparency files. Return ONLY valid JSON.",
    messages: [{ role: "user", content: `CSV file: "${filename}". First rows (max 30 cols):\n${JSON.stringify(truncated, null, 2)}\n\nReturn ONLY JSON:\n{"format":"long"|"wide","headerRow":<int>,"dataStartRow":<int>,"hospitalSource":"column"|"filename","hospitalNameFromFilename":<string|null>,"columns":{"hospital_name":<int|null>,"address":<int|null>,"cpt_code":<int|null>,"procedure_name":<int|null>,"category":<int|null>,"payer_name":<int|null>,"payer_type":<int|null>,"price":<int|null>,"price_type":<int|null>},"widePayerColumns":[{"colIndex":<int>,"payerName":"<str>","payerType":"cash|commercial|medicare|medicaid|other"}],"notes":"<str>"}` }],
  });
  const m = schemaText.match(/\{[\s\S]*\}/); if (!m) throw new Error("Could not parse AI schema");
  const schema = JSON.parse(m[0]);
  console.log(`  📐 ${schema.format} | header row ${schema.headerRow + 1} | ${schema.notes?.slice(0, 80)}`);
  const fallback = (schema.hospitalSource === "filename" && schema.hospitalNameFromFilename)
    ? schema.hospitalNameFromFilename : filename.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");

  async function* schemaRows() {
    let i = 0;
    for await (const line of lineSource()) {
      if (i >= schema.dataStartRow) { const cols = parseCsvLine(line); if (!cols.every(c => c === "")) yield* applySchema(cols, schema, fallback); }
      i++;
    }
  }
  return await drainRows(schemaRows(), filename);
}

async function processXlsx(buffer, filename) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheets = wb.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" }).map(r => r.map(c => String(c ?? "").trim())).filter(r => r.some(c => c !== "")) }));
  if (!sheets.length || sheets.every(s => s.rows.length < 2)) throw new Error("File appears empty");

  console.log(`  🤖 Detecting schema with AI…`);
  const sample = sheets.slice(0, 3).map(s => ({ sheet: s.name, rows: s.rows.slice(0, 20).map(r => r.slice(0, 30)) }));
  const schemaText = await anthropicCall({ max_tokens: 1024, messages: [{ role: "user", content: `Excel hospital prices. File: "${filename}". Sample:\n${JSON.stringify(sample)}\n\nReturn ONLY JSON:\n{"format":"long"|"wide","bestSheet":"<name>","headerRow":<int>,"dataStartRow":<int>,"hospitalSource":"column"|"filename","hospitalNameFromFilename":<string|null>,"columns":{"hospital_name":<int|null>,"address":<int|null>,"cpt_code":<int|null>,"procedure_name":<int|null>,"category":<int|null>,"payer_name":<int|null>,"payer_type":<int|null>,"price":<int|null>,"price_type":<int|null>},"widePayerColumns":[{"colIndex":<int>,"payerName":"<str>","payerType":"cash|commercial|medicare|medicaid|other"}],"notes":"<str>"}` }] });
  const m = schemaText.match(/\{[\s\S]*\}/); if (!m) throw new Error("Could not parse AI schema");
  const schema = JSON.parse(m[0]);
  console.log(`  📐 ${schema.format} | sheet: ${schema.bestSheet} | ${schema.notes?.slice(0, 80)}`);
  const sheet = sheets.find(s => s.name === schema.bestSheet) ?? sheets[0];
  const fallback = (schema.hospitalSource === "filename" && schema.hospitalNameFromFilename) ? schema.hospitalNameFromFilename : filename.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
  async function* rows() { for (const cols of sheet.rows.slice(schema.dataStartRow)) { if (!cols.every(c => c === "")) yield* applySchema(cols, schema, fallback); } }
  return await drainRows(rows(), filename);
}

// ─── Process one file ─────────────────────────────────────────────────────────

async function processFile(filePath) {
  const name = basename(filePath);
  const ext = extname(filePath).toLowerCase().slice(1);
  const mb = (statSync(filePath).size / 1024 / 1024).toFixed(0);
  console.log(`\n📄 ${name} (${mb} MB)`);

  if (ext === "zip") {
    const zip = await JSZip.loadAsync(await readFile(filePath));
    const entries = Object.values(zip.files).filter(e => !e.dir && /\.(csv|xlsx|xls|xlsm|json)$/i.test(e.name));
    if (!entries.length) throw new Error("ZIP contains no supported files");
    console.log(`  📦 ${entries.length} file(s) inside ZIP`);
    let tot = { hospitalsUpserted: 0, proceduresUpserted: 0, pricesInserted: 0 };
    for (const entry of entries) {
      const ename = entry.name.split("/").pop();
      const eext = extname(ename).toLowerCase().slice(1);
      console.log(`  → ${ename}`);
      const chunkSrc = chunksFromZipEntry(entry);
      let r;
      if (eext === "xlsx" || eext === "xls" || eext === "xlsm") r = await processXlsx(Buffer.from(await entry.async("arraybuffer")), ename);
      else if (eext === "json") r = await processJson(chunkSrc, ename);
      else r = await processCsv(chunkSrc, ename);
      tot.hospitalsUpserted += r.hospitalsUpserted; tot.proceduresUpserted += r.proceduresUpserted; tot.pricesInserted += r.pricesInserted;
    }
    return tot;
  }

  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") return processXlsx(await readFile(filePath), name);
  if (ext === "json") return processJson(chunksFromFile(filePath), name);
  return processCsv(chunksFromFile(filePath), name);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function collectFiles(args) {
  const files = [];
  for (const arg of args) {
    const p = resolve(arg);
    if (!existsSync(p)) { console.warn(`⚠ Not found: ${p}`); continue; }
    if (statSync(p).isDirectory()) {
      for (const f of readdirSync(p)) if (/\.(csv|xlsx|xls|xlsm|json|zip)$/i.test(f)) files.push(resolve(p, f));
    } else files.push(p);
  }
  return files;
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) { console.error("Usage: node scripts/seed-prices.mjs <file|folder> [...]"); process.exit(1); }
  const files = collectFiles(args);
  if (!files.length) { console.error("No supported files found."); process.exit(1); }

  console.log(`\n🏥 Hospital Price Seeder`);
  console.log(`📁 ${files.length} file(s) to process`);

  let grand = { hospitalsUpserted: 0, proceduresUpserted: 0, pricesInserted: 0 }, failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < files.length; i++) {
    console.log(`\n[${i + 1}/${files.length}]`);
    try {
      const r = await processFile(files[i]);
      grand.hospitalsUpserted += r.hospitalsUpserted; grand.proceduresUpserted += r.proceduresUpserted; grand.pricesInserted += r.pricesInserted;
      const elapsed = (Date.now() - startTime) / 1000;
      const perFile = elapsed / (i + 1);
      const remaining = Math.round(perFile * (files.length - i - 1));
      const eta = remaining > 60 ? `~${Math.round(remaining / 60)}m remaining` : `~${remaining}s remaining`;
      console.log(`\n  ✅ Done — 🏥 ${r.hospitalsUpserted} hospitals · 🩺 ${r.proceduresUpserted} procedures · 💰 ${r.pricesInserted.toLocaleString()} prices | ${eta}`);
    } catch (err) { console.error(`\n  ❌ Failed: ${err.message}`); failed++; }
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`✅ Total: 🏥 ${grand.hospitalsUpserted} hospitals · 🩺 ${grand.proceduresUpserted} procedures · 💰 ${grand.pricesInserted.toLocaleString()} prices`);
  if (failed) console.log(`❌ ${failed} file(s) failed`);
  await prisma.$disconnect();
}

main().catch(err => { console.error("Fatal:", err); prisma.$disconnect(); process.exit(1); });
