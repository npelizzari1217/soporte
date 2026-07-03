/**
 * T2.4 [RED] — Tests integración ClientesController
 *             GET /clientes y POST /clientes con provisioning completo.
 *
 * Extiende el spec previo (1.D.1) que ya cubre:
 * - POST /clientes con RegistrarClienteUseCase (básico)
 * - DELETE /clientes/:id
 * - PUT /clientes/:id/reactivar
 * - Protección JwtAuthGuard (T1.3)
 *
 * Agrega (T2.4 / T2.5):
 * - GET /clientes → ListarClientesUseCase (global admin only)
 * - POST /clientes → ahora usa CrearClienteUseCase (provisioning completo)
 * - Guards: GlobalAdminGuard aplicado a GET / y POST /
 *
 * Spec ref: clientes-tenancy/GET /clientes, clientes-tenancy/POST /clientes
 */
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
  ExecutionContext,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ClientesController } from './clientes.controller';
import { CiclosVigentesController } from './ciclos-vigentes.controller';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { GlobalAdminGuard } from '../../../auth/infrastructure/guards/global-admin.guard';
import { ListarClientesUseCase } from '../../application/use-cases/listar-clientes.use-case';
import { SuspenderClienteUseCase } from '../../application/use-cases/suspender-cliente.use-case';
import { ReactivarClienteUseCase } from '../../application/use-cases/reactivar-cliente.use-case';
import { CrearClienteUseCase } from '../../application/use-cases/crear-cliente.use-case';
import { CrearCicloVigenteUseCase } from '../../application/use-cases/crear-ciclo-vigente.use-case';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import { Result } from '../../../shared/domain/result';
import {
  ClienteConflictError,
  ClienteNotFoundError,
  CicloVigenteOverlapError,
} from '../../domain/errors/clientes.errors';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeMockCliente(overrides?: Partial<{ activo: boolean }>): ClienteEntity {
  return ClienteEntity.create({
    nombre: 'Acme Corp',
    razonSocial: 'Acme S.A.',
    cuit: '20123456789',
    dbName: 'soporte_acme',
    activo: overrides?.activo ?? true,
  });
}

function makeMockCiclo(): CicloVigenteEntity {
  return CicloVigenteEntity.create({
    nombre: 'Ejercicio 2026',
    fechaInicio: new Date('2026-01-01'),
    fechaFin: new Date('2026-12-31'),
    activo: true,
  });
}

// ─── Mocks de use cases ───────────────────────────────────────────────────────

