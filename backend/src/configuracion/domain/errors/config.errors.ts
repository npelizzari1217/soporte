import { DomainError } from '../../../shared/domain/result';
import { CifradoError } from '../../../shared/domain/errors/cifrado.errors';
import { ConfigIncompletaError } from '../../../shared/domain/errors/config-incompleta.error';

/**
 * `ConfigIncompletaError` vive físicamente en `shared/domain/errors` (la
 * consume `SmtpConfig.create()`, un VO de `shared/` — Dz1/Dz2). Se re-exporta
 * acá para conservar la superficie pública que pide la tarea 2.3 y `design.md`
 * §5 (`import { ConfigIncompletaError } from '.../configuracion/domain/errors/config.errors'`
 * sigue funcionando para quien consuma este módulo). Ver DESVIACIÓN en
 * `config-incompleta.error.ts` y STATE.md (PR2).
 */
export { ConfigIncompletaError };

/**
 * NoConfigError — ni el tenant ni la config global tienen NINGUNA fila para
 * la categoría resuelta (ej. `smtp`). Distinto de `ConfigIncompletaError`
 * (hay ALGUNAS filas pero falta un campo requerido tras el merge).
 *
 * Ref design: §5. Ref spec: Requirement 1 escenario "Ni tenant ni global
 * tienen config". Tarea: 2.3 (PR2).
 */
export class NoConfigError extends DomainError {
  readonly code = 'NO_CONFIG' as const;

  constructor(message: string) {
    super(message);
  }
}

/**
 * InfraConfigError — fallo de infraestructura al consultar Prisma (master o
 * tenant) durante la resolución de config: `clienteId` malformado
 * (`PrismaClientValidationError`), conexión caída, timeout, pool agotado.
 *
 * Distinta de `NoConfigError`/`ConfigIncompletaError` (esos son resultados
 * de negocio válidos — "no hay config"). Esta es un fallo real de la capa de
 * persistencia. El resolver corre en un listener async sin boundary HTTP
 * (mismo contexto que `SolicitanteEmailResolver` — Requirement 8 de
 * notif-email-estado-ticket): un `throw`/reject sin capturar aquí se
 * propagaría fuera de `resolveSmtp()` y violaría el contrato "NUNCA lanza".
 * El mensaje NUNCA interpola el error crudo del driver (puede contener
 * detalles de conexión sensibles) — mismo criterio que
 * `SolicitanteEmailResolver`.
 *
 * Ref design: §5, §3.1. Ref spec: Requirement 1, Requirement 9. Judgment Day
 * PR2 Ronda 1, issue 1 (WARNING).
 */
export class InfraConfigError extends DomainError {
  readonly code = 'CONFIG_INFRA_ERROR' as const;

  constructor(message: string) {
    super(message);
  }
}

/**
 * ConfigFilaCorruptaError — una fila `esSecreto=true` tiene `iv`/`authTag`
 * en `null` (dato corrupto — el `CHECK` de PR1 debería impedirlo, pero el
 * tipo Prisma es `string | null`).
 *
 * Distinta de `ConfigIncompletaError` (que significa "falta un campo tras
 * el merge tenant→global") — acá el campo SÍ está presente pero con un
 * dato interno inconsistente. Un monitoreo que agrupe por `code` no debe
 * confundir "corrupción de fila" con "config incompleta" (son causas raíz
 * distintas: la primera es un bug/tampering de datos, la segunda es config
 * de negocio faltante). Judgment Day PR2 Ronda 1, issue 6.
 *
 * Ref design: §5. Ref spec: Requirement 2.
 */
export class ConfigFilaCorruptaError extends DomainError {
  readonly code = 'CONFIG_FILA_CORRUPTA' as const;

  constructor(message: string) {
    super(message);
  }
}

/**
 * ResolveConfigError — unión de todos los fallos tipados que puede devolver
 * `IConfigResolver.resolveSmtp()`. NUNCA se lanza — siempre `Result.fail`.
 *
 * Ref design: §5. Tarea: 2.3/2.4 (PR2).
 */
export type ResolveConfigError =
  | ConfigIncompletaError
  | NoConfigError
  | CifradoError
  | InfraConfigError
  | ConfigFilaCorruptaError;
