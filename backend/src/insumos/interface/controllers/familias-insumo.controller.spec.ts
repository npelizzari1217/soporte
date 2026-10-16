import { describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { FamiliasInsumoController } from './familias-insumo.controller';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';
import { FamiliaInsumoEntity } from '../../domain/entities/familia-insumo.entity';
import { Result } from '../../../shared/domain/result';
import {
  FamiliaInsumoNoEncontradaError,
  FamiliaInsumoCodigoDuplicadoError,
} from '../../domain/errors/familias-insumo.errors';
import { CrearFamiliaInsumoUseCase } from '../../application/use-cases/crear-familia-insumo.use-case';
import { EditarFamiliaInsumoUseCase } from '../../application/use-cases/editar-familia-insumo.use-case';
import { CambiarEstadoActivoFamiliaInsumoUseCase } from '../../application/use-cases/cambiar-estado-activo-familia-insumo.use-case';
import { ListarFamiliasInsumoUseCase } from '../../application/use-cases/listar-familias-insumo.use-case';

/**
 * Doble de un use case concreto: instancia real del prototipo con `execute`
 * espiado y tipado contra la firma del caso de uso.
 */
function espiado<T extends { execute: (...args: never[]) => unknown }>(Clase: { prototype: T }) {
  const execute = vi.fn<T['execute']>();
  const caso: T = Object.create(Clase.prototype, { execute: { value: execute } });
  return { caso, execute };
}

describe('FamiliasInsumoController', () => {
  function buildController() {
    const crearUseCase = espiado(CrearFamiliaInsumoUseCase);
    const editarUseCase = espiado(EditarFamiliaInsumoUseCase);
    const cambiarEstadoUseCase = espiado(CambiarEstadoActivoFamiliaInsumoUseCase);
    const listarUseCase = espiado(ListarFamiliasInsumoUseCase);

    const controller = new FamiliasInsumoController(
      crearUseCase.caso,
      editarUseCase.caso,
      cambiarEstadoUseCase.caso,
      listarUseCase.caso,
    );
    return { controller, crearUseCase, editarUseCase, cambiarEstadoUseCase, listarUseCase };
  }

  it('GET /familias-insumo retorna el listado mapeado a DTO', async () => {
    const familia = FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true });
    const { controller, listarUseCase } = buildController();
    listarUseCase.execute.mockResolvedValue([familia]);

    const result = await controller.listar();

    expect(result).toHaveLength(1);
    expect(result[0]!.codigo).toBe('A');
  });

  it('POST /familias-insumo crea y retorna el DTO', async () => {
    const familia = FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true });
    const { controller, crearUseCase } = buildController();
    crearUseCase.execute.mockResolvedValue(Result.ok(familia));

    const result = await controller.crear({ codigo: 'A', nombre: 'A' });

    expect(result.codigo).toBe('A');
  });

  it('POST /familias-insumo reenvía esRepuesto al use case sin transformarlo', async () => {
    const familia = FamiliaInsumoEntity.create({
      codigo: 'CPU',
      nombre: 'CPU',
      activo: true,
      esRepuesto: true,
    });
    const { controller, crearUseCase } = buildController();
    crearUseCase.execute.mockResolvedValue(Result.ok(familia));

    const result = await controller.crear({ codigo: 'CPU', nombre: 'CPU', esRepuesto: true });

    expect(crearUseCase.execute).toHaveBeenCalledWith({
      codigo: 'CPU',
      nombre: 'CPU',
      esRepuesto: true,
    });
    expect(result.esRepuesto).toBe(true);
  });

  it('POST /familias-insumo con codigo duplicado lanza 422', async () => {
    const { controller, crearUseCase } = buildController();
    crearUseCase.execute.mockResolvedValue(Result.fail(new FamiliaInsumoCodigoDuplicadoError('A')));

    await expect(controller.crear({ codigo: 'A', nombre: 'A' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('PATCH /familias-insumo/:id con id inexistente lanza 404', async () => {
    const { controller, editarUseCase } = buildController();
    editarUseCase.execute.mockResolvedValue(
      Result.fail(new FamiliaInsumoNoEncontradaError('id-x')),
    );

    await expect(controller.editar('id-x', { nombre: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('PATCH /familias-insumo/:id/estado desactiva', async () => {
    const familia = FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true });
    familia.desactivar();
    const { controller, cambiarEstadoUseCase } = buildController();
    cambiarEstadoUseCase.execute.mockResolvedValue(Result.ok(familia));

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
      const handler: object = FamiliasInsumoController.prototype[metodo];
      const guards = (Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as unknown[];

      if (debeEstarPresente) {
        expect(guards).toContain(AdminClienteGuard);
      } else {
        expect(guards).not.toContain(AdminClienteGuard);
      }
    });
  });
});
