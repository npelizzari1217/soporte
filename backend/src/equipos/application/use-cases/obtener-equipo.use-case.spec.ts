import { describe, it, expect, vi } from 'vitest';
import { ObtenerEquipoUseCase } from './obtener-equipo.use-case';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { EquipoNoEncontradoError } from '../../domain/errors/equipos.errors';

/**
 * sdd/catalogo-unico-componentes (ADR-6): `ObtenerEquipoUseCase` resuelve
 * `{tipoNombre, tipoActivo}` de cada componente SOLO por la familia de su
 * insumo (`IInsumoRepository.findFamiliasDeInsumos`, una consulta al tenant).
 * MASTER no se consulta.
 */
describe('ObtenerEquipoUseCase', () => {
  function makeEquipo() {
    return EquipoInformaticoEntity.create({
      nombre: 'X',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacion: null,
      importe: null,
      fechaValoracion: null,
      observaciones: null,
      valorResidual: null,
      fechaValorResidual: null,
    });
  }

  function makeComponente(equipoId: string, insumoId: string = 'insumo-1') {
    return ComponenteEquipoEntity.create({
      equipoId,
      insumoId,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    }).getValue();
  }

  function makeUseCase(overrides: {
    equipoRepo?: unknown;
    componenteRepo?: unknown;
    insumoRepo?: unknown;
  }) {
    return new ObtenerEquipoUseCase(
      (overrides.equipoRepo ?? { findById: vi.fn() }) as never,
      (overrides.componenteRepo ?? { findAllByEquipoId: vi.fn() }) as never,
      (overrides.insumoRepo ?? { findFamiliasDeInsumos: vi.fn() }) as never,
    );
  }

  function familia(nombre: string, flags: { activo: boolean; deletedAt: Date | null }) {
    return { insumoId: 'insumo-1', codigo: 'TORNILLO', nombre, ...flags };
  }

  it('retorna el equipo y sus componentes con el tipo de la familia (familia activa)', async () => {
    const equipo = makeEquipo();
    const componente = makeComponente(equipo.id);
    const insumoRepo = {
      findFamiliasDeInsumos: vi
        .fn()
        .mockResolvedValue(
          new Map([['insumo-1', familia('Tornillos', { activo: true, deletedAt: null })]]),
        ),
    };
    const useCase = makeUseCase({
      equipoRepo: { findById: vi.fn().mockResolvedValue(equipo) },
      componenteRepo: { findAllByEquipoId: vi.fn().mockResolvedValue([componente]) },
      insumoRepo,
    });

    const result = await useCase.execute({ equipoId: equipo.id });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().equipo.id).toBe(equipo.id);
    expect(result.getValue().componentes).toEqual([
      { componente, tipoNombre: 'Tornillos', tipoActivo: true },
    ]);
    expect(insumoRepo.findFamiliasDeInsumos).toHaveBeenCalledTimes(1);
    expect(insumoRepo.findFamiliasDeInsumos).toHaveBeenCalledWith(['insumo-1']);
  });

  it.each([
    ['deshabilitada', { activo: false, deletedAt: null }],
    ['soft-deleted', { activo: true, deletedAt: new Date() }],
  ])('familia %s → tipoNombre presente, tipoActivo false', async (_caso, flags) => {
    const equipo = makeEquipo();
    const componente = makeComponente(equipo.id);
    const useCase = makeUseCase({
      equipoRepo: { findById: vi.fn().mockResolvedValue(equipo) },
      componenteRepo: { findAllByEquipoId: vi.fn().mockResolvedValue([componente]) },
      insumoRepo: {
        findFamiliasDeInsumos: vi
          .fn()
          .mockResolvedValue(new Map([['insumo-1', familia('Tornillos', flags)]])),
      },
    });

    const result = await useCase.execute({ equipoId: equipo.id });

    expect(result.getValue().componentes).toEqual([
      { componente, tipoNombre: 'Tornillos', tipoActivo: false },
    ]);
  });

  it('insumoId ausente del mapa → tipoNombre null, tipoActivo false (el display cae a "—")', async () => {
    const equipo = makeEquipo();
    const componente = makeComponente(equipo.id, 'insumo-fantasma');
    const useCase = makeUseCase({
      equipoRepo: { findById: vi.fn().mockResolvedValue(equipo) },
      componenteRepo: { findAllByEquipoId: vi.fn().mockResolvedValue([componente]) },
      insumoRepo: { findFamiliasDeInsumos: vi.fn().mockResolvedValue(new Map()) },
    });

    const result = await useCase.execute({ equipoId: equipo.id });

    expect(result.getValue().componentes).toEqual([
      { componente, tipoNombre: null, tipoActivo: false },
    ]);
  });

  it('varios componentes → UNA sola consulta de familias (sin N+1)', async () => {
    const equipo = makeEquipo();
    const a = makeComponente(equipo.id, 'insumo-1');
    const b = makeComponente(equipo.id, 'insumo-2');
    const insumoRepo = {
      findFamiliasDeInsumos: vi.fn().mockResolvedValue(
        new Map([
          ['insumo-1', familia('Tornillos', { activo: true, deletedAt: null })],
          [
            'insumo-2',
            {
              insumoId: 'insumo-2',
              codigo: 'RAM',
              nombre: 'Memoria RAM',
              activo: true,
              deletedAt: null,
            },
          ],
        ]),
      ),
    };
    const useCase = makeUseCase({
      equipoRepo: { findById: vi.fn().mockResolvedValue(equipo) },
      componenteRepo: { findAllByEquipoId: vi.fn().mockResolvedValue([a, b]) },
      insumoRepo,
    });

    const result = await useCase.execute({ equipoId: equipo.id });

    expect(result.getValue().componentes.map((c) => c.tipoNombre)).toEqual([
      'Tornillos',
      'Memoria RAM',
    ]);
    expect(insumoRepo.findFamiliasDeInsumos).toHaveBeenCalledTimes(1);
    expect(insumoRepo.findFamiliasDeInsumos).toHaveBeenCalledWith(['insumo-1', 'insumo-2']);
  });

  it('sin componentes → no consulta el catálogo del tenant', async () => {
    const equipo = makeEquipo();
    const insumoRepo = { findFamiliasDeInsumos: vi.fn() };
    const useCase = makeUseCase({
      equipoRepo: { findById: vi.fn().mockResolvedValue(equipo) },
      componenteRepo: { findAllByEquipoId: vi.fn().mockResolvedValue([]) },
      insumoRepo,
    });

    const result = await useCase.execute({ equipoId: equipo.id });

    expect(result.getValue().componentes).toEqual([]);
    expect(insumoRepo.findFamiliasDeInsumos).not.toHaveBeenCalled();
  });

  it('falla con EquipoNoEncontradoError si no existe (sin consultar componentes ni el catálogo)', async () => {
    const componenteRepo = { findAllByEquipoId: vi.fn() };
    const insumoRepo = { findFamiliasDeInsumos: vi.fn() };
    const useCase = makeUseCase({
      equipoRepo: { findById: vi.fn().mockResolvedValue(null) },
      componenteRepo,
      insumoRepo,
    });

    const result = await useCase.execute({ equipoId: 'no-existe' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
    expect(componenteRepo.findAllByEquipoId).not.toHaveBeenCalled();
    expect(insumoRepo.findFamiliasDeInsumos).not.toHaveBeenCalled();
  });

  it('incluye componentes dados de baja (activo=false, deletedAt seteado)', async () => {
    const equipo = makeEquipo();
    const componente = makeComponente(equipo.id);
    componente.softDelete();
    const useCase = makeUseCase({
      equipoRepo: { findById: vi.fn().mockResolvedValue(equipo) },
      componenteRepo: { findAllByEquipoId: vi.fn().mockResolvedValue([componente]) },
      insumoRepo: {
        findFamiliasDeInsumos: vi
          .fn()
          .mockResolvedValue(
            new Map([['insumo-1', familia('Tornillos', { activo: true, deletedAt: null })]]),
          ),
      },
    });

    const result = await useCase.execute({ equipoId: equipo.id });

    const [item] = result.getValue().componentes;
    expect(item!.componente.activo).toBe(false);
    expect(item!.componente.deletedAt).not.toBeNull();
  });
});
