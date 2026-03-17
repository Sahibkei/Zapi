export class ZapiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class UnsupportedFeatureError extends ZapiError {
  constructor(message: string, details?: unknown) {
    super(message, 501, details);
  }
}

export class AuthenticationError extends ZapiError {
  constructor(message: string, details?: unknown) {
    super(message, 401, details);
  }
}

export class AuthorizationError extends ZapiError {
  constructor(message: string, details?: unknown) {
    super(message, 403, details);
  }
}

export class RateLimitError extends ZapiError {
  constructor(message: string, details?: unknown) {
    super(message, 429, details);
  }
}

export class NotFoundError extends ZapiError {
  constructor(message: string, details?: unknown) {
    super(message, 404, details);
  }
}

export class UpstreamError extends ZapiError {
  constructor(message: string, details?: unknown) {
    super(message, 502, details);
  }
}

export function isZapiError(value: unknown): value is ZapiError {
  return value instanceof ZapiError;
}
