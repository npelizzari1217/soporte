/**
 * T3.8 [RED/GREEN] — Unit tests para UsuariosController (extendido con POST/GET/PATCH baja).
 *
 * Rutas verificadas:
 *   POST   /usuarios              → CrearUsuarioUseCase   [JwtAuthGuard, TenantGuard, usuario:gestionar]
 *   GET    /usuarios              → ListarUsuariosUseCase [JwtAuthGuard, TenantGuard, usuario:gestionar]
 *   PATCH  /usuarios/:id/baja    → BajaUsuarioUseCase    [JwtAuthGuard, TenantGuard, usuario:gestionar]
 *   POST   /usuarios/:id/roles   → AsignarRolUseCase     (legacy, se mantiene)
 *
 * Spec ref: clientes-tenancy/POST, GET, PATCH /usuarios
 * Tarea: T3.8
 *
 * Nota técnica: TenantGuard importa PrismaService que requiere '.prisma/master' (generado
 * en runtime por `prisma generate`). En tests unitarios sin DB, es necesario mockear
 * el módulo de clientes Prisma para evitar el error de import.
 * El mismo patrón aplica a guards del módulo auth que usan inyección de PrismaService.
 */

// Mocks hoisted — deben estar ANTES de cualquier import que traiga TenantGuard / PrismaService
vi.mock('../../../shared/infrastructure/persistence/prisma-clients', () => ({
  MasterPrismaClient: class {},
  TenantPrismaClient: class {},
}));
vi.mock('../../../shared/infrastructure/persistence/prisma.service', () => ({
  PrismaService: class {
    getMasterClient() {
      return {};
    }
    getTenantClient() {
      return {};
    }
  },
}));

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UsuariosController } from './usuarios.controller';
import { Result } from '../../../shared/domain/result';
import {
  UsuarioNoEncontradoError,
  RolNoEncontradoError,
  RolYaAsignadoError,
  AutoBajaProhibidaError,
  UsuarioConflictError,
} from '../../domain/errors/auth.errors';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import type { JwtPayload } from '../../domain/ports/i-token.service';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeAsignarRolUseCase() {
  return { execute: vi.fn() };
}

function makeBajaUsuarioUseCase() {
  return { execute: vi.fn() };
}

function makeCrearUsuarioUseCase() {
  return { execute: vi.fn() };
}

function makeListarUsuariosUseCase() {
  return { execute: vi.fn() };
}

function makeTenantContext(clienteId = 'tenant-a-uuid'): TenantContext {
  return {
    get: vi.fn().mockReturnValue({ clienteId, dbName: 'db_a', prismaClient: {} }),
    bind: vi.fn(),
    initScope: vi.fn(),
    run: vi.fn(),
    getClient: vi.fn(),
  } as unknown as TenantContext;
}

function makeJwtUser(sub = 'requester-uuid'): JwtPayload {
  return {
    sub,
    cliente_id: 'tenant-a-uuid',
    email: 'admin@empresa.com',
    roles: ['ADMINISTRADOR'],
    permisos: ['usuario:gestionar'],
    cliente_nombre: 'Empresa A',
    is_global_admin: false,
  };
}

function makeUsuarioEntity(overrides?: Partial<{ activo: boolean; email: string }>): UsuarioEntity {
  return UsuarioEntity.create({
    email: overrides?.email ?? 'user@empresa.com',
    nombre: 'Juan',
    apellido: 'Pérez',
    passwordHash: 'hashed_value_secret',
    clienteId: 'tenant-a-uuid',
    activo: overrides?.activo ?? true,
    isGlobalAdmin: false,
    roles: [],
  });
}

