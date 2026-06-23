/**
 * 6.D.1 TEST — Unit tests para EquiposController.
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
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { EquiposController } from './equipos.controller';
import { Result } from '../../../shared/domain/result';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import {
  AsignadoEquipoInvalidoError,
  EquipoInformaticoNoEncontradoError,
  NumeroSerieEquipoDuplicadoError,
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
    ...overrides,
  };
}

function makeEquipo(): EquipoInformaticoEntity {
  return EquipoInformaticoEntity.create({
    nombre: 'PC Contabilidad 03',
    numeroSerie: 'SN-DELL-001',
    marca: 'Dell',
    modelo: 'OptiPlex 7090',
    fechaAdquisicion: null,
    ubicacionId: null,
    asignadoAId: null,
    activo: true,
  });
}

function makeUseCaseMocks() {
  return {
    crearEquipoUseCase: { execute: jest.fn() },
    editarEquipoUseCase: { execute: jest.fn() },
    eliminarEquipoUseCase: { execute: jest.fn() },
    asignarEquipoUseCase: { execute: jest.fn() },
    obtenerEquipoUseCase: { execute: jest.fn() },
    listarEquiposUseCase: { execute: jest.fn() },
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('EquiposController', () => {
  let controller: EquiposController;
  let mocks: ReturnType<typeof makeUseCaseMocks>;
  let user: JwtPayload;

  beforeEach(() => {
    mocks = makeUseCaseMocks();
    user = makeUser();
    controller = new EquiposController(
      mocks.crearEquipoUseCase as any,
      mocks.editarEquipoUseCase as any,
      mocks.eliminarEquipoUseCase as any,
      mocks.asignarEquipoUseCase as any,
      mocks.obtenerEquipoUseCase as any,
      mocks.listarEquiposUseCase as any,
    );
  });

  // ─── POST /equipos ──────────────────────────────────────────────────────────

  describe('POST /equipos (crearEquipo)', () => {
    it('retorna 201 con datos del equipo creado', async () => {
      const equipo = makeEquipo();
      mocks.crearEquipoUseCase.execute.mockResolvedValue(Result.ok(equipo));

      const result = await controller.crearEquipo(
        { nombre: 'PC Contabilidad 03', numeroSerie: 'SN-DELL-001', marca: 'Dell' },
        user,
      );

      expect(result).toMatchObject({
        nombre: 'PC Contabilidad 03',
        numeroSerie: 'SN-DELL-001',
        marca: 'Dell',
        activo: true,
      });
    });

    it('delega al use case con los datos del dto', async () => {
      const equipo = makeEquipo();
      mocks.crearEquipoUseCase.execute.mockResolvedValue(Result.ok(equipo));
      const dto = { nombre: 'Laptop Dev', numeroSerie: null, marca: 'HP' };

      await controller.crearEquipo(dto, user);

      expect(mocks.crearEquipoUseCase.execute).toHaveBeenCalledWith({
        nombre: 'Laptop Dev',
        numeroSerie: null,
        marca: 'HP',
        modelo: null,
        fechaAdquisicion: null,
        ubicacionId: null,
      });
    });

    it('lanza ConflictException cuando numero_serie ya existe', async () => {
      mocks.crearEquipoUseCase.execute.mockResolvedValue(
        Result.fail(new NumeroSerieEquipoDuplicadoError('SN-DELL-001')),
      );

      await expect(
        controller.crearEquipo({ nombre: 'PC duplicado', numeroSerie: 'SN-DELL-001' }, user),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── PATCH /equipos/:id ─────────────────────────────────────────────────────

  describe('PATCH /equipos/:id (editarEquipo)', () => {
    it('retorna 200 con datos actualizados', async () => {
      const equipo = makeEquipo();
      mocks.editarEquipoUseCase.execute.mockResolvedValue(Result.ok(equipo));

      const result = await controller.editarEquipo(
        equipo.id,
        { nombre: 'PC Contabilidad 03 Updated' },
        user,
      );

      expect(result).toMatchObject({ nombre: 'PC Contabilidad 03' });
    });

    it('lanza NotFoundException cuando el equipo no existe', async () => {
      mocks.editarEquipoUseCase.execute.mockResolvedValue(
        Result.fail(new EquipoInformaticoNoEncontradoError('eq-x')),
      );

      await expect(controller.editarEquipo('eq-x', { nombre: 'No existe' }, user)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza ConflictException cuando el nuevo numero_serie ya lo usa otro equipo', async () => {
      mocks.editarEquipoUseCase.execute.mockResolvedValue(
        Result.fail(new NumeroSerieEquipoDuplicadoError('SN-DELL-999')),
      );

      await expect(
        controller.editarEquipo('eq-001', { nombre: 'PC', numeroSerie: 'SN-DELL-999' }, user),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── DELETE /equipos/:id ────────────────────────────────────────────────────

  describe('DELETE /equipos/:id (eliminarEquipo)', () => {
    it('retorna 204 (void) cuando la eliminación es exitosa', async () => {
      mocks.eliminarEquipoUseCase.execute.mockResolvedValue(Result.ok(undefined));

      const result = await controller.eliminarEquipo('eq-001', user);

      expect(result).toBeUndefined();
      expect(mocks.eliminarEquipoUseCase.execute).toHaveBeenCalledWith({
        equipoId: 'eq-001',
      });
    });

    it('lanza NotFoundException cuando el equipo no existe', async () => {
      mocks.eliminarEquipoUseCase.execute.mockResolvedValue(
        Result.fail(new EquipoInformaticoNoEncontradoError('eq-x')),
      );

      await expect(controller.eliminarEquipo('eq-x', user)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── POST /equipos/:id/asignar ──────────────────────────────────────────────

  describe('POST /equipos/:id/asignar (asignarEquipo)', () => {
    it('retorna 200 con equipo actualizado', async () => {
      const equipo = makeEquipo();
      mocks.asignarEquipoUseCase.execute.mockResolvedValue(Result.ok(equipo));

      const result = await controller.asignarEquipo(equipo.id, { asignadoAId: 'user-002' }, user);

      expect(result).toMatchObject({ activo: true });
      expect(mocks.asignarEquipoUseCase.execute).toHaveBeenCalledWith({
        equipoId: equipo.id,
        asignadoAId: 'user-002',
        clienteId: user.cliente_id,
      });
    });

    it('lanza NotFoundException cuando el equipo no existe', async () => {
      mocks.asignarEquipoUseCase.execute.mockResolvedValue(
        Result.fail(new EquipoInformaticoNoEncontradoError('eq-x')),
      );

      await expect(
        controller.asignarEquipo('eq-x', { asignadoAId: 'user-002' }, user),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza UnprocessableEntityException cuando el asignado no es usuario activo del tenant', async () => {
      mocks.asignarEquipoUseCase.execute.mockResolvedValue(
        Result.fail(new AsignadoEquipoInvalidoError('user-x')),
      );

      await expect(
        controller.asignarEquipo('eq-001', { asignadoAId: 'user-x' }, user),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  // ─── GET /equipos/:id ───────────────────────────────────────────────────────

  describe('GET /equipos/:id (obtenerEquipo)', () => {
    it('retorna 200 con los datos del equipo', async () => {
      const equipo = makeEquipo();
      mocks.obtenerEquipoUseCase.execute.mockResolvedValue(Result.ok(equipo));

      const result = await controller.obtenerEquipo(equipo.id, user);

      expect(result).toMatchObject({ nombre: 'PC Contabilidad 03' });
      expect(mocks.obtenerEquipoUseCase.execute).toHaveBeenCalledWith(equipo.id);
    });

    it('lanza NotFoundException cuando el equipo no existe o fue eliminado', async () => {
      mocks.obtenerEquipoUseCase.execute.mockResolvedValue(
        Result.fail(new EquipoInformaticoNoEncontradoError('eq-x')),
      );

      await expect(controller.obtenerEquipo('eq-x', user)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── GET /equipos ───────────────────────────────────────────────────────────

  describe('GET /equipos (listarEquipos)', () => {
    it('retorna 200 con lista de equipos activos', async () => {
      const equipos = [makeEquipo(), makeEquipo()];
      mocks.listarEquiposUseCase.execute.mockResolvedValue(Result.ok(equipos));

      const result = await controller.listarEquipos(user);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });

    it('retorna lista vacía cuando no hay equipos activos', async () => {
      mocks.listarEquiposUseCase.execute.mockResolvedValue(Result.ok([]));

      const result = await controller.listarEquipos(user);

      expect(result).toHaveLength(0);
    });
  });

  // ─── Guard chain (via Reflect metadata) ────────────────────────────────────

  describe('Guard chain', () => {
    it('aplica JwtAuthGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', EquiposController) ?? [];
      expect(guards).toContain(JwtAuthGuard);
    });

    it('aplica TenantGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', EquiposController) ?? [];
      expect(guards).toContain(TenantGuard);
    });

    it('aplica RolesGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', EquiposController) ?? [];
      expect(guards).toContain(RolesGuard);
    });

    it('aplica PermissionsGuard al nivel de clase', () => {
      const guards: unknown[] = Reflect.getMetadata('__guards__', EquiposController) ?? [];
      expect(guards).toContain(PermissionsGuard);
    });

    it('requiere permiso equipo:gestionar en crearEquipo', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, EquiposController.prototype.crearEquipo) ?? [];
      expect(perms).toContain('equipo:gestionar');
    });

    it('requiere permiso equipo:gestionar en editarEquipo', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, EquiposController.prototype.editarEquipo) ?? [];
      expect(perms).toContain('equipo:gestionar');
    });

    it('requiere permiso equipo:gestionar en eliminarEquipo', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, EquiposController.prototype.eliminarEquipo) ?? [];
      expect(perms).toContain('equipo:gestionar');
    });

    it('requiere permiso equipo:gestionar en asignarEquipo', () => {
      const perms: string[] =
        Reflect.getMetadata(PERMISSIONS_KEY, EquiposController.prototype.asignarEquipo) ?? [];
      expect(perms).toContain('equipo:gestionar');
    });
  });
});
