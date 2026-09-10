import { describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InsumosController } from './insumos.controller';
import { AdminClienteGuard } from '../../../auth/infrastructure/guards/admin-cliente.guard';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { InsumoCodigoAlternativoEntity } from '../../domain/entities/insumo-codigo-alternativo.entity';
import { Result } from '../../../shared/domain/result';
import {
  CodigoAlternativoDuplicadoError,
  FamiliaInsumoDeshabilitadaError,
  InsumoCodigoDuplicadoError,
  InsumoNoEncontradoError,
} from '../../domain/errors/insumos.errors';

const FAMILIA_ID = '11111111-1111-4111-8111-111111111111';
const UNIDAD_ID = '22222222-2222-4222-8222-222222222222';

function construirInsumo(
  overrides: Partial<{ codigo: string; stockMinimo: number | null; activo: boolean }> = {},
): InsumoEntity {
  return InsumoEntity.create({
    codigo: overrides.codigo ?? 'TON-001',
    nombre: 'Tóner negro',
    familiaId: FAMILIA_ID,
    unidadMedidaId: UNIDAD_ID,
    stockMinimo: overrides.stockMinimo ?? null,
    activo: overrides.activo ?? true,
    codigosAlternativos: [
      InsumoCodigoAlternativoEntity.create({ codigo: 'CE285A', fabricante: 'HP' }),
    ],
    compatibilidad: [],
  });
}

