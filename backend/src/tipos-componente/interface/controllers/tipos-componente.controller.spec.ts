/**
 * tipos-componente.controller.spec.ts — TDD RED→GREEN (sdd/tipos-componente-master, PR2).
 *
 * Unit test: instancia el controller directamente con los use cases
 * mockeados (sin bootstrapear NestJS ni pasar por guards reales) — verifica
 * traducción HTTP ↔ use case, mapeo Result.fail → HttpException, y que cada
 * endpoint ROOT declare `GlobalAdminGuard` vía metadata (mismo patrón que
 * `ciclos-vigentes.controller.spec.ts`, con el chequeo de metadata de guard
 * agregado — no existía antes, análogo a `PERMISSIONS_KEY` en
 * `compras.controller.spec.ts`/`roles.controller.spec.ts`).
 */
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { TiposComponenteController } from './tipos-componente.controller';
import { GlobalAdminGuard } from '../../../auth/infrastructure/guards/global-admin.guard';
import { Result } from '../../../shared/domain/result';
import { TipoComponente } from '../../domain/entities/tipo-componente.entity';
import {
  CodigoTipoComponenteDuplicadoError,
  CodigoTipoComponenteInvalidoError,
  TipoComponenteNotFoundError,
} from '../../domain/errors/tipos-componente.errors';

