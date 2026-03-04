/**
 * Thin wrapper around the Anthropic Messages API with automatic retry
 * on 529 (Overloaded) and model fallback.
 */

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicRequest {
  model?: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
}

// Try newer model first, fall back to older stable models on overload
const MODEL_CASCADE = [
  "claude-haiku-4-5-20251001",
  "claude-3-5-haiku-20241022",
  "claude-3-haiku-20240307",
];

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

async function callOnce(apiKey: string, body: object): Promise<Response> {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function anthropicCall(request: AnthropicRequest): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const modelsToTry = request.model ? [request.model] : MODEL_CASCADE;

  for (const model of modelsToTry) {
    const payload = { ...request, model };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await callOnce(apiKey, payload);

      if (res.ok) {
        const data = await res.json();
        return data.content?.[0]?.text ?? "";
      }

      if ((res.status === 529 || res.status === 503) && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`Anthropic ${model} returned ${res.status} – retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // 529 after all retries → try next model in cascade
      if (res.status === 529 || res.status === 503) {
        console.warn(`${model} exhausted retries, trying next model…`);
        break;
      }

      // Non-retryable error (4xx etc.)
      const text = await res.text().catch(() => "");
      throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  throw new Error("All Anthropic models are overloaded right now. Please try again in a minute.");
}
