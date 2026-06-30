/**
 * 1.D.1 TEST — Unit tests de ClientesController + CiclosVigentesController
 *             (RED → GREEN con 1.D.2)
 *
 * Estrategia: instanciación directa del controller con use cases mockeados.
 * No requiere @nestjs/testing — los controllers son clases TypeScript normales.
 *
 * Cubre ClientesController:
 * - POST /clientes → body del cliente + status 201
 * - POST /clientes → 409 ConflictException si db_name ya existe
 * - DELETE /clientes/:id → void (suspensión exitosa)
 * - DELETE /clientes/:id → 404 NotFoundException si no existe
 * - PUT /clientes/:id/reactivar → void + 200
 * - PUT /clientes/:id/reactivar → 404 si no existe
 * - Shape correcta del ClienteResponseDto
 *
 * Cubre CiclosVigentesController:
 * - POST /ciclos-vigentes → body del ciclo
 * - POST /ciclos-vigentes → 422 UnprocessableEntityException en solapamiento
 * - Shape correcta del CicloVigenteResponseDto
 *
 * T1.3 — Tests de protección JwtAuthGuard en ClientesController (RED → GREEN con T1.4)
 * Spec ref: auth-rbac/ClientesController protegido
 */
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientesController } from './clientes.controller';
import { CiclosVigentesController } from './ciclos-vigentes.controller';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { RegistrarClienteUseCase } from '../../application/use-cases/registrar-cliente.use-case';
import { SuspenderClienteUseCase } from '../../application/use-cases/suspender-cliente.use-case';
import { ReactivarClienteUseCase } from '../../application/use-cases/reactivar-cliente.use-case';
import { CrearCicloVigenteUseCase } from '../../application/use-cases/crear-ciclo-vigente.use-case';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import { Result } from '../../../shared/domain/result';
import {
  ClienteConflictError,
  ClienteNotFoundError,
  CicloVigenteOverlapError,
} from '../../domain/errors/clientes.errors';

// ─── Factories de entidades mock ──────────────────────────────────────────────

