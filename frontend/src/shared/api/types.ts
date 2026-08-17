/**
 * JwtPayload — access token payload decoded client/edge-side.
 *
 * ADR-3 (`sdd/auth-multitenancy/design`): forma nueva del payload, difiere de
 * soporte1 (que usaba `roles: string[]`):
 * - `sub`: id del usuario (UUIDv7).
 * - `cliente_id`: cliente al que está scopeado el token; `null` = token
 *   MASTER (root sin tenant seleccionado).
 * - `rol`: código del rol de la membresía activa en `cliente_id`. SINGULAR
 *   (un rol por membresía). `null` para root-master sin membresía en ese cliente.
 * - `permisos`: permisos acumulativos del rol, deduplicados. `[]` para root-master.
 * - `is_global_admin`: true si el usuario es ROOT (super-admin cross-tenant).
 *   NUNCA se deriva de `rol` — ortogonalidad.
 * - `cliente_nombre`: nombre del cliente scopeado; `null` si `cliente_id` es null.
 * - `membresias`: TODAS las membresías activas del usuario (alimenta el
 *   switcher del front, R28).
 * - `modulos`: módulos habilitados para el usuario (TICKETS/COMPRAS/EDILICIA/
 *   EQUIPOS, renombrado desde SOPORTE en WU-7.2 — ahora DERIVADO de
 *   `permisos`, no un eje independiente). ROOT y ADMINISTRADOR reciben
 *   todos. Alimenta el gating por
 *   módulo del front (5.2 CAPA 3). `[]` cuando el usuario no tiene ninguno.
 * - `nombre`/`apellido`: identidad del usuario (constante entre tenants).
 *   Alimenta el bloque de usuario del sidebar. Tokens emitidos antes de
 *   agregar este campo pueden no traerlo — `decodeJwtPayload` normaliza a
 *   `""` (mismo criterio defensivo que `modulos`).
 *
 * Decodificado en el BFF (login/switch, sin verificación — viene del backend
 * confiable) y verificado con `jose` en el middleware Edge (R26). Toda
 * autorización real la aplica el backend NestJS.
 */
export interface JwtPayload {
  sub: string;
  cliente_id: string | null;
  rol: string | null;
  permisos: string[];
  is_global_admin: boolean;
  cliente_nombre: string | null;
  membresias: { cliente_id: string; nombre: string; rol: string }[];
  modulos: string[];
  nombre: string;
  apellido: string;
}

/**
 * Decode a JWT's payload segment WITHOUT verifying its signature.
 *
 * Only safe to call on tokens that come from a trusted source over a private
 * network (the NestJS backend's login/switch responses) — never on tokens
 * supplied by the client. Signature verification for client-supplied tokens
 * happens in `shared/auth/verify.ts` (jose, Edge middleware).
 *
 * @param accessToken  Raw JWT string (`header.payload.signature`).
 */
export function decodeJwtPayload(accessToken: string): JwtPayload {
  const payload = JSON.parse(
    Buffer.from(accessToken.split(".")[1], "base64url").toString(),
  ) as JwtPayload;
  // Defensivo: tokens viejos (previos a 5.2) no traen `modulos`; tokens
  // previos al agregado de identidad no traen `nombre`/`apellido`.
  // Normalizamos para que los consumidores no dependan de un campo undefined.
  return {
    ...payload,
    modulos: payload.modulos ?? [],
    nombre: payload.nombre ?? "",
    apellido: payload.apellido ?? "",
  };
}

/**
 * Normalized API error — discriminable by `instanceof ApiError`.
 * Maps NestJS `{ statusCode, message, error }` responses to a typed error class.
 *
 * Spec: PR11 — apiFetch (`shared/api/client.ts`) error normalization.
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
    // Maintain proper prototype chain in transpiled environments.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Subclass to distinguish session-expiry from other 401s.
 * Thrown when both the access token AND the single-flight refresh attempt fail.
 * Callers branch on `instanceof SessionExpiredError` to force a re-login.
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
