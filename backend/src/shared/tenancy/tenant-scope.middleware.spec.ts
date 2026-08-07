/**
 * tenant-scope.middleware.spec.ts — TDD RED phase (T5.1, PR5).
 *
 * TenantScopeMiddleware inicializa el scope AsyncLocalStorage de
 * TenantContext ANTES de que los guards corran, para que un TenantGuard
 * async (con `await` de por medio) pueda mutar un store COMPARTIDO por toda
 * la request (guards + controller + repos) — ver el JSDoc de la
 * implementación para el detalle de la compatibilidad Jest/Node adaptado de
 * soporte1.
 */
import { TenantContext } from './tenant-context';
import { TenantScopeMiddleware } from './tenant-scope.middleware';

describe('TenantScopeMiddleware', () => {
  let tenantContext: TenantContext;
  let middleware: TenantScopeMiddleware;

  beforeEach(() => {
    tenantContext = new TenantContext();
    middleware = new TenantScopeMiddleware(tenantContext);
  });

  it('llama a next() dentro de un scope de TenantContext inicializado', () => {
    let sawScope = false;

    const next = (): void => {
      // Dentro de next(), get() debe existir el scope (aunque sin bind() aún
      // está en null) — lo verificamos indirectamente: bind() debe poder
      // mutar el store compartido (si no hay scope, bind() cae al fallback
      // enterWith(), que TAMBIÉN deja ver el ctx, pero no persiste el mismo
      // objeto mutable entre continuaciones async — la prueba real está en
      // el próximo test).
      tenantContext.bind({ prismaClient: {}, dbName: 'db_test', clienteId: 'cliente-1' });
      sawScope = tenantContext.get()?.dbName === 'db_test';
    };

    middleware.use({}, {}, next);

    expect(sawScope).toBe(true);
  });

  it('el scope inicializado permite bind() posterior en el mismo request (mutable store)', () => {
    let beforeBind: unknown;
    let afterBind: unknown;

    const next = (): void => {
      beforeBind = tenantContext.get();
      tenantContext.bind({ prismaClient: {}, dbName: 'db_middleware', clienteId: 'cid' });
      afterBind = tenantContext.get();
    };

    middleware.use({}, {}, next);

    expect(beforeBind).toBeUndefined();
    expect(afterBind).toEqual({ prismaClient: {}, dbName: 'db_middleware', clienteId: 'cid' });
  });

  it('no filtra el contexto fuera del scope de la request', () => {
    const next = (): void => {
      tenantContext.bind({ prismaClient: {}, dbName: 'db_leak_test', clienteId: 'cid' });
    };

    middleware.use({}, {}, next);

    expect(tenantContext.get()).toBeUndefined();
  });
});
