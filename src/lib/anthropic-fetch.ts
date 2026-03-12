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
  /** Pass true to enable prompt caching on the system prompt (saves ~90% on cached tokens). */
  cacheSystemPrompt?: boolean;
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

async function callOnce(apiKey: string, body: object, useCaching: boolean): Promise<Response> {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      ...(useCaching && { "anthropic-beta": "prompt-caching-2024-07-31" }),
    },
    body: JSON.stringify(body),
  });
}

/**
 * Streaming version — calls Anthropic with stream:true and invokes onChunk for each text delta.
 * Returns the full accumulated text when done. Uses Sonnet by default for accuracy.
 */
export async function anthropicStream(
  request: AnthropicRequest,
  onChunk: (text: string) => void,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const { cacheSystemPrompt, system, ...rest } = request;
  const model = rest.model ?? "claude-sonnet-4-6";

  const systemField = system
    ? cacheSystemPrompt
      ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
      : system
    : undefined;

  const payload = {
    ...rest,
    model,
    stream: true,
    ...(systemField !== undefined && { system: systemField }),
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      ...(cacheSystemPrompt && { "anthropic-beta": "prompt-caching-2024-07-31" }),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 200)}`);
  }

  if (!res.body) throw new Error("No response body from Anthropic");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIdx;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
          const chunk = parsed.delta.text as string;
          fullText += chunk;
          onChunk(chunk);
        }
      } catch { /* ignore malformed SSE lines */ }
    }
  }

  return fullText;
}

export async function anthropicCall(request: AnthropicRequest): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const { cacheSystemPrompt, system, ...rest } = request;
  const modelsToTry = rest.model ? [rest.model] : MODEL_CASCADE;

  // Build system field: array with cache_control when caching is requested
  const systemField = system
    ? cacheSystemPrompt
      ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
      : system
    : undefined;

  for (const model of modelsToTry) {
    const payload = { ...rest, model, ...(systemField !== undefined && { system: systemField }) };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await callOnce(apiKey, payload, !!cacheSystemPrompt);

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
