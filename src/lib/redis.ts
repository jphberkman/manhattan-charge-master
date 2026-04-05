/**
 * Cache layer — uses Vercel KV (preferred) or falls back to external Redis.
 *
 * To use Vercel KV: add a KV store in Vercel dashboard → it auto-sets
 * KV_REST_API_URL and KV_REST_API_TOKEN env vars.
 *
 * Falls back to REDIS_URL (ioredis) if Vercel KV env vars aren't set.
 * Falls back to no-op if neither is configured.
 */

// ── Try Vercel KV first ────────────────────────────────────────────────────

function useVercelKv(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function makeVercelKvClient() {
  const { kv } = await import("@vercel/kv");
  return {
    get: async <T>(key: string): Promise<T | null> => {
      try {
        return await kv.get<T>(key);
      } catch { return null; }
    },
    set: async (key: string, value: unknown, opts?: { ex: number }): Promise<void> => {
      try {
        if (opts?.ex) await kv.set(key, value, { ex: opts.ex });
        else await kv.set(key, value);
      } catch { /* ignore */ }
    },
  };
}

// ── Fallback to ioredis ────────────────────────────────────────────────────

function makeIoRedisClient() {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  // Dynamic import to avoid bundling ioredis when using Vercel KV
  const IORedis = require("ioredis");
  const client = new IORedis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  client.on("error", (err: Error) => { console.error("[Redis]", err.message); });

  return {
    get: async <T>(key: string): Promise<T | null> => {
      try {
        const val = await client.get(key);
        return val ? (JSON.parse(val) as T) : null;
      } catch { return null; }
    },
    set: async (key: string, value: unknown, opts?: { ex: number }): Promise<void> => {
      try {
        const str = JSON.stringify(value);
        if (opts?.ex) await client.set(key, str, "EX", opts.ex);
        else await client.set(key, str);
      } catch { /* ignore */ }
    },
  };
}

// ── No-op fallback ─────────────────────────────────────────────────────────

const noopRedis = {
  get: async () => null,
  set: async () => {},
};

// ── Export ──────────────────────────────────────────────────────────────────

type CacheClient = {
  get: <T>(key: string) => Promise<T | null>;
  set: (key: string, value: unknown, opts?: { ex: number }) => Promise<void>;
};

let _client: CacheClient | null = null;

function getClient(): CacheClient {
  if (_client) return _client;

  if (useVercelKv()) {
    // Vercel KV — lazy-initialize on first use
    let kvClient: CacheClient | null = null;
    _client = {
      get: async <T>(key: string) => {
        if (!kvClient) kvClient = await makeVercelKvClient();
        return kvClient.get<T>(key);
      },
      set: async (key: string, value: unknown, opts?: { ex: number }) => {
        if (!kvClient) kvClient = await makeVercelKvClient();
        return kvClient.set(key, value, opts);
      },
    };
  } else {
    _client = makeIoRedisClient() ?? noopRedis;
  }

  return _client;
}

export const redis = {
  get: <T>(key: string) => getClient().get<T>(key),
  set: (key: string, value: unknown, opts?: { ex: number }) => getClient().set(key, value, opts),
};
