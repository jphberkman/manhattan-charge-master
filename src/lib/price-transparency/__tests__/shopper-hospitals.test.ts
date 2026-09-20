import { describe, expect, it } from "vitest";
import {
  resolveShopperHospitalId,
  SHOPPER_HOSPITALS,
} from "../shopper-hospitals";

describe("resolveShopperHospitalId", () => {
  it("maps the founder shopper list names", () => {
    expect(resolveShopperHospitalId("Lenox Hill Hospital (Northwell Health)")).toBe("lenox-hill");
    expect(resolveShopperHospitalId("Mount Sinai Morningside")).toBe("mount-sinai-morningside");
    expect(resolveShopperHospitalId("Mount Sinai West")).toBe("mount-sinai-west");
    expect(resolveShopperHospitalId("NewYork-Presbyterian Lower Manhattan Hospital")).toBe(
      "nyp-lower-manhattan",
    );
    expect(
      resolveShopperHospitalId("NewYork-Presbyterian / Columbia University Irving Medical Center"),
    ).toBe("nyp-columbia");
    expect(
      resolveShopperHospitalId("NewYork-Presbyterian / Weill Cornell Medical Center"),
    ).toBe("nyp-cornell");
    expect(resolveShopperHospitalId("NYC Health + Hospitals / Bellevue")).toBe("hhc-bellevue");
    expect(resolveShopperHospitalId("NYC Health + Hospitals / Harlem")).toBe("hhc-harlem");
    expect(resolveShopperHospitalId("NYC Health + Hospitals / Metropolitan")).toBe(
      "hhc-metropolitan",
    );
    expect(
      resolveShopperHospitalId("NYU Langone Health (Tisch Hospital & Kimmel Pavilion)"),
    ).toBe("nyu-langone");
    expect(resolveShopperHospitalId("The Mount Sinai Hospital (Main Campus)")).toBe("mount-sinai");
    expect(resolveShopperHospitalId("Hospital for Special Surgery (HSS)")).toBe("hss");
    expect(resolveShopperHospitalId("Memorial Sloan Kettering Cancer Center (MSK)")).toBe("msk");
  });

  it("does not treat the whole H+H file as Bellevue", () => {
    expect(resolveShopperHospitalId("NYC Health + Hospitals")).toBeNull();
    expect(resolveShopperHospitalId("hospital_name")).toBeNull();
  });

  it("does not collapse concatenated NYP campuses onto one hospital", () => {
    expect(
      resolveShopperHospitalId(
        "NewYork-Presbyterian Columbia University Irving Medical Center|NewYork-Presbyterian Weill Cornell Medical Center|NewYork-Presbyterian Brooklyn Methodist Hospital",
      ),
    ).toBeNull();
  });

  it("does not map NYU Orthopedic onto Tisch/Kimmel", () => {
    expect(resolveShopperHospitalId("NYU Langone Orthopedic Hospital")).toBeNull();
  });

  it("does not map ambiguous Mount Sinai or junk upload names", () => {
    expect(resolveShopperHospitalId("Mount Sinai")).toBeNull();
    expect(resolveShopperHospitalId("chargemaster")).toBeNull();
    expect(resolveShopperHospitalId("Northwell Health")).toBeNull();
  });

  it("keeps Morningside distinct from West", () => {
    expect(resolveShopperHospitalId("Mount Sinai Morningside")).not.toBe("mount-sinai-west");
    expect(resolveShopperHospitalId("Mount Sinai West")).not.toBe("mount-sinai-morningside");
  });

  it("lists 13 shopper hospitals", () => {
    expect(SHOPPER_HOSPITALS).toHaveLength(13);
  });

  it("only attaches CMS CCNs proven in Care Compare Hospital General Information", () => {
    const byId = Object.fromEntries(SHOPPER_HOSPITALS.map((h) => [h.id, h.cmsCcn]));
    expect(byId["lenox-hill"]).toBe("330119");
    expect(byId["mount-sinai-west"]).toBe("330046");
    expect(byId["nyp-cornell"]).toBe("330101");
    expect(byId["hhc-bellevue"]).toBe("330204");
    expect(byId["hhc-harlem"]).toBe("330240");
    expect(byId["hhc-metropolitan"]).toBe("330199");
    expect(byId["nyu-langone"]).toBe("330214");
    expect(byId["mount-sinai"]).toBe("330024");
    expect(byId["hss"]).toBe("330270");
    expect(byId["mount-sinai-morningside"]).toBeNull();
    expect(byId["nyp-lower-manhattan"]).toBeNull();
    expect(byId["nyp-columbia"]).toBeNull();
    expect(byId["msk"]).toBeNull();
  });
});
