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
 * ResolveConfigError — unión de todos los fallos tipados que puede devolver
 * `IConfigResolver.resolveSmtp()`. NUNCA se lanza — siempre `Result.fail`.
 *
 * Ref design: §5. Tarea: 2.3/2.4 (PR2).
 */
export type ResolveConfigError = ConfigIncompletaError | NoConfigError | CifradoError;