function makeMockListar(): vi.Mocked<ListarClientesUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<ListarClientesUseCase>;
}
function makeMockCrear(): vi.Mocked<CrearClienteUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<CrearClienteUseCase>;
}
function makeMockSuspender(): vi.Mocked<SuspenderClienteUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<SuspenderClienteUseCase>;
}
function makeMockReactivar(): vi.Mocked<ReactivarClienteUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<ReactivarClienteUseCase>;
}
function makeMockCrearCiclo(): vi.Mocked<CrearCicloVigenteUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<CrearCicloVigenteUseCase>;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /clientes (T2.4)
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientesController — GET /clientes (T2.4)', () => {
  let controller: ClientesController;
  let listar: vi.Mocked<ListarClientesUseCase>;
  let crear: vi.Mocked<CrearClienteUseCase>;
  let suspender: vi.Mocked<SuspenderClienteUseCase>;
  let reactivar: vi.Mocked<ReactivarClienteUseCase>;

  beforeEach(() => {
    listar = makeMockListar();
    crear = makeMockCrear();
    suspender = makeMockSuspender();
    reactivar = makeMockReactivar();
    controller = new ClientesController(listar, crear, suspender, reactivar);
  });

  it('is_global_admin=true → 200 con lista de clientes', async () => {
    const cliente = makeMockCliente();
    listar.execute.mockResolvedValue([cliente]);

    const response = await controller.listar();

    expect(response).toHaveLength(1);
    expect(response[0].id).toBe(cliente.id);
    expect(response[0].nombre).toBe('Acme Corp');
  });

  it('lista vacía → 200 con array vacío (no 404)', async () => {
    listar.execute.mockResolvedValue([]);

    const response = await controller.listar();

    expect(response).toEqual([]);
  });

  it('cada ítem tiene id, nombre, activo, dbName', async () => {
    const cliente = makeMockCliente();
    listar.execute.mockResolvedValue([cliente]);

    const response = await controller.listar();

    expect(response[0]).toHaveProperty('id');
    expect(response[0]).toHaveProperty('nombre');
    expect(response[0]).toHaveProperty('activo');
    expect(response[0]).toHaveProperty('dbName');
  });

  it('GET / tiene GlobalAdminGuard aplicado (metadata)', () => {
    const GUARDS_METADATA = '__guards__';
    // NestJS almacena guards de método en descriptor.value (el fn mismo), no con propertyKey
    const methodFn = ClientesController.prototype.listar;
    const methodGuards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, methodFn) ?? [];
    const controllerGuards: unknown[] =
      Reflect.getMetadata(GUARDS_METADATA, ClientesController) ?? [];
    const guardIsApplied =
      methodGuards.some((g) => g === GlobalAdminGuard) ||
      controllerGuards.some((g) => g === GlobalAdminGuard);
    expect(guardIsApplied).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /clientes — provisioning con CrearClienteUseCase (T2.4)
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientesController — POST /clientes (T2.4)', () => {
  let controller: ClientesController;
  let listar: vi.Mocked<ListarClientesUseCase>;
  let crear: vi.Mocked<CrearClienteUseCase>;
  let suspender: vi.Mocked<SuspenderClienteUseCase>;
  let reactivar: vi.Mocked<ReactivarClienteUseCase>;

  beforeEach(() => {
    listar = makeMockListar();
    crear = makeMockCrear();
    suspender = makeMockSuspender();
    reactivar = makeMockReactivar();
    controller = new ClientesController(listar, crear, suspender, reactivar);
  });

  it('is_global_admin=true con body válido → 201 con id, nombre, db_name, activo:true', async () => {
    const cliente = makeMockCliente();
    crear.execute.mockResolvedValue(Result.ok(cliente));

    const response = await controller.create({
      nombre: 'Acme Corp',
      razonSocial: null,
      cuit: null,
      adminEmail: 'admin@acme.com',
      adminNombre: 'Admin',
      adminApellido: 'User',
      adminPassword: 'securepass123',
    });

    expect(response.id).toBe(cliente.id);
    expect(response.nombre).toBe('Acme Corp');
    // dbName lo genera el backend (auto-dbname-cliente) — el response lo expone,
    // pero NO se envía en el body del request (ver arriba, sin campo dbName).
    expect(response.dbName).toBe('soporte_acme');
    expect(response.activo).toBe(true);
  });

  it('adminPassword MUST NOT aparecer en la respuesta', async () => {
    const cliente = makeMockCliente();
    crear.execute.mockResolvedValue(Result.ok(cliente));

    const response = await controller.create({
      nombre: 'Acme Corp',
      razonSocial: null,
      cuit: null,
      adminEmail: 'admin@acme.com',
      adminNombre: 'Admin',
      adminApellido: 'User',
      adminPassword: 'securepass123',
    });

    const keys = Object.keys(response);
    expect(keys).not.toContain('adminPassword');
    expect(keys).not.toContain('password');
    expect(keys).not.toContain('passwordHash');
  });

  it('conflicto genérico (ClienteConflictError) → 409 ConflictException', async () => {
    // db_name ya no es input del usuario (auto-dbname-cliente) por lo que no
    // puede colisionar; este test cubre el mapeo genérico Result.fail(ClienteConflictError)
    // → 409 en la capa de controller, por si el use case lo produce por otro motivo.
    crear.execute.mockResolvedValue(Result.fail(new ClienteConflictError('admin@acme.com')));

    await expect(
      controller.create({
        nombre: 'Acme',
        razonSocial: null,
        cuit: null,
        adminEmail: 'admin@acme.com',
        adminNombre: 'Admin',
        adminApellido: 'User',
        adminPassword: 'pass',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('fallo de provisioning (throw) → InternalServerErrorException', async () => {
    crear.execute.mockRejectedValue(new Error('[Provisioning] Error en migración'));

    await expect(
      controller.create({
        nombre: 'Acme',
        razonSocial: null,
        cuit: null,
        adminEmail: 'admin@acme.com',
        adminNombre: 'Admin',
        adminApellido: 'User',
        adminPassword: 'pass',
      }),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('POST / tiene GlobalAdminGuard aplicado (metadata)', () => {
    const GUARDS_METADATA = '__guards__';
    // NestJS almacena guards de método en descriptor.value (el fn mismo), no con propertyKey
    const methodFn = ClientesController.prototype.create;
    const methodGuards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, methodFn) ?? [];
    const controllerGuards: unknown[] =
      Reflect.getMetadata(GUARDS_METADATA, ClientesController) ?? [];
    const hasGlobalAdmin =
      methodGuards.some((g) => g === GlobalAdminGuard) ||
      controllerGuards.some((g) => g === GlobalAdminGuard);
    expect(hasGlobalAdmin).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /clientes/:id y PUT /clientes/:id/reactivar (regresión — no afectados por T2.4/T2.5)
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientesController — suspend/reactivar (regresión)', () => {
  let controller: ClientesController;
  let listar: vi.Mocked<ListarClientesUseCase>;
  let crear: vi.Mocked<CrearClienteUseCase>;
  let suspender: vi.Mocked<SuspenderClienteUseCase>;
  let reactivar: vi.Mocked<ReactivarClienteUseCase>;

  beforeEach(() => {
    listar = makeMockListar();
    crear = makeMockCrear();
    suspender = makeMockSuspender();
    reactivar = makeMockReactivar();
    controller = new ClientesController(listar, crear, suspender, reactivar);
  });

  it('suspend() retorna void (204) cuando exitoso', async () => {
    suspender.execute.mockResolvedValue(Result.ok(undefined));
    const result = await controller.suspend('some-id');
    expect(result).toBeUndefined();
  });

  it('suspend() lanza NotFoundException (404) cuando no existe', async () => {
    suspender.execute.mockResolvedValue(Result.fail(new ClienteNotFoundError('non-existent')));
    await expect(controller.suspend('non-existent')).rejects.toThrow(NotFoundException);
  });

  it('reactivar() retorna void cuando exitoso', async () => {
    reactivar.execute.mockResolvedValue(Result.ok(undefined));
    const result = await controller.reactivar('some-id');
    expect(result).toBeUndefined();
  });

  it('reactivar() lanza NotFoundException (404) cuando no existe', async () => {
    reactivar.execute.mockResolvedValue(Result.fail(new ClienteNotFoundError('non-existent')));
    await expect(controller.reactivar('non-existent')).rejects.toThrow(NotFoundException);
  });

  it('DELETE /:id (suspend) tiene GlobalAdminGuard aplicado (metadata) — CVE hardening', () => {
    const GUARDS_METADATA = '__guards__';
    const methodFn = ClientesController.prototype.suspend;
    const methodGuards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, methodFn) ?? [];
    const controllerGuards: unknown[] =
      Reflect.getMetadata(GUARDS_METADATA, ClientesController) ?? [];
    const hasGlobalAdmin =
      methodGuards.some((g) => g === GlobalAdminGuard) ||
      controllerGuards.some((g) => g === GlobalAdminGuard);
    expect(hasGlobalAdmin).toBe(true);
  });

  it('PUT /:id/reactivar tiene GlobalAdminGuard aplicado (metadata) — CVE hardening', () => {
    const GUARDS_METADATA = '__guards__';
    const methodFn = ClientesController.prototype.reactivar;
    const methodGuards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, methodFn) ?? [];
    const controllerGuards: unknown[] =
      Reflect.getMetadata(GUARDS_METADATA, ClientesController) ?? [];
    const hasGlobalAdmin =
      methodGuards.some((g) => g === GlobalAdminGuard) ||
      controllerGuards.some((g) => g === GlobalAdminGuard);
    expect(hasGlobalAdmin).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T1.3 — Protección JwtAuthGuard (regresión — ya cubierta en PR1)
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientesController — protección JwtAuthGuard (T1.3)', () => {
  it('tiene JwtAuthGuard aplicado a nivel de controlador (metadata)', () => {
    const GUARDS_METADATA = '__guards__';
    const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, ClientesController) ?? [];
    expect(guards.some((g) => g === JwtAuthGuard)).toBe(true);
  });

  it('JwtAuthGuard lanza UnauthorizedException sin header Authorization', () => {
    const mockTokenService = { verifyJwt: vi.fn() };
    const jwtGuard = new JwtAuthGuard(mockTokenService as any);

    const request = { headers: {}, user: null };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(() => jwtGuard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('JwtAuthGuard lanza UnauthorizedException con token expirado/malformado', () => {
    const mockTokenService = { verifyJwt: vi.fn().mockReturnValue(null) };
    const jwtGuard = new JwtAuthGuard(mockTokenService as any);

    const request = { headers: { authorization: 'Bearer expired.token.here' }, user: null };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(() => jwtGuard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('JwtAuthGuard retorna true con token válido', () => {
    const validPayload = {
      sub: 'user-uuid',
      cliente_id: 'c-uuid',
      email: 'u@test.com',
      roles: ['ADMINISTRADOR'],
      permisos: [],
      cliente_nombre: 'Test',
      is_global_admin: false,
    };
    const mockTokenService = { verifyJwt: vi.fn().mockReturnValue(validPayload) };
    const jwtGuard = new JwtAuthGuard(mockTokenService as any);

    const request = { headers: { authorization: 'Bearer valid.token' }, user: null };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const result = jwtGuard.canActivate(ctx);
    expect(result).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CiclosVigentesController (regresión)
// ─────────────────────────────────────────────────────────────────────────────

describe('CiclosVigentesController (regresión)', () => {
  let controller: CiclosVigentesController;
  let crearCiclo: vi.Mocked<CrearCicloVigenteUseCase>;

  beforeEach(() => {
    crearCiclo = makeMockCrearCiclo();
    controller = new CiclosVigentesController(crearCiclo);
  });

  describe('create() — POST /ciclos-vigentes', () => {
    it('retorna el CicloVigenteResponseDto', async () => {
      const ciclo = makeMockCiclo();
      crearCiclo.execute.mockResolvedValue(Result.ok(ciclo));

      const response = await controller.create({
        nombre: 'Ejercicio 2026',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-12-31',
        activo: true,
      });

      expect(response).toMatchObject({ id: ciclo.id, nombre: 'Ejercicio 2026', activo: true });
    });

    it('lanza UnprocessableEntityException (422) en solapamiento', async () => {
      crearCiclo.execute.mockResolvedValue(Result.fail(new CicloVigenteOverlapError()));

      await expect(
        controller.create({
          nombre: 'Overlapping',
          fechaInicio: '2026-06-01',
          fechaFin: '2027-06-30',
          activo: true,
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('el response incluye id, nombre, fechaInicio, fechaFin, activo, deletedAt', async () => {
      const ciclo = makeMockCiclo();
      crearCiclo.execute.mockResolvedValue(Result.ok(ciclo));

      const response = await controller.create({
        nombre: 'Test',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-12-31',
        activo: true,
      });

      expect(response).toHaveProperty('id');
      expect(response).toHaveProperty('nombre');
      expect(response).toHaveProperty('fechaInicio');
      expect(response).toHaveProperty('fechaFin');
      expect(response).toHaveProperty('activo');
      expect(response).toHaveProperty('deletedAt');
    });
  });
});
