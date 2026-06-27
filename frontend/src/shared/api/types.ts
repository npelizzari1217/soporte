/**
 * JWT payload decoded from the access token.
 * Decoded client-side for UI only (roles/permisos UI gating).
 * All actual authorization is enforced by the NestJS backend.
 *
 * cliente_nombre: nombre del tenant — opcional para tolerar tokens emitidos antes de
 * auth-cliente-nombre (degradación elegante). El backend siempre lo emite post-deploy.
 */
export interface JwtPayload {
  sub: string;
  cliente_id: string;
  email: string;
  roles: string[];
  permisos: string[];
  cliente_nombre?: string;
}

/**
 * Normalized API error — discriminable by `instanceof ApiError`.
 * Maps NestJS `{ statusCode, message, error }` responses to a typed error class.
 *
 * Spec: [SPEC:frontend-api-client/normalizacion-errores]
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    /**
     * NestJS can return `message` as either a string or string[].
     * `messages` always holds the full array; `message` (super) holds the first entry.
     */
    public readonly messages: string[] = [message],
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    // Maintain proper prototype chain in transpiled environments
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Subclass to distinguish session-expiry from other 401s.
 * Thrown when both the access token AND the refresh attempt return 401.
 * Callers can branch on `instanceof SessionExpiredError` for redirect logic.
 */
export class SessionExpiredError extends ApiError {
  constructor(raw?: unknown) {
    super(401, "Sesión expirada. Por favor, iniciá sesión nuevamente.", undefined, raw);
    this.name = "SessionExpiredError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * `apiFetch` init options — same as `RequestInit` but with an extra `json` shorthand.
 * Pass `json` to automatically serialize the body and set `Content-Type: application/json`.
 */
export type ApiFetchInit = Omit<RequestInit, "body"> & {
  json?: unknown;
  body?: BodyInit;
};
