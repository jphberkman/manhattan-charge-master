/**
 * Canonical hospitals shown to ShopForCare consumers.
 * Unmapped or mixed-campus source rows are not attributed to a shopper hospital.
 */

export interface ShopperHospital {
  id: string;
  name: string;
  system: string;
  address: string;
}

export const SHOPPER_HOSPITALS: ShopperHospital[] = [
  {
    id: "lenox-hill",
    name: "Lenox Hill Hospital (Northwell Health)",
    system: "Northwell Health",
    address: "100 E 77th St, New York, NY 10075",
  },
  {
    id: "mount-sinai-morningside",
    name: "Mount Sinai Morningside",
    system: "Mount Sinai Health System",
    address: "1111 Amsterdam Ave, New York, NY 10025",
  },
  {
    id: "mount-sinai-west",
    name: "Mount Sinai West",
    system: "Mount Sinai Health System",
    address: "1000 10th Ave, New York, NY 10019",
  },
  {
    id: "nyp-lower-manhattan",
    name: "NewYork-Presbyterian Lower Manhattan Hospital",
    system: "NewYork-Presbyterian",
    address: "170 William St, New York, NY 10038",
  },
  {
    id: "nyp-columbia",
    name: "NewYork-Presbyterian / Columbia University Irving Medical Center",
    system: "NewYork-Presbyterian",
    address: "622 W 168th St, New York, NY 10032",
  },
  {
    id: "nyp-cornell",
    name: "NewYork-Presbyterian / Weill Cornell Medical Center",
    system: "NewYork-Presbyterian",
    address: "525 E 68th St, New York, NY 10065",
  },
  {
    id: "hhc-bellevue",
    name: "NYC Health + Hospitals / Bellevue",
    system: "NYC Health + Hospitals",
    address: "462 1st Ave, New York, NY 10016",
  },
  {
    id: "hhc-harlem",
    name: "NYC Health + Hospitals / Harlem",
    system: "NYC Health + Hospitals",
    address: "506 Lenox Ave, New York, NY 10037",
  },
  {
    id: "hhc-metropolitan",
    name: "NYC Health + Hospitals / Metropolitan",
    system: "NYC Health + Hospitals",
    address: "1901 1st Ave, New York, NY 10029",
  },
  {
    id: "nyu-langone",
    name: "NYU Langone Health (Tisch Hospital & Kimmel Pavilion)",
    system: "NYU Langone Health",
    address: "550 1st Ave, New York, NY 10016",
  },
  {
    id: "mount-sinai",
    name: "The Mount Sinai Hospital (Main Campus)",
    system: "Mount Sinai Health System",
    address: "One Gustave L. Levy Place, New York, NY 10029",
  },
  {
    id: "hss",
    name: "Hospital for Special Surgery (HSS)",
    system: "Hospital for Special Surgery",
    address: "535 E 70th St, New York, NY 10021",
  },
  {
    id: "msk",
    name: "Memorial Sloan Kettering Cancer Center (MSK)",
    system: "Memorial Sloan Kettering",
    address: "1275 York Ave, New York, NY 10065",
  },
];

const BY_ID = new Map(SHOPPER_HOSPITALS.map((h) => [h.id, h]));

