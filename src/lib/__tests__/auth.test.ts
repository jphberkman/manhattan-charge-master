import { describe, test, expect, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

import { createSession, getSession, deleteSession, verifySession } from "@/lib/auth";

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

async function makeToken(payload: object, expiresIn = "7d") {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

describe("createSession", () => {
  beforeEach(() => vi.clearAllMocks());

  test("calls cookieStore.set exactly once", async () => {
    await createSession("user-1", "a@example.com");
    expect(mockCookieStore.set).toHaveBeenCalledOnce();
  });

  test("sets the cookie name to 'auth-token'", async () => {
    await createSession("user-1", "a@example.com");
    const [name] = mockCookieStore.set.mock.calls[0];
    expect(name).toBe("auth-token");
  });

  test("cookie is httpOnly with sameSite=lax and path='/'", async () => {
    await createSession("user-1", "a@example.com");
    const options = mockCookieStore.set.mock.calls[0][2];
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  test("cookie value is a valid signed JWT", async () => {
    await createSession("user-1", "a@example.com");
    const token: string = mockCookieStore.set.mock.calls[0][1];
    const { jwtVerify } = await import("jose");
    // should not throw
    await expect(jwtVerify(token, JWT_SECRET)).resolves.toBeDefined();
  });

  test("JWT payload contains the correct userId and email", async () => {
    await createSession("user-42", "hello@example.com");
    const token: string = mockCookieStore.set.mock.calls[0][1];
    const { jwtVerify } = await import("jose");
    const { payload } = await jwtVerify(token, JWT_SECRET);
    expect(payload.userId).toBe("user-42");
    expect(payload.email).toBe("hello@example.com");
  });

  test("JWT is signed with HS256", async () => {
    await createSession("user-1", "a@example.com");
    const token: string = mockCookieStore.set.mock.calls[0][1];
    const header = JSON.parse(atob(token.split(".")[0]));
    expect(header.alg).toBe("HS256");
  });

  test("cookie expiry is approximately 7 days from now", async () => {
    const before = Date.now();
    await createSession("user-1", "a@example.com");
    const after = Date.now();
    const expires: Date = mockCookieStore.set.mock.calls[0][2].expires;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(expires.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(expires.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
  });

  test("each call produces a unique token", async () => {
    await createSession("user-1", "a@example.com");
    await createSession("user-1", "a@example.com");
    const token1: string = mockCookieStore.set.mock.calls[0][1];
    const token2: string = mockCookieStore.set.mock.calls[1][1];
    // iat differs between calls so tokens should differ
    expect(token1).not.toBe(token2);
  });

  test("secure flag is false in non-production environment", async () => {
    const original = process.env.NODE_ENV;
    // vitest runs in 'test' mode, not 'production'
    await createSession("user-1", "a@example.com");
    const options = mockCookieStore.set.mock.calls[0][2];
    expect(options.secure).toBe(false);
    process.env.NODE_ENV = original;
  });
});

describe("getSession", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns null when no cookie is present", async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    expect(await getSession()).toBeNull();
  });

  test("returns session payload for a valid token", async () => {
    const token = await makeToken({ userId: "user-2", email: "b@example.com", expiresAt: new Date() });
    mockCookieStore.get.mockReturnValue({ value: token });

    const session = await getSession();
    expect(session?.userId).toBe("user-2");
    expect(session?.email).toBe("b@example.com");
  });

  test("returns null for a malformed token", async () => {
    mockCookieStore.get.mockReturnValue({ value: "not-a-jwt" });
    expect(await getSession()).toBeNull();
  });

  test("returns null for an expired token", async () => {
    const token = await makeToken({ userId: "user-3", email: "c@example.com" }, "-1s");
    mockCookieStore.get.mockReturnValue({ value: token });
    expect(await getSession()).toBeNull();
  });
});

describe("deleteSession", () => {
  beforeEach(() => vi.clearAllMocks());

  test("deletes the auth-token cookie", async () => {
    await deleteSession();
    expect(mockCookieStore.delete).toHaveBeenCalledWith("auth-token");
  });
});

describe("verifySession", () => {
  test("returns null when no auth-token cookie is in the request", async () => {
    const req = new NextRequest("http://localhost/api/test");
    expect(await verifySession(req)).toBeNull();
  });

  test("returns session payload for a valid token in the request", async () => {
    const token = await makeToken({ userId: "user-4", email: "d@example.com", expiresAt: new Date() });
    const req = new NextRequest("http://localhost/api/test", {
      headers: { cookie: `auth-token=${token}` },
    });

    const session = await verifySession(req);
    expect(session?.userId).toBe("user-4");
    expect(session?.email).toBe("d@example.com");
  });

  test("returns null for a malformed token in the request", async () => {
    const req = new NextRequest("http://localhost/api/test", {
      headers: { cookie: "auth-token=garbage" },
    });
    expect(await verifySession(req)).toBeNull();
  });

  test("returns null for an expired token in the request", async () => {
    const token = await makeToken({ userId: "user-5", email: "e@example.com" }, "-1s");
    const req = new NextRequest("http://localhost/api/test", {
      headers: { cookie: `auth-token=${token}` },
    });
    expect(await verifySession(req)).toBeNull();
  });
});
