/**
 * Versión actual del payload del JWT (ADR-P7, WU-7.1). Se incrementa cada
 * vez que la FORMA del payload cambia de manera incompatible (ej. R2: el
 * eje de `permisos` pasa de códigos `ticket:crear` a `MODULO:ACCION`).
 * `JwtAuthGuard` rechaza con 401 cualquier token cuya `v` no coincida —
 * dispara el flujo de refresh existente en vez de un 403 sin recuperación
 * (riesgo #2218: el interceptor del frontend solo refresca ante 401).
 */
export const VERSION_PAYLOAD_JWT = 2;

/**
 * JwtPayload — payload del access token JWT.
 *
 * ADR-3 (forma nueva del payload, difiere de soporte1):
 * - v: versión del payload (ADR-P7). Se declara `number`, NO el literal de
 *   `VERSION_PAYLOAD_JWT`: los tokens emitidos ANTES de este campo no lo
 *   traen, así que en runtime puede ser `undefined` pese al tipo. Declararlo
 *   como literal haría que TypeScript "narrowee" la comparación
 *   `payload.v !== VERSION_PAYLOAD_JWT` y el chequeo pareciera vacuo al
 *   lector — la mentira de tipos ya existe hoy (`verifyJwt` castea sin
 *   validar), el chequeo `!==` en runtime es lo que la ataja.
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
 * - zona_horaria: zona horaria OPERATIVA DEL TENANT (`cliente_id`), NUNCA la
 *   zona de VISTA del usuario (sdd/zona-horaria-por-tenant, D3/D11). `null`
 *   cuando `cliente_id` es null (token master), mismo criterio que
 *   `cliente_nombre`. Sale del mismo `resolverScope` que resuelve ese campo
 *   (`ScopeResuelto.zonaHoraria`) — nunca de una consulta propia de cada
 *   caso de uso ni de un valor cableado. **La preferencia de vista del
 *   usuario se resuelve enteramente en el cliente y NO viaja en el token**
 *   (D11): mezclar ambas zonas acá sería la ambigüedad que D11 existe para
 *   prevenir.
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
  v: number;
  sub: string;
  cliente_id: string | null;
  rol: string | null;
  permisos: string[];
  is_global_admin: boolean;
  cliente_nombre: string | null;
  zona_horaria: string | null;
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
