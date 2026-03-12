// ── Types ──────────────────────────────────────────────────────────────────────

export interface NpiResult {
  npi: string;
  firstName: string;
  lastName: string;
  credential: string;
  specialty: string;
  practiceCity: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NPI_API = "https://npiregistry.cms.hhs.gov/api/";
const CACHE_SECS = 86_400; // 24 h

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractResult(r: Record<string, any>, fallbackFirst: string, fallbackLast: string): NpiResult {
  const basic    = r.basic ?? {};
  const taxonomy = r.taxonomies?.find((t: any) => t.primary) ?? r.taxonomies?.[0];
  const addr     = r.addresses?.find((a: any) => a.address_purpose === "LOCATION") ?? r.addresses?.[0];
  return {
    npi:          r.number,
    firstName:    basic.first_name  ?? fallbackFirst,
    lastName:     basic.last_name   ?? fallbackLast,
    credential:   basic.credential  ?? "",
    specialty:    taxonomy?.desc    ?? "",
    practiceCity: addr?.city        ?? "",
  };
}

function preferManhattan(results: Record<string, any>[]): Record<string, any> {
  return (
    results.find((r) =>
      r.addresses?.some((a: any) =>
        ["new york", "manhattan"].some((kw) => a.city?.toLowerCase().includes(kw)),
      ),
    ) ?? results[0]
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validates a physician by name against the NPI Registry.
 * Returns the best Manhattan match, or null if not found.
 */
export async function validateNpiPhysician(
  firstName: string,
  lastName: string,
): Promise<NpiResult | null> {
  try {
    const params = new URLSearchParams({
      version:          "2.1",
      enumeration_type: "NPI-1",
      first_name:       firstName,
      last_name:        lastName,
      state:            "NY",
      limit:            "5",
    });

    const res = await fetch(`${NPI_API}?${params}`, {
      next: { revalidate: CACHE_SECS },
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.results?.length) return null;

    const best = preferManhattan(data.results);
    return extractResult(best, firstName, lastName);
  } catch {
    return null;
  }
}

/**
 * Searches the NPI Registry for physicians by specialty taxonomy description in NYC.
 * Returns up to `limit` real, verified physicians — used as the primary source for
 * physician recommendations instead of having AI invent names.
 */
export async function searchNpiPhysicians(
  taxonomyDescription: string,
  limit = 10,
): Promise<NpiResult[]> {
  try {
    const params = new URLSearchParams({
      version:              "2.1",
      enumeration_type:     "NPI-1",
      taxonomy_description: taxonomyDescription,
      city:                 "New York",
      state:                "NY",
      limit:                String(limit),
    });

    const res = await fetch(`${NPI_API}?${params}`, {
      next: { revalidate: CACHE_SECS },
    });
    if (!res.ok) return [];

    const data = await res.json();
    if (!data.results?.length) return [];

    return (data.results as Record<string, any>[]).map((r) =>
      extractResult(r, r.basic?.first_name ?? "", r.basic?.last_name ?? ""),
    );
  } catch {
    return [];
  }
}
