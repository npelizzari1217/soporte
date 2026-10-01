import { describe, it, expect, vi } from 'vitest';
import { ResumenBajaEquipoUseCase } from './resumen-baja-equipo.use-case';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import {
  CATEGORIAS_BAJA_EQUIPO,
  EquipoInformaticoEntity,
  largoMaximoTextoBaja,
} from '../../domain/entities/equipo-informatico.entity';
import { EquipoDadoDeBajaError, EquipoNoEncontradoError } from '../../domain/errors/equipos.errors';
import type { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import type { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import type { ITicketSoporteRepository } from '../../domain/ports/i-ticket-soporte.repository';
import type { IInsumoRepository } from '../../../insumos/domain/ports/i-insumo.repository';
import type { RegistrarEntradaInsumoUseCase } from '../../../insumos/application/use-cases/registrar-entrada-insumo.use-case';
import { InsumoEntity } from '../../../insumos/domain/entities/insumo.entity';
import type { SeguimientoInsumo } from '../../../insumos/domain/entities/unidad-insumo.entity';
import { ESTADOS_TERMINALES } from '../../../tickets/domain/state-machine/estados.constants';
import { equipoDadoDeBaja, equipoVigente } from '../../testing/equipos-unit.fixtures';

/** `ResumenBajaEquipoUseCase` (baja-equipo-completo, R7, R10, R14): solo lectura, fakes tipados. */
describe('ResumenBajaEquipoUseCase', () => {
  function componente(
    id: string,
    opciones: {
      insumoId?: string;
      unidadId?: string | null;
      numeroSerie?: string | null;
      descripcion?: string | null;
    } = {},
  ): ComponenteEquipoEntity {
    return ComponenteEquipoEntity.create(
      {
        equipoId: 'equipo-1',
        insumoId: opciones.insumoId ?? 'insumo-ninguno',
        descripcion: opciones.descripcion ?? null,
        numeroSerie: opciones.numeroSerie ?? null,
        capacidad: null,
        unidadId: opciones.unidadId ?? null,
      },
      id,
    ).getValue();
  }

  function insumo(id: string, nombre: string, seguimiento: SeguimientoInsumo): InsumoEntity {
    return InsumoEntity.create(
      {
        codigo: id,
        nombre,
        familiaId: 'familia-1',
        unidadMedidaId: 'um-1',
        stockMinimo: null,
        activo: true,
        codigosAlternativos: [],
        compatibilidad: [],
        seguimiento,
      },
      id,
    );
  }

  function preparar(
    opciones: {
      equipo?: EquipoInformaticoEntity | null;
      componentes?: ComponenteEquipoEntity[];
      abiertos?: number;
      causas?: { componenteId: string; insumoId: string | null; causa: 'SERIAL_REQUERIDO' }[];
    } = {},
  ) {
    const equipo =
      opciones.equipo === undefined ? equipoVigente({ nombre: 'PC-1' }) : opciones.equipo;
    const insumos = new Map([
      ['insumo-ninguno', insumo('insumo-ninguno', 'Cable', 'NINGUNO')],
      ['insumo-serie', insumo('insumo-serie', 'Disco SSD', 'SERIE')],
    ]);
    const equipoRepo = {
      findById: vi.fn<IEquipoInformaticoRepository['findById']>(async () => equipo),
    } satisfies Pick<IEquipoInformaticoRepository, 'findById'>;
    const componenteRepo = {
      findActiveByEquipoId: vi.fn<IComponenteEquipoRepository['findActiveByEquipoId']>(
        async () => opciones.componentes ?? [],
      ),
    } satisfies Pick<IComponenteEquipoRepository, 'findActiveByEquipoId'>;
    const insumoRepo = {
      findById: vi.fn<IInsumoRepository['findById']>(async (id) => insumos.get(id) ?? null),
    } satisfies Pick<IInsumoRepository, 'findById'>;
    const ticketSoporteRepo = {
      contarAbiertosPorEquipo: vi.fn<ITicketSoporteRepository['contarAbiertosPorEquipo']>(
        async () => opciones.abiertos ?? 0,
      ),
    } satisfies Pick<ITicketSoporteRepository, 'contarAbiertosPorEquipo'>;
    const registrarEntrada = {
      diagnosticarDevolucionesDeEquipo: vi.fn<
        RegistrarEntradaInsumoUseCase['diagnosticarDevolucionesDeEquipo']
      >(async () => opciones.causas ?? []),
    } satisfies Pick<RegistrarEntradaInsumoUseCase, 'diagnosticarDevolucionesDeEquipo'>;

    const useCase = new ResumenBajaEquipoUseCase(
      equipoRepo,
      componenteRepo,
      insumoRepo,
      ticketSoporteRepo,
      registrarEntrada,
    );
    return { useCase, equipo, ticketSoporteRepo, registrarEntrada };
  }

  it('informa los tickets abiertos pasando los estados terminales del modulo de tickets', async () => {
    const { useCase, ticketSoporteRepo } = preparar({ abiertos: 2 });

    const resumen = (await useCase.execute({ equipoId: 'equipo-1' })).getValue();

    expect(resumen.ticketsAbiertos).toBe(2);
    expect(ticketSoporteRepo.contarAbiertosPorEquipo).toHaveBeenCalledWith('equipo-1', [
      ...ESTADOS_TERMINALES,
    ]);
  });

  it('largoMaximoTexto de cada categoria coincide con largoMaximoTextoBaja', async () => {
    const { useCase } = preparar({ equipo: equipoVigente({ nombre: 'Servidor Ñandú' }) });

    const resumen = (await useCase.execute({ equipoId: 'equipo-1' })).getValue();

    expect(Object.keys(resumen.largoMaximoTexto).sort()).toEqual(
      [...CATEGORIAS_BAJA_EQUIPO].sort(),
    );
    for (const categoria of CATEGORIAS_BAJA_EQUIPO) {
      expect(resumen.largoMaximoTexto[categoria]).toBe(
        largoMaximoTextoBaja('Servidor Ñandú', categoria),
      );
    }
  });

  it('un legado SERIE con serial de texto valido lo sugiere recortado; sin el, sugiere null', async () => {
    const { useCase } = preparar({
      componentes: [
        componente('c-con', { insumoId: 'insumo-serie', numeroSerie: '  LEG-1  ' }),
        componente('c-sin', { insumoId: 'insumo-serie', numeroSerie: '   ' }),
        componente('c-largo', { insumoId: 'insumo-serie', numeroSerie: 'ß'.repeat(200) }),
      ],
    });

    const { piezas } = (await useCase.execute({ equipoId: 'equipo-1' })).getValue();

    expect(piezas.map((p) => [p.componenteId, p.requiereSerial, p.serialSugerido])).toEqual([
      ['c-con', true, 'LEG-1'],
      ['c-sin', true, null],
      ['c-largo', true, null],
    ]);
  });

  it('una pieza con unidad o de un insumo NINGUNO no requiere serial ni lo sugiere', async () => {
    const { useCase, registrarEntrada } = preparar({
      componentes: [
        componente('c-unidad', {
          insumoId: 'insumo-serie',
          unidadId: 'unidad-1',
          numeroSerie: 'SN-U',
        }),
        componente('c-ninguno', { descripcion: 'Cable HDMI', numeroSerie: 'texto' }),
      ],
    });

    const { piezas } = (await useCase.execute({ equipoId: 'equipo-1' })).getValue();

    expect(piezas).toEqual([
      expect.objectContaining({
        componenteId: 'c-unidad',
        unidadId: 'unidad-1',
        numeroSerie: 'SN-U',
        insumoNombre: 'Disco SSD',
        seguimiento: 'SERIE',
        requiereSerial: false,
        serialSugerido: null,
      }),
      expect.objectContaining({
        componenteId: 'c-ninguno',
        descripcion: 'Cable HDMI',
        insumoNombre: 'Cable',
        seguimiento: 'NINGUNO',
        requiereSerial: false,
        serialSugerido: null,
      }),
    ]);
    expect(registrarEntrada.diagnosticarDevolucionesDeEquipo).toHaveBeenCalledWith([
      {
        componenteId: 'c-unidad',
        insumoId: 'insumo-serie',
        unidadId: 'unidad-1',
        numeroSerie: null,
      },
      { componenteId: 'c-ninguno', insumoId: 'insumo-ninguno', unidadId: null, numeroSerie: null },
    ]);
  });

  it('causaQueImpideDevolver sale del diagnostico de la baja, con el serial sugerido', async () => {
    const { useCase, registrarEntrada } = preparar({
      componentes: [
        componente('c-ok', { insumoId: 'insumo-serie', numeroSerie: 'LEG-1' }),
        componente('c-falta', { insumoId: 'insumo-serie', numeroSerie: null }),
      ],
      causas: [{ componenteId: 'c-falta', insumoId: 'insumo-serie', causa: 'SERIAL_REQUERIDO' }],
    });

    const { piezas } = (await useCase.execute({ equipoId: 'equipo-1' })).getValue();

    expect(piezas.map((p) => [p.componenteId, p.causaQueImpideDevolver])).toEqual([
      ['c-ok', null],
      ['c-falta', 'SERIAL_REQUERIDO'],
    ]);
    expect(registrarEntrada.diagnosticarDevolucionesDeEquipo).toHaveBeenCalledWith([
      { componenteId: 'c-ok', insumoId: 'insumo-serie', unidadId: null, numeroSerie: 'LEG-1' },
      { componenteId: 'c-falta', insumoId: 'insumo-serie', unidadId: null, numeroSerie: null },
    ]);
  });

  it('un equipo ya dado de baja responde EquipoDadoDeBajaError y no cuenta nada', async () => {
    const { useCase, ticketSoporteRepo } = preparar({ equipo: equipoDadoDeBaja() });

    const resultado = await useCase.execute({ equipoId: 'equipo-1' });

    expect(resultado.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
    expect(ticketSoporteRepo.contarAbiertosPorEquipo).not.toHaveBeenCalled();
  });

  it('un equipo inexistente o con borrado logico responde EquipoNoEncontradoError', async () => {
    const inexistente = await preparar({ equipo: null }).useCase.execute({ equipoId: 'x' });
    expect(inexistente.getError()).toBeInstanceOf(EquipoNoEncontradoError);

    const borrado = equipoVigente();
    borrado.softDelete();
    const conBorrado = await preparar({ equipo: borrado }).useCase.execute({ equipoId: 'x' });
    expect(conBorrado.getError()).toBeInstanceOf(EquipoNoEncontradoError);
  });
});
