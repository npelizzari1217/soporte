import { describe, it, expect, vi } from 'vitest';
import { ObtenerEquipoUseCase } from './obtener-equipo.use-case';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { EquipoNoEncontradoError } from '../../domain/errors/equipos.errors';

/**
 * PR4b (sdd/tipos-componente-master): `ObtenerEquipoUseCase` enriquece cada
 * componente con `{tipoNombre, tipoActivo}`.
 *
 * sdd/repuestos-autoridad-catalogo (ADR-2/ADR-3): el batch se PARTE por el
 * CAMINO del componente. Un vinculado (`insumoId != null`) resuelve contra el
 * catálogo del TENANT vía `IInsumoRepository.findFamiliasDeInsumos`; uno de
 * texto libre (`insumoId === null`) sigue resolviendo contra MASTER vía
 * `ITipoComponenteMasterChecker.resolver`. Sin fallback cruzado entre las dos
 * fuentes.
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

  function makeComponente(
    equipoId: string,
    tipoComponenteCodigo: string,
    insumoId: string | null = null,
  ) {
    return ComponenteEquipoEntity.create({
      equipoId,
      tipoComponenteCodigo,
      insumoId,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    }).getValue();
  }

  /** Construye el use case con mocks; los que no se pasan quedan sin llamadas registradas. */
  function makeUseCase(overrides: {
    equipoRepo?: unknown;
    componenteRepo?: unknown;
    tipoComponenteMasterChecker?: unknown;
    insumoRepo?: unknown;
  }) {
    return new ObtenerEquipoUseCase(
      (overrides.equipoRepo ?? { findById: vi.fn() }) as never,
      (overrides.componenteRepo ?? { findAllByEquipoId: vi.fn() }) as never,
      (overrides.tipoComponenteMasterChecker ?? { resolver: vi.fn() }) as never,
      (overrides.insumoRepo ?? { findFamiliasDeInsumos: vi.fn() }) as never,
    );
  }

  it('retorna el equipo + sus componentes de texto libre enriquecidos desde MASTER (item 1 — G7)', async () => {
    const equipo = makeEquipo();
    const componente = makeComponente(equipo.id, 'RAM');
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = { findAllByEquipoId: vi.fn().mockResolvedValue([componente]) };
    const tipoComponenteMasterChecker = {
      resolver: vi
        .fn()
        .mockResolvedValue(new Map([['RAM', { nombre: 'Memoria RAM', activo: true }]])),
    };
    const insumoRepo = { findFamiliasDeInsumos: vi.fn() };
    const useCase = makeUseCase({
      equipoRepo,
      componenteRepo,
      tipoComponenteMasterChecker,
      insumoRepo,
    });

    const result = await useCase.execute({ equipoId: equipo.id });
    expect(result.isOk()).toBe(true);
    expect(result.getValue().equipo.id).toBe(equipo.id);
    expect(tipoComponenteMasterChecker.resolver).toHaveBeenCalledWith(['RAM']);
    expect(result.getValue().componentes).toEqual([
      { componente, tipoNombre: 'Memoria RAM', tipoActivo: true },
    ]);
    // Ningún componente vinculado en esta lista: el tenant no se consulta.
    expect(insumoRepo.findFamiliasDeInsumos).not.toHaveBeenCalled();
  });

  it('componente de texto libre sin match en MASTER → tipoNombre null, tipoActivo false (best-effort)', async () => {
    const equipo = makeEquipo();
    const componente = makeComponente(equipo.id, 'DESCONTINUADO');
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = { findAllByEquipoId: vi.fn().mockResolvedValue([componente]) };
    const tipoComponenteMasterChecker = { resolver: vi.fn().mockResolvedValue(new Map()) };
    const useCase = makeUseCase({ equipoRepo, componenteRepo, tipoComponenteMasterChecker });

    const result = await useCase.execute({ equipoId: equipo.id });
    expect(result.getValue().componentes).toEqual([
      { componente, tipoNombre: null, tipoActivo: false },
    ]);
  });

  it('sin componentes → no consulta ni MASTER ni el catálogo del tenant', async () => {
    const equipo = makeEquipo();
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = { findAllByEquipoId: vi.fn().mockResolvedValue([]) };
    const tipoComponenteMasterChecker = { resolver: vi.fn() };
    const insumoRepo = { findFamiliasDeInsumos: vi.fn() };
    const useCase = makeUseCase({
      equipoRepo,
      componenteRepo,
      tipoComponenteMasterChecker,
      insumoRepo,
    });

    const result = await useCase.execute({ equipoId: equipo.id });
    expect(result.getValue().componentes).toEqual([]);
    expect(tipoComponenteMasterChecker.resolver).not.toHaveBeenCalled();
    expect(insumoRepo.findFamiliasDeInsumos).not.toHaveBeenCalled();
  });

  it('falla con EquipoNoEncontradoError si no existe (sin consultar componentes ni catálogos)', async () => {
    const equipoRepo = { findById: vi.fn().mockResolvedValue(null) };
    const componenteRepo = { findAllByEquipoId: vi.fn() };
    const tipoComponenteMasterChecker = { resolver: vi.fn() };
    const insumoRepo = { findFamiliasDeInsumos: vi.fn() };
    const useCase = makeUseCase({
      equipoRepo,
      componenteRepo,
      tipoComponenteMasterChecker,
      insumoRepo,
    });

    const result = await useCase.execute({ equipoId: 'no-existe' });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
    expect(componenteRepo.findAllByEquipoId).not.toHaveBeenCalled();
    expect(tipoComponenteMasterChecker.resolver).not.toHaveBeenCalled();
    expect(insumoRepo.findFamiliasDeInsumos).not.toHaveBeenCalled();
  });

  it('incluye componentes dados de baja (activo=false, deletedAt seteado) — listado enriquecido', async () => {
    const equipo = makeEquipo();
    const componente = makeComponente(equipo.id, 'RAM');
    componente.softDelete();
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = { findAllByEquipoId: vi.fn().mockResolvedValue([componente]) };
    const tipoComponenteMasterChecker = {
      resolver: vi
        .fn()
        .mockResolvedValue(new Map([['RAM', { nombre: 'Memoria RAM', activo: true }]])),
    };
    const useCase = makeUseCase({ equipoRepo, componenteRepo, tipoComponenteMasterChecker });

    const result = await useCase.execute({ equipoId: equipo.id });
    expect(result.isOk()).toBe(true);
    const [item] = result.getValue().componentes;
    expect(item!.componente.activo).toBe(false);
    expect(item!.componente.deletedAt).not.toBeNull();
  });

  /**
   * ADR-2 — el caso que motiva todo el work unit: un componente vinculado a
   * una familia SOLO del tenant (sin fila en MASTER) se muestra con su
   * nombre real y activo, no como "Dado de baja".
   */
  it('componente vinculado a familia solo-tenant se muestra con su nombre y activo (ADR-2)', async () => {
    const equipo = makeEquipo();
    const componente = makeComponente(equipo.id, 'TORNILLO', 'insumo-1');
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = { findAllByEquipoId: vi.fn().mockResolvedValue([componente]) };
    const tipoComponenteMasterChecker = { resolver: vi.fn() };
    const insumoRepo = {
      findFamiliasDeInsumos: vi.fn().mockResolvedValue(
        new Map([
          [
            'insumo-1',
            {
              insumoId: 'insumo-1',
              codigo: 'TORNILLO',
              nombre: 'Tornillos',
              activo: true,
              deletedAt: null,
            },
          ],
        ]),
      ),
    };
    const useCase = makeUseCase({
      equipoRepo,
      componenteRepo,
      tipoComponenteMasterChecker,
      insumoRepo,
    });

    const result = await useCase.execute({ equipoId: equipo.id });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().componentes).toEqual([
      { componente, tipoNombre: 'Tornillos', tipoActivo: true },
    ]);
    expect(insumoRepo.findFamiliasDeInsumos).toHaveBeenCalledWith(['insumo-1']);
    // MASTER ni se consulta: es la prueba de que la autoridad es el tenant.
    expect(tipoComponenteMasterChecker.resolver).not.toHaveBeenCalled();
  });

  /** Anti-N+1: los dos caminos en la misma lista, cada uno con su fuente y UNA sola llamada. */
  it('los dos caminos en la misma lista: cada uno resuelve de su fuente, una sola llamada a cada una', async () => {
    const equipo = makeEquipo();
    const vinculado = makeComponente(equipo.id, 'TORNILLO', 'insumo-1');
    const textoLibre = makeComponente(equipo.id, 'RAM');
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = {
      findAllByEquipoId: vi.fn().mockResolvedValue([vinculado, textoLibre]),
    };
    const tipoComponenteMasterChecker = {
      resolver: vi
        .fn()
        .mockResolvedValue(new Map([['RAM', { nombre: 'Memoria RAM', activo: true }]])),
    };
    const insumoRepo = {
      findFamiliasDeInsumos: vi.fn().mockResolvedValue(
        new Map([
          [
            'insumo-1',
            {
              insumoId: 'insumo-1',
              codigo: 'TORNILLO',
              nombre: 'Tornillos',
              activo: true,
              deletedAt: null,
            },
          ],
        ]),
      ),
    };
    const useCase = makeUseCase({
      equipoRepo,
      componenteRepo,
      tipoComponenteMasterChecker,
      insumoRepo,
    });

    const result = await useCase.execute({ equipoId: equipo.id });

    expect(result.getValue().componentes).toEqual([
      { componente: vinculado, tipoNombre: 'Tornillos', tipoActivo: true },
      { componente: textoLibre, tipoNombre: 'Memoria RAM', tipoActivo: true },
    ]);
    expect(insumoRepo.findFamiliasDeInsumos).toHaveBeenCalledTimes(1);
    expect(insumoRepo.findFamiliasDeInsumos).toHaveBeenCalledWith(['insumo-1']);
    expect(tipoComponenteMasterChecker.resolver).toHaveBeenCalledTimes(1);
    expect(tipoComponenteMasterChecker.resolver).toHaveBeenCalledWith(['RAM']);
  });

  /** Familia deshabilitada o soft-deleted: nombre presente, tipoActivo false. */
  it.each([
    ['deshabilitada', { activo: false, deletedAt: null }],
    ['soft-deleted', { activo: true, deletedAt: new Date() }],
  ])('familia %s → tipoNombre presente, tipoActivo false', async (_caso, familiaFlags) => {
    const equipo = makeEquipo();
    const componente = makeComponente(equipo.id, 'TORNILLO', 'insumo-1');
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = { findAllByEquipoId: vi.fn().mockResolvedValue([componente]) };
    const insumoRepo = {
      findFamiliasDeInsumos: vi
        .fn()
        .mockResolvedValue(
          new Map([
            [
              'insumo-1',
              { insumoId: 'insumo-1', codigo: 'TORNILLO', nombre: 'Tornillos', ...familiaFlags },
            ],
          ]),
        ),
    };
    const useCase = makeUseCase({ equipoRepo, componenteRepo, insumoRepo });

    const result = await useCase.execute({ equipoId: equipo.id });

    expect(result.getValue().componentes).toEqual([
      { componente, tipoNombre: 'Tornillos', tipoActivo: false },
    ]);
  });

  /** `insumoId` ausente del mapa (fila inexistente) ⇒ degradado best-effort, sin lanzar. */
  it('insumoId ausente del mapa → tipoNombre null, tipoActivo false (best-effort)', async () => {
    const equipo = makeEquipo();
    const componente = makeComponente(equipo.id, 'TORNILLO', 'insumo-fantasma');
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = { findAllByEquipoId: vi.fn().mockResolvedValue([componente]) };
    const insumoRepo = { findFamiliasDeInsumos: vi.fn().mockResolvedValue(new Map()) };
    const useCase = makeUseCase({ equipoRepo, componenteRepo, insumoRepo });

    const result = await useCase.execute({ equipoId: equipo.id });

    expect(result.getValue().componentes).toEqual([
      { componente, tipoNombre: null, tipoActivo: false },
    ]);
  });
});
