import { describe, it, expect, vi } from 'vitest';
import { ReactivarComponenteUseCase } from './reactivar-componente.use-case';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import type { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import type { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import type { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import type { OperacionesUnidadInsumo } from '../../../insumos/application/services/operaciones-unidad-insumo.service';
import {
  equipoDadoDeBaja,
  equipoVigente,
  txRunnerDeSpec,
} from '../../testing/equipos-unit.fixtures';
import {
  EquipoDadoDeBajaError,
  EquipoNoEncontradoError,
  ComponenteDevueltoAlStockError,
  ComponenteNoEncontradoError,
  ComponenteYaActivoError,
  UnidadDelComponenteNoDisponibleError,
} from '../../domain/errors/equipos.errors';
import { Result } from '../../../shared/domain/result';
import * as UnidadesErrors from '../../../insumos/domain/errors/unidades-insumo.errors';

describe('ReactivarComponenteUseCase', () => {
  const USUARIO = 'usuario-1';

  function makeComponente(unidadId: string | null = null) {
    return ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      insumoId: 'insumo-1',
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
      unidadId,
    }).getValue();
  }

  type ResultadoReinstalar = Awaited<ReturnType<OperacionesUnidadInsumo['reinstalar']>>;

  /**
   * Arma el caso de uso con el orden de las llamadas registrado en `orden`. `equipo` es lo que
   * devuelve `bloquearParaOperarPiezas` (por defecto, un equipo vigente).
   */
  function makeSetup(
    componente: ComponenteEquipoEntity | null,
    reinstalar: ResultadoReinstalar = Result.ok([]),
    equipo: EquipoInformaticoEntity | null = equipoVigente(),
  ) {
    const orden: string[] = [];
    const txRunner = txRunnerDeSpec(orden);
    vi.spyOn(txRunner, 'run');
    const equipoRepo = {
      bloquearParaOperarPiezas: vi.fn(async () => {
        orden.push('lockEquipo');
        return equipo;
      }),
    } satisfies Pick<IEquipoInformaticoRepository, 'bloquearParaOperarPiezas'>;
    const componenteRepo = {
      findById: vi.fn(async () => componente),
      save: vi.fn(async () => {
        orden.push('save');
      }),
    } satisfies Pick<IComponenteEquipoRepository, 'findById' | 'save'>;
    const operaciones = {
      reinstalar: vi.fn(async () => {
        orden.push('reinstalar');
        return reinstalar;
      }),
    } satisfies Pick<OperacionesUnidadInsumo, 'reinstalar'>;
    const useCase = new ReactivarComponenteUseCase(
      txRunner,
      equipoRepo,
      componenteRepo,
      operaciones,
    );
    return { useCase, txRunner, equipoRepo, componenteRepo, operaciones, orden };
  }

  const dto = (componenteId: string, equipoId = 'equipo-1') => ({
    equipoId,
    componenteId,
    usuarioId: USUARIO,
  });

  it('falla con ComponenteNoEncontradoError si no existe', async () => {
    const { useCase, txRunner } = makeSetup(null);

    const result = await useCase.execute(dto('no-existe'));

    expect(result.getError()).toBeInstanceOf(ComponenteNoEncontradoError);
    expect(txRunner.run).not.toHaveBeenCalled();
  });

  it('falla con ComponenteNoEncontradoError si el componente pertenece a OTRO equipo', async () => {
    const componente = makeComponente();
    componente.softDelete();
    const { useCase, componenteRepo } = makeSetup(componente);

    const result = await useCase.execute(dto(componente.id, 'equipo-2'));

    expect(result.getError()).toBeInstanceOf(ComponenteNoEncontradoError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('falla con ComponenteYaActivoError si el componente ya está activo', async () => {
    const componente = makeComponente();
    const { useCase, componenteRepo } = makeSetup(componente);

    const result = await useCase.execute(dto(componente.id));

    expect(result.getError()).toBeInstanceOf(ComponenteYaActivoError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('reactiva el componente dado de baja (limpia deletedAt) y persiste', async () => {
    const componente = makeComponente();
    componente.softDelete();
    const { useCase, componenteRepo } = makeSetup(componente);

    const result = await useCase.execute(dto(componente.id));

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(true);
    expect(result.getValue().deletedAt).toBeNull();
    expect(componenteRepo.save).toHaveBeenCalledWith(componente);
  });

  describe('equipo dado de baja (LE, R11)', () => {
    it('toma el lock del equipo DENTRO de la transacción, antes de reinstalar o guardar', async () => {
      const componente = makeComponente();
      componente.softDelete();
      const { useCase, orden } = makeSetup(componente);

      await useCase.execute(dto(componente.id));

      expect(orden).toEqual(['tx:inicio', 'lockEquipo', 'save', 'tx:fin']);
    });

    it('un equipo dado de baja falla con EquipoDadoDeBajaError sin tocar el componente ni la unidad', async () => {
      const componente = makeComponente('unidad-1');
      componente.retirar({
        destino: 'DESCARTE',
        motivo: 'Baja del equipo',
        usuarioId: 'user-1',
        bajaMovimientoId: null,
      });
      const { useCase, componenteRepo, operaciones } = makeSetup(
        componente,
        Result.ok([]),
        equipoDadoDeBaja(),
      );

      const result = await useCase.execute(dto(componente.id));

      expect(result.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
      expect(operaciones.reinstalar).not.toHaveBeenCalled();
      expect(componenteRepo.save).not.toHaveBeenCalled();
      expect(componente.activo).toBe(false);
    });

    it('un equipo inexistente o con borrado lógico falla con EquipoNoEncontradoError', async () => {
      const componente = makeComponente();
      componente.softDelete();
      const borrado = equipoVigente();
      borrado.softDelete();
      for (const equipo of [null, borrado]) {
        const { useCase, componenteRepo } = makeSetup(componente, Result.ok([]), equipo);
        const result = await useCase.execute(dto(componente.id));
        expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
        expect(componenteRepo.save).not.toHaveBeenCalled();
      }
    });
  });

  describe('según el destino del retiro (sdd/stock-usado-componentes, ADR-5)', () => {
    it('rechaza con ComponenteDevueltoAlStockError si volvió al stock como USADO, y no persiste', async () => {
      const componente = makeComponente();
      componente.retirar({
        destino: 'STOCK_USADO',
        motivo: 'Pieza sana',
        usuarioId: 'user-1',
        bajaMovimientoId: 'mov-entrada',
      });
      const { useCase, componenteRepo, txRunner } = makeSetup(componente);

      const result = await useCase.execute(dto(componente.id));

      expect(result.getError()).toBeInstanceOf(ComponenteDevueltoAlStockError);
      expect(componenteRepo.save).not.toHaveBeenCalled();
      expect(txRunner.run).not.toHaveBeenCalled();
      expect(componente.activo).toBe(false);
      expect(componente.bajaDestino).toBe('STOCK_USADO');
    });

    it('reactiva un DESCARTE y limpia el registro de retiro', async () => {
      const componente = makeComponente();
      componente.retirar({
        destino: 'DESCARTE',
        motivo: 'Placa quemada',
        usuarioId: 'user-1',
        bajaMovimientoId: null,
      });
      const { useCase, componenteRepo } = makeSetup(componente);

      const result = await useCase.execute(dto(componente.id));

      expect(result.isOk()).toBe(true);
      expect(componente.activo).toBe(true);
      expect(componente.bajaDestino).toBeNull();
      expect(componente.bajaMotivo).toBeNull();
      expect(componente.bajaUsuarioId).toBeNull();
      expect(componenteRepo.save).toHaveBeenCalledWith(componente);
    });

    it('reactiva un retiro LEGADO (sin destino) y persiste, sin tocar ninguna unidad', async () => {
      const componente = makeComponente();
      componente.softDelete();
      expect(componente.bajaDestino).toBeNull();
      const { useCase, componenteRepo, operaciones } = makeSetup(componente);

      const result = await useCase.execute(dto(componente.id));

      expect(result.isOk()).toBe(true);
      expect(componente.activo).toBe(true);
      expect(componenteRepo.save).toHaveBeenCalledWith(componente);
      expect(operaciones.reinstalar).not.toHaveBeenCalled();
    });
  });

  describe('con unidad (sdd/repuestos-numero-de-serie, ADR-12 y ADR-14)', () => {
    function makeDescartado() {
      const componente = makeComponente('unidad-1');
      componente.retirar({
        destino: 'DESCARTE',
        motivo: 'Placa quemada',
        usuarioId: 'user-1',
        bajaMovimientoId: null,
      });
      return componente;
    }

    it('reinstala la unidad (L1 a L3) ANTES de guardar el componente (L4), todo en una transaccion', async () => {
      const componente = makeDescartado();
      const { useCase, operaciones, orden, txRunner } = makeSetup(componente);

      const result = await useCase.execute(dto(componente.id));

      expect(result.isOk()).toBe(true);
      expect(txRunner.run).toHaveBeenCalledTimes(1);
      expect(orden).toEqual(['tx:inicio', 'lockEquipo', 'reinstalar', 'save', 'tx:fin']);
      expect(operaciones.reinstalar).toHaveBeenCalledWith(
        [
          {
            unidadId: 'unidad-1',
            equipoId: 'equipo-1',
            componenteId: componente.id,
            insumoId: 'insumo-1',
          },
        ],
        { usuarioId: USUARIO },
      );
      expect(componente.activo).toBe(true);
    });

    it('unidad que ya no esta descartada por este componente (recuperada, ADR-14): UnidadDelComponenteNoDisponible de equipos, sin guardar', async () => {
      const componente = makeDescartado();
      const { useCase, componenteRepo, orden } = makeSetup(
        componente,
        Result.fail(new UnidadesErrors.UnidadDelComponenteNoDisponibleError(componente.id)),
      );

      const result = await useCase.execute(dto(componente.id));

      expect(result.getError()).toBeInstanceOf(UnidadDelComponenteNoDisponibleError);
      expect(orden).toEqual(['tx:inicio', 'lockEquipo', 'reinstalar', 'tx:fin']);
      expect(componenteRepo.save).not.toHaveBeenCalled();
      expect(componente.activo).toBe(false);
    });

    it('insumo que dejo de ser SERIE: el error de insumos llega tal cual y no se guarda', async () => {
      const componente = makeDescartado();
      const error = new UnidadesErrors.SeguimientoNoModificableError('ya no es SERIE');
      const { useCase, componenteRepo } = makeSetup(componente, Result.fail(error));

      const result = await useCase.execute(dto(componente.id));

      expect(result.getError()).toBe(error);
      expect(componenteRepo.save).not.toHaveBeenCalled();
    });

    it('si el guardado falla despues de reinstalar, la excepcion propaga (la transaccion revierte la unidad)', async () => {
      const componente = makeDescartado();
      const { useCase, componenteRepo } = makeSetup(componente);
      componenteRepo.save.mockRejectedValueOnce(new Error('conexion perdida'));

      await expect(useCase.execute(dto(componente.id))).rejects.toThrow('conexion perdida');
    });
  });
});
