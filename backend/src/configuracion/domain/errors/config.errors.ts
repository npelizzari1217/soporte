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

/**
 * CategoriaNoSoportadaError — `ActualizarConfigUseCase` solo admite
 * `categoria === 'smtp'` (R8, whitelist nivel B). El modelo de datos
 * genérico (`ConfiguracionRuntime.categoria`) soporta otras categorías sin
 * migración adicional, pero NINGÚN caso de uso de este change las cablea —
 * cualquier otra categoría se rechaza ANTES de tocar el repositorio.
 *
 * Ref design: §10, §14 F2/F3 (contexto de scope). Ref spec: Requirement 8.
 * Tarea: 4.7 (PR4).
 */
export class CategoriaNoSoportadaError extends DomainError {
  readonly code = 'CONFIG_CATEGORIA_NO_SOPORTADA' as const;

  constructor(categoria: string) {
    super(`Categoría "${categoria}" no soportada — solo "smtp" está cableada en este change.`);
  }
}

/**
 * ScopeGlobalNoAutorizadoError — F2 (menor privilegio, resolución
 * autoritativa del usuario 2026-07-30, `design.md` "Resolución de forks"):
 * escribir una fila `scope='global'` (afecta a TODOS los tenants sin config
 * propia) requiere `is_global_admin=true` en el JWT del actor. Un actor con
 * el permiso `configuracion:gestionar` pero SIN `is_global_admin` puede
 * escribir su propio scope `tenant`, pero NUNCA la config global. Se valida
 * ANTES de tocar el repositorio o el cifrado — ningún efecto secundario
 * ocurre si este check falla.
 *
 * Ref design: §14 F2 (resolución autoritativa). Ref spec: Requirement 4/5
 * (scope dual). Tarea: 4.8 (PR4).
 */
export class ScopeGlobalNoAutorizadoError extends DomainError {
  readonly code = 'CONFIG_SCOPE_GLOBAL_NO_AUTORIZADO' as const;

  constructor() {
    super('Solo un usuario con is_global_admin puede escribir configuración de scope global.');
  }
}

/**
 * ScopeTenantNoAutorizadoError — ownership de tenant (arreglo 1, Judgment
 * Day PR4 Ronda 1, confirmado A+B): un actor de scope `tenant` (sin
 * `esGlobalAdmin`) solo puede leer/escribir la configuración de SU PROPIO
 * `clienteId`. Antes de esta ronda, un actor de tenant podía pasar
 * `scope.clienteId` de OTRO tenant y el use case no lo rechazaba — el
 * único gate existente (F2) solo cubría `scope.kind === 'global'`. Se
 * valida ANTES de tocar el repositorio (leer o escribir) — mismo criterio
 * que `ScopeGlobalNoAutorizadoError`.
 *
 * Ref: STATE.md "Judgment Day — PR4 — fixes Ronda 1", arreglo 1.
 */
export class ScopeTenantNoAutorizadoError extends DomainError {
  readonly code = 'CONFIG_SCOPE_TENANT_NO_AUTORIZADO' as const;

  constructor() {
    super('El actor no está autorizado a operar sobre la configuración de un tenant ajeno.');
  }
}

/**
 * InvalidScopeError — `scope.kind` fuera de `'tenant'|'global'` (arreglo 2,
 * Judgment Day PR4 Ronda 1, hallazgo Juez A: fail-open a global por
 * `scope.kind` no validado). Los adapters mapeaban CUALQUIER `kind`
 * distinto de `'tenant'` a la rama `else` (global/master) por default — un
 * `scope` malformado/tampereado que cruzara el boundary de use case podía
 * terminar escribiendo/leyendo en la config GLOBAL sin haberlo pedido
 * explícitamente. Se valida en AMBOS use cases ANTES de autorizar o tocar
 * el repositorio (fail-closed) — ver `esScopeKindValido()` en
 * `configuracion/domain/validar-scope.ts`.
 *
 * Ref: STATE.md "Judgment Day — PR4 — fixes Ronda 1", arreglo 2.
 */
export class InvalidScopeError extends DomainError {
  readonly code = 'CONFIG_SCOPE_INVALIDO' as const;

  constructor(kindRecibido: unknown) {
    super(
      `Scope de configuración inválido: "${String(kindRecibido)}" — solo se admite "tenant" o "global".`,
    );
  }
}

/**
 * ValorEnmascaradoNoPermitidoError — round-trip del placeholder enmascarado
 * (arreglo 3, Judgment Day PR4 Ronda 1, hallazgo Juez A). `LeerConfigUseCase`
 * SIEMPRE devuelve `SECRET_MASK` ('********') para filas `esSecreto=true` —
 * un frontend que lea, muestre y reenvíe el formulario sin que el usuario
 * toque el campo del secreto reenviaría literalmente ese placeholder.
 * `ActualizarConfigUseCase` NUNCA debe cifrar y persistir ese literal como
 * si fuera el secreto real — sobrescribiría el password/API-key legítimo
 * con el string `'********'` de forma silenciosa (pérdida de datos + el
 * secreto real queda irrecuperable, ya que solo existía en la fila que se
 * acaba de pisar). Se rechaza ANTES de cifrar/persistir.
 *
 * Ref: STATE.md "Judgment Day — PR4 — fixes Ronda 1", arreglo 3.
 */
export class ValorEnmascaradoNoPermitidoError extends DomainError {
  readonly code = 'CONFIG_VALOR_ENMASCARADO_NO_PERMITIDO' as const;

  constructor() {
    super(
      'El valor recibido es el placeholder enmascarado ("********") — no se puede persistir ' +
        'como el secreto real. Si no se quiere cambiar el secreto, omití el campo o enviá el valor real.',
    );
  }
}

/**
 * ConfigConflictoConcurrenteError — TOCTOU en `upsert()` (arreglo 4,
 * Judgment Day PR4 Ronda 1, confirmado A+B). `PrismaConfiguracionRepository
 * .upsert()` resuelve existencia vía `findFirst` y luego decide
 * `create`/`update` (Dz9 — no hay `.upsert()` nativo posible sobre el
 * partial unique index) — hay una ventana entre el `findFirst` y el
 * `create`/`update` donde OTRA escritura concurrente para la misma
 * `(categoria, clave)` del mismo scope puede ganar la carrera. La DB lo
 * detecta vía el partial unique index y Prisma lo reporta como `P2002`
 * (unique constraint violation). Antes de esta ronda, ese `P2002` se
 * mapeaba al mismo `InfraConfigError` genérico que cualquier otro fallo de
 * infra (timeout, conexión caída) — un caller no podía distinguir "reintentá,
 * fue una carrera" de "la infra está caída". Distinguible por `code`.
 *
 * Ref: STATE.md "Judgment Day — PR4 — fixes Ronda 1", arreglo 4.
 */
export class ConfigConflictoConcurrenteError extends DomainError {
  readonly code = 'CONFIG_CONFLICTO_CONCURRENTE' as const;

  constructor(categoria: string, clave: string) {
    super(
      `Conflicto de escritura concurrente para "${categoria}.${clave}" — otra escritura ganó ` +
        'la carrera. Reintentá la operación.',
    );
  }
}
