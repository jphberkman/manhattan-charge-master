const DEFAULT_TIMEOUT_MS = 8_000;

export class AuthoritativeHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "AuthoritativeHttpError";
  }
}

export async function fetchAuthoritativeText(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ status: number; ok: boolean; text: string }> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
    headers: {
      accept: "application/json, text/html;q=0.9, */*;q=0.8",
      ...rest.headers,
    },
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}

export async function fetchAuthoritativeJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { status, ok, text } = await fetchAuthoritativeText(url, init);
  if (!ok) {
    throw new AuthoritativeHttpError(
      `Authoritative source HTTP ${status}`,
      status,
      url,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AuthoritativeHttpError("Authoritative source returned non-JSON", status, url);
  }
}
