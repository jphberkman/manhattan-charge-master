/**
 * Medicare rate benchmarks for common procedures.
 *
 * Two numbers are provided per procedure:
 *   physicianFee  — CMS Physician Fee Schedule (professional component only, NYC locality)
 *   episodeRate   — Total Medicare payment for the full episode:
 *                   inpatient → MS-DRG base payment (facility) + physician fee
 *                   outpatient → APC payment + physician fee
 *
 * Source: CMS 2025 MPFS (Manhattan/NYC MAC locality), CMS 2025 IPPS/OPPS final rules.
 * Rates are approximate — exact amounts vary by hospital wage index and add-on payments.
 * Commercial negotiated rates are typically 1.5–4× the Medicare episode rate.
 */

/** Year the Medicare rate data was last updated. Use to check staleness. */
export const DATA_YEAR = 2025;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MedicareBenchmark {
  cptCode: string;
  physicianFee: number;      // CMS PFS professional fee (USD)
  episodeRate: number | null; // Full episode rate (USD), null if outpatient-only fee
  episodeType: "DRG" | "APC" | "PFS-only";
  drgCode?: string;
  commercialMultiplierLow: number;  // typical commercial = medicare × this
  commercialMultiplierHigh: number;
  notes: string;
  source: string;
}

// ── Static lookup table ───────────────────────────────────────────────────────
// Covers the most common procedures. physFee = physician professional fee.
// episodeRate = total Medicare payment (facility DRG or APC + physician fee).

