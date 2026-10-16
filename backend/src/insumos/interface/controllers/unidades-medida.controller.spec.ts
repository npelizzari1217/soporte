import { describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { UnidadesMedidaController } from './unidades-medida.controller';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';
import { UnidadMedidaEntity } from '../../domain/entities/unidad-medida.entity';
import { Result } from '../../../shared/domain/result';
import {
  UnidadMedidaNoEncontradaError,
  UnidadMedidaCodigoDuplicadoError,
  UnidadMedidaEnUsoPorSerieError,
} from '../../domain/errors/unidades-medida.errors';
import { CrearUnidadMedidaUseCase } from '../../application/use-cases/crear-unidad-medida.use-case';
import { EditarUnidadMedidaUseCase } from '../../application/use-cases/editar-unidad-medida.use-case';
import { CambiarEstadoActivoUnidadMedidaUseCase } from '../../application/use-cases/cambiar-estado-activo-unidad-medida.use-case';
import { ListarUnidadesMedidaUseCase } from '../../application/use-cases/listar-unidades-medida.use-case';

/**
 * Doble de un use case concreto: instancia real del prototipo con `execute`
 * espiado y tipado contra la firma del caso de uso.
 */
function espiado<T extends { execute: (...args: never[]) => unknown }>(Clase: { prototype: T }) {
  const execute = vi.fn<T['execute']>();
  const caso: T = Object.create(Clase.prototype, { execute: { value: execute } });
  return { caso, execute };
}

describe('UnidadesMedidaController', () => {
  function buildController() {
    const crearUseCase = espiado(CrearUnidadMedidaUseCase);
    const editarUseCase = espiado(EditarUnidadMedidaUseCase);
    const cambiarEstadoUseCase = espiado(CambiarEstadoActivoUnidadMedidaUseCase);
    const listarUseCase = espiado(ListarUnidadesMedidaUseCase);

    const controller = new UnidadesMedidaController(
      crearUseCase.caso,
      editarUseCase.caso,
      cambiarEstadoUseCase.caso,
      listarUseCase.caso,
    );
    return { controller, crearUseCase, editarUseCase, cambiarEstadoUseCase, listarUseCase };
  }

  it('GET /unidades-medida retorna el listado mapeado a DTO', async () => {
    const unidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true });
    const { controller, listarUseCase } = buildController();
    listarUseCase.execute.mockResolvedValue([unidad]);

    const result = await controller.listar();

    expect(result).toHaveLength(1);
    expect(result[0]!.codigo).toBe('A');
  });

  it('POST /unidades-medida crea y retorna el DTO', async () => {
    const unidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true });
    const { controller, crearUseCase } = buildController();
    crearUseCase.execute.mockResolvedValue(Result.ok(unidad));

    const result = await controller.crear({ codigo: 'A', nombre: 'A' });

    expect(result.codigo).toBe('A');
  });

  it('POST /unidades-medida con codigo duplicado lanza 422', async () => {
    const { controller, crearUseCase } = buildController();
    crearUseCase.execute.mockResolvedValue(Result.fail(new UnidadMedidaCodigoDuplicadoError('A')));

    await expect(controller.crear({ codigo: 'A', nombre: 'A' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('PATCH /unidades-medida/:id pasa `entera` al caso de uso y devuelve la unidad con `entera`', async () => {
    const unidad = UnidadMedidaEntity.create({
      codigo: 'A',
      nombre: 'A',
      activo: true,
      entera: true,
    });
    const { controller, editarUseCase } = buildController();
    editarUseCase.execute.mockResolvedValue(Result.ok(unidad));

    const result = await controller.editar('id-1', { entera: true });

    expect(editarUseCase.execute).toHaveBeenCalledWith({ id: 'id-1', entera: true });
    expect(result.entera).toBe(true);
  });

  it('PATCH /unidades-medida/:id desmarcando una unidad usada por un insumo SERIE lanza 422', async () => {
    const { controller, editarUseCase } = buildController();
    editarUseCase.execute.mockResolvedValue(
      Result.fail(new UnidadMedidaEnUsoPorSerieError('id-1')),
    );

    await expect(controller.editar('id-1', { entera: false })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('PATCH /unidades-medida/:id con id inexistente lanza 404', async () => {
    const { controller, editarUseCase } = buildController();
    editarUseCase.execute.mockResolvedValue(Result.fail(new UnidadMedidaNoEncontradaError('id-x')));

    await expect(controller.editar('id-x', { nombre: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('PATCH /unidades-medida/:id/estado desactiva', async () => {
    const unidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true });
    unidad.desactivar();
    const { controller, cambiarEstadoUseCase } = buildController();
    cambiarEstadoUseCase.execute.mockResolvedValue(Result.ok(unidad));

    const result = await controller.cambiarEstadoActivo('id-1', { activo: false });

    expect(result.activo).toBe(false);
    expect(cambiarEstadoUseCase.execute).toHaveBeenCalledWith({ id: 'id-1', activo: false });
  });

  /**
   * Sin este chequeo de metadata, borrar un `@UseGuards(AdminClienteGuard)` de
   * cualquier método de escritura deja toda la suite en verde: los tests de
   * arriba instancian el controller a mano y los guards nunca corren. Mismo
   * patrón que `sectores.controller.spec.ts`.
   */
  describe('RBAC — metadata de guards, por método, NUNCA a nivel de clase', () => {
    it.each([
      ['crear', true],
      ['editar', true],
      ['cambiarEstadoActivo', true],
      ['listar', false],
    ] as const)('%s → AdminClienteGuard presente: %s', (metodo, debeEstarPresente) => {
      const handler = UnidadesMedidaController.prototype[
        metodo as keyof typeof UnidadesMedidaController.prototype
      ] as unknown as (...args: unknown[]) => unknown;
      const guards = (Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as unknown[];

      if (debeEstarPresente) {
        expect(guards).toContain(AdminClienteGuard);
      } else {
        expect(guards).not.toContain(AdminClienteGuard);
      }
    });
  });
});
