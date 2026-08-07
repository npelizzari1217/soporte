import { JwtPayload } from './ports/i-token.service';

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
