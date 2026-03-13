/**
 * Seeds the RevenueCode table with standard NUBC revenue codes.
 *
 * Revenue codes are used by hospitals on UB-04 claims forms to categorize
 * facility charges. This mapping enables parsing of chargemaster files
 * that use revenue codes instead of (or alongside) CPT codes.
 *
 * Usage:
 *   npx tsx scripts/seed-revenue-codes.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

// [code, description, category, chargeType]
const REVENUE_CODES: [string, string, string, string][] = [
  // Room & Board (010x-021x)
  ["0100", "All-inclusive room & board", "Accommodation", "room"],
  ["0101", "All-inclusive room & board - private", "Accommodation", "room"],
  ["0110", "Room & board - private (general)", "Accommodation", "room"],
  ["0111", "Room & board - private (medical/surgical)", "Accommodation", "room"],
  ["0112", "Room & board - private (OB)", "Accommodation", "room"],
  ["0113", "Room & board - private (pediatric)", "Accommodation", "room"],
  ["0114", "Room & board - private (psychiatric)", "Accommodation", "room"],
  ["0120", "Room & board - semi-private (2 bed)", "Accommodation", "room"],
  ["0121", "Room & board - semi-private (med/surg)", "Accommodation", "room"],
  ["0122", "Room & board - semi-private (OB)", "Accommodation", "room"],
  ["0123", "Room & board - semi-private (pediatric)", "Accommodation", "room"],
  ["0130", "Room & board - semi-private (3-4 bed)", "Accommodation", "room"],
  ["0140", "Room & board - private (deluxe)", "Accommodation", "room"],
  ["0150", "Room & board - ward", "Accommodation", "room"],
  ["0160", "Room & board - other", "Accommodation", "room"],
  ["0170", "Nursery", "Accommodation", "room"],
  ["0180", "Leave of absence", "Accommodation", "room"],
  ["0190", "Subacute care", "Accommodation", "room"],
  ["0200", "ICU (general)", "Accommodation", "room"],
  ["0201", "ICU - surgical", "Accommodation", "room"],
  ["0202", "ICU - medical", "Accommodation", "room"],
  ["0203", "ICU - pediatric", "Accommodation", "room"],
  ["0204", "ICU - psychiatric", "Accommodation", "room"],
  ["0206", "ICU - post-ICU", "Accommodation", "room"],
  ["0207", "ICU - neonatal (NICU)", "Accommodation", "room"],
  ["0210", "Coronary care unit (CCU)", "Accommodation", "room"],
  ["0211", "CCU - surgical", "Accommodation", "room"],
  ["0212", "CCU - medical", "Accommodation", "room"],

  // Pharmacy (025x)
  ["0250", "Pharmacy (general)", "Ancillary", "pharmacy"],
  ["0251", "Pharmacy - generic drugs", "Ancillary", "pharmacy"],
  ["0252", "Pharmacy - non-generic drugs", "Ancillary", "pharmacy"],
  ["0253", "Pharmacy - take home drugs", "Ancillary", "pharmacy"],
  ["0254", "Pharmacy - drugs incident to diagnostic", "Ancillary", "pharmacy"],
  ["0255", "Pharmacy - drugs incident to radiology", "Ancillary", "pharmacy"],
  ["0256", "Pharmacy - experimental drugs", "Ancillary", "pharmacy"],
  ["0257", "Pharmacy - non-prescription drugs", "Ancillary", "pharmacy"],
  ["0258", "Pharmacy - IV solutions", "Ancillary", "pharmacy"],
  ["0259", "Pharmacy - other", "Ancillary", "pharmacy"],
  ["0260", "IV therapy (general)", "Ancillary", "pharmacy"],
  ["0261", "IV therapy - infusion pump", "Ancillary", "pharmacy"],
  ["0262", "IV therapy - pharmacy services", "Ancillary", "pharmacy"],
  ["0263", "IV therapy - drug/supply delivery", "Ancillary", "pharmacy"],
  ["0264", "IV therapy - supplies", "Ancillary", "pharmacy"],

  // Medical/Surgical Supplies (027x-028x)
  ["0270", "Medical/surgical supplies (general)", "Ancillary", "supply"],
  ["0271", "Medical/surgical supplies - non-sterile", "Ancillary", "supply"],
  ["0272", "Medical/surgical supplies - sterile", "Ancillary", "supply"],
  ["0273", "Medical/surgical supplies - take home", "Ancillary", "supply"],
  ["0274", "Medical/surgical supplies - prosthetic/orthotic", "Ancillary", "supply"],
  ["0275", "Medical/surgical supplies - pacemaker", "Ancillary", "supply"],
  ["0276", "Medical/surgical supplies - intraocular lens", "Ancillary", "supply"],
  ["0278", "Medical/surgical supplies - implants (other)", "Ancillary", "supply"],
  ["0279", "Medical/surgical supplies - other", "Ancillary", "supply"],
  ["0280", "Oncology (general)", "Ancillary", "therapy"],
  ["0289", "Oncology - other", "Ancillary", "therapy"],

  // Lab & Pathology (030x-031x)
  ["0300", "Laboratory (general)", "Diagnostic", "diagnostic"],
  ["0301", "Laboratory - chemistry", "Diagnostic", "diagnostic"],
  ["0302", "Laboratory - immunology", "Diagnostic", "diagnostic"],
  ["0303", "Laboratory - renal patient (home)", "Diagnostic", "diagnostic"],
  ["0304", "Laboratory - non-routine dialysis", "Diagnostic", "diagnostic"],
  ["0305", "Laboratory - hematology", "Diagnostic", "diagnostic"],
  ["0306", "Laboratory - bacteriology & microbiology", "Diagnostic", "diagnostic"],
  ["0307", "Laboratory - urology", "Diagnostic", "diagnostic"],
  ["0310", "Pathology (general)", "Diagnostic", "diagnostic"],
  ["0311", "Pathology - cytology", "Diagnostic", "diagnostic"],
  ["0312", "Pathology - histology", "Diagnostic", "diagnostic"],
  ["0314", "Pathology - biopsy", "Diagnostic", "diagnostic"],

  // Radiology (032x-035x)
  ["0320", "Radiology - diagnostic (general)", "Diagnostic", "diagnostic"],
  ["0321", "Radiology - angiography", "Diagnostic", "diagnostic"],
  ["0322", "Radiology - arthrography", "Diagnostic", "diagnostic"],
  ["0323", "Radiology - chest X-ray", "Diagnostic", "diagnostic"],
  ["0324", "Radiology - dental X-ray", "Diagnostic", "diagnostic"],
  ["0329", "Radiology - diagnostic (other)", "Diagnostic", "diagnostic"],
  ["0330", "Radiology - therapeutic (general)", "Diagnostic", "therapy"],
  ["0333", "Radiology - therapeutic (radiation therapy)", "Diagnostic", "therapy"],
  ["0340", "Nuclear medicine (general)", "Diagnostic", "diagnostic"],
  ["0341", "Nuclear medicine - diagnostic", "Diagnostic", "diagnostic"],
  ["0342", "Nuclear medicine - therapeutic", "Diagnostic", "therapy"],
  ["0350", "CT scan (general)", "Diagnostic", "diagnostic"],
  ["0351", "CT scan - head", "Diagnostic", "diagnostic"],
  ["0352", "CT scan - body", "Diagnostic", "diagnostic"],
  ["0359", "CT scan - other", "Diagnostic", "diagnostic"],

  // Operating Room (036x)
  ["0360", "Operating room services (general)", "Facility", "facility"],
  ["0361", "OR - minor surgery", "Facility", "facility"],
  ["0362", "OR - organ transplant", "Facility", "facility"],
  ["0367", "OR - kidney transplant", "Facility", "facility"],
  ["0369", "OR - other", "Facility", "facility"],

  // Anesthesia (037x)
  ["0370", "Anesthesia (general)", "Facility", "facility"],
  ["0371", "Anesthesia - incident to radiology", "Facility", "facility"],
  ["0372", "Anesthesia - incident to other diagnostic", "Facility", "facility"],
  ["0374", "Anesthesia - acupuncture", "Facility", "facility"],
  ["0379", "Anesthesia - other", "Facility", "facility"],

  // Blood & Blood Products (038x-039x)
  ["0380", "Blood (general)", "Ancillary", "supply"],
  ["0381", "Blood - packed red cells", "Ancillary", "supply"],
  ["0382", "Blood - whole blood", "Ancillary", "supply"],
  ["0383", "Blood - plasma", "Ancillary", "supply"],
  ["0384", "Blood - platelets", "Ancillary", "supply"],
  ["0385", "Blood - leukocytes", "Ancillary", "supply"],
  ["0386", "Blood - other components", "Ancillary", "supply"],
  ["0390", "Blood storage/processing", "Ancillary", "supply"],

  // Respiratory Services (041x-042x)
  ["0410", "Respiratory services (general)", "Ancillary", "therapy"],
  ["0412", "Respiratory - inhalation services", "Ancillary", "therapy"],
  ["0413", "Respiratory - hyperbaric oxygen therapy", "Ancillary", "therapy"],
  ["0420", "Physical therapy (general)", "Ancillary", "therapy"],
  ["0421", "Physical therapy - visit/evaluation", "Ancillary", "therapy"],
  ["0422", "Physical therapy - hourly", "Ancillary", "therapy"],
  ["0423", "Physical therapy - group", "Ancillary", "therapy"],
  ["0424", "Physical therapy - evaluation", "Ancillary", "therapy"],

  // Other Therapy (043x-044x)
  ["0430", "Occupational therapy (general)", "Ancillary", "therapy"],
  ["0431", "Occupational therapy - visit/evaluation", "Ancillary", "therapy"],
  ["0434", "Occupational therapy - evaluation", "Ancillary", "therapy"],
  ["0440", "Speech therapy (general)", "Ancillary", "therapy"],
  ["0441", "Speech therapy - visit/evaluation", "Ancillary", "therapy"],
  ["0444", "Speech therapy - evaluation", "Ancillary", "therapy"],

  // Emergency Room (045x)
  ["0450", "Emergency room (general)", "Facility", "facility"],
  ["0451", "Emergency room - EMTALA", "Facility", "facility"],
  ["0452", "Emergency room - beyond EMTALA", "Facility", "facility"],
  ["0456", "Emergency room - urgent care", "Facility", "facility"],
  ["0459", "Emergency room - other", "Facility", "facility"],

  // Pulmonary Function & Audiology (046x-047x)
  ["0460", "Pulmonary function (general)", "Diagnostic", "diagnostic"],
  ["0470", "Audiology (general)", "Diagnostic", "diagnostic"],

  // Cardiology (048x)
  ["0480", "Cardiology (general)", "Diagnostic", "diagnostic"],
  ["0481", "Cardiology - cardiac catheterization lab", "Diagnostic", "diagnostic"],
  ["0482", "Cardiology - stress test", "Diagnostic", "diagnostic"],
  ["0483", "Cardiology - echocardiology", "Diagnostic", "diagnostic"],
  ["0489", "Cardiology - other", "Diagnostic", "diagnostic"],

  // Ambulatory Surgery & Outpatient (049x-050x)
  ["0490", "Ambulatory surgical care (general)", "Facility", "facility"],
  ["0499", "Ambulatory surgical care - other", "Facility", "facility"],
  ["0500", "Outpatient services (general)", "Facility", "facility"],
  ["0509", "Outpatient services - other", "Facility", "facility"],

  // Clinic & Free-standing (051x-052x)
  ["0510", "Clinic (general)", "Facility", "facility"],
  ["0519", "Clinic - other", "Facility", "facility"],
  ["0520", "Free-standing clinic (general)", "Facility", "facility"],

  // Osteopathic & Ambulance (053x-054x)
  ["0530", "Osteopathic services (general)", "Ancillary", "therapy"],
  ["0540", "Ambulance (general)", "Ancillary", "other"],

  // Skilled Nursing (055x)
  ["0550", "Skilled nursing (general)", "Accommodation", "room"],

  // MRI (061x)
  ["0610", "MRI (general)", "Diagnostic", "diagnostic"],
  ["0611", "MRI - brain", "Diagnostic", "diagnostic"],
  ["0612", "MRI - spinal cord", "Diagnostic", "diagnostic"],
  ["0614", "MRI - other", "Diagnostic", "diagnostic"],
  ["0615", "MRI - head/neck", "Diagnostic", "diagnostic"],
  ["0616", "MRI - lower extremities", "Diagnostic", "diagnostic"],
  ["0618", "MRI - other body", "Diagnostic", "diagnostic"],

  // Medical/Surgical Supplies - Special (062x)
  ["0621", "Supplies - cardiac cath", "Ancillary", "supply"],
  ["0622", "Supplies - computed tomography", "Ancillary", "supply"],
  ["0623", "Supplies - other imaging", "Ancillary", "supply"],
  ["0624", "Supplies - FDA investigational device", "Ancillary", "supply"],

  // Drugs Requiring Specific Identification (063x)
  ["0636", "Drugs - EPO (less than 10,000 units)", "Ancillary", "pharmacy"],
  ["0637", "Drugs - EPO (10,000+ units)", "Ancillary", "pharmacy"],

  // Recovery Room (071x)
  ["0710", "Recovery room (general)", "Facility", "facility"],
  ["0711", "Recovery room - post-anesthesia", "Facility", "facility"],
  ["0719", "Recovery room - other", "Facility", "facility"],

  // Labor & Delivery (072x)
  ["0720", "Labor room / delivery (general)", "Facility", "facility"],
  ["0721", "Labor room", "Facility", "facility"],
  ["0722", "Delivery room", "Facility", "facility"],
  ["0723", "Circumcision", "Facility", "facility"],
  ["0724", "Birthing center", "Facility", "facility"],
  ["0729", "Labor & delivery - other", "Facility", "facility"],

  // EKG/ECG (073x)
  ["0730", "EKG/ECG (general)", "Diagnostic", "diagnostic"],
  ["0731", "EKG/ECG - Holter monitor", "Diagnostic", "diagnostic"],
  ["0732", "EKG/ECG - telemetry", "Diagnostic", "diagnostic"],
  ["0739", "EKG/ECG - other", "Diagnostic", "diagnostic"],

  // EEG (074x)
  ["0740", "EEG (general)", "Diagnostic", "diagnostic"],

  // Gastrointestinal (075x)
  ["0750", "GI services (general)", "Diagnostic", "diagnostic"],

  // Treatment/Observation Room (076x)
  ["0760", "Treatment/observation room (general)", "Facility", "facility"],
  ["0761", "Treatment room", "Facility", "facility"],
  ["0762", "Observation room", "Facility", "facility"],

  // Lithotripsy (079x)
  ["0790", "Lithotripsy (general)", "Facility", "facility"],

  // Inpatient Renal Dialysis (080x)
  ["0800", "Inpatient renal dialysis (general)", "Ancillary", "therapy"],

  // Organ Acquisition (081x)
  ["0810", "Organ acquisition (general)", "Ancillary", "other"],
  ["0811", "Organ acquisition - living donor", "Ancillary", "other"],
  ["0812", "Organ acquisition - cadaver donor", "Ancillary", "other"],
  ["0813", "Organ acquisition - unknown donor", "Ancillary", "other"],
  ["0814", "Organ acquisition - unsuccessful", "Ancillary", "other"],

  // Hemodialysis Outpatient (082x-083x)
  ["0820", "Hemodialysis - outpatient (general)", "Ancillary", "therapy"],
  ["0830", "Peritoneal dialysis (general)", "Ancillary", "therapy"],

  // Psychiatric & Rehabilitation (091x-094x)
  ["0900", "Psychiatric/psychological services (general)", "Ancillary", "therapy"],
  ["0901", "Psychiatric - electroshock treatment", "Ancillary", "therapy"],
  ["0910", "Psychiatric - individual therapy", "Ancillary", "therapy"],
  ["0914", "Psychiatric - individual therapy (by physician)", "Ancillary", "therapy"],
  ["0920", "Psychiatric - group treatment", "Ancillary", "therapy"],
  ["0940", "Rehabilitation services (general)", "Ancillary", "therapy"],
  ["0943", "Rehabilitation - cardiac rehab", "Ancillary", "therapy"],

  // Professional Fees (096x)
  ["0960", "Professional fees (general)", "Professional", "other"],
  ["0961", "Professional fees - psychiatric", "Professional", "other"],
  ["0962", "Professional fees - ophthalmology", "Professional", "other"],
  ["0963", "Professional fees - anesthesia", "Professional", "facility"],
  ["0964", "Professional fees - audiology", "Professional", "other"],
];

async function main() {
  console.log(`Seeding ${REVENUE_CODES.length} NUBC revenue codes...\n`);

  await prisma.$transaction(
    REVENUE_CODES.map(([code, description, category, chargeType]) =>
      prisma.revenueCode.upsert({
        where: { code },
        create: { code, description, category, chargeType },
        update: { description, category, chargeType },
      }),
    ),
  );

  const count = await prisma.revenueCode.count();
  console.log(`Done! ${count} revenue codes in database.`);

  // Show examples
  const examples = await prisma.revenueCode.findMany({
    where: { code: { in: ["0360", "0370", "0710", "0278", "0120"] } },
  });
  console.log("\nExamples:");
  for (const e of examples) {
    console.log(`  ${e.code}: ${e.description} [${e.category}/${e.chargeType}]`);
  }
}

main()
  .catch((err) => { console.error("Fatal:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
