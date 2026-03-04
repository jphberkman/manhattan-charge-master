import type { HospitalConfig } from "./types";

export const MANHATTAN_HOSPITALS: HospitalConfig[] = [
  {
    id: "msk",
    name: "Memorial Sloan Kettering Cancer Center",
    address: "1275 York Ave, New York, NY 10065",
    sourceFile:
      "/Users/j.pierceberkman/Downloads/131924236_memorial-hospital-for-cancer-and-allied-diseases-nyc_standardcharges.json",
    format: "cms-json",
  },
  {
    id: "mount-sinai",
    name: "Mount Sinai Hospital",
    address: "One Gustave L. Levy Place, New York, NY 10029",
    sourceFile:
      "https://www.mountsinai.org/files/mrf/131624096_mount-sinai-hospital_standardcharges.json",
    format: "cms-json",
  },
  {
    id: "nyu-langone",
    name: "NYU Langone Health (Tisch Hospital)",
    address: "550 1st Ave, New York, NY 10016",
    sourceFile:
      "https://standard-charges-prod.s3.amazonaws.com/pricing_files/133971298-1801992631_nyu-langone-tisch_standardcharges.csv",
    format: "nyu-csv",
  },
];

// CPT codes to extract (surgical procedures)
export const TARGET_CPT_CODES = new Set([
  "44950",
  "44970", // Appendectomy open / laparoscopic
  "47562",
  "47563", // Cholecystectomy
  "27130", // Total hip replacement
  "27447", // Total knee replacement
  "45378",
  "45380", // Colonoscopy diagnostic / with biopsy
  "66984", // Cataract surgery
  "59510", // C-section
  "58150", // Hysterectomy (total abdominal)
  "49505", // Inguinal hernia repair
  "33533", // CABG
]);

export const PROCEDURE_METADATA: Record<
  string,
  { name: string; category: string; description: string }
> = {
  "44950": {
    name: "Appendectomy (Open)",
    category: "General Surgery",
    description: "Open surgical removal of the appendix",
  },
  "44970": {
    name: "Appendectomy (Laparoscopic)",
    category: "General Surgery",
    description: "Minimally invasive removal of the appendix",
  },
  "47562": {
    name: "Cholecystectomy (Laparoscopic)",
    category: "General Surgery",
    description: "Laparoscopic gallbladder removal",
  },
  "47563": {
    name: "Cholecystectomy with Cholangiography",
    category: "General Surgery",
    description: "Laparoscopic gallbladder removal with bile duct imaging",
  },
  "27130": {
    name: "Total Hip Replacement",
    category: "Orthopedics",
    description: "Total hip arthroplasty",
  },
  "27447": {
    name: "Total Knee Replacement",
    category: "Orthopedics",
    description: "Total knee arthroplasty",
  },
  "45378": {
    name: "Colonoscopy (Diagnostic)",
    category: "Gastroenterology",
    description: "Diagnostic colonoscopy",
  },
  "45380": {
    name: "Colonoscopy with Biopsy",
    category: "Gastroenterology",
    description: "Colonoscopy with tissue biopsy",
  },
  "66984": {
    name: "Cataract Surgery",
    category: "Ophthalmology",
    description: "Extracapsular cataract removal with intraocular lens implant",
  },
  "59510": {
    name: "Cesarean Section",
    category: "Obstetrics",
    description: "Routine cesarean delivery with postpartum care",
  },
  "58150": {
    name: "Hysterectomy (Total Abdominal)",
    category: "Gynecology",
    description: "Total abdominal hysterectomy",
  },
  "49505": {
    name: "Inguinal Hernia Repair",
    category: "General Surgery",
    description: "Initial inguinal hernia repair, age 5+",
  },
  "33533": {
    name: "Coronary Artery Bypass Graft (CABG)",
    category: "Cardiac Surgery",
    description: "CABG using arterial graft, single",
  },
};

/** Classify a payer name into a PayerType bucket. */
export function classifyPayerType(
  payerName: string
): "commercial" | "medicare" | "medicaid" | "cash" | "other" {
  const lower = payerName.toLowerCase();
  if (lower.includes("medicare")) return "medicare";
  if (
    lower.includes("medicaid") ||
    lower.includes("fidelis") ||
    lower.includes("amida") ||
    lower.includes("centerlight") ||
    lower.includes("hamaspik") ||
    lower.includes("somos") ||
    lower.includes("metroplus") ||
    lower.includes("healthplus")
  )
    return "medicaid";
  if (
    lower.includes("cash") ||
    lower.includes("self") ||
    lower.includes("self-pay") ||
    lower.includes("uninsured") ||
    lower === "discounted_cash" ||
    lower === "discounted cash"
  )
    return "cash";
  if (lower === "" || lower === "none" || lower === "n/a") return "other";
  return "commercial";
}

/** Normalize a code string to digits only, no leading zeros. */
export function normalizeCptCode(raw: string): string {
  return raw.replace(/[^0-9]/g, "").replace(/^0+/, "");
}

/** Convert a dollar amount (string or number) to integer cents. Returns null for invalid values. */
export function dollarsToCents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = parseFloat(String(value).replace(/[$,\s]/g, ""));
  if (isNaN(num) || num < 0) return null;
  return Math.round(num * 100);
}