describe('InsumosController', () => {
  function buildController(overrides: Record<string, { execute: ReturnType<typeof vi.fn> }> = {}) {
    const crearUseCase = overrides.crear ?? { execute: vi.fn() };
    const editarUseCase = overrides.editar ?? { execute: vi.fn() };
    const cambiarEstadoUseCase = overrides.cambiarEstado ?? { execute: vi.fn() };
    const listarUseCase = overrides.listar ?? { execute: vi.fn() };

    const controller = new InsumosController(
      crearUseCase as never,
      editarUseCase as never,
      cambiarEstadoUseCase as never,
      listarUseCase as never,
    );
    return { controller, crearUseCase, editarUseCase, cambiarEstadoUseCase, listarUseCase };
  }

  it('GET /insumos retorna el listado mapeado a DTO, con los códigos alternativos', async () => {
    const insumo = construirInsumo();
    const { controller } = buildController({
      listar: { execute: vi.fn().mockResolvedValue([insumo]) },
    });

    const result = await controller.listar({});

    expect(result).toHaveLength(1);
    expect(result[0]!.codigo).toBe('TON-001');
    expect(result[0]!.codigosAlternativos).toEqual([
      { id: insumo.codigosAlternativos[0]!.id, codigo: 'CE285A', fabricante: 'HP' },
    ]);
  });

  /**
   * Los tres casos de `esRepuesto` van juntos: ausente, `true` y `false` se
   * distinguen entre sí en la llamada al caso de uso. Sin el caso "ausente"
   * como gemelo de los otros dos, un controller que SIEMPRE mandara `false`
   * (o SIEMPRE `true`) pasaría cualquiera de los dos primeros por separado.
   */
  it('GET /insumos con esRepuesto=true delega exactamente ese valor al caso de uso', async () => {
    const listar = { execute: vi.fn().mockResolvedValue([]) };
    const { controller } = buildController({ listar });

    await controller.listar({ esRepuesto: true });

    expect(listar.execute).toHaveBeenCalledWith(true);
  });

  it('GET /insumos con esRepuesto=false delega exactamente ese valor al caso de uso', async () => {
    const listar = { execute: vi.fn().mockResolvedValue([]) };
    const { controller } = buildController({ listar });

    await controller.listar({ esRepuesto: false });

    expect(listar.execute).toHaveBeenCalledWith(false);
  });

  it('GET /insumos sin esRepuesto delega undefined (sin filtrar) al caso de uso', async () => {
    const listar = { execute: vi.fn().mockResolvedValue([]) };
    const { controller } = buildController({ listar });

    await controller.listar({});

    expect(listar.execute).toHaveBeenCalledWith(undefined);
  });

  it('POST /insumos crea y retorna el DTO', async () => {
    const insumo = construirInsumo({ stockMinimo: 5.5 });
    const { controller, crearUseCase } = buildController({
      crear: { execute: vi.fn().mockResolvedValue(Result.ok(insumo)) },
    });

    const result = await controller.crear({
      codigo: 'TON-001',
      nombre: 'Tóner negro',
      familiaId: FAMILIA_ID,
      unidadMedidaId: UNIDAD_ID,
      stockMinimo: 5.5,
    });

    expect(result.codigo).toBe('TON-001');
    expect(result.stockMinimo).toBe(5.5);
    expect(crearUseCase.execute).toHaveBeenCalledWith({
      codigo: 'TON-001',
      nombre: 'Tóner negro',
      familiaId: FAMILIA_ID,
      unidadMedidaId: UNIDAD_ID,
      stockMinimo: 5.5,
    });
  });

  it('POST /insumos con código duplicado lanza 422', async () => {
    const { controller } = buildController({
      crear: {
        execute: vi.fn().mockResolvedValue(Result.fail(new InsumoCodigoDuplicadoError('TON-001'))),
      },
    });

    await expect(
      controller.crear({
        codigo: 'TON-001',
        nombre: 'Tóner negro',
        familiaId: FAMILIA_ID,
        unidadMedidaId: UNIDAD_ID,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  /**
   * La familia deshabilitada NO es un 404: la fila existe y el administrador
   * la ve en su propio listado. Mandarle un "no encontrado" lo haría buscar un
   * problema que no está.
   */
  it('POST /insumos con familia deshabilitada lanza 422, no 404', async () => {
    const { controller } = buildController({
      crear: {
        execute: vi
          .fn()
          .mockResolvedValue(Result.fail(new FamiliaInsumoDeshabilitadaError(FAMILIA_ID))),
      },
    });

    await expect(
      controller.crear({
        codigo: 'TON-001',
        nombre: 'Tóner negro',
        familiaId: FAMILIA_ID,
        unidadMedidaId: UNIDAD_ID,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('POST /insumos con código alternativo duplicado lanza 422', async () => {
    const { controller } = buildController({
      crear: {
        execute: vi
          .fn()
          .mockResolvedValue(Result.fail(new CodigoAlternativoDuplicadoError('CE285A', 'HP'))),
      },
    });

    await expect(
      controller.crear({
        codigo: 'TON-001',
        nombre: 'Tóner negro',
        familiaId: FAMILIA_ID,
        unidadMedidaId: UNIDAD_ID,
        codigosAlternativos: [{ codigo: 'CE285A', fabricante: 'HP' }],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('PATCH /insumos/:id con id inexistente lanza 404', async () => {
    const { controller } = buildController({
      editar: {
        execute: vi.fn().mockResolvedValue(Result.fail(new InsumoNoEncontradoError('id-x'))),
      },
    });

    await expect(controller.editar('id-x', { nombre: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  /**
   * El id de la ruta y el body van al mismo DTO del caso de uso. Sin este
   * assert, un controller que mandara solo el body dejaría el PATCH sin id y
   * el caso de uso devolvería siempre "no encontrado".
   */
  it('PATCH /insumos/:id reenvía el id de la ruta junto con el body', async () => {
    const insumo = construirInsumo();
    const { controller, editarUseCase } = buildController({
      editar: { execute: vi.fn().mockResolvedValue(Result.ok(insumo)) },
    });

    await controller.editar('id-1', { nombre: 'Renombrado', codigosAlternativos: [] });

    expect(editarUseCase.execute).toHaveBeenCalledWith({
      id: 'id-1',
      nombre: 'Renombrado',
      codigosAlternativos: [],
    });
  });

  it('PATCH /insumos/:id/estado desactiva', async () => {
    const insumo = construirInsumo();
    insumo.desactivar();
    const { controller, cambiarEstadoUseCase } = buildController({
      cambiarEstado: { execute: vi.fn().mockResolvedValue(Result.ok(insumo)) },
    });

    const result = await controller.cambiarEstadoActivo('id-1', { activo: false });

    expect(result.activo).toBe(false);
    expect(cambiarEstadoUseCase.execute).toHaveBeenCalledWith({ id: 'id-1', activo: false });
  });

  it('PATCH /insumos/:id/estado con id inexistente lanza 404', async () => {
    const { controller } = buildController({
      cambiarEstado: {
        execute: vi.fn().mockResolvedValue(Result.fail(new InsumoNoEncontradoError('id-x'))),
      },
    });

    await expect(controller.cambiarEstadoActivo('id-x', { activo: false })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  /**
   * Sin este chequeo de metadata, borrar un `@UseGuards(AdminClienteGuard)` de
   * cualquier método de escritura deja toda la suite en verde: los tests de
   * arriba instancian el controller a mano y los guards nunca corren. Mismo
   * patrón que `modelos-equipo.controller.spec.ts`.
   */
  describe('RBAC — metadata de guards, por método, NUNCA a nivel de clase', () => {
    it.each([
      ['crear', true],
      ['editar', true],
      ['cambiarEstadoActivo', true],
      ['listar', false],
    ] as const)('%s → AdminClienteGuard presente: %s', (metodo, debeEstarPresente) => {
      const handler = InsumosController.prototype[
        metodo as keyof typeof InsumosController.prototype
      ] as unknown as (...args: unknown[]) => unknown;
      const guards = (Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as unknown[];

      if (debeEstarPresente) {
        expect(guards).toContain(AdminClienteGuard);
      } else {
        expect(guards).not.toContain(AdminClienteGuard);
      }
    });

    /**
     * El hermano invertido del caso de arriba: si `AdminClienteGuard`
     * estuviera a NIVEL DE CLASE, los cuatro métodos quedarían gateados y la
     * lectura abierta se rompería sin que ningún assert de handler lo notara
     * —la metadata de clase no aparece en la del método—.
     */
    it('la clase NO declara AdminClienteGuard', () => {
      const guardsDeClase = (Reflect.getMetadata(GUARDS_METADATA, InsumosController) ??
        []) as unknown[];

      expect(guardsDeClase).not.toContain(AdminClienteGuard);
    });
  });
});
