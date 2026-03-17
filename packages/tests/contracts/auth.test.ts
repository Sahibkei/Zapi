import { createHmac } from "node:crypto";
import {
  AuthenticationError,
  AuthorizationError,
  PLAN_DEFINITIONS,
  RateLimitError,
  createAuthResolver,
  createInMemoryRateLimiter,
  requireRegimeAccess
} from "../../core/src";

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = encodeBase64Url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signature = createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${signingInput}.${signature}`;
}

describe("auth and access control", () => {
  it("resolves anonymous traffic to the public plan", () => {
    const resolver = createAuthResolver({});
    const auth = resolver.resolve({ remoteAddress: "127.0.0.1" });

    expect(auth.mode).toBe("anonymous");
    expect(auth.plan).toEqual(PLAN_DEFINITIONS.public);
  });

  it("resolves site JWT users to their declared plan", () => {
    const resolver = createAuthResolver({
      jwtSecret: "test-secret",
      jwtIssuer: "site",
      jwtAudience: "zapi"
    });

    const token = signJwt(
      {
        sub: "user_123",
        email: "user@example.com",
        name: "Test User",
        plan: "pro",
        iss: "site",
        aud: "zapi",
        exp: Math.floor(Date.now() / 1000) + 60
      },
      "test-secret"
    );

    const auth = resolver.resolve({
      authorization: `Bearer ${token}`
    });

    expect(auth.mode).toBe("site_jwt");
    expect(auth.plan.id).toBe("pro");
    expect(auth.email).toBe("user@example.com");
  });

  it("rejects invalid service keys", () => {
    const resolver = createAuthResolver({
      serviceKeys: {
        "valid-key": {
          subject: "site-backend",
          plan: "scale",
          displayName: "Site Backend"
        }
      }
    });

    expect(() => resolver.resolve({ apiKey: "bad-key" })).toThrow(AuthenticationError);
  });

  it("blocks plan access to unavailable regimes", () => {
    expect(() =>
      requireRegimeAccess(
        {
          mode: "site_jwt",
          subject: "user_123",
          plan: PLAN_DEFINITIONS.free
        },
        "companies_house"
      )
    ).toThrow(AuthorizationError);
  });

  it("tracks and enforces hourly rate limits by subject and plan", () => {
    const limiter = createInMemoryRateLimiter();
    const auth = {
      mode: "site_jwt" as const,
      subject: "user_123",
      plan: {
        ...PLAN_DEFINITIONS.free,
        requestsPerHour: 2
      }
    };

    const first = limiter.consume(auth, "statements");
    const second = limiter.consume(auth, "statements");

    expect(first.remaining).toBe(1);
    expect(second.remaining).toBe(0);
    expect(() => limiter.consume(auth, "statements")).toThrow(RateLimitError);
  });
});
