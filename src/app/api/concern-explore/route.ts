import { NextRequest, NextResponse } from "next/server";
import { anthropicCall } from "@/lib/anthropic-fetch";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ConcernExploreResponse {
  query: string;
  description: string;
  causes: string[];
  treatments: {
    name: string;
    type: "conservative" | "surgical" | "medication" | "other";
    description: string;
  }[];
  whenToSeekCare: string[];
  questionsForDoctor: string[];
  relatedProcedures: {
    name: string;
    searchQuery: string;
  }[];
  disclaimer: string;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { query } = body as { query: string };

  if (!query?.trim()) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const trimmed = query.trim().toLowerCase();
  const cacheKey = `concern-explore:${trimmed}`;

  // Check cache
  const cached = await redis.get<ConcernExploreResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const systemPrompt = `You are a health education assistant. Your role is to provide general educational information about health conditions and symptoms. You are NOT a doctor. You do NOT provide diagnoses or medical advice.

RULES:
1. Provide general, well-established medical knowledge only.
2. NEVER suggest specific diagnoses for the user.
3. NEVER provide any pricing, cost estimates, or dollar amounts.
4. Always emphasize consulting a healthcare provider.
5. For treatments, describe both conservative and surgical options when applicable.
6. Include related medical procedures that the user might want to research pricing for.
7. Respond with ONLY valid JSON — no markdown, no commentary.`;

  const userPrompt = `Health concern: "${query}"

Return educational information as JSON:
{
  "description": "2-3 sentence plain-language description of this condition or symptom",
  "causes": ["Common cause 1", "Common cause 2", ...],
  "treatments": [
    {
      "name": "Treatment name",
      "type": "conservative" | "surgical" | "medication" | "other",
      "description": "1-2 sentence description of this treatment option"
    }
  ],
  "whenToSeekCare": ["Warning sign 1", "Warning sign 2", ...],
  "questionsForDoctor": ["Question 1?", "Question 2?", ...],
  "relatedProcedures": [
    {
      "name": "Procedure name",
      "searchQuery": "search query to find pricing for this procedure"
    }
  ]
}

Include 3-5 causes, 3-6 treatment options (mix of conservative and surgical), 3-5 warning signs, 4-6 questions, and 2-5 related procedures.`;

  try {
    const text = await anthropicCall({
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Could not parse AI response");

    const parsed = JSON.parse(match[0]);

    const response: ConcernExploreResponse = {
      query: query.trim(),
      description: parsed.description ?? "",
      causes: parsed.causes ?? [],
      treatments: parsed.treatments ?? [],
      whenToSeekCare: parsed.whenToSeekCare ?? [],
      questionsForDoctor: parsed.questionsForDoctor ?? [],
      relatedProcedures: parsed.relatedProcedures ?? [],
      disclaimer:
        "This content is AI-generated for educational purposes only. It is not medical advice, diagnosis, or treatment recommendation. Always consult your healthcare provider for medical decisions.",
    };

    // Cache for 24 hours
    await redis.set(cacheKey, response, { ex: 86400 });

    return NextResponse.json(response);
  } catch (err) {
    console.error("Concern explore error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate educational content" },
      { status: 500 },
    );
  }
}
