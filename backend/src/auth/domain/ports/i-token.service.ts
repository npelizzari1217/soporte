/**
 * JwtPayload — payload del access token JWT.
 *
 * ADR-3 (forma nueva del payload, difiere de soporte1):
 * - sub: id del usuario (UUIDv7)
 * - cliente_id: cliente al que está scopeado el token; `null` = token MASTER
 *   (root sin tenant seleccionado — R4)
 * - rol: código del rol de la membresía activa en `cliente_id`. SINGULAR
 *   (un rol por membresía — difiere de soporte1 que usaba `roles[]`).
 *   `null` para root-master sin membresía en ese cliente.
 * - permisos: permisos acumulativos del rol, deduplicados. `[]` para root-master.
 * - is_global_admin: true si el usuario es ROOT (super-admin cross-tenant).
 *   NUNCA se deriva de `rol` — ortogonalidad (ver ADR de dominio).
 * - cliente_nombre: nombre del cliente scopeado; `null` si `cliente_id` es null.
 * - membresias: TODAS las membresías activas del usuario (alimenta el
 *   switcher del front, R6).
 * - modulos: módulos funcionales que el usuario puede operar en `cliente_id`
 *   (SOPORTE/COMPRAS/EDILICIA/EQUIPOS). ROOT (is_global_admin), ADMINISTRADOR
 *   (membresía con rolCodigo ADMINISTRADOR) y el token MASTER llevan TODOS los
 *   módulos; cualquier otro usuario lleva solo los asignados en ese cliente.
 * - nombre/apellido: identidad del usuario (UsuarioEntity), CONSTANTE entre
 *   tenants — no vienen de resolverScope (eso es scope de tenant, esto es
 *   identidad global). Se populan en LoginUseCase desde la UsuarioEntity ya
 *   cargada; SwitchTenantUseCase/RefreshTokenUseCase los propagan desde el
 *   payload/entidad ya disponibles, sin una carga extra a DB dedicada a esto.
 *   Alimentan el bloque de usuario del sidebar (front). Default `''` en
 *   SwitchTenantUseCase para tokens emitidos antes de este campo (ventana de
 *   rollout) — se repueblan solos en el próximo login.
 *
 * Los guards verifican `rol`/`permisos`/`is_global_admin` contra el JWT sin
 * query a DB (R11, R13, R14).
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
 * ITokenService — puerto para firma y verificación de JWT.
 *
 * La implementación concreta (JwtTokenService con @nestjs/jwt) vive en
 * auth/infrastructure/.
 *
 * Tarea: T2.2 (PR2 — Auth domain + ports + hashing + token service)
 */
export interface ITokenService {
  /**
   * Firma un JWT con el payload dado.
   *
   * @param payload  Claims del token.
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
