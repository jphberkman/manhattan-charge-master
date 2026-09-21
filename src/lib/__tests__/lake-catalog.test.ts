import { describe, expect, test } from "vitest";
import {
  decideCatalogRow,
  parseMasterIndexCsv,
  preferredHospitalMrfs,
  type MasterIndexRow,
} from "@/lib/price-transparency/lake-catalog";

const HEADER =
  "object_key,size_bytes,sha256,hospital_slug,borough,source_mrf_url,local_path,neon_present";

function row(overrides: Partial<MasterIndexRow> & { objectKey: string }): MasterIndexRow {
  return {
    sizeBytes: 1000,
    sha256: "abc",
    hospitalSlug: "msk",
    borough: "manhattan",
    sourceMrfUrl: "",
    neonPresent: true,
    ...overrides,
  };
}

describe("parseMasterIndexCsv", () => {
  test("parses preferred hospital MRF rows", () => {
    const csv = [
      HEADER,
      "01-hospitals/manhattan/msk/2026-09-20__msk__standardcharges.json.gz,6037108,aa,msk,manhattan,https://example.com,/tmp/x,yes",
      "02-insurance-tic/united/big.json.gz,1603015,bb,united,,,/tmp/y,yes",
    ].join("\n");
    const rows = parseMasterIndexCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].hospitalSlug).toBe("msk");
    expect(rows[0].neonPresent).toBe(true);
    expect(rows[1].hospitalSlug).toBe("united");
  });
});

describe("decideCatalogRow", () => {
  test("ingests mapped Manhattan hospital MRFs", () => {
    const d = decideCatalogRow(
      row({
        objectKey: "01-hospitals/manhattan/nyu-tisch/2026-09-20__nyu-tisch__standardcharges.csv.gz",
        hospitalSlug: "nyu-tisch",
      }),
    );
    expect(d.action).toBe("ingest");
    expect(d.shopperId).toBe("nyu-langone");
  });

  test("skips TiC payer files", () => {
    const d = decideCatalogRow(
      row({
        objectKey: "02-insurance-tic/united/2026-09-20__united__tic-index.json.gz",
        hospitalSlug: "united",
      }),
    );
    expect(d.action).toBe("skip");
    expect(d.reason).toMatch(/TiC/);
  });

  test("skips sister-campus READMEs", () => {
    const d = decideCatalogRow(
      row({
        objectKey: "01-hospitals/manhattan/mount-sinai-west/README_SHARES_MORNINGSIDE.txt",
        hospitalSlug: "mount-sinai-west",
      }),
    );
    expect(d.action).toBe("skip");
  });

  test("skips combined NYP (no shopper mapping)", () => {
    const d = decideCatalogRow(
      row({
        objectKey: "01-hospitals/manhattan/nyp/2026-09-20__nyp-hospital__standardcharges.json.zip",
        hospitalSlug: "nyp",
      }),
    );
    expect(d.action).toBe("skip");
    expect(d.shopperId).toBeUndefined();
  });
});

describe("preferredHospitalMrfs", () => {
  test("returns one object per shopper hospital, smallest first", () => {
    const rows = parseMasterIndexCsv(
      [
        HEADER,
        "01-hospitals/manhattan/msk/2026-09-20__msk__standardcharges.json.gz,6037108,a,msk,manhattan,,,yes",
        "01-hospitals/manhattan/hss/2026-09-20__hss-main__standardcharges.json.gz,338368904,b,hss,manhattan,,,yes",
        "01-hospitals/manhattan/hss/README_REASSEMBLE.txt,298,c,hss,manhattan,,,yes",
        "01-hospitals/bronx/hhc-jacobi/x.bin.gz,31185161,d,hhc-jacobi,bronx,,,yes",
      ].join("\n"),
    );
    const pref = preferredHospitalMrfs(rows);
    expect(pref.map((p) => p.shopperId)).toEqual(["msk", "hss"]);
    expect(pref[0].sizeBytes).toBeLessThan(pref[1].sizeBytes);
  });
});
