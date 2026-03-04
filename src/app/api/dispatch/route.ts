import WebSocket from "ws";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BROADCASTIFY_URL = "https://audio.broadcastify.com/30508.mp3";
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY ?? "";
const BROADCASTIFY_COOKIE = process.env.BROADCASTIFY_COOKIE ?? "";

const DEEPGRAM_URL =
  "wss://api.deepgram.com/v1/listen?" +
  new URLSearchParams({
    model: "nova-2",
    language: "en-US",
    smart_format: "true",
    interim_results: "false",
    punctuate: "true",
  }).toString();

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let ws: WebSocket | null = null;

      function send(data: object) {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // controller already closed
        }
      }

      function cleanup() {
        if (closed) return;
        closed = true;
        try { ws?.close(); } catch { /* ignore */ }
        try { controller.close(); } catch { /* ignore */ }
      }

      try {
        // --- Open Deepgram WebSocket using ws package (avoids Next.js/Turbopack globalThis.WebSocket issues) ---
        ws = new WebSocket(DEEPGRAM_URL, {
          headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
        });

        await new Promise<void>((resolve, reject) => {
          ws!.once("open", () => {
            console.log("[dispatch] Deepgram WS opened");
            resolve();
          });
          ws!.once("error", (err) => {
            console.error("[dispatch] Deepgram WS error on open:", err.message);
            reject(err);
          });
          setTimeout(
            () => reject(new Error("Deepgram connection timeout")),
            10_000
          );
        });

        send({ type: "status", status: "live", timestamp: new Date().toISOString() });

        // Forward Deepgram transcripts as SSE events
        ws.on("message", (raw) => {
          if (closed) return;
          try {
            const data = JSON.parse(raw.toString());
            const alt = data?.channel?.alternatives?.[0];
            const transcript: string = alt?.transcript ?? "";
            if (!transcript.trim()) return;
            send({
              type: "transcript",
              text: transcript,
              confidence: alt?.confidence ?? null,
              timestamp: new Date().toISOString(),
            });
          } catch {
            // malformed JSON from Deepgram — ignore
          }
        });

        ws.on("error", (err) => {
          console.error("[dispatch] Deepgram WS runtime error:", err.message);
          send({ type: "error", message: `Deepgram: ${err.message}`, timestamp: new Date().toISOString() });
          cleanup();
        });

        ws.on("close", (code, reason) => {
          console.log(`[dispatch] Deepgram WS closed: ${code} ${reason}`);
          cleanup();
        });

        // --- Fetch Broadcastify audio stream ---
        const audioHeaders: Record<string, string> = {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "audio/mpeg, audio/*, */*",
          Referer: "https://www.broadcastify.com/listen/feed/30508",
          Origin: "https://www.broadcastify.com",
          "Icy-MetaData": "0",
        };
        if (BROADCASTIFY_COOKIE) audioHeaders["Cookie"] = BROADCASTIFY_COOKIE;
        const audioRes = await fetch(BROADCASTIFY_URL, { headers: audioHeaders });

        if (!audioRes.ok) {
          throw new Error(`Broadcastify returned ${audioRes.status}`);
        }
        if (!audioRes.body) {
          throw new Error("Broadcastify response has no body");
        }

        console.log("[dispatch] Broadcastify connected, streaming audio to Deepgram");

        // Pipe audio chunks into Deepgram WebSocket
        const reader = audioRes.body.getReader();
        while (!closed) {
          const { done, value } = await reader.read();
          if (done || closed) break;
          if (value && ws.readyState === WebSocket.OPEN) {
            ws.send(value);
          }
        }

        cleanup();
      } catch (err) {
        const msg = err instanceof Error ? err.message : JSON.stringify(err);
        console.error("[dispatch] fatal error:", msg);
        send({ type: "error", message: msg, timestamp: new Date().toISOString() });
        cleanup();
      }
    },

    cancel() {
      // client disconnected — stream will be garbage collected
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
