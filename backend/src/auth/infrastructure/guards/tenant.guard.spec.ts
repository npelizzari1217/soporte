/**
 * root-tenant-admin PR-A — Tests de regresión para TenantGuard (R1-c, R5-d, R7-b).
 *
 * Estos tests CONFIRMAN comportamiento ya existente en tenant.guard.ts — NO se
 * espera ningún cambio de código para hacerlos pasar (design.md Dz1/Dz4, tasks A.4-A.7).
 *
 * - R1-c: un root (is_global_admin=true) SIN ningún rol RBAC asignado igual
 *   obtiene acceso cross-tenant vía X-Tenant-Id (ortogonalidad root/RBAC).
 * - R5-d [CRITICAL]: un no-root (is_global_admin=false) que envía X-Tenant-Id
 *   explícito sigue siendo rechazado con 403 — defensa en profundidad intacta.
 * - R7-b: la auditoría cross-tenant (actor, tenant origen/destino, timestamp)
 *   sigue registrándose sin regresión cuando un root opera cross-tenant.
 */
import { ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { JwtPayload } from '../../domain/ports/i-token.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: '01966a6a-0000-7000-8000-000000000001',
    cliente_id: 'tenant-a-uuid',
    email: 'test@test.com',
    roles: [],
    permisos: [],
    cliente_nombre: 'Tenant A',
    is_global_admin: false,
    ...overrides,
  };
}

function makeContext(
  user: JwtPayload | null,
  headers: Record<string, string> = {},
): ExecutionContext {
  const request = { user, headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeCliente(overrides: Partial<{ activo: boolean; deletedAt: Date | null }> = {}) {
  return {
    id: 'tenant-b-uuid',
    dbName: 'db_tenant_b',
    activo: overrides.activo ?? true,
    deletedAt: overrides.deletedAt ?? null,
  };
}

function makePrismaService(clienteFindUnique: (...args: unknown[]) => unknown): PrismaService {
  return {
    getMasterClient: () => ({ cliente: { findUnique: clienteFindUnique } }),
    getTenantClient: () => ({}),
  } as unknown as PrismaService;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('TenantGuard — regresión root-tenant-admin (PR-A)', () => {
  let tenantContext: TenantContext;

  beforeEach(() => {
    tenantContext = new TenantContext();
  });

  it('R1-c: root sin ningún rol RBAC igual concede acceso cross-tenant', async () => {
    const prismaService = makePrismaService(async () => makeCliente());
    const guard = new TenantGuard(prismaService, tenantContext);
    const user = makeUser({ is_global_admin: true, roles: [] });
    const ctx = makeContext(user, { 'x-tenant-id': 'tenant-b-uuid' });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
  });

  it('[CRITICAL] R5-d: no-root con X-Tenant-Id explícito sigue rechazado con 403', async () => {
    const prismaService = makePrismaService(async () => makeCliente());
    const guard = new TenantGuard(prismaService, tenantContext);
    const user = makeUser({ is_global_admin: false, roles: ['ADMINISTRADOR'] });
    const ctx = makeContext(user, { 'x-tenant-id': 'tenant-b-uuid' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('R7-b: auditoría cross-tenant (actor, origen, destino, timestamp) sin regresión', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const prismaService = makePrismaService(async () => makeCliente());
    const guard = new TenantGuard(prismaService, tenantContext);
    const user = makeUser({
      sub: 'actor-uuid',
      cliente_id: 'tenant-a-uuid',
      is_global_admin: true,
      roles: [],
    });
    const ctx = makeContext(user, { 'x-tenant-id': 'tenant-b-uuid' });

    await guard.canActivate(ctx);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/CROSS-TENANT ACCESS.*actor-uuid.*tenant-a-uuid.*tenant-b-uuid/),
    );

    logSpy.mockRestore();
  });
});
