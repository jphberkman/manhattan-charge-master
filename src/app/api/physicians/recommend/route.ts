import { NextRequest, NextResponse } from "next/server";
import { anthropicCall } from "@/lib/anthropic-fetch";
import { searchNpiPhysicians, validateNpiPhysician } from "@/lib/npi";
import { redis } from "@/lib/redis";
import { getBatchCmsUtilization, buildProfileLinks } from "@/lib/cms-utilization";
import type { PhysicianProfileLinks } from "@/lib/cms-utilization";
import type { HospitalComparisonEntry } from "@/app/api/hospitals/compare/route";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PhysicianHospital {
  hospitalName: string;
  hospitalId: string;
}

export interface PhysicianRecommendation {
  name: string;
  credentials: string;
  specialty: string;
  highlights: string[];
  hospitals: PhysicianHospital[];
  whyRecommended: string;
  npi: string | null;
  npiVerified: boolean;
  npiSpecialty: string | null;
  /** True when this physician came from the NPI Registry (not AI-invented). */
  npiSource: boolean;
  /**
   * Number of times this physician performed this procedure on Medicare patients.
   * Sourced from CMS Medicare Physician & Other Practitioners dataset (2022).
   * Null if not found in the dataset (e.g. primarily treats younger/commercial patients).
   */
  procedureVolume: number | null;
  volumeYear: number | null;
  /** Direct links to external profile and review sites. */
  profileLinks: PhysicianProfileLinks | null;
}

