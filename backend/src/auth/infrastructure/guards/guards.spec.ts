/**
 * 2.D.1 TEST — Unit tests para guards de autenticación/autorización.
 *
 * Guards testeados:
 * - JwtAuthGuard: verifica JWT en header Authorization Bearer, rechaza sin token.
 * - RolesGuard: verifica que el JWT tenga los roles requeridos (array OR).
 * - PermissionsGuard: verifica que el JWT tenga los permisos requeridos.
 * - TenantGuard: verifica que el JWT tenga un cliente_id válido.
 *
 * Invariantes de diseño que los tests codifican:
 * - Los guards NUNCA consultan DB — solo evalúan el payload del JWT.
 * - Si no hay metadata de roles/permisos (endpoint público), el guard pasa.
 * - TenantGuard falla si cliente_id es null o vacío en el JWT.
 * - Si el usuario no está en el request (sin JwtAuthGuard previo), retorna 403.
 *
 * Tarea: 2.D.1
 */

import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { PermissionsGuard } from './permissions.guard';
import { TenantGuard } from './tenant.guard';
import { JwtPayload } from '../../domain/ports/i-token.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: '01966a6a-0000-7000-8000-000000000001',
    cliente_id: 'c1111111-0000-4000-8000-000000000001',
    email: 'test@test.com',
    roles: ['ADMIN'],
    permisos: ['ticket:crear', 'compra:aprobar', 'usuario:gestionar'],
    cliente_nombre: 'Test Corp',
    ...overrides,
  };
}