const MEDICARE_RATES: Record<string, Omit<MedicareBenchmark, "cptCode">> = {
  // ── Orthopedics / Musculoskeletal ─────────────────────────────────────────
  "27447": { physicianFee: 1572, episodeRate: 18900,  episodeType: "DRG",     drgCode: "470", commercialMultiplierLow: 2.5, commercialMultiplierHigh: 5.0, notes: "Total knee arthroplasty. DRG 470 (w/o MCC). Implants typically $8–20K.", source: "CMS 2025 IPPS/MPFS NYC" },
  "27130": { physicianFee: 1573, episodeRate: 18900,  episodeType: "DRG",     drgCode: "470", commercialMultiplierLow: 2.5, commercialMultiplierHigh: 5.0, notes: "Total hip arthroplasty. Same DRG 470 as knee. Implant costs similar.", source: "CMS 2025 IPPS/MPFS NYC" },
  "27125": { physicianFee: 1210, episodeRate: 18900,  episodeType: "DRG",     drgCode: "470", commercialMultiplierLow: 2.5, commercialMultiplierHigh: 5.0, notes: "Hemiarthroplasty, hip.", source: "CMS 2025 IPPS/MPFS NYC" },
  "27236": { physicianFee: 1380, episodeRate: 18900,  episodeType: "DRG",     drgCode: "470", commercialMultiplierLow: 2.5, commercialMultiplierHigh: 4.5, notes: "ORIF femoral neck fracture.", source: "CMS 2025 IPPS/MPFS NYC" },
  "27245": { physicianFee: 1490, episodeRate: 16200,  episodeType: "DRG",     drgCode: "481", commercialMultiplierLow: 2.0, commercialMultiplierHigh: 4.0, notes: "ORIF intertrochanteric hip fracture.", source: "CMS 2025 IPPS/MPFS NYC" },
  "29827": { physicianFee:  900, episodeRate:  2700,  episodeType: "APC",                     commercialMultiplierLow: 3.0, commercialMultiplierHigh: 6.0, notes: "Shoulder arthroscopy with rotator cuff repair. Typically outpatient.", source: "CMS 2025 OPPS/MPFS NYC" },
  "29888": { physicianFee: 1100, episodeRate:  3300,  episodeType: "APC",                     commercialMultiplierLow: 3.0, commercialMultiplierHigh: 6.0, notes: "Knee arthroscopy with ACL reconstruction. Typically outpatient.", source: "CMS 2025 OPPS/MPFS NYC" },
  "29881": { physicianFee:  640, episodeRate:  1950,  episodeType: "APC",                     commercialMultiplierLow: 2.5, commercialMultiplierHigh: 5.0, notes: "Knee arthroscopy with medial meniscectomy.", source: "CMS 2025 OPPS/MPFS NYC" },
  "29880": { physicianFee:  700, episodeRate:  2100,  episodeType: "APC",                     commercialMultiplierLow: 2.5, commercialMultiplierHigh: 5.0, notes: "Knee arthroscopy with medial and lateral meniscectomy.", source: "CMS 2025 OPPS/MPFS NYC" },
  "29874": { physicianFee:  520, episodeRate:  1600,  episodeType: "APC",                     commercialMultiplierLow: 2.5, commercialMultiplierHigh: 5.0, notes: "Knee arthroscopy, loose body removal.", source: "CMS 2025 OPPS/MPFS NYC" },

  // ── Spine ────────────────────────────────────────────────────────────────────
  "22630": { physicianFee: 1240, episodeRate: 22500,  episodeType: "DRG",     drgCode: "460", commercialMultiplierLow: 2.5, commercialMultiplierHigh: 5.0, notes: "Lumbar interbody fusion. DRG 460 (w/o CC/MCC). Cage/hardware ~$8–15K.", source: "CMS 2025 IPPS/MPFS NYC" },
  "22612": { physicianFee:  968, episodeRate: 22500,  episodeType: "DRG",     drgCode: "460", commercialMultiplierLow: 2.5, commercialMultiplierHigh: 5.0, notes: "Lumbar posterior arthrodesis.", source: "CMS 2025 IPPS/MPFS NYC" },
  "63030": { physicianFee:  780, episodeRate: 14000,  episodeType: "DRG",     drgCode: "551", commercialMultiplierLow: 2.0, commercialMultiplierHigh: 4.5, notes: "Laminotomy/discectomy, single level.", source: "CMS 2025 IPPS/MPFS NYC" },
  "63047": { physicianFee:  850, episodeRate: 14500,  episodeType: "DRG",     drgCode: "551", commercialMultiplierLow: 2.0, commercialMultiplierHigh: 4.5, notes: "Laminectomy with facetectomy, single level.", source: "CMS 2025 IPPS/MPFS NYC" },

  // ── Cardiac ──────────────────────────────────────────────────────────────────
  "33533": { physicianFee: 2400, episodeRate: 38000,  episodeType: "DRG",     drgCode: "231", commercialMultiplierLow: 2.0, commercialMultiplierHigh: 4.0, notes: "CABG, arterial. DRG 231. Long inpatient stay, high implant costs.", source: "CMS 2025 IPPS/MPFS NYC" },
  "33534": { physicianFee: 2500, episodeRate: 40000,  episodeType: "DRG",     drgCode: "231", commercialMultiplierLow: 2.0, commercialMultiplierHigh: 4.0, notes: "CABG, two arterial.", source: "CMS 2025 IPPS/MPFS NYC" },
  "33405": { physicianFee: 3200, episodeRate: 55000,  episodeType: "DRG",     drgCode: "216", commercialMultiplierLow: 2.0, commercialMultiplierHigh: 4.0, notes: "Aortic valve replacement. DRG 216. Valve cost $10–40K.", source: "CMS 2025 IPPS/MPFS NYC" },
  "33361": { physicianFee: 3800, episodeRate: 60000,  episodeType: "DRG",     drgCode: "216", commercialMultiplierLow: 2.0, commercialMultiplierHigh: 4.0, notes: "TAVR (transcatheter aortic valve). Very high device cost ($30–50K).", source: "CMS 2025 IPPS/MPFS NYC" },

  // ── General Surgery ──────────────────────────────────────────────────────────
  "47562": { physicianFee:  580, episodeRate:  9200,  episodeType: "DRG",     drgCode: "411", commercialMultiplierLow: 2.0, commercialMultiplierHigh: 4.0, notes: "Laparoscopic cholecystectomy. Often same-day or 23-hr stay.", source: "CMS 2025 IPPS/MPFS NYC" },
  "47563": { physicianFee:  680, episodeRate:  9800,  episodeType: "DRG",     drgCode: "411", commercialMultiplierLow: 2.0, commercialMultiplierHigh: 4.0, notes: "Laparoscopic cholecystectomy with cholangiography.", source: "CMS 2025 IPPS/MPFS NYC" },
  "44950": { physicianFee:  450, episodeRate:  9500,  episodeType: "DRG",     drgCode: "341", commercialMultiplierLow: 2.0, commercialMultiplierHigh: 4.0, notes: "Appendectomy, simple. DRG 341.", source: "CMS 2025 IPPS/MPFS NYC" },
  "44960": { physicianFee:  520, episodeRate: 13000,  episodeType: "DRG",     drgCode: "340", commercialMultiplierLow: 2.0, commercialMultiplierHigh: 4.0, notes: "Appendectomy, ruptured. Longer stay, DRG 340.", source: "CMS 2025 IPPS/MPFS NYC" },
  "49505": { physicianFee:  540, episodeRate:  3200,  episodeType: "APC",                     commercialMultiplierLow: 2.0, commercialMultiplierHigh: 4.5, notes: "Inguinal hernia repair. Usually outpatient.", source: "CMS 2025 OPPS/MPFS NYC" },
  "43324": { physicianFee:  820, episodeRate: 18000,  episodeType: "DRG",     drgCode: "329", commercialMultiplierLow: 2.0, commercialMultiplierHigh: 3.5, notes: "Esophagogastric fundoplasty (Nissen).", source: "CMS 2025 IPPS/MPFS NYC" },

  // ── GI / Endoscopy ───────────────────────────────────────────────────────────
  "45378": { physicianFee:  315, episodeRate:   665,  episodeType: "APC",                     commercialMultiplierLow: 2.0, commercialMultiplierHigh: 5.0, notes: "Colonoscopy, diagnostic. One of the most common outpatient procedures.", source: "CMS 2025 OPPS/MPFS NYC" },
  "45380": { physicianFee:  400, episodeRate:   800,  episodeType: "APC",                     commercialMultiplierLow: 2.0, commercialMultiplierHigh: 5.0, notes: "Colonoscopy with biopsy.", source: "CMS 2025 OPPS/MPFS NYC" },
  "45385": { physicianFee:  480, episodeRate:   960,  episodeType: "APC",                     commercialMultiplierLow: 2.0, commercialMultiplierHigh: 5.0, notes: "Colonoscopy with polypectomy.", source: "CMS 2025 OPPS/MPFS NYC" },
  "43235": { physicianFee:  150, episodeRate:   430,  episodeType: "APC",                     commercialMultiplierLow: 2.0, commercialMultiplierHigh: 5.0, notes: "Upper GI endoscopy, diagnostic.", source: "CMS 2025 OPPS/MPFS NYC" },
  "43239": { physicianFee:  188, episodeRate:   490,  episodeType: "APC",                     commercialMultiplierLow: 2.0, commercialMultiplierHigh: 5.0, notes: "Upper GI endoscopy with biopsy.", source: "CMS 2025 OPPS/MPFS NYC" },

  // ── Ophthalmology ────────────────────────────────────────────────────────────
  "66984": { physicianFee:  710, episodeRate:  1760,  episodeType: "APC",                     commercialMultiplierLow: 1.5, commercialMultiplierHigh: 4.0, notes: "Cataract extraction with IOL. One of the highest-volume procedures.", source: "CMS 2025 OPPS/MPFS NYC" },
  "66982": { physicianFee:  980, episodeRate:  2200,  episodeType: "APC",                     commercialMultiplierLow: 1.5, commercialMultiplierHigh: 4.0, notes: "Complex cataract extraction.", source: "CMS 2025 OPPS/MPFS NYC" },

  // ── Urology ──────────────────────────────────────────────────────────────────
  "52601": { physicianFee:  780, episodeRate:  8500,  episodeType: "DRG",     drgCode: "585", commercialMultiplierLow: 2.0, commercialMultiplierHigh: 4.0, notes: "TURP (transurethral resection of prostate).", source: "CMS 2025 IPPS/MPFS NYC" },
  "55866": { physicianFee: 1800, episodeRate: 14000,  episodeType: "DRG",     drgCode: "710", commercialMultiplierLow: 2.0, commercialMultiplierHigh: 4.0, notes: "Laparoscopic radical prostatectomy.", source: "CMS 2025 IPPS/MPFS NYC" },
  "50590": { physicianFee:  820, episodeRate:  5500,  episodeType: "DRG",     drgCode: "657", commercialMultiplierLow: 2.0, commercialMultiplierHigh: 4.5, notes: "Lithotripsy (kidney stones).", source: "CMS 2025 IPPS/MPFS NYC" },

  // ── Gynecology ───────────────────────────────────────────────────────────────
  "58571": { physicianFee: 1050, episodeRate: 11000,  episodeType: "DRG",     drgCode: "742", commercialMultiplierLow: 2.0, commercialMultiplierHigh: 4.0, notes: "Laparoscopic hysterectomy.", source: "CMS 2025 IPPS/MPFS NYC" },
  "58150": { physicianFee:  820, episodeRate: 11000,  episodeType: "DRG",     drgCode: "742", commercialMultiplierLow: 2.0, commercialMultiplierHigh: 4.0, notes: "Total abdominal hysterectomy.", source: "CMS 2025 IPPS/MPFS NYC" },

  // ── ENT ──────────────────────────────────────────────────────────────────────
  "42826": { physicianFee:  480, episodeRate:  3500,  episodeType: "APC",                     commercialMultiplierLow: 2.0, commercialMultiplierHigh: 5.0, notes: "Tonsillectomy, age 12+.", source: "CMS 2025 OPPS/MPFS NYC" },
  "31254": { physicianFee:  620, episodeRate:  4500,  episodeType: "APC",                     commercialMultiplierLow: 2.0, commercialMultiplierHigh: 5.0, notes: "Functional endoscopic sinus surgery (FESS).", source: "CMS 2025 OPPS/MPFS NYC" },

  // ── Neurosurgery ─────────────────────────────────────────────────────────────
  "61510": { physicianFee: 3200, episodeRate: 45000,  episodeType: "DRG",     drgCode: "025", commercialMultiplierLow: 2.0, commercialMultiplierHigh: 4.0, notes: "Craniotomy for tumor. Complex, long ICU stay.", source: "CMS 2025 IPPS/MPFS NYC" },

  // ── Vascular ────────────────────────────────────────────────────────────────
  "35301": { physicianFee: 1680, episodeRate: 18000,  episodeType: "DRG",     drgCode: "237", commercialMultiplierLow: 2.0, commercialMultiplierHigh: 4.0, notes: "Carotid endarterectomy.", source: "CMS 2025 IPPS/MPFS NYC" },

  // ── Radiology / Imaging ──────────────────────────────────────────────────────
  "70553": { physicianFee:  280, episodeRate:   700,  episodeType: "APC",                     commercialMultiplierLow: 2.0, commercialMultiplierHigh: 6.0, notes: "MRI brain with and without contrast.", source: "CMS 2025 OPPS/MPFS NYC" },
  "71046": { physicianFee:   55, episodeRate:   200,  episodeType: "APC",                     commercialMultiplierLow: 2.0, commercialMultiplierHigh: 6.0, notes: "Chest X-ray, 2 views.", source: "CMS 2025 OPPS/MPFS NYC" },
  "93306": { physicianFee:  310, episodeRate:   750,  episodeType: "APC",                     commercialMultiplierLow: 1.5, commercialMultiplierHigh: 4.0, notes: "Echocardiogram with Doppler.", source: "CMS 2025 OPPS/MPFS NYC" },
};

// ── Public API ─────────────────────────────────────────────────────────────────

/** Returns Medicare benchmark for a CPT code, or null if not in the lookup table. */
export function getMedicareRate(cptCode: string): MedicareBenchmark | null {
  const entry = MEDICARE_RATES[cptCode.trim()];
  if (!entry) return null;
  return { cptCode, ...entry };
}

/**
 * Returns Medicare benchmarks for multiple CPT codes.
 * Returns the entry with the highest episodeRate (best estimate for the primary procedure).
 */
export function getBestMedicareBenchmark(cptCodes: string[]): MedicareBenchmark | null {
  const matches = cptCodes
    .map((c) => getMedicareRate(c))
    .filter((m): m is MedicareBenchmark => m !== null);

  if (!matches.length) return null;

  // Prefer entries with episode rates; then highest episode rate
  return matches.sort((a, b) => {
    if (a.episodeRate && !b.episodeRate) return -1;
    if (!a.episodeRate && b.episodeRate) return 1;
    return (b.episodeRate ?? b.physicianFee) - (a.episodeRate ?? a.physicianFee);
  })[0];
}
