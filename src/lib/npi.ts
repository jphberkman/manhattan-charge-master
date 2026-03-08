export interface NpiResult {
  npi: string;
  firstName: string;
  lastName: string;
  credential: string;
  specialty: string;
  practiceCity: string;
}

export async function validateNpiPhysician(
  firstName: string,
  lastName: string
): Promise<NpiResult | null> {
  try {
    const params = new URLSearchParams({
      version: "2.1",
      enumeration_type: "NPI-1",
      first_name: firstName,
      last_name: lastName,
      state: "NY",
      limit: "5",
    });

    const res = await fetch(
      `https://npiregistry.cms.hhs.gov/api/?${params}`,
      { next: { revalidate: 86400 } } // cache 24h
    );
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.results?.length) return null;

    // Prefer a NYC / Manhattan practice address
    const best =
      data.results.find((r: any) =>
        r.addresses?.some((a: any) =>
          ["new york", "manhattan"].some((kw) =>
            a.city?.toLowerCase().includes(kw)
          )
        )
      ) ?? data.results[0];

    const basic = best.basic ?? {};
    const taxonomy =
      best.taxonomies?.find((t: any) => t.primary) ?? best.taxonomies?.[0];
    const addr =
      best.addresses?.find((a: any) => a.address_purpose === "LOCATION") ??
      best.addresses?.[0];

    return {
      npi: best.number,
      firstName: basic.first_name ?? firstName,
      lastName: basic.last_name ?? lastName,
      credential: basic.credential ?? "",
      specialty: taxonomy?.desc ?? "",
      practiceCity: addr?.city ?? "",
    };
  } catch {
    return null;
  }
}
