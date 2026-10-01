import { describe, it, expect, vi } from 'vitest';
import { DarDeBajaEquipoUseCase, type DarDeBajaEquipoDto } from './dar-de-baja-equipo.use-case';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import type { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import {
  BajaEquipoConPiezasProblematicasError,
  EquipoDadoDeBajaError,
  EquipoModificadoDuranteLaBajaError,
  EquipoNoEncontradoError,
  MotivoBajaEquipoInvalidoError,
} from '../../domain/errors/equipos.errors';
import type { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import type { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import type { RegistrarEntradaInsumoUseCase } from '../../../insumos/application/use-cases/registrar-entrada-insumo.use-case';
import type { OperacionesUnidadInsumo } from '../../../insumos/application/services/operaciones-unidad-insumo.service';
import { FalloOperacionDeUnidad } from '../../../insumos/domain/errors/fallo-operacion-de-unidad';
import {
  DevolucionConPiezasProblematicasError,
  SerialDuplicadoError,
  UnidadNoDisponibleError,
} from '../../../insumos/domain/errors/unidades-insumo.errors';
import type { CausaPieza } from '../../../insumos/application/services/clasificar-pieza-devuelta';
import type { UnidadInsumoEntity } from '../../../insumos/domain/entities/unidad-insumo.entity';
import { DomainError, Result } from '../../../shared/domain/result';
import type { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { equipoDadoDeBaja, equipoVigente } from '../../testing/equipos-unit.fixtures';

/**
 * `DarDeBajaEquipoUseCase` (sdd/baja-equipo-completo, ADR-3 y ADR-4).
 *
 * Unit: los repos y los servicios de insumos van como fakes tipados. Que la excepcion interna
 * revierta de verdad lo prueba la integracion (WU-9 y WU-10); aca se prueba la orquestacion:
 * orden de llamadas, una sola leyenda, y que ningun `fail` salga de `run()` tras una escritura.
 */
describe('DarDeBajaEquipoUseCase', () => {
  const USUARIO = 'usuario-1';
  const AHORA = new Date('2026-10-01T12:00:00Z');

  function componente(
    id: string,
    opciones: { insumoId?: string; unidadId?: string | null } = {},
  ): ComponenteEquipoEntity {
    return ComponenteEquipoEntity.create(
      {
        equipoId: 'equipo-1',
        insumoId: opciones.insumoId ?? 'insumo-1',
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
        unidadId: opciones.unidadId ?? null,
      },
      id,
    ).getValue();
  }

  function preparar(
    opciones: {
      equipo?: EquipoInformaticoEntity;
      bloqueado?: EquipoInformaticoEntity | null;
      componentes?: ComponenteEquipoEntity[];
      segundaLectura?: ComponenteEquipoEntity[];
      registrarBaja?: boolean;
    } = {},
  ) {
    const orden: string[] = [];
    const equipo = opciones.equipo ?? equipoVigente({ nombre: 'PC-1' });
    const componentes = opciones.componentes ?? [];
    const lecturas = [componentes, opciones.segundaLectura ?? componentes];
    const estado = { revertida: false };

    const txRunner: Pick<ITenantTransactionRunner, 'run'> = {
      run: async <T>(fn: () => Promise<T>): Promise<T> => {
        orden.push('tx:inicio');
        try {
          return await fn();
        } catch (error) {
          estado.revertida = true;
          throw error;
        }
      },
    };
    const equipoRepo = {
      findById: vi.fn<IEquipoInformaticoRepository['findById']>(async () => equipo),
      bloquearParaModificar: vi.fn<IEquipoInformaticoRepository['bloquearParaModificar']>(
        async () => {
          orden.push('LE');
          return opciones.bloqueado === undefined ? equipo : opciones.bloqueado;
        },
      ),
      registrarBaja: vi.fn(async () => {
        orden.push('equipo');
        return opciones.registrarBaja ?? true;
      }),
    } satisfies Pick<
      IEquipoInformaticoRepository,
      'findById' | 'bloquearParaModificar' | 'registrarBaja'
    >;
    const componenteRepo = {
      findActiveByEquipoId: vi.fn(async () => lecturas.shift() ?? componentes),
      retirar: vi.fn<IComponenteEquipoRepository['retirar']>(async (c) => {
        orden.push(`L4:${c.id}`);
        return true;
      }),
    } satisfies Pick<IComponenteEquipoRepository, 'findActiveByEquipoId' | 'retirar'>;
    const registrarEntrada = {
      diagnosticarDevolucionesDeEquipo: vi.fn<
        RegistrarEntradaInsumoUseCase['diagnosticarDevolucionesDeEquipo']
      >(async () => []),
      registrarDevolucionesDeEquipo: vi.fn<
        RegistrarEntradaInsumoUseCase['registrarDevolucionesDeEquipo']
      >(async (dto) => {
        orden.push('stock');
        return Result.ok<Map<string, string>, DomainError>(
          new Map(dto.piezas.map((p) => [p.componenteId, `mov-${p.componenteId}`])),
        );
      }),
    } satisfies Pick<
      RegistrarEntradaInsumoUseCase,
      'diagnosticarDevolucionesDeEquipo' | 'registrarDevolucionesDeEquipo'
    >;
    const operaciones = {
      descartarInstaladas: vi.fn<OperacionesUnidadInsumo['descartarInstaladas']>(async () => {
        orden.push('stock');
        return Result.ok<UnidadInsumoEntity[], DomainError>([]);
      }),
    } satisfies Pick<OperacionesUnidadInsumo, 'descartarInstaladas'>;

    const useCase = new DarDeBajaEquipoUseCase(
      txRunner,
      equipoRepo,
      componenteRepo,
      registrarEntrada,
      operaciones,
      () => AHORA,
    );
    return {
      useCase,
      equipo,
      equipoRepo,
      componenteRepo,
      registrarEntrada,
      operaciones,
      orden,
      estado,
    };
  }

  function dto(sobrescribir: Partial<DarDeBajaEquipoDto> = {}): DarDeBajaEquipoDto {
    return {
      equipoId: 'equipo-1',
      destino: 'STOCK_USADO',
      categoria: 'VEJEZ',
      usuarioId: USUARIO,
      ...sobrescribir,
    };
  }

  describe('opcion A (STOCK_USADO)', () => {
    it('sigue el orden LE -> stock -> componentes por id -> equipo', async () => {
      const s = preparar({
        componentes: [componente('c-3'), componente('c-1'), componente('c-2')],
      });

      const resultado = await s.useCase.execute(dto());

      expect(resultado.isOk()).toBe(true);
      expect(s.orden).toEqual(['tx:inicio', 'LE', 'stock', 'L4:c-1', 'L4:c-2', 'L4:c-3', 'equipo']);
    });

    it('usa el mismo destino y la misma leyenda en las piezas, en stock y en el equipo', async () => {
      const piezas = [componente('c-1'), componente('c-2')];
      const s = preparar({ componentes: piezas });
      const leyenda = 'Baja del equipo «PC-1» — Donación: a la escuela N° 12';

      await s.useCase.execute(dto({ categoria: 'DONACION', motivo: '  a la escuela N° 12  ' }));

      const entrada = s.registrarEntrada.registrarDevolucionesDeEquipo.mock.calls[0][0];
      expect(entrada.motivo).toBe(leyenda);
      for (const pieza of piezas) {
        expect(pieza.bajaDestino).toBe('STOCK_USADO');
        expect(pieza.bajaMotivo).toBe(leyenda);
        expect(pieza.bajaMovimientoId).toBe(`mov-${pieza.id}`);
        expect(pieza.bajaUsuarioId).toBe(USUARIO);
      }
      expect(s.equipo.activo).toBe(false);
      expect(s.equipo.bajaDestino).toBe('STOCK_USADO');
      expect(s.equipo.bajaCategoria).toBe('DONACION');
      expect(s.equipo.bajaMotivo).toBe('a la escuela N° 12');
      expect(s.equipo.bajaFecha).toEqual(AHORA);
      expect(s.equipo.bajaUsuarioId).toBe(USUARIO);
    });

    it('sin texto la leyenda lleva solo la etiqueta y el equipo guarda motivo null', async () => {
      const s = preparar({ componentes: [componente('c-1')] });

      await s.useCase.execute(dto({ motivo: '   ' }));

      expect(s.registrarEntrada.registrarDevolucionesDeEquipo.mock.calls[0][0].motivo).toBe(
        'Baja del equipo «PC-1» — Vejez',
      );
      expect(s.equipo.bajaMotivo).toBeNull();
    });

    it('pasa los seriales por componenteId solo a los legados e ignora el de una unidad', async () => {
      const s = preparar({
        componentes: [componente('c-1'), componente('c-2', { unidadId: 'u-2' })],
      });

      await s.useCase.execute(
        dto({
          seriales: [
            { componenteId: 'c-1', numeroSerie: 'LEG-1' },
            { componenteId: 'c-2', numeroSerie: 'IGNORADO' },
          ],
        }),
      );

      const { piezas } = s.registrarEntrada.registrarDevolucionesDeEquipo.mock.calls[0][0];
      expect(piezas).toEqual([
        { componenteId: 'c-1', insumoId: 'insumo-1', unidadId: null, numeroSerie: 'LEG-1' },
        { componenteId: 'c-2', insumoId: 'insumo-1', unidadId: 'u-2', numeroSerie: null },
      ]);
    });

    it('un legado sin serial informado viaja con numeroSerie null (stock lo rechaza)', async () => {
      const s = preparar({ componentes: [componente('c-1')] });

      await s.useCase.execute(dto());

      expect(
        s.registrarEntrada.registrarDevolucionesDeEquipo.mock.calls[0][0].piezas[0].numeroSerie,
      ).toBeNull();
    });
  });

  describe('opcion B (DESCARTE)', () => {
    it('no exige seriales, no diagnostica y no devuelve stock', async () => {
      const piezas = [componente('c-1'), componente('c-2'), componente('c-3')];
      const s = preparar({ componentes: piezas });

      const resultado = await s.useCase.execute(dto({ destino: 'DESCARTE' }));

      expect(resultado.isOk()).toBe(true);
      expect(s.registrarEntrada.diagnosticarDevolucionesDeEquipo).not.toHaveBeenCalled();
      expect(s.registrarEntrada.registrarDevolucionesDeEquipo).not.toHaveBeenCalled();
      expect(s.operaciones.descartarInstaladas).not.toHaveBeenCalled();
      for (const pieza of piezas) {
        expect(pieza.bajaDestino).toBe('DESCARTE');
        expect(pieza.bajaMovimientoId).toBeNull();
      }
    });

    it('descarta las unidades ordenadas por unidadId con la misma leyenda', async () => {
      const s = preparar({
        componentes: [
          componente('c-1', { unidadId: 'u-9' }),
          componente('c-2'),
          componente('c-3', { unidadId: 'u-2' }),
        ],
      });

      await s.useCase.execute(
        dto({ destino: 'DESCARTE', categoria: 'ROTURA', motivo: 'no enciende' }),
      );

      const [items, contexto] = s.operaciones.descartarInstaladas.mock.calls[0];
      expect(items.map((i) => i.unidadId)).toEqual(['u-2', 'u-9']);
      expect(items.map((i) => i.componenteId)).toEqual(['c-3', 'c-1']);
      expect(contexto).toEqual({
        usuarioId: USUARIO,
        motivo: 'Baja del equipo «PC-1» — Rotura: no enciende',
      });
      expect(s.orden).toEqual(['tx:inicio', 'LE', 'stock', 'L4:c-1', 'L4:c-2', 'L4:c-3', 'equipo']);
    });
  });

  describe('atomicidad', () => {
    it('un fail del stock se lanza dentro de run(): revierte y no marca el equipo', async () => {
      const s = preparar({ componentes: [componente('c-1')] });
      s.registrarEntrada.registrarDevolucionesDeEquipo.mockResolvedValueOnce(
        Result.fail(new UnidadNoDisponibleError('u-1', 'ya no esta instalada')),
      );

      const resultado = await s.useCase.execute(dto());

      expect(resultado.isFail()).toBe(true);
      expect(resultado.getError()).toBeInstanceOf(UnidadNoDisponibleError);
      expect(s.estado.revertida).toBe(true);
      expect(s.componenteRepo.retirar).not.toHaveBeenCalled();
      expect(s.equipoRepo.registrarBaja).not.toHaveBeenCalled();
    });

    it('traduce DevolucionConPiezasProblematicasError a BajaEquipoConPiezasProblematicasError', async () => {
      const s = preparar({ componentes: [componente('c-1')] });
      s.registrarEntrada.registrarDevolucionesDeEquipo.mockResolvedValueOnce(
        Result.fail(
          new DevolucionConPiezasProblematicasError([
            { componenteId: 'c-1', insumoId: 'insumo-1', causa: 'SERIAL_REQUERIDO' },
          ]),
        ),
      );

      const resultado = await s.useCase.execute(dto());

      const error = resultado.getError();
      expect(error).toBeInstanceOf(BajaEquipoConPiezasProblematicasError);
      expect((error as BajaEquipoConPiezasProblematicasError).piezas).toEqual([
        { componenteId: 'c-1', insumoId: 'insumo-1', causa: 'SERIAL_REQUERIDO' },
      ]);
      expect(s.estado.revertida).toBe(true);
    });

    it('desenvuelve FalloOperacionDeUnidad (P2002 residual) como fail traducido', async () => {
      const s = preparar({ componentes: [componente('c-1')] });
      s.registrarEntrada.registrarDevolucionesDeEquipo.mockRejectedValueOnce(
        new FalloOperacionDeUnidad(
          new DevolucionConPiezasProblematicasError([
            { componenteId: 'c-1', insumoId: 'insumo-1', causa: 'SERIAL_DUPLICADO' },
          ]),
        ),
      );

      const resultado = await s.useCase.execute(dto());

      expect(resultado.getError()).toBeInstanceOf(BajaEquipoConPiezasProblematicasError);
      expect(s.estado.revertida).toBe(true);
      expect(s.equipoRepo.registrarBaja).not.toHaveBeenCalled();
    });

    it('un SerialDuplicadoError suelto en FalloOperacionDeUnidad se informa tal cual', async () => {
      const s = preparar({ componentes: [componente('c-1')] });
      s.registrarEntrada.registrarDevolucionesDeEquipo.mockRejectedValueOnce(
        new FalloOperacionDeUnidad(new SerialDuplicadoError('A1')),
      );

      const resultado = await s.useCase.execute(dto());

      expect(resultado.getError()).toBeInstanceOf(SerialDuplicadoError);
    });

    it('un fail del descarte revierte sin marcar el equipo', async () => {
      const s = preparar({ componentes: [componente('c-1', { unidadId: 'u-1' })] });
      s.operaciones.descartarInstaladas.mockResolvedValueOnce(
        Result.fail(new UnidadNoDisponibleError('u-1', 'ya no esta instalada')),
      );

      const resultado = await s.useCase.execute(dto({ destino: 'DESCARTE' }));

      expect(resultado.getError()).toBeInstanceOf(UnidadNoDisponibleError);
      expect(s.estado.revertida).toBe(true);
      expect(s.equipoRepo.registrarBaja).not.toHaveBeenCalled();
    });

    it('registrarBaja en false da fail y revierte', async () => {
      const s = preparar({ componentes: [componente('c-1')], registrarBaja: false });

      const resultado = await s.useCase.execute(dto());

      expect(resultado.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
      expect(s.estado.revertida).toBe(true);
    });

    it('un CAS de componente en 0 filas revierte y no marca el equipo', async () => {
      const s = preparar({ componentes: [componente('c-1')] });
      s.componenteRepo.retirar.mockResolvedValueOnce(false);

      const resultado = await s.useCase.execute(dto());

      expect(resultado.isFail()).toBe(true);
      expect(s.estado.revertida).toBe(true);
      expect(s.equipoRepo.registrarBaja).not.toHaveBeenCalled();
    });

    it('otra excepcion (no de dominio) propaga', async () => {
      const s = preparar({ componentes: [componente('c-1')] });
      s.registrarEntrada.registrarDevolucionesDeEquipo.mockRejectedValueOnce(new Error('db caida'));

      await expect(s.useCase.execute(dto())).rejects.toThrow('db caida');
    });

    it('si el conjunto de piezas cambio antes del lock da EquipoModificadoDuranteLaBajaError', async () => {
      const s = preparar({
        componentes: [componente('c-1')],
        segundaLectura: [componente('c-1'), componente('c-2')],
      });

      const resultado = await s.useCase.execute(dto());

      expect(resultado.getError()).toBeInstanceOf(EquipoModificadoDuranteLaBajaError);
      expect(s.registrarEntrada.registrarDevolucionesDeEquipo).not.toHaveBeenCalled();
      expect(s.estado.revertida).toBe(true);
    });
  });

  describe('equipo y borde', () => {
    it('un equipo sin piezas se marca sin tocar stock ni componentes', async () => {
      const s = preparar({ componentes: [] });

      const resultado = await s.useCase.execute(dto());

      expect(resultado.isOk()).toBe(true);
      expect(s.registrarEntrada.registrarDevolucionesDeEquipo).not.toHaveBeenCalled();
      expect(s.operaciones.descartarInstaladas).not.toHaveBeenCalled();
      expect(s.componenteRepo.retirar).not.toHaveBeenCalled();
      expect(s.orden).toEqual(['tx:inicio', 'LE', 'equipo']);
    });

    it('un equipo ya dado de baja se rechaza sin abrir la transaccion', async () => {
      const s = preparar({ equipo: equipoDadoDeBaja() });

      const resultado = await s.useCase.execute(dto());

      expect(resultado.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
      expect(s.orden).toEqual([]);
    });

    it('un equipo dado de baja por otra baja concurrente se detecta bajo el LE', async () => {
      const s = preparar({ componentes: [componente('c-1')], bloqueado: equipoDadoDeBaja() });

      const resultado = await s.useCase.execute(dto());

      expect(resultado.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
      expect(s.estado.revertida).toBe(true);
      expect(s.registrarEntrada.registrarDevolucionesDeEquipo).not.toHaveBeenCalled();
    });

    it('un equipo con borrado logico es no encontrado', async () => {
      const equipo = equipoVigente();
      equipo.softDelete();
      const s = preparar({ equipo });

      const resultado = await s.useCase.execute(dto());

      expect(resultado.getError()).toBeInstanceOf(EquipoNoEncontradoError);
      expect(s.orden).toEqual([]);
    });

    it('un equipo inexistente es no encontrado', async () => {
      const s = preparar();
      s.equipoRepo.findById.mockResolvedValueOnce(null);

      const resultado = await s.useCase.execute(dto());

      expect(resultado.getError()).toBeInstanceOf(EquipoNoEncontradoError);
    });

    it('un equipo borrado entre la lectura y el LE es no encontrado', async () => {
      const s = preparar({ componentes: [componente('c-1')], bloqueado: null });

      const resultado = await s.useCase.execute(dto());

      expect(resultado.getError()).toBeInstanceOf(EquipoNoEncontradoError);
      expect(s.estado.revertida).toBe(true);
    });

    it('un destino fuera del catalogo se rechaza y no cambia nada', async () => {
      const s = preparar({ componentes: [componente('c-1')] });

      const resultado = await s.useCase.execute(dto({ destino: 'REGALO' }));

      expect(resultado.getError()).toBeInstanceOf(MotivoBajaEquipoInvalidoError);
      expect(s.orden).toEqual([]);
    });
  });

  describe('motivo y leyenda', () => {
    it.each([
      ['sin texto', undefined],
      ['solo espacios', '   '],
    ])('la categoria OTRA %s se rechaza', async (_caso, motivo) => {
      const s = preparar({ componentes: [componente('c-1')] });

      const resultado = await s.useCase.execute(dto({ categoria: 'OTRA', motivo }));

      const error = resultado.getError();
      expect(error).toBeInstanceOf(MotivoBajaEquipoInvalidoError);
      expect((error as MotivoBajaEquipoInvalidoError).largoMaximo).toBeUndefined();
      expect(s.orden).toEqual([]);
    });

    it('la categoria OTRA con texto se acepta', async () => {
      const s = preparar();

      const resultado = await s.useCase.execute(dto({ categoria: 'OTRA', motivo: ' lo pidio X ' }));

      expect(resultado.isOk()).toBe(true);
      expect(s.equipo.bajaMotivo).toBe('lo pidio X');
    });

    it('una categoria fuera del catalogo se rechaza', async () => {
      const s = preparar();

      const resultado = await s.useCase.execute(dto({ categoria: 'OTROS' }));

      expect(resultado.getError()).toBeInstanceOf(MotivoBajaEquipoInvalidoError);
      expect(s.orden).toEqual([]);
    });

    it('un texto que completa exactamente 500 caracteres de leyenda se acepta', async () => {
      // 'PC-1' (4) + 23 fijos + 'Vejez' (5) deja 468 para el texto.
      const s = preparar({ componentes: [componente('c-1')] });

      const resultado = await s.useCase.execute(dto({ motivo: 'x'.repeat(468) }));

      expect(resultado.isOk()).toBe(true);
      const { motivo } = s.registrarEntrada.registrarDevolucionesDeEquipo.mock.calls[0][0];
      expect(motivo).toHaveLength(500);
    });

    it('un texto de un caracter de mas se rechaza con largoMaximo y no cambia nada', async () => {
      const s = preparar({ componentes: [componente('c-1')] });

      const resultado = await s.useCase.execute(dto({ motivo: 'x'.repeat(469) }));

      const error = resultado.getError();
      expect(error).toBeInstanceOf(MotivoBajaEquipoInvalidoError);
      expect((error as MotivoBajaEquipoInvalidoError).largoMaximo).toBe(468);
      expect(s.orden).toEqual([]);
      expect(s.equipo.activo).toBe(true);
    });

    it('si el nombre crecio antes del LE, el largo se revalida bajo el lock', async () => {
      const s = preparar({
        componentes: [componente('c-1')],
        bloqueado: equipoVigente({ nombre: 'N'.repeat(255) }),
      });

      const resultado = await s.useCase.execute(dto({ motivo: 'x'.repeat(468) }));

      expect((resultado.getError() as MotivoBajaEquipoInvalidoError).largoMaximo).toBe(
        500 - (255 + 23 + 5),
      );
      expect(s.estado.revertida).toBe(true);
      expect(s.registrarEntrada.registrarDevolucionesDeEquipo).not.toHaveBeenCalled();
    });
  });

  describe('diagnostico previo (STOCK_USADO)', () => {
    it('junta TODAS las piezas problematicas en un solo error y no abre la transaccion', async () => {
      const s = preparar({
        componentes: [componente('c-1'), componente('c-2'), componente('c-3')],
      });
      const causas: CausaPieza[] = [
        { componenteId: 'c-1', insumoId: 'insumo-1', causa: 'INSUMO_BORRADO' },
        { componenteId: 'c-3', insumoId: 'insumo-1', causa: 'SERIAL_DUPLICADO' },
      ];
      s.registrarEntrada.diagnosticarDevolucionesDeEquipo.mockResolvedValueOnce(causas);

      const resultado = await s.useCase.execute(dto());

      const error = resultado.getError();
      expect(error).toBeInstanceOf(BajaEquipoConPiezasProblematicasError);
      expect((error as BajaEquipoConPiezasProblematicasError).piezas).toEqual(causas);
      expect(s.orden).toEqual([]);
      expect(s.equipoRepo.bloquearParaModificar).not.toHaveBeenCalled();
    });
  });
});
