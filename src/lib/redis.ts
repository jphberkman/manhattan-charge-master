import IORedis from "ioredis";

const url = process.env.REDIS_URL;

// No-op client when env var isn't set
const noopRedis = {
  get: async () => null,
  set: async () => null,
};

function makeClient() {
  if (!url) return null;
  const client = new IORedis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  client.on("error", () => {}); // suppress unhandled errors
  return client;
}

const client = makeClient();

export const redis = client
  ? {
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
    }
  : noopRedis;
