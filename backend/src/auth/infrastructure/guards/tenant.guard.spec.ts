/**
 * tenant.guard.spec.ts — TDD RED phase (T6.2, PR6).
 *
 * TenantGuard: si `cliente_id` es null/vacío → 403 (endpoints master/root NO
 * aplican este guard). Resuelve `master.clientes`, valida `activo && !deleted`
 * → 403 `ClienteInactivoError` si no. Bindea `TenantContext` con el
 * PrismaClient del tenant (R12). ÚNICO guard que consulta DB (1 query).
 *
 * NO implementa el header X-Tenant-Id de soporte1 (ADR-4): el switch
 * (re-emisión de token) es el ÚNICO mecanismo de salto de tenant.
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';
import { JwtPayload } from '../../domain/ports/i-token.service';
import { payloadDeTest } from '../../test-helpers/payload-de-test';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { ZonaHoraria } from '../../../shared/domain/zona-horaria';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../shared/tenancy/tenant-context';

function buildContext(user: JwtPayload | null): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function buildPayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return payloadDeTest({
    sub: 'usuario-1',
    cliente_id: 'cliente-1',
    rol: 'TECNICO',
    permisos: [],
    cliente_nombre: 'Cliente 1',
    ...overrides,
  });
}

describe('TenantGuard (R12)', () => {
  function buildDeps(clienteRepoResult: ClienteEntity | null) {
    const clienteRepo: IClienteRepository = {
      findById: vi.fn().mockResolvedValue(clienteRepoResult),
      findByDbName: vi.fn(),
      findAll: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };
    const tenantClientStub = { __marker: 'tenant-prisma-client' };
    const prismaService = {
      getTenantClient: vi.fn().mockReturnValue(tenantClientStub),
    } as unknown as PrismaService;
    const tenantContext = new TenantContext();
    const guard = new TenantGuard(clienteRepo, prismaService, tenantContext);
    return { guard, clienteRepo, prismaService, tenantContext, tenantClientStub };
  }

  it('cliente_id null → 403, NO consulta DB', async () => {
    const { guard, clienteRepo } = buildDeps(null);
    const context = buildContext(buildPayload({ cliente_id: null }));

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    expect(clienteRepo.findById).not.toHaveBeenCalled();
  });

  it('cliente no encontrado en master → 403 ClienteInactivo', async () => {
    const { guard } = buildDeps(null);
    const context = buildContext(buildPayload());

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('cliente inactivo (activo=false) → 403 ClienteInactivo', async () => {
    const clienteInactivo = ClienteEntity.reconstitute(
      {
        nombre: 'Cliente 1',
        razonSocial: null,
        cuit: null,
        dbName: 'soporte_cliente1',
        activo: false,
        zonaHoraria: ZonaHoraria.crear('America/Argentina/Buenos_Aires'),
      },
      'cliente-1',
      new Date(),
      new Date(),
      null,
    );
    const { guard } = buildDeps(clienteInactivo);
    const context = buildContext(buildPayload());

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('cliente soft-deleted → 403 ClienteInactivo', async () => {
    const clienteBorrado = ClienteEntity.reconstitute(
      {
        nombre: 'Cliente 1',
        razonSocial: null,
        cuit: null,
        dbName: 'soporte_cliente1',
        activo: true,
        zonaHoraria: ZonaHoraria.crear('America/Argentina/Buenos_Aires'),
      },
      'cliente-1',
      new Date(),
      new Date(),
      new Date(),
    );
    const { guard } = buildDeps(clienteBorrado);
    const context = buildContext(buildPayload());

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('cliente activo y vivo → true, bindea TenantContext con el PrismaClient del tenant', async () => {
    const clienteActivo = ClienteEntity.reconstitute(
      {
        nombre: 'Cliente 1',
        razonSocial: null,
        cuit: null,
        dbName: 'soporte_cliente1',
        activo: true,
        zonaHoraria: ZonaHoraria.crear('America/Argentina/Buenos_Aires'),
      },
      'cliente-1',
      new Date(),
      new Date(),
      null,
    );
    const { guard, prismaService, tenantContext, tenantClientStub } = buildDeps(clienteActivo);
    const context = buildContext(buildPayload({ cliente_id: 'cliente-1' }));
    // El aislamiento real de AsyncLocalStorage entre la continuación async del
    // guard y la del test ya está cubierto por tenant-context.spec.ts (PR5) —
    // acá se espía bind() para verificar el CONTRATO del guard sin acoplarse
    // a la semántica de propagación entre continuaciones (resuelta en
    // producción por TenantScopeMiddleware, T5.1).
    const bindSpy = vi.spyOn(tenantContext, 'bind');

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(prismaService.getTenantClient).toHaveBeenCalledWith('soporte_cliente1');
    expect(bindSpy).toHaveBeenCalledWith({
      prismaClient: tenantClientStub,
      dbName: 'soporte_cliente1',
      clienteId: 'cliente-1',
    });
  });
});