export interface PhysicianResponse {
  physicians: PhysicianRecommendation[];
  /** Human-readable note about data provenance shown in the UI. */
  sourceNote: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SHORT_NAMES: Record<string, string> = {
  "nyu-langone":      "NYU Langone",
  "nyu-orthopedic":   "NYU Langone Orthopedic",
  "nyp-cornell":      "NYP / Weill Cornell",
  "nyp-columbia":     "NYP / Columbia",
  "mount-sinai":      "Mount Sinai",
  "mount-sinai-west": "Mount Sinai West",
  "msk":              "Memorial Sloan Kettering",
  "lenox-hill":       "Lenox Hill (Northwell)",
  "hss":              "Hospital for Special Surgery",
  "bellevue":         "Bellevue Hospital",
};

/**
 * Maps broad procedure categories to NPI taxonomy description search terms.
 * Used to query real physician records before passing to AI for ranking.
 */
const PROCEDURE_TAXONOMY_HINTS: [RegExp, string][] = [
  [/knee|hip|shoulder|joint|replacement|arthroplasty|orthopedic|fracture|acl|rotator/i, "Orthopedic Surgery"],
  [/spine|disc|laminectomy|fusion|vertebr/i, "Neurological Surgery"],
  [/cardiac|heart|coronary|valve|bypass/i, "Thoracic Surgery (Cardiothoracic Vascular Surgery)"],
  [/gallbladder|appendix|appendectomy|cholecystectomy|colectomy|hernia|bowel/i, "Surgery"],
  [/cancer|tumor|oncology|mastectomy|resection/i, "Surgical Oncology"],
  [/eye|cataract|retina|ophthalmol/i, "Ophthalmology"],
  [/urology|prostate|kidney|bladder/i, "Urology"],
  [/gynecol|uterus|ovary|hysterectomy/i, "Obstetrics & Gynecology"],
  [/colonoscopy|endoscopy|gastro|colon/i, "Gastroenterology"],
  [/neuro|brain|craniotomy/i, "Neurological Surgery"],
  [/vascular|aneurysm|aorta/i, "Vascular Surgery"],
  [/plastic|reconstructive|cosmetic/i, "Plastic Surgery"],
  [/ent|ear|nose|throat|sinus|tonsil/i, "Otolaryngology"],
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveTaxonomyHint(procedureName: string, cptCode: string | null): string {
  const text = `${procedureName} ${cptCode ?? ""}`;
  for (const [pattern, taxonomy] of PROCEDURE_TAXONOMY_HINTS) {
    if (pattern.test(text)) return taxonomy;
  }
  return "Surgery"; // broad fallback
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const {
    procedureName,
    cptCode,
    insurerName,
    payerType,
    hospitalPrices = [] as HospitalComparisonEntry[],
  } = await req.json();

  if (!procedureName) {
    return NextResponse.json({ error: "procedureName is required" }, { status: 400 });
  }

  const cacheKey = `physicians2:${procedureName.trim().toLowerCase()}|${cptCode ?? ""}|${insurerName ?? ""}|${payerType ?? ""}`;
  const cached = await redis.get<PhysicianResponse>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const hasInsurance = !!(insurerName && payerType !== "cash");
  const insurerContext = insurerName
    ? `Patient has ${insurerName} (${payerType ?? "commercial"}) insurance.`
    : "No specific insurer selected.";

  const hospitalList = (hospitalPrices as HospitalComparisonEntry[])
    .map((e) => `- ${e.hospital.name} [id: ${e.hospital.id}]`)
    .join("\n");

  // 1. Query NPI Registry for real, verified physicians in NYC
  const taxonomyHint = deriveTaxonomyHint(procedureName, cptCode ?? null);
  const npiCandidates = await searchNpiPhysicians(taxonomyHint, 15);
  const useNpiSource = npiCandidates.length >= 3;

  // 2. Fetch Medicare procedure volume for each candidate (parallel, non-blocking)
  //    This gives us real, objective volume data to rank by before passing to AI.
  const volumeMap = cptCode
    ? await getBatchCmsUtilization(npiCandidates.map((c) => c.npi), cptCode)
    : new Map();

  let physicians: PhysicianRecommendation[];
  let sourceNote: string;

  try {
    if (useNpiSource) {
      // 2a. NPI-first path: sort by Medicare procedure volume, then pass to Claude for ranking
      const sortedCandidates = [...npiCandidates].sort((a, b) => {
        const va = volumeMap.get(a.npi)?.totalServices ?? 0;
        const vb = volumeMap.get(b.npi)?.totalServices ?? 0;
        return vb - va; // highest volume first
      });

      const candidateList = sortedCandidates
        .map((p, i) => {
          const vol = volumeMap.get(p.npi);
          const volNote = vol ? ` [${vol.totalServices} Medicare procedures/${vol.year}]` : "";
          return `${i}: ${p.firstName} ${p.lastName}${p.credential ? `, ${p.credential}` : ""} — ${p.specialty} (${p.practiceCity})${volNote}`;
        })
        .join("\n");

      const rankText = await anthropicCall({
        max_tokens: 1500,
        system: `You are an expert in Manhattan healthcare. You rank real, verified physicians for specific procedures.
You MUST only select physicians from the provided list — do not add, invent, or substitute names.
Return ONLY valid JSON — no markdown.`,
        messages: [
          {
            role: "user",
            content: `Select and rank the top 3 physicians for "${procedureName}" (CPT ${cptCode ?? "unknown"}) from this verified NPI Registry list.
Candidates are pre-sorted by Medicare procedure volume (highest first) — use this as a strong signal of experience.

${candidateList}

${insurerContext}
${hasInsurance ? `Prefer physicians likely in-network with ${insurerName}.` : ""}
${hospitalList ? `Hospitals in our system (use these when listing affiliations):\n${hospitalList}` : ""}

Return JSON:
{
  "selections": [
    {
      "candidateIndex": <0-based index from list above>,
      "highlights": ["Specific reason 1 (include procedure volume if known)", "Board certified", "Fellowship-trained"],
      "whyRecommended": "One sentence on why this physician is a strong choice — mention volume if available.",
      "hospitals": [
        { "hospitalId": "<id from system list, or empty string>", "hospitalName": "<hospital name>" }
      ]
    }
  ]
}

Guidelines:
- Prefer candidates with higher Medicare procedure volume as a proxy for experience
- Select physicians whose taxonomy matches the procedure specialty
- Prefer those with Manhattan practice city
- List 1-3 realistic hospital affiliations per physician based on their specialty and hospital type
- For orthopedics: prefer HSS, NYU Orthopedic, NYP/Cornell
- For oncology: prefer MSK, NYP/Columbia
- For general surgery: prefer NYP/Columbia, Mount Sinai, NYU Langone`,
          },
        ],
      });

      const rankMatch = rankText.match(/\{[\s\S]*\}/);
      if (!rankMatch) throw new Error("Could not parse ranking response");

      const ranked = JSON.parse(rankMatch[0]) as {
        selections: Array<{
          candidateIndex: number;
          highlights: string[];
          whyRecommended: string;
          hospitals: Array<{ hospitalId: string; hospitalName: string }>;
        }>;
      };

      physicians = ranked.selections
        .slice(0, 3)
        .flatMap((sel): PhysicianRecommendation[] => {
          const candidate = sortedCandidates[sel.candidateIndex];
          if (!candidate) return [];
          const fullName = `${candidate.firstName} ${candidate.lastName}`;
          const vol = volumeMap.get(candidate.npi) ?? null;
          return [
            {
              name: `Dr. ${fullName}`,
              credentials: candidate.credential || "MD",
              specialty: candidate.specialty,
              highlights: sel.highlights,
              whyRecommended: sel.whyRecommended,
              hospitals: sel.hospitals.map((h) => ({
                hospitalName: SHORT_NAMES[h.hospitalId] ?? h.hospitalName,
                hospitalId: h.hospitalId,
              })),
              npi: candidate.npi,
              npiVerified: true,
              npiSpecialty: candidate.specialty,
              npiSource: true,
              procedureVolume: vol?.totalServices ?? null,
              volumeYear: vol?.year ?? null,
              profileLinks: buildProfileLinks(candidate.npi, candidate.firstName, candidate.lastName, candidate.specialty),
            },
          ];
        });

      const hasVolumeData = physicians.some((p) => p.procedureVolume != null);
      sourceNote = `Physicians sourced from the NPI Registry (${npiCandidates.length} verified ${taxonomyHint} practitioners in NYC). ${hasVolumeData ? "Ranked by Medicare procedure volume (CMS 2022 data). " : ""}Descriptions by AI.`;
    } else {
      // 2b. Fallback path: AI generation with strong anti-hallucination guardrails
      const genText = await anthropicCall({
        max_tokens: 1500,
        system: `You are an expert in Manhattan healthcare who recommends physicians for procedures.
IMPORTANT: Only recommend physicians you have high confidence actually practice in Manhattan.
If you are not certain a physician exists and practices in NYC, do not include them.
Return ONLY valid JSON — no markdown.`,
        messages: [
          {
            role: "user",
            content: `Recommend up to 3 physicians in Manhattan for: "${procedureName}" (CPT ${cptCode ?? "unknown"}).

${insurerContext}
${hasInsurance ? `Prioritize physicians likely in-network with ${insurerName}.` : ""}
${hospitalList ? `Hospitals in our system:\n${hospitalList}` : ""}

Return JSON:
{
  "physicians": [
    {
      "name": "Dr. First Last",
      "credentials": "MD, FACS",
      "specialty": "Subspecialty name",
      "highlights": ["High-volume: 300+ procedures/year", "Fellowship-trained", "Board certified"],
      "whyRecommended": "One sentence on why this physician stands out for this procedure.",
      "hospitals": [
        { "hospitalId": "<id from list above, or empty string>", "hospitalName": "<hospital name>" }
      ]
    }
  ]
}

Guidelines:
- Only include physicians you have high confidence actually practice in Manhattan
- List 2-3 realistic hospital affiliations based on known affiliations
- HSS and NYU Orthopedic for musculoskeletal; MSK for oncology; NYP/Columbia for complex surgery`,
          },
        ],
      });

      const genMatch = genText.match(/\{[\s\S]*\}/);
      if (!genMatch) throw new Error("Could not parse AI response");

      const parsed = JSON.parse(genMatch[0]) as {
        physicians: Array<{
          name: string;
          credentials: string;
          specialty: string;
          highlights: string[];
          whyRecommended: string;
          hospitals: Array<{ hospitalId: string; hospitalName: string }>;
        }>;
      };

      // Validate each AI-generated physician against NPI Registry
      const verified = await Promise.all(
        parsed.physicians.map(async (doc) => {
          const parts = doc.name.replace(/^Dr\.?\s*/i, "").trim().split(/\s+/);
          const firstName = parts[0] ?? "";
          const lastName  = parts[parts.length - 1] ?? "";
          const npiResult = await validateNpiPhysician(firstName, lastName);

          // Reject if NPI validation found a physician with a completely different specialty
          const specialtyMismatch =
            npiResult &&
            npiResult.specialty &&
            doc.specialty &&
            !npiResult.specialty.toLowerCase().includes(doc.specialty.toLowerCase().split(" ")[0]) &&
            !doc.specialty.toLowerCase().includes(npiResult.specialty.toLowerCase().split(" ")[0]);

          const npi = specialtyMismatch ? null : (npiResult?.npi ?? null);
          return {
            name:            doc.name,
            credentials:     doc.credentials,
            specialty:       doc.specialty,
            highlights:      doc.highlights,
            whyRecommended:  doc.whyRecommended,
            hospitals:       doc.hospitals.map((h) => ({
              hospitalName: SHORT_NAMES[h.hospitalId] ?? h.hospitalName,
              hospitalId:   h.hospitalId,
            })),
            npi,
            npiVerified:     !specialtyMismatch && !!npiResult,
            npiSpecialty:    npiResult?.specialty ?? null,
            npiSource:       false,
            procedureVolume: null,
            volumeYear:      null,
            profileLinks:    npi
              ? buildProfileLinks(npi, parts[0] ?? "", parts.at(-1) ?? "", doc.specialty)
              : {
                  npiRegistry: "",
                  healthgrades: `https://www.healthgrades.com/usearch?what=${encodeURIComponent(doc.name.replace(/^Dr\.?\s*/i, ""))}&state=NY&type=physician`,
                  usNews: `https://health.usnews.com/doctors/search?name=${encodeURIComponent(doc.name.replace(/^Dr\.?\s*/i, ""))}&location=New+York%2C+NY`,
                  googleSearch: `https://www.google.com/search?q=${encodeURIComponent(doc.name + " " + doc.specialty + " Manhattan reviews")}`,
                },
          } satisfies PhysicianRecommendation;
        }),
      );

      physicians = verified;
      sourceNote = `Physician recommendations generated by AI. NPI Registry verification attempted for each — look for the verified badge to confirm identity.`;
    }

    const result: PhysicianResponse = { physicians, sourceNote };
    await redis.set(cacheKey, result, { ex: 86400 });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Physician recommend error:", err);
    return NextResponse.json({ error: "Failed to generate recommendations" }, { status: 500 });
  }
}
