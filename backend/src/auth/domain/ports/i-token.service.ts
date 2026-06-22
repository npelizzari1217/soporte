/**
 * JwtPayload — payload del token de acceso JWT.
 *
 * Campos transportados en el claim:
 * - sub: id del usuario (UUIDv7)
 * - cliente_id: tenant de origen del usuario
 * - email: email del usuario
 * - roles: códigos de roles asignados
 * - permisos: permisos efectivos (unión de los roles, deduplicados)
 *
 * Los guards verifican `roles` y `permisos` contra el JWT sin query a DB.
 */
export interface JwtPayload {
  sub: string;
  cliente_id: string;
  email: string;
  roles: string[];
  permisos: string[];
}

/**
 * ITokenService — puerto para firma y verificación de JWT.
 *
 * La implementación concreta (JwtTokenService con @nestjs/jwt) vive
 * en auth/infrastructure/ → PR-06.
 *
 * Tarea: 2.A.3
 */
export interface ITokenService {
  /**
   * Firma un JWT con el payload dado.
   *
   * @param payload  Claims del token (sub, cliente_id, email, roles, permisos).
   * @returns        Token JWT firmado como string.
   */
  signJwt(payload: JwtPayload): string;

  /**
   * Verifica un JWT y retorna su payload si es válido.
   *
   * @param token  Token JWT a verificar.
   * @returns      Payload decodificado si válido, null si inválido/expirado.
   */
  verifyJwt(token: string): JwtPayload | null;
}

/** Token de inyección de dependencias para ITokenService en NestJS. */
export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');
