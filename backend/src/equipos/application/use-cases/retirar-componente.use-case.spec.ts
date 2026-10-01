import { describe, it, expect, vi } from 'vitest';
import { RetirarComponenteUseCase } from './retirar-componente.use-case';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { MovimientoInsumoEntity } from '../../../insumos/domain/entities/movimiento-insumo.entity';
import type { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { Result } from '../../../shared/domain/result';
import {
  ComponenteDadoDeBajaError,
  ComponenteNoEncontradoError,
  MotivoRetiroRequeridoError,
} from '../../domain/errors/equipos.errors';
import { CondicionUsadoNoAdmitidaError } from '../../../insumos/domain/errors/insumos.errors';
import {
  SerialDuplicadoError,
  UnidadNoDisponibleError,
} from '../../../insumos/domain/errors/unidades-insumo.errors';

/**
 * `RetirarComponenteUseCase` (sdd/stock-usado-componentes, ADR-4).
 *
 * Unit: la ENTRADA y el repo van mockeados. Que la excepcion interna revierta
 * de verdad contra Postgres lo prueba el spec de integracion; aca se prueba la
 * orquestacion: orden ENTRADA -> marca, y que un fallo lance dentro de `run()`.
 */
describe('RetirarComponenteUseCase', () => {
  const USUARIO = 'usuario-uuid';

  function makeComponente(instalacionMovimientoId: string | null = null) {
    return ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      insumoId: 'insumo-1',
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
      instalacionMovimientoId,
    }).getValue();
  }

  function makeEntrada() {
    return MovimientoInsumoEntity.create({
      insumoId: 'insumo-1',
      tipo: 'ENTRADA',
      condicion: 'USADO',
      cantidad: 1,
      usuarioId: USUARIO,
      equipoId: 'equipo-1',
    }).getValue();
  }

  /** Runner fake: ejecuta el callback y deja propagar la excepcion, como el real al revertir. */
  function makeSetup(
    componente: ComponenteEquipoEntity | null,
    opciones: { entrada?: unknown; marcado?: boolean; descarte?: unknown } = {},
  ) {
    const orden: string[] = [];
    const txRunner = { run: vi.fn((fn: () => unknown) => fn()) };
    const componenteRepo = {
      findById: vi.fn().mockResolvedValue(componente),
      retirar: vi.fn(async () => {
        orden.push('retirar');
        return opciones.marcado ?? true;
      }),
    };
    const equipoRepo = {
      bloquearParaOperarPiezas: vi.fn(async () => {
        orden.push('lock-equipo');
        return null;
      }),
    } satisfies Pick<IEquipoInformaticoRepository, 'bloquearParaOperarPiezas'>;
    const registrarEntrada = {
      registrarDevolucionDeComponente: vi.fn(async () => {
        orden.push('entrada');
        return opciones.entrada ?? Result.ok(makeEntrada());
      }),
    };
    const operaciones = {
      descartarInstaladas: vi.fn(async () => {
        orden.push('descartar');
        return opciones.descarte ?? Result.ok([]);
      }),
    };
    const useCase = new RetirarComponenteUseCase(
      txRunner as never,
      equipoRepo,
      componenteRepo as never,
      registrarEntrada as never,
      operaciones as never,
    );
    return { useCase, txRunner, equipoRepo, componenteRepo, registrarEntrada, operaciones, orden };
  }

  const dto = (componenteId: string, extra: Record<string, unknown> = {}) => ({
    equipoId: 'equipo-1',
    componenteId,
    destino: 'STOCK_USADO' as const,
    usuarioId: USUARIO,
    ...extra,
  });

  it('STOCK_USADO: la ENTRADA va ANTES de la marca y el componente apunta a ella', async () => {
    const componente = makeComponente('salida-1');
    const { useCase, orden, registrarEntrada, txRunner } = makeSetup(componente);

    const result = await useCase.execute(dto(componente.id, { motivo: '  se cambio  ' }));

    expect(result.isOk()).toBe(true);
    expect(orden).toEqual(['lock-equipo', 'entrada', 'retirar']);
    expect(txRunner.run).toHaveBeenCalledTimes(1);
    expect(registrarEntrada.registrarDevolucionDeComponente).toHaveBeenCalledWith({
      insumoId: 'insumo-1',
      equipoId: 'equipo-1',
      usuarioId: USUARIO,
      motivo: 'se cambio',
      unidadId: null,
      componenteId: componente.id,
      numeroSerie: undefined,
    });
    expect(componente.bajaDestino).toBe('STOCK_USADO');
    expect(componente.bajaMotivo).toBe('se cambio');
    expect(componente.bajaMovimientoId).not.toBeNull();
    expect(componente.isDeleted()).toBe(true);
  });

  it('STOCK_USADO con SALIDA vinculada y sin motivo: completa con bajaSinSalidaPrevia = false', async () => {
    const componente = makeComponente('salida-1');
    const { useCase } = makeSetup(componente);

    const result = await useCase.execute(dto(componente.id));

    expect(result.isOk()).toBe(true);
    expect(componente.bajaSinSalidaPrevia).toBe(false);
  });

  it('STOCK_USADO sin SALIDA vinculada y con motivo: completa con bajaSinSalidaPrevia = true', async () => {
    const componente = makeComponente(null);
    const { useCase } = makeSetup(componente);

    const result = await useCase.execute(dto(componente.id, { motivo: 'venia de otro equipo' }));

    expect(result.isOk()).toBe(true);
    expect(componente.bajaSinSalidaPrevia).toBe(true);
  });

  it('toma el lock del equipo (LE FOR SHARE) dentro de la transaccion, antes de cualquier escritura', async () => {
    const componente = makeComponente('salida-1');
    const { useCase, equipoRepo, txRunner } = makeSetup(componente);

    await useCase.execute(dto(componente.id));

    expect(equipoRepo.bloquearParaOperarPiezas).toHaveBeenCalledWith('equipo-1');
    expect(txRunner.run).toHaveBeenCalledTimes(1);
  });

  it('rechazos previos a la transaccion no toman el lock del equipo', async () => {
    const { useCase, equipoRepo } = makeSetup(null);

    const result = await useCase.execute(dto('inexistente'));

    expect(result.getError()).toBeInstanceOf(ComponenteNoEncontradoError);
    expect(equipoRepo.bloquearParaOperarPiezas).not.toHaveBeenCalled();
  });

  it('STOCK_USADO sin SALIDA vinculada y sin motivo: rechazo, sin transaccion ni movimiento', async () => {
    const componente = makeComponente(null);
    const { useCase, txRunner, registrarEntrada } = makeSetup(componente);

    const result = await useCase.execute(dto(componente.id));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MotivoRetiroRequeridoError);
    expect(txRunner.run).not.toHaveBeenCalled();
    expect(registrarEntrada.registrarDevolucionDeComponente).not.toHaveBeenCalled();
  });

  it.each([undefined, null, '', '   '])(
    'DESCARTE con motivo %j: rechazo sin tocar nada',
    async (motivo) => {
      const componente = makeComponente('salida-1');
      const { useCase, txRunner } = makeSetup(componente);

      const result = await useCase.execute(dto(componente.id, { destino: 'DESCARTE', motivo }));

      expect(result.getError()).toBeInstanceOf(MotivoRetiroRequeridoError);
      expect(txRunner.run).not.toHaveBeenCalled();
    },
  );

  it('DESCARTE con motivo de mas de 500 caracteres: el contrato lanza y no toca nada', async () => {
    const componente = makeComponente('salida-1');
    const { useCase, txRunner } = makeSetup(componente);

    await expect(
      useCase.execute(dto(componente.id, { destino: 'DESCARTE', motivo: 'x'.repeat(501) })),
    ).rejects.toThrow(/excede 500/);
    expect(txRunner.run).not.toHaveBeenCalled();
  });

  it('DESCARTE con motivo: no toca stock y la baja no lleva movimiento', async () => {
    const componente = makeComponente('salida-1');
    const { useCase, registrarEntrada, componenteRepo } = makeSetup(componente);

    const result = await useCase.execute(
      dto(componente.id, { destino: 'DESCARTE', motivo: 'quemado' }),
    );

    expect(result.isOk()).toBe(true);
    expect(registrarEntrada.registrarDevolucionDeComponente).not.toHaveBeenCalled();
    expect(componenteRepo.retirar).toHaveBeenCalledWith(componente);
    expect(componente.bajaMovimientoId).toBeNull();
    expect(componente.bajaDestino).toBe('DESCARTE');
  });

  it('componente ya retirado: rechazo sin movimiento', async () => {
    const componente = makeComponente('salida-1');
    componente.retirar({
      destino: 'DESCARTE',
      motivo: 'x',
      usuarioId: USUARIO,
      bajaMovimientoId: null,
    });
    const { useCase, registrarEntrada, txRunner } = makeSetup(componente);

    const result = await useCase.execute(dto(componente.id, { destino: 'DESCARTE', motivo: 'y' }));

    expect(result.getError()).toBeInstanceOf(ComponenteDadoDeBajaError);
    expect(txRunner.run).not.toHaveBeenCalled();
    expect(registrarEntrada.registrarDevolucionDeComponente).not.toHaveBeenCalled();
  });

  it('componente inexistente o de OTRO equipo: ComponenteNoEncontradoError', async () => {
    const otro = makeComponente('salida-1');
    for (const encontrado of [null, otro]) {
      const { useCase } = makeSetup(encontrado);
      const result = await useCase.execute({ ...dto('x'), equipoId: 'equipo-2' });
      expect(result.getError()).toBeInstanceOf(ComponenteNoEncontradoError);
    }
  });

  it('la ENTRADA falla (insumo no repuesto): lanza dentro de run(), no marca y devuelve el error original', async () => {
    const componente = makeComponente('salida-1');
    const error = new CondicionUsadoNoAdmitidaError('insumo-1');
    const { useCase, componenteRepo, txRunner } = makeSetup(componente, {
      entrada: Result.fail(error),
    });

    const result = await useCase.execute(dto(componente.id));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    expect(componenteRepo.retirar).not.toHaveBeenCalled();
    // El fallo se propago como excepcion por `run()` (lo que revierte en Postgres).
    await expect(txRunner.run.mock.results[0].value).rejects.toThrow(/retiro del componente/);
  });

  it('la marca toca 0 filas (retiro concurrente): lanza dentro de run() para revertir la ENTRADA', async () => {
    const componente = makeComponente('salida-1');
    const { useCase, txRunner, orden } = makeSetup(componente, { marcado: false });

    const result = await useCase.execute(dto(componente.id));

    expect(orden).toEqual(['lock-equipo', 'entrada', 'retirar']);
    expect(result.getError()).toBeInstanceOf(ComponenteDadoDeBajaError);
    await expect(txRunner.run.mock.results[0].value).rejects.toThrow(/retiro del componente/);
  });

  it('una excepcion ajena (base caida) propaga sin convertirse en Result', async () => {
    const componente = makeComponente('salida-1');
    const { useCase, componenteRepo } = makeSetup(componente);
    componenteRepo.retirar.mockRejectedValueOnce(new Error('conexion perdida'));

    await expect(useCase.execute(dto(componente.id))).rejects.toThrow('conexion perdida');
  });

  describe('con unidad (sdd/repuestos-numero-de-serie, ADR-12)', () => {
    function makeConUnidad(): ComponenteEquipoEntity {
      return ComponenteEquipoEntity.create({
        equipoId: 'equipo-1',
        insumoId: 'insumo-1',
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
        unidadId: 'unidad-1',
        instalacionMovimientoId: 'salida-1',
      }).getValue();
    }

    it('STOCK_USADO: la devolucion recibe la unidad y el componente, y la marca va despues', async () => {
      const componente = makeConUnidad();
      const { useCase, orden, registrarEntrada } = makeSetup(componente);

      const result = await useCase.execute(dto(componente.id, { numeroSerie: 'IGNORADO' }));

      expect(result.isOk()).toBe(true);
      expect(orden).toEqual(['lock-equipo', 'entrada', 'retirar']);
      expect(registrarEntrada.registrarDevolucionDeComponente).toHaveBeenCalledWith(
        expect.objectContaining({ unidadId: 'unidad-1', componenteId: componente.id }),
      );
    });

    it('DESCARTE: descarta la unidad (con insumo, equipo y componente) ANTES de marcar el componente, sin ENTRADA', async () => {
      const componente = makeConUnidad();
      const { useCase, orden, operaciones, registrarEntrada } = makeSetup(componente);

      const result = await useCase.execute(
        dto(componente.id, { destino: 'DESCARTE', motivo: 'se rompio' }),
      );

      expect(result.isOk()).toBe(true);
      expect(orden).toEqual(['lock-equipo', 'descartar', 'retirar']);
      expect(operaciones.descartarInstaladas).toHaveBeenCalledWith(
        [
          {
            unidadId: 'unidad-1',
            equipoId: 'equipo-1',
            componenteId: componente.id,
            insumoId: 'insumo-1',
          },
        ],
        { usuarioId: USUARIO, motivo: 'se rompio' },
      );
      expect(registrarEntrada.registrarDevolucionDeComponente).not.toHaveBeenCalled();
      expect(componente.bajaDestino).toBe('DESCARTE');
    });

    it('DESCARTE de un componente sin unidad (legado): no toca la unidad', async () => {
      const componente = makeComponente('salida-1');
      const { useCase, operaciones } = makeSetup(componente);

      const result = await useCase.execute(
        dto(componente.id, { destino: 'DESCARTE', motivo: 'se rompio' }),
      );

      expect(result.isOk()).toBe(true);
      expect(operaciones.descartarInstaladas).not.toHaveBeenCalled();
    });

    it('STOCK_USADO legado: el serial del DTO viaja a la devolucion', async () => {
      const componente = makeComponente('salida-1');
      const { useCase, registrarEntrada } = makeSetup(componente);

      await useCase.execute(dto(componente.id, { numeroSerie: 'SN-1' }));

      expect(registrarEntrada.registrarDevolucionDeComponente).toHaveBeenCalledWith(
        expect.objectContaining({ unidadId: null, numeroSerie: 'SN-1' }),
      );
    });

    it('un fallo que no es UNIDAD_NO_DISPONIBLE (p. ej. serial duplicado) no relee el componente', async () => {
      const componente = makeConUnidad();
      const error = new SerialDuplicadoError('SN-1');
      const { useCase, componenteRepo } = makeSetup(componente, { entrada: Result.fail(error) });

      const result = await useCase.execute(dto(componente.id));

      expect(result.getError()).toBe(error);
      expect(componenteRepo.findById).toHaveBeenCalledTimes(1);
    });

    it('si falla el descarte de la unidad: el error sale como Result y la marca nunca se intenta', async () => {
      const componente = makeConUnidad();
      const error = new MotivoRetiroRequeridoError('DESCARTE');
      const { useCase, componenteRepo, txRunner } = makeSetup(componente, {
        descarte: Result.fail(error),
      });

      const result = await useCase.execute(
        dto(componente.id, { destino: 'DESCARTE', motivo: 'x' }),
      );

      expect(result.getError()).toBe(error);
      expect(componenteRepo.retirar).not.toHaveBeenCalled();
      await expect(txRunner.run.mock.results[0].value).rejects.toThrow(/retiro del componente/);
    });

    it('si la unidad falla porque otro retiro del mismo componente comiteo primero: ComponenteDadoDeBaja', async () => {
      const componente = makeConUnidad();
      const yaRetirado = makeConUnidad();
      yaRetirado.retirar({
        destino: 'DESCARTE',
        motivo: 'x',
        usuarioId: USUARIO,
        bajaMovimientoId: null,
      });
      const { useCase, componenteRepo } = makeSetup(componente, {
        descarte: Result.fail(new UnidadNoDisponibleError('unidad-1', 'ya no esta instalada')),
      });
      componenteRepo.findById.mockResolvedValueOnce(componente).mockResolvedValueOnce(yaRetirado);

      const result = await useCase.execute(
        dto(componente.id, { destino: 'DESCARTE', motivo: 'x' }),
      );

      expect(result.getError()).toBeInstanceOf(ComponenteDadoDeBajaError);
    });
  });
});