function makeContext(
  payload: JwtPayload | null,
  _meta?: { requiredRoles?: string[]; requiredPermissions?: string[] },
): ExecutionContext {
  const request = {
    user: payload,
    headers: {},
  } as any;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

// ─── JwtAuthGuard ─────────────────────────────────────────────────────────────

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let mockITokenService: { verifyJwt: jest.Mock };

  beforeEach(() => {
    mockITokenService = { verifyJwt: jest.fn() };
    guard = new JwtAuthGuard(mockITokenService as any);
  });

  it('permite request cuando el token es válido', () => {
    const payload = makePayload();
    mockITokenService.verifyJwt.mockReturnValue(payload);

    const request: any = { headers: { authorization: 'Bearer valid-token' }, user: null };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(request.user).toEqual(payload);
  });

  it('lanza UnauthorizedException cuando no hay header Authorization', () => {
    const request: any = { headers: {}, user: null };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException cuando el token es inválido/expirado', () => {
    mockITokenService.verifyJwt.mockReturnValue(null);

    const request: any = { headers: { authorization: 'Bearer expired-token' }, user: null };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException cuando el header no es Bearer', () => {
    const request: any = { headers: { authorization: 'Basic dXNlcjpwYXNz' }, user: null };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});

// ─── RolesGuard ───────────────────────────────────────────────────────────────

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('permite cuando no hay metadata de roles (endpoint público)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);
    const ctx = makeContext(makePayload());
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('permite cuando el usuario tiene uno de los roles requeridos', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'SOPORTE_IT']);
    const ctx = makeContext(makePayload({ roles: ['ADMIN'] }));
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('lanza ForbiddenException cuando el usuario no tiene ningún rol requerido', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const ctx = makeContext(makePayload({ roles: ['SOLICITANTE'] }));
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException cuando no hay usuario en el request (sin JwtAuthGuard previo)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const ctx = makeContext(null);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

// ─── PermissionsGuard ─────────────────────────────────────────────────────────

describe('PermissionsGuard', () => {
  let reflector: Reflector;
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  it('permite cuando no hay metadata de permisos (endpoint público)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);
    const ctx = makeContext(makePayload());
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('permite cuando el usuario tiene todos los permisos requeridos', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ticket:crear', 'compra:aprobar']);
    const ctx = makeContext(
      makePayload({ permisos: ['ticket:crear', 'compra:aprobar', 'usuario:gestionar'] }),
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('lanza ForbiddenException cuando falta al menos un permiso requerido', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ticket:crear', 'rol:asignar']);
    const ctx = makeContext(makePayload({ permisos: ['ticket:crear'] }));
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException cuando no hay usuario en el request', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ticket:crear']);
    const ctx = makeContext(null);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

// ─── TenantGuard ──────────────────────────────────────────────────────────────

describe('TenantGuard', () => {
  let guard: TenantGuard;
  let mockMasterClient: { cliente: { findUnique: jest.Mock } };
  let mockPrismaService: { getMasterClient: jest.Mock; getTenantClient: jest.Mock };
  let mockTenantContext: { bind: jest.Mock };

  const CLIENTE_ID = 'c1111111-0000-4000-8000-000000000001';
  const VALID_CLIENTE_ROW = {
    id: CLIENTE_ID,
    dbName: 'tenant_db_test',
    activo: true,
    deletedAt: null,
  };

  beforeEach(() => {
    mockMasterClient = { cliente: { findUnique: jest.fn() } };
    mockPrismaService = {
      getMasterClient: jest.fn().mockReturnValue(mockMasterClient),
      getTenantClient: jest.fn().mockReturnValue({ isMockTenantClient: true }),
    };
    mockTenantContext = { bind: jest.fn() };
    guard = new TenantGuard(mockPrismaService as any, mockTenantContext as any);
  });

  // ─── Validación temprana (antes de consultar DB) ───────────────────────────

  it('lanza ForbiddenException cuando cliente_id está vacío (sin consultar DB)', async () => {
    const ctx = makeContext(makePayload({ cliente_id: '' }));
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(mockPrismaService.getMasterClient).not.toHaveBeenCalled();
  });

  it('lanza ForbiddenException cuando no hay usuario en el request', async () => {
    const ctx = makeContext(null);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(mockPrismaService.getMasterClient).not.toHaveBeenCalled();
  });

  // ─── Resolución de db_name desde master.clientes (RED) ────────────────────

  it('resuelve db_name desde master.clientes y permite la request', async () => {
    mockMasterClient.cliente.findUnique.mockResolvedValue(VALID_CLIENTE_ROW);

    const ctx = makeContext(makePayload({ cliente_id: CLIENTE_ID }));
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(mockMasterClient.cliente.findUnique).toHaveBeenCalledWith({
      where: { id: CLIENTE_ID },
      select: { id: true, dbName: true, activo: true, deletedAt: true },
    });
  });

  it('lanza ForbiddenException cuando el cliente tiene activo=false', async () => {
    mockMasterClient.cliente.findUnique.mockResolvedValue({ ...VALID_CLIENTE_ROW, activo: false });

    const ctx = makeContext(makePayload({ cliente_id: CLIENTE_ID }));
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException cuando el cliente tiene deleted_at seteado', async () => {
    mockMasterClient.cliente.findUnique.mockResolvedValue({
      ...VALID_CLIENTE_ROW,
      deletedAt: new Date('2026-01-01'),
    });

    const ctx = makeContext(makePayload({ cliente_id: CLIENTE_ID }));
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException cuando el cliente no existe en master', async () => {
    mockMasterClient.cliente.findUnique.mockResolvedValue(null);

    const ctx = makeContext(makePayload({ cliente_id: CLIENTE_ID }));
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // ─── Vinculación de TenantContext (RED) ───────────────────────────────────

  it('vincula TenantContext con el cliente Prisma resuelto', async () => {
    const tenantClient = { isMockTenantClient: true };
    mockMasterClient.cliente.findUnique.mockResolvedValue(VALID_CLIENTE_ROW);
    mockPrismaService.getTenantClient.mockReturnValue(tenantClient);

    const ctx = makeContext(makePayload({ cliente_id: CLIENTE_ID }));
    await guard.canActivate(ctx);

    expect(mockTenantContext.bind).toHaveBeenCalledWith({
      prismaClient: tenantClient,
      dbName: VALID_CLIENTE_ROW.dbName,
      clienteId: CLIENTE_ID,
    });
    expect(mockPrismaService.getTenantClient).toHaveBeenCalledWith(VALID_CLIENTE_ROW.dbName);
  });
});
