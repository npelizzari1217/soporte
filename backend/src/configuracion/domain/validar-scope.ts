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
import { ConfigScope } from './events/configuracion-cambiada.event';

export function esScopeKindValido(kind: unknown): kind is ConfigScope['kind'] {
  return kind === 'tenant' || kind === 'global';
}