/** Exact (normalized) source names that may be attributed to one shopper hospital. */
const EXACT_NAME_TO_ID: Record<string, string> = {
  "lenox hill hospital": "lenox-hill",
  "lenox hill hospital (northwell)": "lenox-hill",
  "lenox hill hospital (northwell health)": "lenox-hill",
  "northwell lenox hill": "lenox-hill",
  "mount sinai morningside": "mount-sinai-morningside",
  "mount sinai west": "mount-sinai-west",
  "newyork-presbyterian lower manhattan hospital": "nyp-lower-manhattan",
  "new york-presbyterian lower manhattan hospital": "nyp-lower-manhattan",
  "nyp lower manhattan": "nyp-lower-manhattan",
  "newyork-presbyterian columbia university irving medical center": "nyp-columbia",
  "new york-presbyterian columbia university irving medical center": "nyp-columbia",
  "nyp columbia": "nyp-columbia",
  "columbia university irving medical center": "nyp-columbia",
  "newyork-presbyterian / columbia university irving medical center": "nyp-columbia",
  "newyork-presbyterian weill cornell medical center": "nyp-cornell",
  "new york-presbyterian weill cornell medical center": "nyp-cornell",
  "newyork-presbyterian / weill cornell medical center": "nyp-cornell",
  "nyp weill cornell": "nyp-cornell",
  "weill cornell": "nyp-cornell",
  "bellevue hospital center": "hhc-bellevue",
  "bellevue hospital": "hhc-bellevue",
  "nyc health + hospitals / bellevue": "hhc-bellevue",
  "nyc health and hospitals / bellevue": "hhc-bellevue",
  "nyc health + hospitals bellevue": "hhc-bellevue",
  "harlem hospital center": "hhc-harlem",
  "harlem hospital": "hhc-harlem",
  "nyc health + hospitals / harlem": "hhc-harlem",
  "nyc health and hospitals / harlem": "hhc-harlem",
  "metropolitan hospital center": "hhc-metropolitan",
  "metropolitan hospital": "hhc-metropolitan",
  "nyc health + hospitals / metropolitan": "hhc-metropolitan",
  "nyc health and hospitals / metropolitan": "hhc-metropolitan",
  "nyu langone health (tisch hospital)": "nyu-langone",
  "nyu langone health (tisch hospital & kimmel pavilion)": "nyu-langone",
  "nyu langone health": "nyu-langone",
  "nyu langone tisch": "nyu-langone",
  "kimmel pavilion": "nyu-langone",
  "the mount sinai hospital": "mount-sinai",
  "the mount sinai hospital (main campus)": "mount-sinai",
  "mount sinai hospital": "mount-sinai",
  "hospital for special surgery": "hss",
  "hospital for special surgery (hss)": "hss",
  "hss": "hss",
  "memorial sloan kettering cancer center": "msk",
  "memorial sloan kettering cancer center (msk)": "msk",
  "memorial sloan-kettering": "msk",
  "msk": "msk",
};

function normalizeHospitalName(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Map a source hospital name to a shopper-facing facility.
 * Returns null when attribution would be guesswork (system-wide files, concatenated campuses, junk names).
 */
export function resolveShopperHospitalId(rawName: string): string | null {
  const lower = normalizeHospitalName(rawName);
  if (!lower) return null;

  // Mixed-campus or pipe-joined names cannot be attributed to one facility.
  if (lower.includes("|")) return null;

  if (EXACT_NAME_TO_ID[lower]) return EXACT_NAME_TO_ID[lower];

  // Generic system labels are not a facility.
  if (
    lower === "nyc health + hospitals" ||
    lower === "nyc health and hospitals" ||
    lower === "new york city health and hospitals" ||
    lower === "hospital_name" ||
    lower === "chargemaster" ||
    lower === "northwell health"
  ) {
    return null;
  }

  // Do not treat NYU Orthopedic as Tisch/Kimmel.
  if (lower.includes("orthopedic")) return null;

  // Ambiguous "mount sinai" without campus.
  if (lower === "mount sinai") return null;

  // Unique substring matches — only when a single shopper hospital hits.
  const hits = new Set<string>();
  const needles: [string, string][] = [
    ["lenox hill", "lenox-hill"],
    ["morningside", "mount-sinai-morningside"],
    ["mount sinai west", "mount-sinai-west"],
    ["lower manhattan", "nyp-lower-manhattan"],
    ["weill cornell", "nyp-cornell"],
    ["columbia", "nyp-columbia"],
    ["bellevue", "hhc-bellevue"],
    ["harlem", "hhc-harlem"],
    ["metropolitan", "hhc-metropolitan"],
    ["tisch", "nyu-langone"],
    ["kimmel", "nyu-langone"],
    ["special surgery", "hss"],
    ["sloan kettering", "msk"],
    ["sloan-kettering", "msk"],
  ];
  for (const [needle, id] of needles) {
    if (lower.includes(needle)) hits.add(id);
  }
  if (hits.size === 1) return [...hits][0];
  return null;
}

export function getShopperHospital(id: string): ShopperHospital | undefined {
  return BY_ID.get(id);
}
