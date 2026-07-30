/**
 * esScopeKindValido — guard runtime de `ConfigScope.kind`.
 *
 * TypeScript garantiza en tiempo de compilación que `ConfigScope.kind` solo
 * puede ser `'tenant'|'global'` DENTRO del código propio — pero `ConfigScope`
 * cruza boundaries (DTO de use case hoy; futuro body HTTP en PR5) donde un
 * valor malformado puede colarse en runtime sin que el compilador lo vea
 * (JSON parseado, cliente mal escrito, tampering). Sin este guard, los
 * adapters (`if (kind==='tenant') {...} else {...global...}`) caían en
 * global por DEFAULT ante cualquier `kind` no-'tenant' — fail-OPEN, el peor
 * comportamiento posible para un dato multi-tenant (Judgment Day PR4 Ronda
 * 1, arreglo 2, hallazgo Juez A).
 *
 * Este guard corre en AMBOS use cases (`LeerConfigUseCase`/
 * `ActualizarConfigUseCase`) ANTES de autorizar o tocar el repositorio —
 * fail-CLOSED: cualquier `kind` desconocido se rechaza con
 * `InvalidScopeError` ahí mismo, nunca llega al adapter. Los adapters
 * (`configuracion-repository.adapter.ts`/`audit-log.adapter.ts`) además
 * reemplazan su `if/else` por un `switch` exhaustivo con rama `default` que
 * también falla — defensa en profundidad, por si algún caller futuro invoca
 * el adapter sin pasar por el use case.
 *
 * Ref: STATE.md "Judgment Day — PR4 — fixes Ronda 1", arreglo 2.
 */
import { Result } from '../../shared/domain/result';
import { ActorContext } from './actor-context';
import { ConfigScope } from './events/configuracion-cambiada.event';
import { ScopeGlobalNoAutorizadoError, ScopeTenantNoAutorizadoError } from './errors/config.errors';

export function esScopeKindValido(kind: unknown): kind is ConfigScope['kind'] {
  return kind === 'tenant' || kind === 'global';
}

/**
 * autorizarScope — ÚNICA fuente de verdad de la autorización de scope
 * (ownership de tenant + privilegio global) para `configuracion/` (auth-access
 * skill regla 5: "Role/permission logic lives in DOMAIN. Not strings
 * scattered through code"). Antes de este fix, `LeerConfigUseCase` y
 * `ActualizarConfigUseCase` tenían el MISMO bloque copy-pasteado —
 * duplicación que además escondía un bypass fail-open (ver abajo).
 *
 * FAIL-CLOSED, `null` NUNCA satisface ownership (CRITICAL, Judgment Day PR4
 * Ronda 2, Juez B): con la comparación previa `scope.clienteId ===
 * actor.clienteId`, un `actor.clienteId === null` (global-admin sin tenant,
 * o cualquier actor con el campo ausente) combinado con un
 * `scope.clienteId === null` malformado (cruza el boundary vía JSON.parse —
 * mismo vector que el `scope.kind` inválido del arreglo 2, Ronda 1) hacía
 * `null === null ⇒ true` y el gate NO disparaba. Lo único que salvaba el
 * caso en producción era que Prisma lanza al recibir `clienteId: null` en el
 * `where` — una coincidencia del ORM, no una garantía de autorización. Este
 * helper cierra el bypass exigiendo explícitamente que AMBOS lados sean
 * strings no vacíos antes de comparar.
 *
 * Reglas (fail-closed):
 *   - `scope.kind === 'global'` ⇒ requiere `actor.esGlobalAdmin`.
 *   - `scope.kind === 'tenant'` ⇒ permitido si `actor.esGlobalAdmin`, O si
 *     `actor.clienteId !== null && typeof scope.clienteId === 'string' &&
 *     scope.clienteId.length > 0 && scope.clienteId === actor.clienteId`.
 *
 * Se asume que `esScopeKindValido(scope.kind)` YA corrió antes (fail-closed
 * de `scope.kind`, arreglo 2 Ronda 1) — este helper NO revalida el `kind`,
 * solo autoriza sobre un `scope` cuyo `kind` ya se sabe `'tenant'|'global'`.
 *
 * Ref: STATE.md "Judgment Day — PR4 — fixes Ronda 2", arreglo 1 (CRITICAL,
 * Juez B) + arreglo authz-duplicada (MEDIUM).
 */
export function autorizarScope(
  actor: ActorContext,
  scope: ConfigScope,
): Result<void, ScopeGlobalNoAutorizadoError | ScopeTenantNoAutorizadoError> {
  if (scope.kind === 'global') {
    if (!actor.esGlobalAdmin) {
      return Result.fail(new ScopeGlobalNoAutorizadoError());
    }
    return Result.ok(undefined);
  }

  const esPropioTenant =
    actor.clienteId !== null &&
    typeof scope.clienteId === 'string' &&
    scope.clienteId.length > 0 &&
    scope.clienteId === actor.clienteId;

  if (!actor.esGlobalAdmin && !esPropioTenant) {
    return Result.fail(new ScopeTenantNoAutorizadoError());
  }
  return Result.ok(undefined);
}
