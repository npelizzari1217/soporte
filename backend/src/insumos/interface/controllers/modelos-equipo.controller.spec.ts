import { describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ModelosEquipoController } from './modelos-equipo.controller';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';
import { ModeloEquipoEntity } from '../../domain/entities/modelo-equipo.entity';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { Result } from '../../../shared/domain/result';
import {
  ModeloEquipoNoEncontradoError,
  ModeloEquipoDuplicadoError,
} from '../../domain/errors/modelos-equipo.errors';
import { CrearModeloEquipoUseCase } from '../../application/use-cases/crear-modelo-equipo.use-case';
import { EditarModeloEquipoUseCase } from '../../application/use-cases/editar-modelo-equipo.use-case';
import { CambiarEstadoActivoModeloEquipoUseCase } from '../../application/use-cases/cambiar-estado-activo-modelo-equipo.use-case';
import { ListarModelosEquipoUseCase } from '../../application/use-cases/listar-modelos-equipo.use-case';
import { ListarInsumosPorModeloEquipoUseCase } from '../../application/use-cases/listar-insumos-por-modelo-equipo.use-case';

/**
 * Doble de un use case concreto: instancia real del prototipo con `execute`
 * espiado y tipado contra la firma del caso de uso.
 */
function espiado<T extends { execute: (...args: never[]) => unknown }>(Clase: { prototype: T }) {
  const execute = vi.fn<T['execute']>();
  const caso: T = Object.create(Clase.prototype, { execute: { value: execute } });
  return { caso, execute };
}

describe('ModelosEquipoController', () => {
  function buildController() {
    const crearUseCase = espiado(CrearModeloEquipoUseCase);
    const editarUseCase = espiado(EditarModeloEquipoUseCase);
    const cambiarEstadoUseCase = espiado(CambiarEstadoActivoModeloEquipoUseCase);
    const listarUseCase = espiado(ListarModelosEquipoUseCase);
    const listarInsumosUseCase = espiado(ListarInsumosPorModeloEquipoUseCase);

    const controller = new ModelosEquipoController(
      crearUseCase.caso,
      editarUseCase.caso,
      cambiarEstadoUseCase.caso,
      listarUseCase.caso,
      listarInsumosUseCase.caso,
    );
    return {
      controller,
      crearUseCase,
      editarUseCase,
      cambiarEstadoUseCase,
      listarUseCase,
      listarInsumosUseCase,
    };
  }

  function buildInsumo(codigo: string, modeloEquipoId: string): InsumoEntity {
    return InsumoEntity.create({
      codigo,
      nombre: `Insumo ${codigo}`,
      familiaId: 'fam-1',
      unidadMedidaId: 'uni-1',
      stockMinimo: null,
      activo: true,
      codigosAlternativos: [],
      compatibilidad: [{ modeloEquipoId, rol: 'NEGRO' }],
    });
  }

  it('GET /modelos-equipo retorna el listado mapeado a DTO', async () => {
    const modelo = ModeloEquipoEntity.create({ marca: 'HP', modelo: 'M404', activo: true });
    const { controller, listarUseCase } = buildController();
    listarUseCase.execute.mockResolvedValue([modelo]);

    const result = await controller.listar();

    expect(result).toHaveLength(1);
    expect(result[0]!.marca).toBe('HP');
  });

  /**
   * El assert es de CONTENIDO y no solo de forma: un handler que devolviera el
   * catálogo entero también sería un array de insumos, y la pregunta que este
   * endpoint responde —"¿qué insumo le va a ESTE modelo?"— quedaría sin
   * respuesta con la lista completa.
   */
  it('GET /modelos-equipo/:id/insumos retorna los insumos compatibles mapeados a DTO', async () => {
    const insumo = buildInsumo('TON-001', 'mod-1');
    const { controller, listarInsumosUseCase } = buildController();
    listarInsumosUseCase.execute.mockResolvedValue([insumo]);

    const result = await controller.listarInsumosCompatibles('mod-1');

    expect(result).toHaveLength(1);
    expect(result[0]!.codigo).toBe('TON-001');
    expect(result[0]!.compatibilidad).toEqual([{ modeloEquipoId: 'mod-1', rol: 'NEGRO' }]);
  });

  /** Si el id se perdiera, la consulta devolvería el subconjunto equivocado. */
  it('GET /modelos-equipo/:id/insumos delega el id del modelo al caso de uso', async () => {
    const { controller, listarInsumosUseCase } = buildController();
    listarInsumosUseCase.execute.mockResolvedValue([]);

    await controller.listarInsumosCompatibles('mod-7');

    expect(listarInsumosUseCase.execute).toHaveBeenCalledWith('mod-7');
  });

  it('POST /modelos-equipo crea y retorna el DTO', async () => {
    const modelo = ModeloEquipoEntity.create({ marca: 'HP', modelo: 'M404', activo: true });
    const { controller, crearUseCase } = buildController();
    crearUseCase.execute.mockResolvedValue(Result.ok(modelo));

    const result = await controller.crear({ marca: 'HP', modelo: 'M404' });

    expect(result.marca).toBe('HP');
  });

  it('POST /modelos-equipo con par duplicado lanza 422', async () => {
    const { controller, crearUseCase } = buildController();
    crearUseCase.execute.mockResolvedValue(
      Result.fail(new ModeloEquipoDuplicadoError('HP', 'M404')),
    );

    await expect(controller.crear({ marca: 'HP', modelo: 'M404' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('PATCH /modelos-equipo/:id con id inexistente lanza 404', async () => {
    const { controller, editarUseCase } = buildController();
    editarUseCase.execute.mockResolvedValue(Result.fail(new ModeloEquipoNoEncontradoError('id-x')));

    await expect(controller.editar('id-x', { modelo: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('PATCH /modelos-equipo/:id/estado desactiva', async () => {
    const modelo = ModeloEquipoEntity.create({ marca: 'HP', modelo: 'M404', activo: true });
    modelo.desactivar();
    const { controller, cambiarEstadoUseCase } = buildController();
    cambiarEstadoUseCase.execute.mockResolvedValue(Result.ok(modelo));

    const result = await controller.cambiarEstadoActivo('id-1', { activo: false });

    expect(result.activo).toBe(false);
    expect(cambiarEstadoUseCase.execute).toHaveBeenCalledWith({ id: 'id-1', activo: false });
  });

  /**
   * Sin este chequeo de metadata, borrar un `@UseGuards(AdminClienteGuard)` de
   * cualquier método de escritura deja toda la suite en verde: los tests de
   * arriba instancian el controller a mano y los guards nunca corren. Mismo
   * patrón que `familias-insumo.controller.spec.ts`.
   */
  describe('RBAC — metadata de guards, por método, NUNCA a nivel de clase', () => {
    it.each([
      ['crear', true],
      ['editar', true],
      ['cambiarEstadoActivo', true],
      ['listar', false],
      ['listarInsumosCompatibles', false],
    ] as const)('%s → AdminClienteGuard presente: %s', (metodo, debeEstarPresente) => {
      const handler: object = ModelosEquipoController.prototype[metodo];
      const guards = (Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as unknown[];

      if (debeEstarPresente) {
        expect(guards).toContain(AdminClienteGuard);
      } else {
        expect(guards).not.toContain(AdminClienteGuard);
      }
    });
  });
});
