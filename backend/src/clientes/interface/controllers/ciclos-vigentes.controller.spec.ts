/**
 * ciclos-vigentes.controller.spec.ts — TDD RED→GREEN (T9.3, PR9).
 *
 * Unit test: instancia el controller directamente con el use case mockeado
 * (sin bootstrapear NestJS ni pasar por guards) — verifica traducción
 * HTTP ↔ use case y mapeo Result.fail → HttpException.
 */
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CicloVigenteController } from './ciclos-vigentes.controller';
import { Result } from '../../../shared/domain/result';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import {
  CicloVigenteInvalidDatesError,
  CicloVigenteNotFoundError,
} from '../../domain/errors/clientes.errors';

describe('CicloVigenteController (T9.3, item 4/G6, sdd/ciclos-abm-root)', () => {
  function buildController() {
    const crearCicloVigenteUseCase = { execute: vi.fn() };
    const listarCiclosVigentesUseCase = { execute: vi.fn() };
    const editarCicloVigenteUseCase = { execute: vi.fn() };
    const eliminarCicloVigenteUseCase = { execute: vi.fn() };
    const listarCiclosVigentesAdminUseCase = { execute: vi.fn() };
    const controller = new CicloVigenteController(
      crearCicloVigenteUseCase as any,
      listarCiclosVigentesUseCase as any,
      editarCicloVigenteUseCase as any,
      eliminarCicloVigenteUseCase as any,
      listarCiclosVigentesAdminUseCase as any,
    );
    return {
      controller,
      crearCicloVigenteUseCase,
      listarCiclosVigentesUseCase,
      editarCicloVigenteUseCase,
      eliminarCicloVigenteUseCase,
      listarCiclosVigentesAdminUseCase,
    };
  }

  describe('POST /ciclos-vigentes', () => {
    it('crea el ciclo y retorna 201 con el DTO de respuesta', async () => {
      const { controller, crearCicloVigenteUseCase } = buildController();
      const ciclo = CicloVigenteEntity.create({
        nombre: 'Ciclo 2026',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      });
      crearCicloVigenteUseCase.execute.mockResolvedValue(Result.ok(ciclo));

      const result = await controller.create({
        nombre: 'Ciclo 2026',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-12-31',
      } as any);

      expect(result).toEqual({
        id: ciclo.id,
        nombre: 'Ciclo 2026',
        fechaInicio: '2026-01-01',
        fechaFin: '2026-12-31',
        activo: true,
      });
      expect(crearCicloVigenteUseCase.execute).toHaveBeenCalledWith({
        nombre: 'Ciclo 2026',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
      });
    });

    it('propaga 422 UnprocessableEntityException cuando el use case falla', async () => {
      const { controller, crearCicloVigenteUseCase } = buildController();
      crearCicloVigenteUseCase.execute.mockResolvedValue(
        Result.fail(new CicloVigenteInvalidDatesError()),
      );

      await expect(
        controller.create({
          nombre: 'Ciclo inválido',
          fechaInicio: '2026-12-31',
          fechaFin: '2026-01-01',
        } as any),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('GET /ciclos-vigentes (item 4/G6)', () => {
    it('lista los ciclos activos mapeados al DTO de respuesta', async () => {
      const { controller, listarCiclosVigentesUseCase } = buildController();
      const ciclo = CicloVigenteEntity.create({
        nombre: 'Ciclo 2026',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      });
      listarCiclosVigentesUseCase.execute.mockResolvedValue([ciclo]);

      const result = await controller.listar();

      expect(result).toEqual([
        {
          id: ciclo.id,
          nombre: 'Ciclo 2026',
          fechaInicio: '2026-01-01',
          fechaFin: '2026-12-31',
          activo: true,
        },
      ]);
    });
  });

  describe('PATCH /ciclos-vigentes/:id (sdd/ciclos-abm-root, ROOT-only)', () => {
    it('edita el ciclo y retorna el DTO de respuesta', async () => {
      const { controller, editarCicloVigenteUseCase } = buildController();
      const ciclo = CicloVigenteEntity.create({
        nombre: 'Ciclo renombrado',
        fechaInicio: new Date('2026-02-01'),
        fechaFin: new Date('2026-11-30'),
        activo: true,
      });
      editarCicloVigenteUseCase.execute.mockResolvedValue(Result.ok(ciclo));

      const result = await controller.editar(ciclo.id, {
        nombre: 'Ciclo renombrado',
        fechaInicio: '2026-02-01',
        fechaFin: '2026-11-30',
      } as any);

      expect(result).toEqual({
        id: ciclo.id,
        nombre: 'Ciclo renombrado',
        fechaInicio: '2026-02-01',
        fechaFin: '2026-11-30',
        activo: true,
      });
      expect(editarCicloVigenteUseCase.execute).toHaveBeenCalledWith({
        cicloVigenteId: ciclo.id,
        nombre: 'Ciclo renombrado',
        fechaInicio: new Date('2026-02-01'),
        fechaFin: new Date('2026-11-30'),
      });
    });

    it('no envía fechaInicio/fechaFin al use case cuando no vienen en el body', async () => {
      const { controller, editarCicloVigenteUseCase } = buildController();
      const ciclo = CicloVigenteEntity.create({
        nombre: 'Solo nombre',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      });
      editarCicloVigenteUseCase.execute.mockResolvedValue(Result.ok(ciclo));

      await controller.editar(ciclo.id, { nombre: 'Solo nombre' } as any);

      expect(editarCicloVigenteUseCase.execute).toHaveBeenCalledWith({
        cicloVigenteId: ciclo.id,
        nombre: 'Solo nombre',
        fechaInicio: undefined,
        fechaFin: undefined,
      });
    });

    it('propaga 422 UnprocessableEntityException cuando el use case falla por fechas inválidas', async () => {
      const { controller, editarCicloVigenteUseCase } = buildController();
      editarCicloVigenteUseCase.execute.mockResolvedValue(
        Result.fail(new CicloVigenteInvalidDatesError()),
      );

      await expect(
        controller.editar('id-x', { fechaInicio: '2026-12-31', fechaFin: '2026-01-01' } as any),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('propaga 404 NotFoundException cuando el ciclo no existe', async () => {
      const { controller, editarCicloVigenteUseCase } = buildController();
      editarCicloVigenteUseCase.execute.mockResolvedValue(
        Result.fail(new CicloVigenteNotFoundError('id-x')),
      );

      await expect(controller.editar('id-x', { nombre: 'X' } as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('DELETE /ciclos-vigentes/:id (sdd/ciclos-abm-root, ROOT-only)', () => {
    it('da de baja el ciclo (204, sin body)', async () => {
      const { controller, eliminarCicloVigenteUseCase } = buildController();
      eliminarCicloVigenteUseCase.execute.mockResolvedValue(Result.ok(undefined));

      const result = await controller.eliminar('id-x');

      expect(result).toBeUndefined();
      expect(eliminarCicloVigenteUseCase.execute).toHaveBeenCalledWith({ cicloVigenteId: 'id-x' });
    });

    it('propaga 404 NotFoundException cuando el ciclo no existe', async () => {
      const { controller, eliminarCicloVigenteUseCase } = buildController();
      eliminarCicloVigenteUseCase.execute.mockResolvedValue(
        Result.fail(new CicloVigenteNotFoundError('id-x')),
      );

      await expect(controller.eliminar('id-x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('GET /ciclos-vigentes/admin (sdd/ciclos-abm-root, ROOT-only)', () => {
    it('lista TODOS los ciclos (incluye eliminados) mapeados al DTO admin', async () => {
      const { controller, listarCiclosVigentesAdminUseCase } = buildController();
      const activo = CicloVigenteEntity.create({
        nombre: 'Activo',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      });
      const eliminado = CicloVigenteEntity.create({
        nombre: 'Eliminado',
        fechaInicio: new Date('2025-01-01'),
        fechaFin: new Date('2025-12-31'),
        activo: true,
      });
      eliminado.softDelete();
      listarCiclosVigentesAdminUseCase.execute.mockResolvedValue([activo, eliminado]);

      const result = await controller.listarAdmin();

      expect(result).toEqual([
        {
          id: activo.id,
          nombre: 'Activo',
          fechaInicio: '2026-01-01',
          fechaFin: '2026-12-31',
          activo: true,
          eliminado: false,
        },
        {
          id: eliminado.id,
          nombre: 'Eliminado',
          fechaInicio: '2025-01-01',
          fechaFin: '2025-12-31',
          activo: true,
          eliminado: true,
        },
      ]);
    });
  });
});
