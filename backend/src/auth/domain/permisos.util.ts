import { JwtPayload } from './ports/i-token.service';
import { PARES_VALIDOS } from '../../shared/domain/acciones';

/**
 * Helpers de chequeo de permiso INLINE que HONRAN el flag ROOT.
 *
 * Para las autorizaciones condicionales al `body`/`query` que NO son
 * expresables con el `@RequirePermissions` estático de `PermissionsGuard`
 * (metadata fija por ruta): scope de `ticket:ver_todos`, gate del comentario
 * interno (`ticket:observar`), visibilidad de datos sensibles, lista básica
 * con regla OR, etc.
 *
 * Replican el MISMO criterio que `PermissionsGuard`/`GlobalAdminGuard`:
 * `is_global_admin` puede TODO — es un flag ortogonal al rol, no un permiso.
 * Así un ROOT con `permisos=[]` (scopeado a un tenant sin membresía) no recibe
 * 403 espurios ni pierde scope/visibilidad al trabajar dentro de un tenant.
 *
 * ADR: sdd/root-access-fix. Regla previa: `PermissionsGuard` y el `can()` del
 * front ya bypassean al ROOT; estos chequeos inline deben hacer lo mismo.
 */

/** Tipo mínimo para no acoplar los helpers al `JwtPayload` completo. */
type ActorPermisos = Pick<JwtPayload, 'is_global_admin' | 'permisos'>;

/** ¿El actor tiene el permiso dado? ROOT siempre `true`. */
export function actorTienePermiso(actor: ActorPermisos, permiso: string): boolean {
  return actor.is_global_admin || actor.permisos.includes(permiso);
}

/** ¿El actor tiene AL MENOS UNO de los permisos (regla OR)? ROOT siempre `true`. */
export function actorTieneAlgunPermiso(actor: ActorPermisos, permisos: readonly string[]): boolean {
  return actor.is_global_admin || permisos.some((p) => actor.permisos.includes(p));
}

// ─── Matriz de permisos por usuario (WU-5, sdd/matriz-permisos-por-usuario) ─
//
// `puedeEjecutar` es el ÚNICO predicado de autorización sobre la matriz
// nueva — lo consumen `AccionesGuard` (WU-6) y todos los chequeos inline que
// migran en WU-7.3 (mismo criterio que ADR-P11: una fuente, dos
// consumidores). Reemplaza en ese rol a `actorTienePermiso`/
// `actorTieneAlgunPermiso` de arriba, que siguen vivos SOLO para lo que
// todavía no migró (se retiran junto con `roles_permisos`, WU-9).

/** Tipo mínimo para los chequeos sobre la matriz: agrega `rol` a `ActorPermisos`. */
export type ActorAcciones = Pick<JwtPayload, 'is_global_admin' | 'rol' | 'permisos'> & {
  /** `permisos` puede llegar `undefined` en payloads legacy — fail-closed abajo. */
  permisos?: readonly string[];
};

/**
 * ¿El actor puede ejecutar el código `MODULO:ACCION` dado?
 *
 * Orden de evaluación (R3, pasos 3-5 del guard):
 * 1. `is_global_admin` (ROOT) → siempre `true`.
 * 2. `rol === 'ADMINISTRADOR'` Y el código es un par válido del catálogo →
 *    `true` (bypass acotado al catálogo, no a lo que el usuario tenga en su
 *    propia fila de matriz — un ADMINISTRADOR no necesita filas, R2).
 * 3. Si no, `permisos.includes(codigo)`. El `?? []` es el fail-closed de S5:
 *    un payload sin `permisos` (legacy o corrupto) deniega, no crashea.
 */
export function puedeEjecutar(actor: ActorAcciones, codigo: string): boolean {
  if (actor.is_global_admin) return true;
  if (actor.rol === 'ADMINISTRADOR' && (PARES_VALIDOS as readonly string[]).includes(codigo)) {
    return true;
  }
  return (actor.permisos ?? []).includes(codigo);
}

/** ¿El actor puede ejecutar AL MENOS UNO de los códigos (regla OR)? */
export function puedeEjecutarAlguna(actor: ActorAcciones, codigos: readonly string[]): boolean {
  return codigos.some((codigo) => puedeEjecutar(actor, codigo));
}

/**
 * ¿El actor es ADMINISTRADOR del cliente activo o ROOT? Usado por
 * `AdminClienteGuard` (WU-6) y por los chequeos inline de configuración
 * (R4) que no son celdas de la matriz (ej. `incluirEmail` en `GET /usuarios`,
 * R10).
 */
export function esAdminDeCliente(actor: Pick<ActorAcciones, 'is_global_admin' | 'rol'>): boolean {
  return actor.is_global_admin || actor.rol === 'ADMINISTRADOR';
}
