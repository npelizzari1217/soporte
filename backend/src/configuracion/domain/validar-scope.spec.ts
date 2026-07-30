/**
 * validar-scope — unit tests de `autorizarScope` (Judgment Day PR4 Ronda 2,
 * arreglo 1 CRITICAL Juez B + authz-duplicada MEDIUM).
 *
 * Cubre el bypass `null === null` que tenía el bloque copy-pasteado en
 * `LeerConfigUseCase`/`ActualizarConfigUseCase` ANTES de este fix: un
 * `actor.clienteId === null` combinado con un `scope.clienteId === null`
 * malformado (cruza el boundary vía JSON.parse, mismo vector que el
 * `scope.kind` inválido del arreglo 2 Ronda 1) hacía `esPropioTenant = true`
 * y el gate no disparaba. `autorizarScope` es ahora la ÚNICA fuente de
 * verdad de esta autorización — `null` NUNCA satisface ownership.
 */
import { Result } from '../../shared/domain/result';
import { ActorContext } from './actor-context';
import { ConfigScope } from './events/configuracion-cambiada.event';
import { autorizarScope } from './validar-scope';
import { ScopeGlobalNoAutorizadoError, ScopeTenantNoAutorizadoError } from './errors/config.errors';

const GLOBAL_ADMIN: ActorContext = { clienteId: null, esGlobalAdmin: true };
const ACTOR_TENANT_A: ActorContext = { clienteId: 'cliente-a', esGlobalAdmin: false };
const ACTOR_TENANT_B: ActorContext = { clienteId: 'cliente-b', esGlobalAdmin: false };
const ACTOR_SIN_TENANT: ActorContext = { clienteId: null, esGlobalAdmin: false };

describe('autorizarScope', () => {
  it('(a) CRITICAL — actor{clienteId:null, esGlobalAdmin:false} + scope{tenant, clienteId:null} malformado ⇒ rechazado', () => {
    // JSON.parse (sin `as any`/`as unknown as`, prohibidos en este proyecto)
    // para simular el scope malformado que cruza el boundary de use case en
    // runtime sin que el compilador lo objete — este es EXACTAMENTE el
    // bypass que la comparación previa `scope.clienteId === actor.clienteId`
    // dejaba pasar (`null === null`).
    const scopeMalformado: ConfigScope = JSON.parse('{"kind":"tenant","clienteId":null}');

    const result = autorizarScope(ACTOR_SIN_TENANT, scopeMalformado);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ScopeTenantNoAutorizadoError);
    expect(result.getError().code).toBe('CONFIG_SCOPE_TENANT_NO_AUTORIZADO');
  });

  it('(b) scope.clienteId string vacío ⇒ rechazado, incluso si "coincide" con un actor.clienteId vacío', () => {
    const actorConClienteIdVacio: ActorContext = { clienteId: '', esGlobalAdmin: false };
    const scope: ConfigScope = { kind: 'tenant', clienteId: '' };

    const result = autorizarScope(actorConClienteIdVacio, scope);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ScopeTenantNoAutorizadoError);
  });

  it('(c) tenant propio ⇒ autorizado', () => {
    const scope: ConfigScope = { kind: 'tenant', clienteId: 'cliente-a' };

    const result = autorizarScope(ACTOR_TENANT_A, scope);

    expect(result.isOk()).toBe(true);
  });

  it('(d) tenant ajeno ⇒ rechazado', () => {
    const scope: ConfigScope = { kind: 'tenant', clienteId: 'cliente-a' };

    const result = autorizarScope(ACTOR_TENANT_B, scope);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ScopeTenantNoAutorizadoError);
  });

  it('(e) global-admin ⇒ autorizado para cualquier tenant ajeno + global', () => {
    const resultTenantAjeno = autorizarScope(GLOBAL_ADMIN, {
      kind: 'tenant',
      clienteId: 'cliente-z',
    });
    const resultGlobal = autorizarScope(GLOBAL_ADMIN, { kind: 'global' });

    expect(resultTenantAjeno.isOk()).toBe(true);
    expect(resultGlobal.isOk()).toBe(true);
  });

  it('scope global sin esGlobalAdmin ⇒ rechazado', () => {
    const result = autorizarScope(ACTOR_TENANT_A, { kind: 'global' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ScopeGlobalNoAutorizadoError);
    expect(result.getError().code).toBe('CONFIG_SCOPE_GLOBAL_NO_AUTORIZADO');
  });

  it('Result.ok(undefined) en el camino feliz — no expone ningún valor', () => {
    const result: Result<void, ScopeGlobalNoAutorizadoError | ScopeTenantNoAutorizadoError> =
      autorizarScope(GLOBAL_ADMIN, { kind: 'global' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toBeUndefined();
  });
});