describe('TiposComponenteController (sdd/tipos-componente-master, PR2, ROOT-only)', () => {
  function buildController() {
    const crearUseCase = { execute: vi.fn() };
    const renombrarUseCase = { execute: vi.fn() };
    const desactivarUseCase = { execute: vi.fn() };
    const activarUseCase = { execute: vi.fn() };
    const listarAdminUseCase = { execute: vi.fn() };
    const controller = new TiposComponenteController(
      crearUseCase as any,
      renombrarUseCase as any,
      desactivarUseCase as any,
      activarUseCase as any,
      listarAdminUseCase as any,
    );
    return {
      controller,
      crearUseCase,
      renombrarUseCase,
      desactivarUseCase,
      activarUseCase,
      listarAdminUseCase,
    };
  }

  describe.each([
    ['create', 'POST /tipos-componente'],
    ['listarAdmin', 'GET /tipos-componente/admin'],
    ['renombrar', 'PATCH /tipos-componente/:id'],
    ['activar', 'POST /tipos-componente/:id/activar'],
    ['desactivar', 'POST /tipos-componente/:id/desactivar'],
  ])('%s (%s)', (method) => {
    it('declara GlobalAdminGuard (ROOT-only)', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        (TiposComponenteController.prototype as any)[method],
      ) as unknown[];
      expect(guards).toContain(GlobalAdminGuard);
    });
  });

  describe('POST /tipos-componente', () => {
    it('crea el tipo y retorna 201 con el DTO de respuesta', async () => {
      const { controller, crearUseCase } = buildController();
      const tipo = TipoComponente.create({ codigo: 'CPU', nombre: 'Procesador' }).getValue();
      crearUseCase.execute.mockResolvedValue(Result.ok(tipo));

      const result = await controller.create({ codigo: 'cpu', nombre: 'Procesador' } as any);

      expect(result).toEqual({ id: tipo.id, codigo: 'CPU', nombre: 'Procesador', activo: true });
      expect(crearUseCase.execute).toHaveBeenCalledWith({ codigo: 'cpu', nombre: 'Procesador' });
    });

    it('propaga 409 ConflictException cuando el código está duplicado', async () => {
      const { controller, crearUseCase } = buildController();
      crearUseCase.execute.mockResolvedValue(
        Result.fail(new CodigoTipoComponenteDuplicadoError('CPU')),
      );

      await expect(
        controller.create({ codigo: 'CPU', nombre: 'Duplicado' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('propaga 422 UnprocessableEntityException cuando el código es inválido', async () => {
      const { controller, crearUseCase } = buildController();
      crearUseCase.execute.mockResolvedValue(
        Result.fail(new CodigoTipoComponenteInvalidoError('   ')),
      );

      await expect(controller.create({ codigo: '   ', nombre: 'X' } as any)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  describe('GET /tipos-componente/admin', () => {
    it('lista TODOS los tipos (incluye inactivos) mapeados al DTO de respuesta', async () => {
      const { controller, listarAdminUseCase } = buildController();
      const activo = TipoComponente.create({ codigo: 'CPU', nombre: 'Procesador' }).getValue();
      const inactivo = TipoComponente.create({ codigo: 'RAM', nombre: 'Memoria' }).getValue();
      inactivo.desactivar();
      listarAdminUseCase.execute.mockResolvedValue([activo, inactivo]);

      const result = await controller.listarAdmin();

      expect(result).toEqual([
        { id: activo.id, codigo: 'CPU', nombre: 'Procesador', activo: true },
        { id: inactivo.id, codigo: 'RAM', nombre: 'Memoria', activo: false },
      ]);
    });
  });

  describe('PATCH /tipos-componente/:id', () => {
    it('renombra el tipo y retorna el DTO de respuesta', async () => {
      const { controller, renombrarUseCase } = buildController();
      const tipo = TipoComponente.create({ codigo: 'CPU', nombre: 'Renombrado' }).getValue();
      renombrarUseCase.execute.mockResolvedValue(Result.ok(tipo));

      const result = await controller.renombrar(tipo.id, { nombre: 'Renombrado' } as any);

      expect(result).toEqual({ id: tipo.id, codigo: 'CPU', nombre: 'Renombrado', activo: true });
      expect(renombrarUseCase.execute).toHaveBeenCalledWith({
        id: tipo.id,
        nombre: 'Renombrado',
      });
    });

    it('propaga 404 NotFoundException cuando el tipo no existe', async () => {
      const { controller, renombrarUseCase } = buildController();
      renombrarUseCase.execute.mockResolvedValue(
        Result.fail(new TipoComponenteNotFoundError('id-x')),
      );

      await expect(controller.renombrar('id-x', { nombre: 'X' } as any)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('POST /tipos-componente/:id/activar', () => {
    it('activa el tipo y retorna el DTO de respuesta', async () => {
      const { controller, activarUseCase } = buildController();
      const tipo = TipoComponente.create({ codigo: 'CPU', nombre: 'Procesador' }).getValue();
      activarUseCase.execute.mockResolvedValue(Result.ok(tipo));

      const result = await controller.activar(tipo.id);

      expect(result).toEqual({ id: tipo.id, codigo: 'CPU', nombre: 'Procesador', activo: true });
      expect(activarUseCase.execute).toHaveBeenCalledWith({ id: tipo.id });
    });

    it('propaga 404 NotFoundException cuando el tipo no existe', async () => {
      const { controller, activarUseCase } = buildController();
      activarUseCase.execute.mockResolvedValue(
        Result.fail(new TipoComponenteNotFoundError('id-x')),
      );

      await expect(controller.activar('id-x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('POST /tipos-componente/:id/desactivar', () => {
    it('desactiva el tipo y retorna el DTO de respuesta', async () => {
      const { controller, desactivarUseCase } = buildController();
      const tipo = TipoComponente.create({ codigo: 'CPU', nombre: 'Procesador' }).getValue();
      tipo.desactivar();
      desactivarUseCase.execute.mockResolvedValue(Result.ok(tipo));

      const result = await controller.desactivar(tipo.id);

      expect(result).toEqual({ id: tipo.id, codigo: 'CPU', nombre: 'Procesador', activo: false });
      expect(desactivarUseCase.execute).toHaveBeenCalledWith({ id: tipo.id });
    });

    it('propaga 404 NotFoundException cuando el tipo no existe', async () => {
      const { controller, desactivarUseCase } = buildController();
      desactivarUseCase.execute.mockResolvedValue(
        Result.fail(new TipoComponenteNotFoundError('id-x')),
      );

      await expect(controller.desactivar('id-x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