function makeController() {
  const asignarRol = makeAsignarRolUseCase();
  const baja = makeBajaUsuarioUseCase();
  const crear = makeCrearUsuarioUseCase();
  const listar = makeListarUsuariosUseCase();
  const tenantCtx = makeTenantContext();
  const controller = new UsuariosController(
    asignarRol as any,
    baja as any,
    crear as any,
    listar as any,
    tenantCtx,
  );
  return { controller, asignarRol, baja, crear, listar, tenantCtx };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /usuarios
// ─────────────────────────────────────────────────────────────────────────────

describe('UsuariosController — POST /usuarios (T3.8)', () => {
  it('ADMINISTRADOR body válido → 201 con usuario (sin password_hash)', async () => {
    const { controller, crear } = makeController();
    const entity = makeUsuarioEntity();
    crear.execute.mockResolvedValue(Result.ok(entity));

    const result = await controller.crearUsuario(
      {
        email: 'juan@empresa.com',
        nombre: 'Juan',
        apellido: 'P',
        password: 'secret',
        rol: 'TECNICO',
      },
      makeJwtUser(),
    );

    expect(result).toBeDefined();
    expect(result.id).toBe(entity.id);
    // CRITICAL: passwordHash NEVER en respuesta
    expect((result as any).passwordHash).toBeUndefined();
    expect((result as any).password).toBeUndefined();
  });

  it('pasa clienteId del TenantContext (NUNCA del body)', async () => {
    const { controller, crear } = makeController();
    crear.execute.mockResolvedValue(Result.ok(makeUsuarioEntity()));

    await controller.crearUsuario(
      { email: 'j@e.com', nombre: 'J', apellido: 'P', password: 'x', rol: 'USUARIO' },
      makeJwtUser(),
    );

    expect(crear.execute).toHaveBeenCalledWith(
      expect.objectContaining({ clienteId: 'tenant-a-uuid' }),
    );
  });

  it('email duplicado → 409 ConflictException', async () => {
    const { controller, crear } = makeController();
    crear.execute.mockResolvedValue(Result.fail(new UsuarioConflictError('dup@email.com')));

    await expect(
      controller.crearUsuario(
        { email: 'dup@email.com', nombre: 'J', apellido: 'P', password: 'x', rol: 'USUARIO' },
        makeJwtUser(),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('rol inválido (no en DB) → 400 BadRequestException', async () => {
    const { controller, crear } = makeController();
    crear.execute.mockResolvedValue(Result.fail(new RolNoEncontradoError('SUPER_ADMIN')));

    await expect(
      controller.crearUsuario(
        { email: 'j@e.com', nombre: 'J', apellido: 'P', password: 'x', rol: 'SUPER_ADMIN' },
        makeJwtUser(),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rol no válido en enum (validación local) → 400 BadRequestException', async () => {
    const { controller, crear } = makeController();

    await expect(
      controller.crearUsuario(
        { email: 'j@e.com', nombre: 'J', apellido: 'P', password: 'x', rol: 'DIRECTOR' },
        makeJwtUser(),
      ),
    ).rejects.toThrow(BadRequestException);

    // No llama al use case para roles inválidos
    expect(crear.execute).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /usuarios
// ─────────────────────────────────────────────────────────────────────────────

describe('UsuariosController — GET /usuarios (T3.8)', () => {
  it('ADMINISTRADOR → 200 con usuarios del tenant (sin password_hash)', async () => {
    const { controller, listar } = makeController();
    const activo = makeUsuarioEntity({ activo: true });
    const inactivo = makeUsuarioEntity({ activo: false, email: 'inactivo@empresa.com' });
    listar.execute.mockResolvedValue([activo, inactivo]);

    const result = await controller.listarUsuarios();

    expect(result).toHaveLength(2);
    result.forEach((u) => {
      expect((u as any).passwordHash).toBeUndefined();
      expect((u as any).password).toBeUndefined();
    });
  });

  it('incluye usuarios con activo=FALSE (admin ve inactivos)', async () => {
    const { controller, listar } = makeController();
    const inactivo = makeUsuarioEntity({ activo: false });
    listar.execute.mockResolvedValue([inactivo]);

    const result = await controller.listarUsuarios();

    expect(result[0].activo).toBe(false);
  });

  it('pasa clienteId del TenantContext al use case', async () => {
    const { controller, listar } = makeController();
    listar.execute.mockResolvedValue([]);

    await controller.listarUsuarios();

    expect(listar.execute).toHaveBeenCalledWith({ clienteId: 'tenant-a-uuid' });
  });

  it('lista vacía → 200 con array vacío (no 404)', async () => {
    const { controller, listar } = makeController();
    listar.execute.mockResolvedValue([]);

    const result = await controller.listarUsuarios();

    expect(result).toEqual([]);
  });

  it('Operador + X-Tenant-Id → pasa el clienteId resuelto por TenantContext', async () => {
    const tenantCtx = makeTenantContext('tenant-b-uuid');
    const { listar } = makeController();
    const controller = new UsuariosController(
      makeAsignarRolUseCase() as any,
      makeBajaUsuarioUseCase() as any,
      makeCrearUsuarioUseCase() as any,
      listar as any,
      tenantCtx,
    );
    listar.execute.mockResolvedValue([]);

    await controller.listarUsuarios();

    expect(listar.execute).toHaveBeenCalledWith({ clienteId: 'tenant-b-uuid' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /usuarios/:id/baja
// ─────────────────────────────────────────────────────────────────────────────

describe('UsuariosController — PATCH /usuarios/:id/baja (T3.8)', () => {
  it('ADMINISTRADOR mismo tenant → 200 OK', async () => {
    const { controller, baja } = makeController();
    baja.execute.mockResolvedValue(Result.ok(undefined));

    const result = await controller.baja('user-uuid', makeJwtUser('admin-uuid'));

    expect(result).toBeUndefined();
  });

  it('pasa usuarioId, requesterId (JWT.sub) y clienteId (TenantContext) al use case', async () => {
    const { controller, baja } = makeController();
    baja.execute.mockResolvedValue(Result.ok(undefined));

    await controller.baja('target-user-uuid', makeJwtUser('admin-sub-uuid'));

    expect(baja.execute).toHaveBeenCalledWith({
      usuarioId: 'target-user-uuid',
      requesterId: 'admin-sub-uuid',
      clienteId: 'tenant-a-uuid',
    });
  });

  it('usuario de otro tenant → 404 NotFoundException', async () => {
    const { controller, baja } = makeController();
    baja.execute.mockResolvedValue(Result.fail(new UsuarioNoEncontradoError('user-uuid')));

    await expect(controller.baja('user-uuid', makeJwtUser())).rejects.toThrow(NotFoundException);
  });

  it('auto-baja (self) → 422 UnprocessableEntityException', async () => {
    const { controller, baja } = makeController();
    baja.execute.mockResolvedValue(Result.fail(new AutoBajaProhibidaError()));

    await expect(controller.baja('self-uuid', makeJwtUser('self-uuid'))).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('usuario ya dado de baja → 200 (idempotente)', async () => {
    const { controller, baja } = makeController();
    baja.execute.mockResolvedValue(Result.ok(undefined)); // idempotente → ok

    const result = await controller.baja('already-gone-uuid', makeJwtUser());

    expect(result).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /usuarios/:id/roles (legacy — regresión)
// ─────────────────────────────────────────────────────────────────────────────

describe('UsuariosController — POST /usuarios/:id/roles (regresión T3.8)', () => {
  it('asigna el rol y retorna 201 (void)', async () => {
    const { controller, asignarRol } = makeController();
    asignarRol.execute.mockResolvedValue(Result.ok(undefined));

    const result = await controller.asignarRol('user-uuid', { rolCodigo: 'TECNICO' });

    expect(result).toBeUndefined();
    expect(asignarRol.execute).toHaveBeenCalledWith({
      usuarioId: 'user-uuid',
      rolCodigo: 'TECNICO',
      clienteId: 'tenant-a-uuid',
    });
  });

  it('pasa clienteId del TenantContext (NUNCA del body) — root-tenant-admin R4/Dz4', async () => {
    const { controller, asignarRol } = makeController();
    asignarRol.execute.mockResolvedValue(Result.ok(undefined));

    // Body hostil: intenta colar un clienteId propio para forzar cross-tenant.
    // AsignarRolDto solo declara rolCodigo, pero el excess-property check de TS
    // solo aplica a literales de objeto pasados directo — via variable intermedia
    // compila por structural typing, sin necesitar `as any`.
    const bodyHostil = { rolCodigo: 'TECNICO', clienteId: 'evil-tenant' };
    await controller.asignarRol('user-uuid', bodyHostil);

    expect(asignarRol.execute).toHaveBeenCalledWith(
      expect.objectContaining({ clienteId: 'tenant-a-uuid' }),
    );
    expect(asignarRol.execute).not.toHaveBeenCalledWith(
      expect.objectContaining({ clienteId: 'evil-tenant' }),
    );
  });

  it('usuario no encontrado → NotFoundException', async () => {
    const { controller, asignarRol } = makeController();
    asignarRol.execute.mockResolvedValue(Result.fail(new UsuarioNoEncontradoError('u1')));

    await expect(controller.asignarRol('u1', { rolCodigo: 'TECNICO' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rol no encontrado → NotFoundException', async () => {
    const { controller, asignarRol } = makeController();
    asignarRol.execute.mockResolvedValue(Result.fail(new RolNoEncontradoError('NONE')));

    await expect(controller.asignarRol('u1', { rolCodigo: 'NONE' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rol ya asignado → BadRequestException', async () => {
    const { controller, asignarRol } = makeController();
    asignarRol.execute.mockResolvedValue(Result.fail(new RolYaAsignadoError('ADMIN')));

    await expect(controller.asignarRol('u1', { rolCodigo: 'ADMIN' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
