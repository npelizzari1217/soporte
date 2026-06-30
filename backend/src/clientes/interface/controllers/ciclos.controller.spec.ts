/**
 * T2.14 [RED] — Tests integración CiclosController (tenant-level).
 *
 * Rutas cubiertas:
 *   GET    /ciclos               → ListarCiclosUseCase
 *   POST   /ciclos               → CrearCicloTenantUseCase
 *   PATCH  /ciclos/:id/activar   → ActivarCicloUseCase
 *
 * Guards:
 *   Controller level: JwtAuthGuard, TenantGuard
 *   Method level:     PermissionsGuard + @RequirePermissions('ciclo:gestionar')
 *
 * Spec ref: clientes-tenancy/GET /ciclos, POST /ciclos, PATCH /ciclos/:id/activar
 * Tarea: T2.14
 */
import {
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CiclosController } from './ciclos.controller';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../auth/infrastructure/guards/decorators';
import { ListarCiclosUseCase } from '../../application/use-cases/listar-ciclos.use-case';
import { CrearCicloTenantUseCase } from '../../application/use-cases/crear-ciclo-tenant.use-case';
import { ActivarCicloUseCase } from '../../application/use-cases/activar-ciclo.use-case';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { Result } from '../../../shared/domain/result';
import {
  CicloVigenteOverlapError,
  CicloVigenteInvalidDatesError,
} from '../../domain/errors/clientes.errors';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeCiclo(overrides?: Partial<{ activo: boolean; nombre: string }>): CicloClienteEntity {
  return CicloClienteEntity.create({
    nombre: overrides?.nombre ?? 'Ejercicio 2026',
    fechaInicio: new Date('2026-01-01'),
    fechaFin: new Date('2026-12-31'),
    activo: overrides?.activo ?? false,
  });
}

