/**
 * ActorContext — identidad de autorización mínima que un use case de
 * `configuracion/` necesita para enforzar ownership de tenant + privilegio
 * global (F2 + ownership de tenant — arreglo 1, Judgment Day PR4 Ronda 1).
 *
 * No existe un VO `UserIdentity` reusable en `auth/domain` (grep confirmado
 * sobre `backend/src/auth/domain`, 2026-07-31): las entidades de ahí
 * (`usuario.entity.ts`, `role.entity.ts`, `permiso.entity.ts`) modelan
 * persistencia de RBAC, no un contrato de identidad pensado para cruzar el
 * boundary de un use case. Se define acá, mínimo y específico a lo que
 * `configuracion/` necesita, en vez de acoplar este dominio a una entidad
 * ajena que no fue diseñada para este propósito.
 *
 * auth-access skill regla 4 ("Pass `UserIdentity` to use cases as a
 * parameter — never as a global/static... never trust the token alone
 * dentro de application/") + regla 5 ("Role/permission logic lives in
 * DOMAIN"): el DTO de AMBOS use cases (`LeerConfigUseCase`/
 * `ActualizarConfigUseCase`) lleva este objeto — NUNCA un boolean suelto
 * tipo el `actorEsGlobalAdmin` que tenía `ActualizarConfigDto` antes de esta
 * ronda.
 *
 * REQUISITO DURO para PR5 (controller, todavía no existe): `clienteId`/
 * `esGlobalAdmin` DEBEN resolverse EXCLUSIVAMENTE del JWT verificado
 * (`req.user`/`@CurrentUser()`, claim `is_global_admin`) — NUNCA del
 * body/query de la request. Un actor que pudiera setear su propio
 * `ActorContext` desde el payload de la request podría impersonar a un
 * global-admin o reclamar el tenant de otro cliente — el JWT ya verificado
 * por el servidor es la ÚNICA fuente de verdad admisible.
 *
 * Ref: STATE.md "Judgment Day — PR4 — fixes Ronda 1", arreglo 1.
 */
export interface ActorContext {
  /**
   * `clienteId` del tenant al que pertenece el actor, o `null` si el actor
   * no tiene tenant propio (ej. un global-admin sin tenant asociado).
   */
  readonly clienteId: string | null;
  /** `true` si el JWT trae el claim `is_global_admin`. NUNCA se infiere de otra fuente. */
  readonly esGlobalAdmin: boolean;
}
