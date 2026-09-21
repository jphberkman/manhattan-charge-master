import { searchHcpcs, searchIcd10Cm, searchRxTerms } from "../src/lib/authoritative/nlm-clinical-tables";
import { getCareCompareByCcn } from "../src/lib/authoritative/cms-care-compare";
import { listCmsCatalog, listHptEnforcement } from "../src/lib/authoritative/cms-data-api";
import { listCdcIcd10CmFiles } from "../src/lib/authoritative/cdc-icd10cm";
import { lookupProcedurePrice } from "../src/lib/authoritative/cms-ppl";
import { lookupAuthoritativeCodes, validateAuthoritativeCode } from "../src/lib/authoritative/lookup";

async function main() {
  const knee = await lookupAuthoritativeCodes("osteoarthritis knee");
  const out = {
    icd: await searchIcd10Cm("M17.11", 1),
    hcpcs: await searchHcpcs("E0193", 1),
    rx: (await searchRxTerms("ibuprofen", 2)).map((r) => r.displayName),
    bellevue: await getCareCompareByCcn("330204"),
    catalogN: (await listCmsCatalog(3)).length,
    hptN: (await listHptEnforcement("NY", 2)).length,
    cdc: (await listCdcIcd10CmFiles("2026")).map((f) => f.name),
    ppl: await lookupProcedurePrice("27447"),
    validateIcd: await validateAuthoritativeCode("M17.11"),
    validateCpt: await validateAuthoritativeCode("27447"),
    lookupKnee: { icd: knee.icd10cm.slice(0, 2), hcpcs: knee.hcpcs, notes: knee.notes },
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
