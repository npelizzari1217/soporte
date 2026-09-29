import { DomainError } from '../../../shared/domain/result';

/**
 * ResetLinkInvalidoError — rechazo único de `ConfirmarResetPasswordUseCase`
 * (ADR-5) para las 4 causas de token inválido (inexistente, usado, revocado,
 * vencido) Y para una cuenta no disponible. Indistinguibles a propósito
 * (Requirement "Confirmar con un token inválido responde igual sin importar
 * la causa"): revelar la causa filtraría si un email existe o un link ya se
 * usó. Mismo criterio que `EncuestaLinkInvalidoError` (`csat.errors.ts`).
 *
 * **Archivo propio, no `auth.errors.ts`** (desvío de la tarea 6.1, criterio
 * de apply): `auth.controller.spec.ts` tiene un spec guardián de cobertura
 * TOTAL sobre cada export de `auth.errors.ts` en `AuthController.toHttpException`.
 * Este error nunca pasa por `AuthController` — lo consume
 * `RecuperacionPasswordController` (WU-8), módulo aparte por ADR-1. Un
 * archivo de errores propio por feature ya es el patrón del repo
 * (`csat.errors.ts`, `tickets.errors.ts`).
 * → HTTP 400 en WU-8: no 401 (dispararía el refresh de `apiFetch`), no 404
 * (el token viaja en el body, no es un recurso de la ruta).
 *
 * Ref spec: Requirement "Confirmar con un token inválido responde igual sin
 * importar la causa". Ref design: ADR-5. Tarea: 6.1.
 */
export class ResetLinkInvalidoError extends DomainError {
  readonly code = 'AUTH_RESET_LINK_INVALIDO';

  constructor() {
    super('El link de reseteo no es válido o ya venció.');
  }
}
