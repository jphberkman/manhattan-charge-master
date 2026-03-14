/**
 * Seeds the ConditionMapping table with common patient conditions → CPT code mappings.
 *
 * This enables symptom-based search: when a user types "gallstones", we can
 * instantly resolve it to CPT 47562 (laparoscopic cholecystectomy) without
 * needing AI or fuzzy text matching.
 *
 * Usage:
 *   npx tsx scripts/seed-condition-mappings.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

// ── Condition → CPT mappings ─────────────────────────────────────────────────
// Format: [condition, icd10Code, cptCode, procedureName, weight]
// Weight: 100 = primary treatment, 80 = common alternative, 60 = less common

const MAPPINGS: [string, string, string, string, number][] = [
  // Orthopedic
  ["knee pain", "M17.11", "27447", "Total knee replacement", 100],
  ["knee arthritis", "M17.11", "27447", "Total knee replacement", 100],
  ["knee replacement", "", "27447", "Total knee replacement", 100],
  ["total knee replacement", "", "27447", "Total knee replacement", 100],
  ["torn ACL", "S83.511A", "29888", "ACL reconstruction", 100],
  ["ACL tear", "S83.511A", "29888", "ACL reconstruction", 100],
  ["ACL reconstruction", "S83.511A", "29888", "ACL reconstruction", 100],
  ["ACL repair", "S83.511A", "29888", "ACL reconstruction", 100],
  ["anterior cruciate ligament", "S83.511A", "29888", "ACL reconstruction", 100],
  ["torn meniscus", "S83.211A", "29881", "Meniscectomy (arthroscopic)", 100],
  ["meniscus tear", "S83.211A", "29881", "Meniscectomy (arthroscopic)", 100],
  ["hip pain", "M16.11", "27130", "Total hip replacement", 100],
  ["hip arthritis", "M16.11", "27130", "Total hip replacement", 100],
  ["hip replacement", "", "27130", "Total hip replacement", 100],
  ["total hip replacement", "", "27130", "Total hip replacement", 100],
  ["broken hip", "S72.001A", "27236", "Hip fracture repair (pinning)", 100],
  ["hip fracture", "S72.001A", "27236", "Hip fracture repair (pinning)", 100],
  ["rotator cuff tear", "M75.111", "29827", "Rotator cuff repair (arthroscopic)", 100],
  ["rotator cuff repair", "M75.111", "29827", "Rotator cuff repair (arthroscopic)", 100],
  ["rotator cuff", "M75.111", "29827", "Rotator cuff repair (arthroscopic)", 100],
  ["shoulder pain", "M75.111", "29827", "Rotator cuff repair (arthroscopic)", 80],
  ["shoulder replacement", "", "23472", "Total shoulder replacement", 100],
  ["total shoulder replacement", "", "23472", "Total shoulder replacement", 100],
  ["herniated disc", "M51.16", "63030", "Lumbar discectomy", 100],
  ["back pain", "M54.5", "63030", "Lumbar discectomy", 60],
  ["sciatica", "M54.31", "63030", "Lumbar discectomy", 80],
  ["spinal stenosis", "M48.06", "63047", "Lumbar laminectomy", 100],
  ["spinal fusion", "", "22612", "Lumbar spinal fusion", 100],
  ["lumbar fusion", "", "22612", "Lumbar spinal fusion", 100],
  ["carpal tunnel", "G56.00", "64721", "Carpal tunnel release", 100],
  ["carpal tunnel release", "G56.00", "64721", "Carpal tunnel release", 100],
  ["carpal tunnel surgery", "G56.00", "64721", "Carpal tunnel release", 100],
  ["ankle fracture", "S82.891A", "27766", "Ankle fracture repair (ORIF)", 100],
  ["ankle fracture ORIF", "S82.891A", "27766", "Ankle fracture repair (ORIF)", 100],
  ["broken ankle", "S82.891A", "27766", "Ankle fracture repair (ORIF)", 100],
  ["bunion", "M20.11", "28296", "Bunionectomy", 100],
  ["bunionectomy", "M20.11", "28296", "Bunionectomy", 100],
  ["trigger finger", "M65.30", "26055", "Trigger finger release", 100],

  // General surgery
  ["gallstones", "K80.20", "47562", "Laparoscopic cholecystectomy", 100],
  ["gallbladder", "K80.20", "47562", "Laparoscopic cholecystectomy", 100],
  ["appendicitis", "K35.80", "44970", "Laparoscopic appendectomy", 100],
  ["appendectomy", "K35.80", "44970", "Laparoscopic appendectomy", 100],
  ["appendix removal", "K35.80", "44970", "Laparoscopic appendectomy", 100],
  ["appendix", "K35.80", "44970", "Laparoscopic appendectomy", 100],
  ["hernia", "K40.90", "49505", "Inguinal hernia repair", 100],
  ["inguinal hernia", "K40.90", "49505", "Inguinal hernia repair", 100],
  ["umbilical hernia", "K42.9", "49585", "Umbilical hernia repair", 100],
  ["hemorrhoids", "K64.8", "46255", "Hemorrhoidectomy", 100],
  ["thyroid nodule", "E04.1", "60220", "Thyroid lobectomy", 100],
  ["thyroid surgery", "", "60220", "Thyroid lobectomy", 100],
  ["breast lump", "N63.0", "19120", "Breast lump excision", 100],
  ["mastectomy", "", "19303", "Mastectomy", 100],
  ["breast cancer surgery", "C50.911", "19303", "Mastectomy", 100],

  // Cardiac
  ["coronary artery bypass", "", "33533", "CABG (single graft)", 100],
  ["coronary bypass", "", "33533", "CABG (single graft)", 100],
  ["heart bypass", "", "33533", "CABG (single graft)", 100],
  ["bypass surgery", "", "33533", "CABG (single graft)", 80],
  ["CABG", "", "33533", "CABG (single graft)", 100],
  ["heart valve replacement", "", "33405", "Aortic valve replacement", 100],
  ["aortic valve", "", "33405", "Aortic valve replacement", 100],
  ["cardiac catheterization", "", "93458", "Left heart catheterization", 100],
  ["heart catheter", "", "93458", "Left heart catheterization", 100],
  ["pacemaker", "", "33208", "Pacemaker insertion (dual chamber)", 100],
  ["coronary stent", "", "92928", "Coronary stent placement", 100],
  ["chest pain", "R07.9", "93458", "Left heart catheterization", 60],
  ["atrial fibrillation", "I48.91", "93656", "Cardiac ablation", 80],

  // GI
  ["colonoscopy", "", "45378", "Diagnostic colonoscopy", 100],
  ["colon polyp", "K63.5", "45385", "Colonoscopy with polypectomy", 100],
  ["upper endoscopy", "", "43239", "Upper GI endoscopy with biopsy", 100],
  ["acid reflux", "K21.0", "43239", "Upper GI endoscopy with biopsy", 60],
  ["GERD", "K21.0", "43280", "Laparoscopic fundoplication", 80],
  ["bariatric surgery", "", "43775", "Laparoscopic sleeve gastrectomy", 100],
  ["gastric bypass", "", "43644", "Laparoscopic gastric bypass", 100],
  ["weight loss surgery", "", "43775", "Laparoscopic sleeve gastrectomy", 100],
  ["colon cancer", "C18.9", "44204", "Laparoscopic colectomy", 100],

  // OB/GYN
  ["cesarean section", "", "59510", "Cesarean delivery", 100],
  ["c-section", "", "59510", "Cesarean delivery", 100],
  ["hysterectomy", "", "58571", "Laparoscopic hysterectomy", 100],
  ["hysterectomy", "", "58150", "Total abdominal hysterectomy", 80],
  ["laparoscopic hysterectomy", "", "58571", "Laparoscopic hysterectomy", 100],
  ["fibroids", "D25.9", "58571", "Laparoscopic hysterectomy", 80],
  ["fibroids", "D25.9", "58150", "Total abdominal hysterectomy", 60],
  ["fibroid removal", "D25.9", "58140", "Myomectomy", 100],
  ["ovarian cyst", "N83.20", "58661", "Laparoscopic cyst removal", 100],
  ["endometriosis", "N80.0", "58660", "Laparoscopic lysis of adhesions", 80],
  ["egg retrieval", "", "58970", "Oocyte retrieval for IVF", 100],
  ["IVF", "", "58970", "Oocyte retrieval for IVF", 100],
  ["tubal ligation", "", "58670", "Laparoscopic tubal ligation", 100],

  // Urology
  ["kidney stones", "N20.0", "52356", "Lithotripsy (ureteroscopic)", 100],
  ["kidney stone removal", "N20.0", "52356", "Lithotripsy (ureteroscopic)", 100],
  ["prostate enlargement", "N40.1", "52601", "TURP (prostate resection)", 100],
  ["prostate cancer", "C61", "55866", "Laparoscopic prostatectomy", 100],
  ["prostatectomy", "", "55866", "Laparoscopic prostatectomy", 100],
  ["vasectomy", "", "55250", "Vasectomy", 100],
  ["circumcision", "", "54150", "Circumcision", 100],

  // ENT
  ["tonsillectomy", "", "42826", "Tonsillectomy", 100],
  ["tonsils", "J35.01", "42826", "Tonsillectomy", 100],
  ["sinus surgery", "", "31256", "Endoscopic sinus surgery", 100],
  ["sinusitis", "J32.9", "31256", "Endoscopic sinus surgery", 80],
  ["deviated septum", "J34.2", "30520", "Septoplasty", 100],
  ["ear tubes", "", "69436", "Tympanostomy (ear tube insertion)", 100],
  ["ear infection", "H66.90", "69436", "Tympanostomy (ear tube insertion)", 60],
  ["sleep apnea", "G47.33", "42145", "Uvulopalatopharyngoplasty (UPPP)", 80],
  ["sleep apnea", "G47.33", "95810", "Polysomnography (sleep study)", 100],

  // Eye
  ["cataract", "H25.9", "66984", "Cataract surgery (phacoemulsification)", 100],
  ["cataract surgery", "", "66984", "Cataract surgery (phacoemulsification)", 100],
  ["LASIK", "", "65760", "LASIK (keratomileusis)", 100],
  ["detached retina", "H33.001", "67108", "Retinal detachment repair", 100],
  ["glaucoma", "H40.11", "66170", "Trabeculectomy (glaucoma surgery)", 80],

  // Vascular
  ["varicose veins", "I83.90", "36478", "Endovenous ablation", 100],
  ["blood clot", "I82.401", "37187", "Venous thrombectomy", 80],
  ["carotid stenosis", "I65.21", "35301", "Carotid endarterectomy", 100],
  ["aortic aneurysm", "I71.4", "34802", "Endovascular aortic repair", 100],

  // Diagnostic / Imaging
  ["MRI brain", "", "70553", "MRI brain with and without contrast", 100],
  ["MRI knee", "", "73721", "MRI knee without contrast", 100],
  ["CT scan chest", "", "71260", "CT chest with contrast", 100],
  ["CT scan abdomen", "", "74177", "CT abdomen/pelvis with contrast", 100],
  ["stress test", "", "93015", "Cardiovascular stress test", 100],
  ["echocardiogram", "", "93306", "Transthoracic echocardiography", 100],
  ["sleep study", "", "95810", "Polysomnography (sleep study)", 100],
  ["mammogram", "", "77067", "Screening mammography (bilateral)", 100],
  ["bone density", "", "77080", "DEXA scan (bone density)", 100],
  ["PET scan", "", "78816", "PET scan for tumor", 100],

  // Common outpatient
  ["wisdom teeth", "", "41899", "Wisdom tooth extraction", 100],
  ["wisdom teeth extraction", "", "41899", "Wisdom tooth extraction", 100],
  ["wisdom tooth", "", "41899", "Wisdom tooth extraction", 100],
  ["root canal", "", "D3330", "Root canal (molar)", 100],
  ["epidural injection", "", "62322", "Lumbar epidural steroid injection", 100],
  ["cortisone injection", "", "20610", "Joint injection (cortisone)", 100],
  ["cortisone injection knee", "", "20610", "Joint injection (cortisone)", 100],
  ["skin lesion removal", "", "11102", "Skin biopsy/lesion removal", 100],
  ["mole removal", "D22.9", "11102", "Skin biopsy/lesion removal", 100],
  ["physical therapy", "", "97110", "Physical therapy evaluation", 100],

  // Cancer
  ["lung biopsy", "", "32405", "Lung biopsy (percutaneous)", 100],
  ["lung cancer", "C34.90", "32480", "Lung lobectomy", 100],
  ["colon cancer surgery", "C18.9", "44204", "Laparoscopic colectomy", 100],
  ["bladder cancer", "C67.9", "52234", "Bladder tumor resection (TURBT)", 100],
  ["melanoma", "C43.9", "11606", "Melanoma excision", 100],
];

// Old mappings to clean up (condition+cptCode pairs that have been superseded)
const STALE_MAPPINGS: [string, string][] = [
  ["ankle fracture", "27792"],
  ["broken ankle", "27792"],
  ["ankle fracture ORIF", "27792"],
  ["wisdom teeth", "D7240"],
];

async function main() {
  // Clean up stale mappings first
  for (const [condition, cptCode] of STALE_MAPPINGS) {
    await prisma.conditionMapping.deleteMany({ where: { condition, cptCode } });
  }
  if (STALE_MAPPINGS.length) console.log(`Cleaned up ${STALE_MAPPINGS.length} stale mappings.`);

  console.log(`Seeding ${MAPPINGS.length} condition → CPT mappings...\n`);

  let upserted = 0;

  for (const [condition, icd10Code, cptCode, procedureName, weight] of MAPPINGS) {
    await prisma.conditionMapping.upsert({
      where: {
        condition_cptCode: { condition, cptCode },
      },
      create: { condition, icd10Code, cptCode, procedureName, weight },
      update: { icd10Code, procedureName, weight },
    });
    upserted++;
  }

  const count = await prisma.conditionMapping.count();
  console.log(`Done! ${count} condition mappings in database.`);

  // Show some examples
  const examples = await prisma.conditionMapping.findMany({
    where: { condition: { in: ["gallstones", "torn ACL", "chest pain"] } },
    orderBy: { weight: "desc" },
  });
  console.log("\nExamples:");
  for (const e of examples) {
    console.log(`  "${e.condition}" → CPT ${e.cptCode} (${e.procedureName}) [ICD-10: ${e.icd10Code || "—"}, weight: ${e.weight}]`);
  }
}

main()
  .catch((err) => { console.error("Fatal:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
