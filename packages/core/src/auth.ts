import { createHmac, timingSafeEqual } from "node:crypto";
import {
  AuthenticationError,
  AuthorizationError,
  RateLimitError
} from "./errors";
import type { StatementSourceRegime } from "./contracts";

export type PlanId = "public" | "free" | "plus" | "pro" | "scale";
export type AuthMode = "anonymous" | "site_jwt" | "service_key";

export interface PlanDefinition {
  id: PlanId;
  label: string;
  requestsPerHour: number;
  regimes: StatementSourceRegime[];
  features: string[];
}

export interface AuthContext {
  mode: AuthMode;
  subject: string;
  plan: PlanDefinition;
  email?: string;
  displayName?: string;
}

export interface AuthResolverOptions {
  jwtSecret?: string;
  jwtIssuer?: string;
  jwtAudience?: string;
  serviceKeys?: Record<string, { subject: string; plan: PlanId; displayName?: string }>;
}

export interface RateLimitResult {
  limit: number;
  remaining: number;
  resetAt: string;
  plan: PlanId;
}

interface RateLimitBucket {
  count: number;
  resetAtMs: number;
}

interface JwtPayload {
  sub?: string;
  email?: string;
  name?: string;
  plan?: PlanId;
  iss?: string;
  aud?: string | string[];
  exp?: number;
}

export const PLAN_DEFINITIONS: Record<PlanId, PlanDefinition> = {
  public: {
    id: "public",
    label: "Public",
    requestsPerHour: 60,
    regimes: ["sec_edgar"],
    features: ["Anonymous access", "US SEC coverage"]
  },
  free: {
    id: "free",
    label: "Free",
    requestsPerHour: 100,
    regimes: ["sec_edgar"],
    features: ["Signed site user", "US SEC coverage", "Last 5 years historical depth"]
  },
  plus: {
    id: "plus",
    label: "Plus",
    requestsPerHour: 500,
    regimes: ["sec_edgar"],
    features: ["Paid US plan", "US SEC coverage", "Excel plugin coming soon"]
  },
  pro: {
    id: "pro",
    label: "Pro",
    requestsPerHour: 2000,
    regimes: ["sec_edgar", "companies_house", "edinet", "india_placeholder"],
    features: ["Full API access", "All configured regimes", "Higher production cap"]
  },
  scale: {
    id: "scale",
    label: "Scale",
    requestsPerHour: 10000,
    regimes: ["sec_edgar", "companies_house", "edinet", "india_placeholder"],
    features: ["Internal service access", "Highest hourly cap", "All configured regions"]
  }
};

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function encodeBase64Url(value: Buffer): string {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parseJwt(token: string): { header: Record<string, unknown>; payload: JwtPayload; signature: string; signingInput: string } {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AuthenticationError("Invalid bearer token format.");
  }

  const [headerPart, payloadPart, signature] = parts;
  const header = JSON.parse(decodeBase64Url(headerPart).toString("utf8")) as Record<string, unknown>;
  const payload = JSON.parse(decodeBase64Url(payloadPart).toString("utf8")) as JwtPayload;
  return {
    header,
    payload,
    signature,
    signingInput: `${headerPart}.${payloadPart}`
  };
}

function verifyJwt(token: string, options: AuthResolverOptions): JwtPayload {
  if (!options.jwtSecret) {
    throw new AuthenticationError("Site JWT authentication is not configured on this deployment.");
  }

  const { header, payload, signature, signingInput } = parseJwt(token);
  if (header.alg !== "HS256") {
    throw new AuthenticationError("Unsupported bearer token algorithm.", {
      supportedAlgorithm: "HS256"
    });
  }

  const expectedSignature = encodeBase64Url(
    createHmac("sha256", options.jwtSecret).update(signingInput).digest()
  );
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new AuthenticationError("Invalid bearer token signature.");
  }

  if (payload.exp && Date.now() >= payload.exp * 1000) {
    throw new AuthenticationError("Bearer token has expired.");
  }

  if (options.jwtIssuer && payload.iss !== options.jwtIssuer) {
    throw new AuthenticationError("Bearer token issuer is invalid.", {
      expectedIssuer: options.jwtIssuer
    });
  }

  if (options.jwtAudience) {
    const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    if (!audiences.includes(options.jwtAudience)) {
      throw new AuthenticationError("Bearer token audience is invalid.", {
        expectedAudience: options.jwtAudience
      });
    }
  }

  return payload;
}

