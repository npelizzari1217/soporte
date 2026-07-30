import { DomainError } from '../result';

/**
 * ConfigIncompletaError — el conjunto de campos requeridos de una config
 * (ej. `SmtpConfig`) no está completo tras el merge tenant→global, o alguno
 * de los campos presentes tiene un formato inválido (ej. `port` no numérico).
 *
 * Vive en `shared/domain/errors` (NO en `configuracion/domain/errors` como
 * lista literalmente `design.md` §5) porque la consume directamente
 * `SmtpConfig.create()`, un Value Object de `shared/domain/value-objects`
 * (Dz1: cross-dominio, producido por `configuracion/`, consumido por
 * `tickets/`). Un VO de `shared/` NO puede importar de `configuracion/domain`
 * sin invertir la regla de dependencias de clean-arch (mismo razonamiento
 * que Dz2 para `CifradoError`/`ISecretCipher`). `configuracion/domain/errors/config.errors.ts`
 * re-exporta esta clase para conservar la superficie pública que pide la
 * tarea 2.3 — ver DESVIACIÓN documentada en STATE.md (PR2).
 *
 * Ref design: §5 (firma de `SmtpConfig.create()`), Dz1/Dz2 (razonamiento de
 * placement). Ref spec: R1 "config incompleta". Tarea: 2.1-2.3 (PR2).
 */
export class ConfigIncompletaError extends DomainError {
  readonly code = 'CONFIG_INCOMPLETA' as const;

  constructor(message: string) {
    super(message);
  }
}
