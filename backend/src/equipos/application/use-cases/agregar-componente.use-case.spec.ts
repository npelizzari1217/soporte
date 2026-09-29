import { AgregarComponenteUseCase } from './agregar-componente.use-case';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { InsumoEntity } from '../../../insumos/domain/entities/insumo.entity';
import { FamiliaInsumoEntity } from '../../../insumos/domain/entities/familia-insumo.entity';
import {
  EquipoNoEncontradoError,
  InsumoRepuestoInexistenteError,
  InsumoNoEsRepuestoError,
  FamiliaRepuestoDeshabilitadaError,
} from '../../domain/errors/equipos.errors';

/**
 * AgregarComponenteUseCase — alta de un solo camino (sdd/catalogo-unico-componentes,
 * WU-3): `insumoId` obligatorio, cada guard de insumo/familia con su error
 * propio, y el tipo derivado siempre de `familia.codigo`. Sin dependencia del
 * catálogo MASTER.
 */
describe('AgregarComponenteUseCase', () => {
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

  function makeInsumo(familiaId: string, activo = true) {
    return InsumoEntity.create({
      codigo: 'REP-001',
      nombre: 'Mouse óptico',
      familiaId,
      unidadMedidaId: 'unidad-medida-fixture',
      stockMinimo: null,
      activo,
      codigosAlternativos: [],
      compatibilidad: [],
    });
  }

  function makeFamilia(esRepuesto: boolean, codigo = 'MOUSE', activo = true) {
    return FamiliaInsumoEntity.create({ codigo, nombre: 'Mouse', activo, esRepuesto });
  }

  /** Construye el use case con mocks; los que no se pasan quedan sin llamadas registradas. */
  function makeUseCase(overrides: {
    equipoRepo?: unknown;
    componenteRepo?: unknown;
    insumoRepo?: unknown;
    familiaInsumoRepo?: unknown;
  }) {
    return new AgregarComponenteUseCase(
      (overrides.equipoRepo ?? { findById: vi.fn() }) as never,
      (overrides.componenteRepo ?? { save: vi.fn() }) as never,
      (overrides.insumoRepo ?? { findById: vi.fn() }) as never,
      (overrides.familiaInsumoRepo ?? { findById: vi.fn() }) as never,
    );
  }

  /** Arma los cuatro colaboradores con un equipo válido, un insumo y una familia dados. */
  function armar(insumo: InsumoEntity | null, familia: FamiliaInsumoEntity | null) {
    const equipo = makeEquipo();
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = { save: vi.fn() };
    const insumoRepo = { findById: vi.fn().mockResolvedValue(insumo) };
    const familiaInsumoRepo = { findById: vi.fn().mockResolvedValue(familia) };
    const useCase = makeUseCase({ equipoRepo, componenteRepo, insumoRepo, familiaInsumoRepo });
    return { equipo, componenteRepo, insumoRepo, familiaInsumoRepo, useCase };
  }

  it('falla con EquipoNoEncontradoError si el equipo no existe', async () => {
    const equipoRepo = { findById: vi.fn().mockResolvedValue(null) };
    const componenteRepo = { save: vi.fn() };
    const useCase = makeUseCase({ equipoRepo, componenteRepo });

    const result = await useCase.execute({ equipoId: 'no-existe', insumoId: 'ins-1' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('falla con EquipoNoEncontradoError si el equipo está soft-deleted', async () => {
    const equipo = makeEquipo();
    equipo.softDelete();
    const componenteRepo = { save: vi.fn() };
    const useCase = makeUseCase({
      equipoRepo: { findById: vi.fn().mockResolvedValue(equipo) },
      componenteRepo,
    });

    const result = await useCase.execute({ equipoId: equipo.id, insumoId: 'ins-1' });

    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('alta sin insumoId: falla y no persiste ni consulta el catálogo', async () => {
    const { equipo, componenteRepo, insumoRepo, useCase } = armar(null, null);

    // Un llamador que salte la validación del borde (insumoId vacío o ausente).
    const vacio = await useCase.execute({ equipoId: equipo.id, insumoId: '' });
    const ausente = await useCase.execute({ equipoId: equipo.id } as never);

    expect(vacio.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
    expect(ausente.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
    expect(insumoRepo.findById).not.toHaveBeenCalled();
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  describe('cada guard rechaza con su error propio y no persiste', () => {
    it('insumo inexistente → InsumoRepuestoInexistenteError', async () => {
      const { equipo, componenteRepo, useCase } = armar(null, null);
      const result = await useCase.execute({ equipoId: equipo.id, insumoId: 'ins-x' });
      expect(result.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
      expect(componenteRepo.save).not.toHaveBeenCalled();
    });

    it('insumo inactivo → InsumoRepuestoInexistenteError', async () => {
      const insumo = makeInsumo('fam-1', false);
      const { equipo, componenteRepo, useCase } = armar(insumo, makeFamilia(true));
      const result = await useCase.execute({ equipoId: equipo.id, insumoId: insumo.id });
      expect(result.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
      expect(componenteRepo.save).not.toHaveBeenCalled();
    });

    it('insumo soft-deleted (con activo: true) → InsumoRepuestoInexistenteError', async () => {
      const insumo = makeInsumo('fam-1');
      insumo.softDelete();
      const { equipo, componenteRepo, useCase } = armar(insumo, makeFamilia(true));
      const result = await useCase.execute({ equipoId: equipo.id, insumoId: insumo.id });
      expect(result.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
      expect(componenteRepo.save).not.toHaveBeenCalled();
    });

    it('familia inexistente → InsumoRepuestoInexistenteError', async () => {
      const insumo = makeInsumo('fam-1');
      const { equipo, componenteRepo, useCase } = armar(insumo, null);
      const result = await useCase.execute({ equipoId: equipo.id, insumoId: insumo.id });
      expect(result.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
      expect(componenteRepo.save).not.toHaveBeenCalled();
    });

    it('familia soft-deleted → InsumoRepuestoInexistenteError', async () => {
      const insumo = makeInsumo('fam-1');
      const familia = makeFamilia(true);
      familia.softDelete();
      const { equipo, componenteRepo, useCase } = armar(insumo, familia);
      const result = await useCase.execute({ equipoId: equipo.id, insumoId: insumo.id });
      expect(result.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
      expect(componenteRepo.save).not.toHaveBeenCalled();
    });

    it('familia no repuesto (consumible) → InsumoNoEsRepuestoError', async () => {
      const insumo = makeInsumo('fam-1');
      const { equipo, componenteRepo, useCase } = armar(insumo, makeFamilia(false));
      const result = await useCase.execute({ equipoId: equipo.id, insumoId: insumo.id });
      expect(result.getError()).toBeInstanceOf(InsumoNoEsRepuestoError);
      expect(componenteRepo.save).not.toHaveBeenCalled();
    });

    it('familia repuesto deshabilitada → FamiliaRepuestoDeshabilitadaError', async () => {
      const insumo = makeInsumo('fam-1');
      const { equipo, componenteRepo, useCase } = armar(insumo, makeFamilia(true, 'MOUSE', false));
      const result = await useCase.execute({ equipoId: equipo.id, insumoId: insumo.id });
      expect(result.getError()).toBeInstanceOf(FamiliaRepuestoDeshabilitadaError);
      expect(componenteRepo.save).not.toHaveBeenCalled();
    });
  });

  it('alta válida: la entidad recibe tipoComponenteCodigo = familia.codigo y queda vinculada al insumo', async () => {
    const insumo = makeInsumo('fam-1');
    const { equipo, componenteRepo, useCase } = armar(insumo, makeFamilia(true, 'TECLADO'));

    const result = await useCase.execute({
      equipoId: equipo.id,
      insumoId: insumo.id,
      descripcion: 'Teclado USB',
      numeroSerie: 'SN-1',
      capacidad: null,
    });

    expect(result.isOk()).toBe(true);
    const componente = result.getValue();
    expect(componente.tipoComponenteCodigo).toBe('TECLADO');
    expect(componente.insumoId).toBe(insumo.id);
    expect(componente.descripcion).toBe('Teclado USB');
    expect(componente.numeroSerie).toBe('SN-1');
    expect(componenteRepo.save).toHaveBeenCalledTimes(1);
    expect(componenteRepo.save).toHaveBeenCalledWith(componente);
  });

  it('familia propia del tenant sin catálogo global (TORNILLO) se vincula sin consultar MASTER', async () => {
    const insumo = makeInsumo('fam-propia');
    const { equipo, componenteRepo, useCase } = armar(insumo, makeFamilia(true, 'TORNILLO'));

    const result = await useCase.execute({ equipoId: equipo.id, insumoId: insumo.id });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().tipoComponenteCodigo).toBe('TORNILLO');
    expect(componenteRepo.save).toHaveBeenCalledTimes(1);
  });

  it('permite N componentes del mismo tipo por equipo (sin restricción de unicidad)', async () => {
    const insumo = makeInsumo('fam-1');
    const { equipo, componenteRepo, useCase } = armar(insumo, makeFamilia(true, 'MOUSE'));

    const r1 = await useCase.execute({ equipoId: equipo.id, insumoId: insumo.id });
    const r2 = await useCase.execute({ equipoId: equipo.id, insumoId: insumo.id });

    expect(r1.isOk()).toBe(true);
    expect(r2.isOk()).toBe(true);
    expect(r1.getValue().id).not.toBe(r2.getValue().id);
    expect(componenteRepo.save).toHaveBeenCalledTimes(2);
  });

  it('no depende del catálogo MASTER: el constructor solo recibe cuatro colaboradores', () => {
    expect(AgregarComponenteUseCase.length).toBe(4);
  });
});