function resolvePlan(planId: PlanId | undefined): PlanDefinition {
  return PLAN_DEFINITIONS[planId ?? "free"];
}

export function parseServiceKeys(rawValue: string | undefined): AuthResolverOptions["serviceKeys"] {
  if (!rawValue) {
    return {};
  }

  const parsed = JSON.parse(rawValue) as Record<
    string,
    { subject?: string; plan?: PlanId; displayName?: string }
  >;
  return Object.fromEntries(
    Object.entries(parsed).map(([key, config]) => [
      key,
      {
        subject: config.subject ?? "service-client",
        plan: config.plan ?? "scale",
        displayName: config.displayName
      }
    ])
  );
}

export function createAuthResolver(options: AuthResolverOptions) {
  return {
    resolve(input: { authorization?: string; apiKey?: string; remoteAddress?: string }): AuthContext {
      if (input.apiKey) {
        const entry = options.serviceKeys?.[input.apiKey];
        if (!entry) {
          throw new AuthenticationError("Unknown API key.");
        }

        return {
          mode: "service_key",
          subject: entry.subject,
          displayName: entry.displayName,
          plan: resolvePlan(entry.plan)
        };
      }

      const authorization = input.authorization?.trim();
      if (authorization?.startsWith("Bearer ")) {
        const payload = verifyJwt(authorization.slice("Bearer ".length), options);
        if (!payload.sub) {
          throw new AuthenticationError("Bearer token is missing a subject.");
        }

        return {
          mode: "site_jwt",
          subject: payload.sub,
          email: payload.email,
          displayName: payload.name,
          plan: resolvePlan(payload.plan)
        };
      }

      return {
        mode: "anonymous",
        subject: input.remoteAddress?.trim() || "anonymous",
        plan: PLAN_DEFINITIONS.public
      };
    }
  };
}

export function requireRegimeAccess(auth: AuthContext, regime: StatementSourceRegime): void {
  if (!auth.plan.regimes.includes(regime)) {
    throw new AuthorizationError(
      `The ${auth.plan.label} plan does not include access to the ${regime} regime.`,
      {
        plan: auth.plan.id,
        regime,
        allowedRegimes: auth.plan.regimes
      }
    );
  }
}

export function createInMemoryRateLimiter() {
  const buckets = new Map<string, RateLimitBucket>();

  return {
    consume(auth: AuthContext, routeKey: string): RateLimitResult {
      const now = Date.now();
      const windowMs = 60 * 60 * 1000;
      const key = `${auth.subject}:${routeKey}:${auth.plan.id}`;
      const existing = buckets.get(key);
      const bucket =
        !existing || existing.resetAtMs <= now
          ? { count: 0, resetAtMs: now + windowMs }
          : existing;

      if (bucket.count >= auth.plan.requestsPerHour) {
        throw new RateLimitError("Hourly request limit exceeded for the current plan.", {
          plan: auth.plan.id,
          routeKey,
          limit: auth.plan.requestsPerHour,
          resetAt: new Date(bucket.resetAtMs).toISOString()
        });
      }

      bucket.count += 1;
      buckets.set(key, bucket);

      return {
        limit: auth.plan.requestsPerHour,
        remaining: Math.max(auth.plan.requestsPerHour - bucket.count, 0),
        resetAt: new Date(bucket.resetAtMs).toISOString(),
        plan: auth.plan.id
      };
    }
  };
}