function makeMockListar(): vi.Mocked<ListarCiclosUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<ListarCiclosUseCase>;
}
function makeMockCrear(): vi.Mocked<CrearCicloTenantUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<CrearCicloTenantUseCase>;
}
function makeMockActivar(): vi.Mocked<ActivarCicloUseCase> {
  return { execute: vi.fn() } as unknown as vi.Mocked<ActivarCicloUseCase>;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /ciclos
// ─────────────────────────────────────────────────────────────────────────────

describe('CiclosController — GET /ciclos (T2.14)', () => {
  let controller: CiclosController;
  let listar: vi.Mocked<ListarCiclosUseCase>;
  let crear: vi.Mocked<CrearCicloTenantUseCase>;
  let activar: vi.Mocked<ActivarCicloUseCase>;

  beforeEach(() => {
    listar = makeMockListar();
    crear = makeMockCrear();
    activar = makeMockActivar();
    controller = new CiclosController(listar, crear, activar);
  });

  it('ADMINISTRADOR → 200 con ciclos del tenant resuelto', async () => {
    const ciclo = makeCiclo();
    listar.execute.mockResolvedValue([ciclo]);

    const response = await controller.listar();

    expect(response).toHaveLength(1);
    expect(response[0].id).toBe(ciclo.id);
    expect(response[0].nombre).toBe('Ejercicio 2026');
  });

  it('sin ciclos → 200 con array vacío (no 404)', async () => {
    listar.execute.mockResolvedValue([]);

    const response = await controller.listar();

    expect(response).toEqual([]);
  });

  it('cada ítem incluye id, nombre, fechaInicio, fechaFin, activo', async () => {
    const ciclo = makeCiclo();
    listar.execute.mockResolvedValue([ciclo]);

    const response = await controller.listar();

    expect(response[0]).toHaveProperty('id');
    expect(response[0]).toHaveProperty('nombre');
    expect(response[0]).toHaveProperty('fechaInicio');
    expect(response[0]).toHaveProperty('fechaFin');
    expect(response[0]).toHaveProperty('activo');
  });

  it('cada ítem no incluye cicloVigenteId (soft-ref interno)', async () => {
    const ciclo = makeCiclo();
    listar.execute.mockResolvedValue([ciclo]);

    const response = await controller.listar();

    expect(response[0]).not.toHaveProperty('cicloVigenteId');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /ciclos
// ─────────────────────────────────────────────────────────────────────────────

describe('CiclosController — POST /ciclos (T2.14)', () => {
  let controller: CiclosController;
  let listar: vi.Mocked<ListarCiclosUseCase>;
  let crear: vi.Mocked<CrearCicloTenantUseCase>;
  let activar: vi.Mocked<ActivarCicloUseCase>;

  beforeEach(() => {
    listar = makeMockListar();
    crear = makeMockCrear();
    activar = makeMockActivar();
    controller = new CiclosController(listar, crear, activar);
  });

  it('body válido → 201 con activo=false por defecto, incluye id', async () => {
    const ciclo = makeCiclo({ activo: false });
    crear.execute.mockResolvedValue(Result.ok(ciclo));

    const response = await controller.create({
      nombre: 'Ejercicio 2026',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-12-31',
    });

    expect(response.id).toBeTruthy();
    expect(response.activo).toBe(false);
    expect(response.nombre).toBe('Ejercicio 2026');
  });

  it('fechas solapadas con ciclo activo → 422 UnprocessableEntityException', async () => {
    crear.execute.mockResolvedValue(Result.fail(new CicloVigenteOverlapError()));

    await expect(
      controller.create({
        nombre: 'Solapado',
        fechaInicio: '2026-06-01',
        fechaFin: '2027-06-30',
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('fecha_fin < fecha_inicio → 400 BadRequestException', async () => {
    crear.execute.mockResolvedValue(Result.fail(new CicloVigenteInvalidDatesError()));

    await expect(
      controller.create({
        nombre: 'Inválido',
        fechaInicio: '2026-12-31',
        fechaFin: '2026-01-01',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('response NO incluye cicloVigenteId', async () => {
    const ciclo = makeCiclo();
    crear.execute.mockResolvedValue(Result.ok(ciclo));

    const response = await controller.create({
      nombre: 'Ejercicio 2026',
      fechaInicio: '2026-01-01',
      fechaFin: '2026-12-31',
    });

    expect(response).not.toHaveProperty('cicloVigenteId');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /ciclos/:id/activar
// ─────────────────────────────────────────────────────────────────────────────

describe('CiclosController — PATCH /ciclos/:id/activar (T2.14)', () => {
  let controller: CiclosController;
  let listar: vi.Mocked<ListarCiclosUseCase>;
  let crear: vi.Mocked<CrearCicloTenantUseCase>;
  let activar: vi.Mocked<ActivarCicloUseCase>;

  beforeEach(() => {
    listar = makeMockListar();
    crear = makeMockCrear();
    activar = makeMockActivar();
    controller = new CiclosController(listar, crear, activar);
  });

  it('ADMINISTRADOR → 200 con ciclo activo=true en respuesta', async () => {
    const ciclo = makeCiclo({ activo: true });
    activar.execute.mockResolvedValue(ciclo);

    const response = await controller.activar(ciclo.id);

    expect(response.id).toBe(ciclo.id);
    expect(response.activo).toBe(true);
  });

  it('ciclo inexistente → NotFoundException (re-lanzada del use case)', async () => {
    activar.execute.mockRejectedValue(new NotFoundException('Ciclo no encontrado'));

    await expect(controller.activar('id-que-no-existe')).rejects.toThrow(NotFoundException);
  });

  it('ciclo de otro tenant → NotFoundException (TenantContext aísla la query)', async () => {
    // TenantContext garantiza que findById busca en el tenant activo.
    // Si el ciclo es de otro tenant → findById retorna null → NotFoundException.
    activar.execute.mockRejectedValue(new NotFoundException('Ciclo no encontrado en este tenant'));

    await expect(controller.activar('ciclo-otro-tenant')).rejects.toThrow(NotFoundException);
  });

  it('operador via X-Tenant-Id → 200 (TenantGuard resolvió el tenant correcto)', async () => {
    const ciclo = makeCiclo({ activo: true });
    activar.execute.mockResolvedValue(ciclo);

    // No lanza excepción: TenantGuard ya resolvió el tenant objetivo
    await expect(controller.activar(ciclo.id)).resolves.toMatchObject({ activo: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Guard metadata
// ─────────────────────────────────────────────────────────────────────────────

describe('CiclosController — Guard metadata (T2.14)', () => {
  const GUARDS_KEY = '__guards__';

  it('JwtAuthGuard está aplicado a nivel de controlador', () => {
    const guards: unknown[] = Reflect.getMetadata(GUARDS_KEY, CiclosController) ?? [];
    expect(guards.some((g) => g === JwtAuthGuard)).toBe(true);
  });

  it('TenantGuard está aplicado a nivel de controlador', () => {
    const guards: unknown[] = Reflect.getMetadata(GUARDS_KEY, CiclosController) ?? [];
    expect(guards.some((g) => g === TenantGuard)).toBe(true);
  });

  it('PermissionsGuard está aplicado en listar() (método GET)', () => {
    const methodFn = CiclosController.prototype.listar;
    const guards: unknown[] = Reflect.getMetadata(GUARDS_KEY, methodFn) ?? [];
    expect(guards.some((g) => g === PermissionsGuard)).toBe(true);
  });

  it('PermissionsGuard está aplicado en create() (método POST)', () => {
    const methodFn = CiclosController.prototype.create;
    const guards: unknown[] = Reflect.getMetadata(GUARDS_KEY, methodFn) ?? [];
    expect(guards.some((g) => g === PermissionsGuard)).toBe(true);
  });

  it('PermissionsGuard está aplicado en activar() (método PATCH)', () => {
    const methodFn = CiclosController.prototype.activar;
    const guards: unknown[] = Reflect.getMetadata(GUARDS_KEY, methodFn) ?? [];
    expect(guards.some((g) => g === PermissionsGuard)).toBe(true);
  });

  it('listar() requiere permiso ciclo:gestionar', () => {
    const methodFn = CiclosController.prototype.listar;
    const perms: string[] = Reflect.getMetadata(PERMISSIONS_KEY, methodFn) ?? [];
    expect(perms).toContain('ciclo:gestionar');
  });

  it('create() requiere permiso ciclo:gestionar', () => {
    const methodFn = CiclosController.prototype.create;
    const perms: string[] = Reflect.getMetadata(PERMISSIONS_KEY, methodFn) ?? [];
    expect(perms).toContain('ciclo:gestionar');
  });

  it('activar() requiere permiso ciclo:gestionar', () => {
    const methodFn = CiclosController.prototype.activar;
    const perms: string[] = Reflect.getMetadata(PERMISSIONS_KEY, methodFn) ?? [];
    expect(perms).toContain('ciclo:gestionar');
  });
});
