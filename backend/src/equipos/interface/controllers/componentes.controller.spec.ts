/**
 * 6.D.1 TEST — Unit tests para ComponentesController.
 *
 * Verifica que el controlador:
 * - Delega a los use cases con los DTOs correctos.
 * - Retorna la respuesta esperada (status codes + shape).
 * - Mapea errores de dominio a HttpException apropiadas.
 * - Aplica la cadena de guards JWT → Roles/Permissions → Tenant.
 * - Aplica el permiso equipo:gestionar en mutaciones.
 *
 * Los use cases son mockeados (sin Prisma ni NestJS DI).
 *
 * Tarea: 6.D.1
 */
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ComponentesController } from './componentes.controller';
import { Result } from '../../../shared/domain/result';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import {
  ComponenteEquipoNoEncontradoError,
  EquipoInformaticoNoEncontradoError,
  TipoComponenteInactivoError,
  TipoComponenteNoEncontradoError,
} from '../../domain/errors/equipos.errors';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { RolesGuard } from '../../../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-001',
    cliente_id: 'cli-abc',
    email: 'soporte@example.com',
    roles: ['SOPORTE_IT'],
    permisos: ['equipo:gestionar'],
    cliente_nombre: 'Test Corp',
    ...overrides,
  };
}

function makeComponente(): ComponenteEquipoEntity {
  return ComponenteEquipoEntity.create({
    equipoId: 'equipo-001',
    tipoComponenteId: 'tipo-cpu-001',
    descripcion: 'Intel Core i7-12700',
    numeroSerie: null,
    capacidad: null,
  });
}

