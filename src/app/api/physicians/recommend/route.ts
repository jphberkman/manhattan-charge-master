import { NextRequest, NextResponse } from "next/server";
import { anthropicCall } from "@/lib/anthropic-fetch";
import { searchNpiPhysicians, validateNpiPhysician } from "@/lib/npi";
import { redis } from "@/lib/redis";
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

  let physicians: PhysicianRecommendation[];
  let sourceNote: string;

  try {
    if (useNpiSource) {
      // 2a. NPI-first path: pass real verified physicians to Claude for ranking
      const candidateList = npiCandidates
        .map(
          (p, i) =>
            `${i}: ${p.firstName} ${p.lastName}${p.credential ? `, ${p.credential}` : ""} — ${p.specialty} (${p.practiceCity})`,
        )
        .join("\n");

      const rankText = await anthropicCall({
        max_tokens: 1500,
        system: `You are an expert in Manhattan healthcare. You rank real, verified physicians for specific procedures.
You MUST only select physicians from the provided list — do not add, invent, or substitute names.
Return ONLY valid JSON — no markdown.`,
        messages: [
          {
            role: "user",
            content: `Select and rank the top 3 physicians for "${procedureName}" (CPT ${cptCode ?? "unknown"}) from this verified NPI Registry list:

${candidateList}

${insurerContext}
${hasInsurance ? `Prefer physicians likely in-network with ${insurerName}.` : ""}
${hospitalList ? `Hospitals in our system (use these when listing affiliations):\n${hospitalList}` : ""}

Return JSON:
{
  "selections": [
    {
      "candidateIndex": <0-based index from list above>,
      "highlights": ["Specific reason 1", "Specific reason 2", "Board certified", "Fellowship-trained"],
      "whyRecommended": "One sentence on why this physician is a strong choice for this procedure.",
      "hospitals": [
        { "hospitalId": "<id from system list, or empty string>", "hospitalName": "<hospital name>" }
      ]
    }
  ]
}

Guidelines:
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
          const candidate = npiCandidates[sel.candidateIndex];
          if (!candidate) return [];
          const fullName = `${candidate.firstName} ${candidate.lastName}`;
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
            },
          ];
        });

      sourceNote = `Physicians sourced from the NPI Registry (${npiCandidates.length} verified ${taxonomyHint} practitioners in NYC). Ranked and described by AI.`;
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
            npi:             specialtyMismatch ? null : (npiResult?.npi ?? null),
            npiVerified:     !specialtyMismatch && !!npiResult,
            npiSpecialty:    npiResult?.specialty ?? null,
            npiSource:       false,
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