function makeMockCliente(): ClienteEntity {
  return ClienteEntity.create({
    nombre: 'Acme Corp',
    razonSocial: 'Acme S.A.',
    cuit: '20123456789',
    dbName: 'soporte_acme',
    activo: true,
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

function makeMockRegistrar(): vi.Mocked<RegistrarClienteUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<RegistrarClienteUseCase>;
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
// ClientesController
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientesController', () => {
  let controller: ClientesController;
  let registrar: vi.Mocked<RegistrarClienteUseCase>;
  let suspender: vi.Mocked<SuspenderClienteUseCase>;
  let reactivar: vi.Mocked<ReactivarClienteUseCase>;

  beforeEach(() => {
    registrar = makeMockRegistrar();
    suspender = makeMockSuspender();
    reactivar = makeMockReactivar();
    controller = new ClientesController(registrar, suspender, reactivar);
  });

  describe('create() — POST /clientes', () => {
    it('retorna el ClienteResponseDto con los datos del cliente', async () => {
      const cliente = makeMockCliente();
      registrar.execute.mockResolvedValue(Result.ok(cliente));

      const response = await controller.create({
        nombre: 'Acme Corp',
        razonSocial: 'Acme S.A.',
        cuit: '20123456789',
        dbName: 'soporte_acme',
      });

      expect(response).toMatchObject({
        id: cliente.id,
        nombre: 'Acme Corp',
        razonSocial: 'Acme S.A.',
        cuit: '20123456789',
        dbName: 'soporte_acme',
        activo: true,
      });
    });

    it('lanza ConflictException (409) cuando db_name ya existe', async () => {
      registrar.execute.mockResolvedValue(Result.fail(new ClienteConflictError('soporte_acme')));

      await expect(
        controller.create({ nombre: 'X', razonSocial: null, cuit: null, dbName: 'soporte_acme' }),
      ).rejects.toThrow(ConflictException);
    });

    it('el response incluye id, nombre, razonSocial, cuit, dbName, activo, deletedAt', async () => {
      const cliente = makeMockCliente();
      registrar.execute.mockResolvedValue(Result.ok(cliente));

      const response = await controller.create({
        nombre: 'X',
        razonSocial: null,
        cuit: null,
        dbName: 'x_db',
      });

      expect(response).toHaveProperty('id');
      expect(response).toHaveProperty('nombre');
      expect(response).toHaveProperty('razonSocial');
      expect(response).toHaveProperty('cuit');
      expect(response).toHaveProperty('dbName');
      expect(response).toHaveProperty('activo');
      expect(response).toHaveProperty('deletedAt');
    });
  });

  describe('suspend() — DELETE /clientes/:id', () => {
    it('retorna void (204) cuando suspensión exitosa', async () => {
      suspender.execute.mockResolvedValue(Result.ok(undefined));
      const result = await controller.suspend('some-id');
      expect(result).toBeUndefined();
    });

    it('lanza NotFoundException (404) cuando el cliente no existe', async () => {
      suspender.execute.mockResolvedValue(Result.fail(new ClienteNotFoundError('non-existent')));
      await expect(controller.suspend('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reactivar() — PUT /clientes/:id/reactivar', () => {
    it('retorna void cuando reactivación exitosa', async () => {
      reactivar.execute.mockResolvedValue(Result.ok(undefined));
      const result = await controller.reactivar('some-id');
      expect(result).toBeUndefined();
    });

    it('lanza NotFoundException (404) cuando el cliente no existe', async () => {
      reactivar.execute.mockResolvedValue(Result.fail(new ClienteNotFoundError('non-existent')));
      await expect(controller.reactivar('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T1.3 — ClientesController protegido con JwtAuthGuard
// ─────────────────────────────────────────────────────────────────────────────

describe('ClientesController — protección JwtAuthGuard (T1.3)', () => {
  /**
   * Verifica a nivel de metadatos que JwtAuthGuard está aplicado en el controlador.
   * Falla en RED porque @UseGuards no está en el controlador aún.
   * Pasa en GREEN (T1.4) cuando se agrega @UseGuards(JwtAuthGuard).
   *
   * Invariante: guards sin auth deben rechazar con 401 (lo verifica JwtAuthGuard directamente).
   */
  it('tiene JwtAuthGuard aplicado a nivel de controlador (metadata)', () => {
    const GUARDS_METADATA = '__guards__';
    const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, ClientesController) ?? [];
    expect(guards.some((g) => g === JwtAuthGuard)).toBe(true);
  });

  it('JwtAuthGuard lanza UnauthorizedException sin header Authorization (simula GET /clientes sin token)', () => {
    // Verifica el comportamiento del guard que protegerá el controlador
    const mockTokenService = { verifyJwt: vi.fn() };
    const jwtGuard = new JwtAuthGuard(mockTokenService as any);

    const request = { headers: {}, user: null };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(() => jwtGuard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('JwtAuthGuard lanza UnauthorizedException con token expirado/malformado (simula POST /clientes)', () => {
    const mockTokenService = { verifyJwt: vi.fn().mockReturnValue(null) };
    const jwtGuard = new JwtAuthGuard(mockTokenService as any);

    const request = { headers: { authorization: 'Bearer expired.token.here' }, user: null };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(() => jwtGuard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('JwtAuthGuard retorna true con token válido (permite acceso a guards subsiguientes)', () => {
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
// CiclosVigentesController
// ─────────────────────────────────────────────────────────────────────────────

describe('CiclosVigentesController', () => {
  let controller: CiclosVigentesController;
  let crearCiclo: vi.Mocked<CrearCicloVigenteUseCase>;

  beforeEach(() => {
    crearCiclo = makeMockCrearCiclo();
    controller = new CiclosVigentesController(crearCiclo);
  });

  describe('create() — POST /ciclos-vigentes', () => {
    it('retorna el CicloVigenteResponseDto con los datos del ciclo', async () => {
      const ciclo = makeMockCiclo();
      crearCiclo.execute.mockResolvedValue(Result.ok(ciclo));

      const response = await controller.create({
        nombre: 'Ejercicio 2026',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-12-31',
        activo: true,
      });

      expect(response).toMatchObject({
        id: ciclo.id,
        nombre: 'Ejercicio 2026',
        activo: true,
      });
    });

    it('lanza UnprocessableEntityException (422) en solapamiento de fechas', async () => {
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
