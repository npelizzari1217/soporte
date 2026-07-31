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
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UsuariosController } from './usuarios.controller';
import { Result } from '../../../shared/domain/result';
import {
  UsuarioNoEncontradoError,
  RolNoEncontradoError,
  RolYaAsignadoError,
  AutoBajaProhibidaError,
  UsuarioConflictError,
  RootRequeridoError,
} from '../../domain/errors/auth.errors';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { GlobalAdminGuard } from '../../infrastructure/guards/global-admin.guard';
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

function makeCrearRootUseCase() {
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

function makeJwtUser(sub = 'requester-uuid', overrides?: Partial<JwtPayload>): JwtPayload {
  return {
    sub,
    cliente_id: 'tenant-a-uuid',
    email: 'admin@empresa.com',
    roles: ['ADMINISTRADOR'],
    permisos: ['usuario:gestionar'],
    cliente_nombre: 'Empresa A',
    is_global_admin: false,
    ...overrides,
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
  const crearRoot = makeCrearRootUseCase();
  const tenantCtx = makeTenantContext();
  const controller = new UsuariosController(
    asignarRol as any,
    baja as any,
    crear as any,
    listar as any,
    crearRoot as any,
    tenantCtx,
  );
  return { controller, asignarRol, baja, crear, listar, crearRoot, tenantCtx };
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
      makeCrearRootUseCase() as any,
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /usuarios/root (B.5-B.9 — root-tenant-admin Dz2, R2/R7)
// ─────────────────────────────────────────────────────────────────────────────

describe('UsuariosController — POST /usuarios/root (B.5-B.9)', () => {
  it('[CRITICAL] la ruta declara GlobalAdminGuard vía @UseGuards (R2-c)', () => {
    // Verifica el wiring de guard a nivel de metadata de Nest — el mismo mecanismo
    // que evalúa NestJS en runtime al resolver @UseGuards(). GlobalAdminGuard en sí
    // ya está cubierto unitariamente en global-admin.guard.spec.ts (rechaza
    // is_global_admin=false con ForbiddenException); acá confirmamos que la ruta
    // crearRoot() efectivamente lo tiene declarado (si el guard se quitara del
    // método, este test detecta la regresión de wiring).
    const guards = (Reflect.getMetadata(GUARDS_METADATA, UsuariosController.prototype.crearRoot) ??
      []) as unknown[];
    expect(guards).toContain(GlobalAdminGuard);
  });

  it('[R2-c, Judgment Day Ronda 1 FIX 5] GlobalAdminGuard.canActivate rechaza un actor NO-root con ForbiddenException', () => {
    // Complementa el test de metadata de arriba: ese test solo prueba que el
    // guard está DECLARADO en la ruta, no que efectivamente rechaza. Acá se
    // invoca GlobalAdminGuard.canActivate() directamente contra un request de
    // un actor no-root, reusando el mismo patrón de
    // global-admin.guard.spec.ts (mock mínimo de ExecutionContext vía
    // switchToHttp().getRequest()).
    const guard = new GlobalAdminGuard();
    const request = { user: makeJwtUser('admin-uuid', { is_global_admin: false }) };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('actor root, body válido → 201 con usuario isGlobalAdmin=true', async () => {
    const { controller, crearRoot } = makeController();
    const entity = UsuarioEntity.create({
      email: 'nuevo-root@empresa.com',
      nombre: 'Root',
      apellido: 'Dos',
      passwordHash: 'hashed_value_secret',
      clienteId: 'tenant-a-uuid',
      activo: true,
      isGlobalAdmin: true,
      roles: [],
    });
    crearRoot.execute.mockResolvedValue(Result.ok(entity));

    const result = await controller.crearRoot(
      { email: 'nuevo-root@empresa.com', nombre: 'Root', apellido: 'Dos', password: 'secret123' },
      makeJwtUser('actor-root-uuid', { is_global_admin: true }),
    );

    expect(result.isGlobalAdmin).toBe(true);
    expect((result as any).passwordHash).toBeUndefined();
  });

  it('resuelve clienteId de TenantContext (NUNCA del body) y actor.isRoot del JWT', async () => {
    const { controller, crearRoot } = makeController();
    crearRoot.execute.mockResolvedValue(
      Result.ok(
        UsuarioEntity.create({
          email: 'r@e.com',
          nombre: 'R',
          apellido: 'D',
          passwordHash: 'x',
          clienteId: 'tenant-a-uuid',
          activo: true,
          isGlobalAdmin: true,
          roles: [],
        }),
      ),
    );

    await controller.crearRoot(
      { email: 'r@e.com', nombre: 'R', apellido: 'D', password: 'secret123' },
      makeJwtUser('actor-root-uuid', { is_global_admin: true }),
    );

    expect(crearRoot.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        clienteId: 'tenant-a-uuid',
        actor: { id: 'actor-root-uuid', isRoot: true },
      }),
    );
  });

  it('[CRITICAL] actor no-root (defensa de aplicación) → RootRequeridoError → 403 ForbiddenException', async () => {
    const { controller, crearRoot } = makeController();
    crearRoot.execute.mockResolvedValue(Result.fail(new RootRequeridoError()));

    await expect(
      controller.crearRoot(
        { email: 'x@e.com', nombre: 'X', apellido: 'Y', password: 'secret123' },
        makeJwtUser('admin-uuid', { is_global_admin: false }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('email ya existe → 409 ConflictException', async () => {
    const { controller, crearRoot } = makeController();
    crearRoot.execute.mockResolvedValue(Result.fail(new UsuarioConflictError('dup@root.com')));

    await expect(
      controller.crearRoot(
        { email: 'dup@root.com', nombre: 'X', apellido: 'Y', password: 'secret123' },
        makeJwtUser('actor-root-uuid', { is_global_admin: true }),
      ),
    ).rejects.toThrow(ConflictException);
  });
});