function makeUseCaseMocks() {
  return {
    agregarComponenteUseCase: { execute: vi.fn() },
    eliminarComponenteUseCase: { execute: vi.fn() },
    obtenerComponentesPorEquipoUseCase: { execute: vi.fn() },
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ComponentesController', () => {
  let controller: ComponentesController;
  let mocks: ReturnType<typeof makeUseCaseMocks>;
  let user: JwtPayload;

  beforeEach(() => {
    mocks = makeUseCaseMocks();
    user = makeUser();
    controller = new ComponentesController(
      mocks.agregarComponenteUseCase as any,
      mocks.eliminarComponenteUseCase as any,
      mocks.obtenerComponentesPorEquipoUseCase as any,
    );
  });

  // ─── POST /equipos/:id/componentes ──────────────────────────────────────────

  describe('POST /equipos/:id/componentes (agregarComponente)', () => {
    it('retorna 201 con datos del componente creado', async () => {
      const componente = makeComponente();
      mocks.agregarComponenteUseCase.execute.mockResolvedValue(Result.ok(componente));

      const result = await controller.agregarComponente(
        'equipo-001',
        { tipoComponenteId: 'tipo-cpu-001', descripcion: 'Intel Core i7-12700' },
        user,
      );

      expect(result).toMatchObject({
        equipoId: 'equipo-001',
        tipoComponenteId: 'tipo-cpu-001',
        descripcion: 'Intel Core i7-12700',
      });
    });

    it('delega al use case con los datos del dto', async () => {
      const componente = makeComponente();
      mocks.agregarComponenteUseCase.execute.mockResolvedValue(Result.ok(componente));
      const dto = {
        tipoComponenteId: 'tipo-ram-001',
        descripcion: null,
        numeroSerie: null,
        capacidad: '16GB DDR4',
      };

      await controller.agregarComponente('equipo-001', dto, user);

      expect(mocks.agregarComponenteUseCase.execute).toHaveBeenCalledWith({
        equipoId: 'equipo-001',
        tipoComponenteId: 'tipo-ram-001',
        descripcion: null,
        numeroSerie: null,
        capacidad: '16GB DDR4',
      });
    });

    it('lanza NotFoundException cuando el equipo no existe', async () => {
      mocks.agregarComponenteUseCase.execute.mockResolvedValue(
        Result.fail(new EquipoInformaticoNoEncontradoError('eq-x')),
      );

      await expect(
        controller.agregarComponente('eq-x', { tipoComponenteId: 'tipo-001' }, user),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException cuando el tipo de componente no existe (404)', async () => {
      mocks.agregarComponenteUseCase.execute.mockResolvedValue(
        Result.fail(new TipoComponenteNoEncontradoError('tipo-x')),
      );

      await expect(
        controller.agregarComponente('eq-001', { tipoComponenteId: 'tipo-x' }, user),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza UnprocessableEntityException cuando el tipo de componente está inactivo (422)', async () => {
      mocks.agregarComponenteUseCase.execute.mockResolvedValue(
        Result.fail(new TipoComponenteInactivoError('tipo-inactivo-001')),
      );

      await expect(
        controller.agregarComponente('eq-001', { tipoComponenteId: 'tipo-inactivo-001' }, user),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  // ─── DELETE /componentes/:id ────────────────────────────────────────────────

  describe('DELETE /componentes/:id (eliminarComponente)', () => {
    it('retorna 204 (void) cuando la eliminación es exitosa', async () => {
      mocks.eliminarComponenteUseCase.execute.mockResolvedValue(Result.ok(undefined));

      const result = await controller.eliminarComponente('comp-001', user);

      expect(result).toBeUndefined();
      expect(mocks.eliminarComponenteUseCase.execute).toHaveBeenCalledWith({
        componenteId: 'comp-001',
      });
    });

    it('lanza NotFoundException cuando el componente no existe o fue eliminado', async () => {
      mocks.eliminarComponenteUseCase.execute.mockResolvedValue(
        Result.fail(new ComponenteEquipoNoEncontradoError('comp-x')),
      );

      await expect(controller.eliminarComponente('comp-x', user)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── GET /equipos/:id/componentes ───────────────────────────────────────────

  describe('GET /equipos/:id/componentes (obtenerComponentesPorEquipo)', () => {
    it('retorna 200 con lista de componentes del equipo', async () => {
      const componentes = [makeComponente(), makeComponente()];
      mocks.obtenerComponentesPorEquipoUseCase.execute.mockResolvedValue(Result.ok(componentes));

      const result = await controller.obtenerComponentesPorEquipo('equipo-001', user);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(mocks.obtenerComponentesPorEquipoUseCase.execute).toHaveBeenCalledWith('equipo-001');
    });

    it('lanza NotFoundException cuando el equipo no existe', async () => {
      mocks.obtenerComponentesPorEquipoUseCase.execute.mockResolvedValue(
        Result.fail(new EquipoInformaticoNoEncontradoError('eq-x')),
      );

      await expect(controller.obtenerComponentesPorEquipo('eq-x', user)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('retorna lista vacía cuando el equipo existe pero no tiene componentes', async () => {
      mocks.obtenerComponentesPorEquipoUseCase.execute.mockResolvedValue(Result.ok([]));

      const result = await controller.obtenerComponentesPorEquipo('equipo-001', user);

      expect(result).toHaveLength(0);
    });
  });

  // ─── Guard chain (via Reflect metadata) ────────────────────────────────────

  describe('Guard chain', () => {
    it('aplica JwtAuthGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ComponentesController) ?? [];
      expect(guards).toContain(JwtAuthGuard);
    });

    it('aplica TenantGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ComponentesController) ?? [];
      expect(guards).toContain(TenantGuard);
    });

    it('aplica RolesGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ComponentesController) ?? [];
      expect(guards).toContain(RolesGuard);
    });

    it('aplica PermissionsGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', ComponentesController) ?? [];
      expect(guards).toContain(PermissionsGuard);
    });

    it('requiere permiso equipo:gestionar en agregarComponente', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, ComponentesController.prototype.agregarComponente) ??
        [];
      expect(perms).toContain('equipo:gestionar');
    });

    it('requiere permiso equipo:gestionar en eliminarComponente', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, ComponentesController.prototype.eliminarComponente) ??
        [];
      expect(perms).toContain('equipo:gestionar');
    });
  });
});
