import { describe, it, expect, vi } from 'vitest';
import { AgregarComponenteUseCase } from './agregar-componente.use-case';
import type { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import type { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import type { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import type { IInsumoRepository } from '../../../insumos/domain/ports/i-insumo.repository';
import type { IFamiliaInsumoRepository } from '../../../insumos/domain/ports/i-familia-insumo.repository';
import { equipoDadoDeBaja, equipoVigente } from '../../testing/equipos-unit.fixtures';
import { InsumoEntity } from '../../../insumos/domain/entities/insumo.entity';
import { FamiliaInsumoEntity } from '../../../insumos/domain/entities/familia-insumo.entity';
import {
  EquipoDadoDeBajaError,
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
  const makeEquipo = equipoVigente;

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

  type EquipoRepoFake = Pick<IEquipoInformaticoRepository, 'bloquearParaOperarPiezas'>;
  type ComponenteRepoFake = Pick<IComponenteEquipoRepository, 'save'>;

  function makeEquipoRepo(equipo: EquipoInformaticoEntity | null) {
    return {
      bloquearParaOperarPiezas: vi.fn(async () => equipo),
    } satisfies EquipoRepoFake;
  }

  function makeComponenteRepo() {
    return { save: vi.fn(async () => {}) } satisfies ComponenteRepoFake;
  }

  function makeInsumoRepo(insumo: InsumoEntity | null) {
    return { findById: vi.fn(async () => insumo) } satisfies Pick<IInsumoRepository, 'findById'>;
  }

  function makeFamiliaRepo(familia: FamiliaInsumoEntity | null) {
    return { findById: vi.fn(async () => familia) } satisfies Pick<
      IFamiliaInsumoRepository,
      'findById'
    >;
  }

  /** Arma los cuatro colaboradores con un equipo válido, un insumo y una familia dados. */
  function armar(
    insumo: InsumoEntity | null,
    familia: FamiliaInsumoEntity | null,
    equipo: EquipoInformaticoEntity | null = makeEquipo(),
  ) {
    const equipoRepo = makeEquipoRepo(equipo);
    const componenteRepo = makeComponenteRepo();
    const insumoRepo = makeInsumoRepo(insumo);
    const familiaInsumoRepo = makeFamiliaRepo(familia);
    const useCase = new AgregarComponenteUseCase(
      equipoRepo,
      componenteRepo,
      insumoRepo,
      familiaInsumoRepo,
    );
    const equipoId = equipo?.id ?? 'equipo-inexistente';
    return { equipo, equipoId, equipoRepo, componenteRepo, insumoRepo, familiaInsumoRepo, useCase };
  }

  it('falla con EquipoNoEncontradoError si el equipo no existe', async () => {
    const { componenteRepo, useCase } = armar(null, null, null);

    const result = await useCase.execute({ equipoId: 'no-existe', insumoId: 'ins-1' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('falla con EquipoNoEncontradoError si el equipo está soft-deleted', async () => {
    const equipo = makeEquipo();
    equipo.softDelete();
    const { componenteRepo, useCase } = armar(null, null, equipo);

    const result = await useCase.execute({ equipoId: equipo.id, insumoId: 'ins-1' });

    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('un equipo dado de baja falla con EquipoDadoDeBajaError, ni consulta el catálogo ni persiste (R11)', async () => {
    const insumo = makeInsumo('fam-1');
    const { equipoId, componenteRepo, insumoRepo, useCase } = armar(
      insumo,
      makeFamilia(true),
      equipoDadoDeBaja(),
    );

    const preparado = await useCase.preparar({ equipoId, insumoId: insumo.id });
    const ejecutado = await useCase.execute({ equipoId, insumoId: insumo.id });

    expect(preparado.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
    expect(ejecutado.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
    expect(insumoRepo.findById).not.toHaveBeenCalled();
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('lee el equipo con bloquearParaOperarPiezas (LE FOR SHARE) antes de tocar el catálogo', async () => {
    const insumo = makeInsumo('fam-1');
    const { equipo, equipoId, equipoRepo, insumoRepo, useCase } = armar(insumo, makeFamilia(true));
    const orden: string[] = [];
    equipoRepo.bloquearParaOperarPiezas.mockImplementation(async () => {
      orden.push('lockEquipo');
      return equipo;
    });
    insumoRepo.findById.mockImplementation(async () => {
      orden.push('insumo');
      return insumo;
    });

    await useCase.preparar({ equipoId, insumoId: insumo.id });

    expect(orden).toEqual(['lockEquipo', 'insumo']);
  });

  it('alta sin insumoId: falla y no persiste ni consulta el catálogo', async () => {
    const { equipoId, componenteRepo, insumoRepo, useCase } = armar(null, null);

    // Un llamador que salte la validación del borde (insumoId vacío o ausente).
    const vacio = await useCase.execute({ equipoId, insumoId: '' });
    const ausente = await useCase.execute({ equipoId, insumoId: undefined as unknown as string });

    expect(vacio.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
    expect(ausente.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
    expect(insumoRepo.findById).not.toHaveBeenCalled();
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  describe('cada guard rechaza con su error propio y no persiste', () => {
    it('insumo inexistente → InsumoRepuestoInexistenteError', async () => {
      const { equipoId, componenteRepo, useCase } = armar(null, null);
      const result = await useCase.execute({ equipoId, insumoId: 'ins-x' });
      expect(result.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
      expect(componenteRepo.save).not.toHaveBeenCalled();
    });

    it('insumo inactivo → InsumoRepuestoInexistenteError', async () => {
      const insumo = makeInsumo('fam-1', false);
      const { equipoId, componenteRepo, useCase } = armar(insumo, makeFamilia(true));
      const result = await useCase.execute({ equipoId, insumoId: insumo.id });
      expect(result.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
      expect(componenteRepo.save).not.toHaveBeenCalled();
    });

    it('insumo soft-deleted (con activo: true) → InsumoRepuestoInexistenteError', async () => {
      const insumo = makeInsumo('fam-1');
      insumo.softDelete();
      const { equipoId, componenteRepo, useCase } = armar(insumo, makeFamilia(true));
      const result = await useCase.execute({ equipoId, insumoId: insumo.id });
      expect(result.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
      expect(componenteRepo.save).not.toHaveBeenCalled();
    });

    it('familia inexistente → InsumoRepuestoInexistenteError', async () => {
      const insumo = makeInsumo('fam-1');
      const { equipoId, componenteRepo, useCase } = armar(insumo, null);
      const result = await useCase.execute({ equipoId, insumoId: insumo.id });
      expect(result.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
      expect(componenteRepo.save).not.toHaveBeenCalled();
    });

    it('familia soft-deleted → InsumoRepuestoInexistenteError', async () => {
      const insumo = makeInsumo('fam-1');
      const familia = makeFamilia(true);
      familia.softDelete();
      const { equipoId, componenteRepo, useCase } = armar(insumo, familia);
      const result = await useCase.execute({ equipoId, insumoId: insumo.id });
      expect(result.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
      expect(componenteRepo.save).not.toHaveBeenCalled();
    });

    it('familia no repuesto (consumible) → InsumoNoEsRepuestoError', async () => {
      const insumo = makeInsumo('fam-1');
      const { equipoId, componenteRepo, useCase } = armar(insumo, makeFamilia(false));
      const result = await useCase.execute({ equipoId, insumoId: insumo.id });
      expect(result.getError()).toBeInstanceOf(InsumoNoEsRepuestoError);
      expect(componenteRepo.save).not.toHaveBeenCalled();
    });

    it('familia repuesto deshabilitada → FamiliaRepuestoDeshabilitadaError', async () => {
      const insumo = makeInsumo('fam-1');
      const { equipoId, componenteRepo, useCase } = armar(
        insumo,
        makeFamilia(true, 'MOUSE', false),
      );
      const result = await useCase.execute({ equipoId, insumoId: insumo.id });
      expect(result.getError()).toBeInstanceOf(FamiliaRepuestoDeshabilitadaError);
      expect(componenteRepo.save).not.toHaveBeenCalled();
    });
  });

  it('alta válida: el componente queda vinculado al insumo y se guarda', async () => {
    const insumo = makeInsumo('fam-1');
    const { equipoId, componenteRepo, useCase } = armar(insumo, makeFamilia(true, 'TECLADO'));

    const result = await useCase.execute({
      equipoId,
      insumoId: insumo.id,
      descripcion: 'Teclado USB',
      numeroSerie: 'SN-1',
      capacidad: null,
    });

    expect(result.isOk()).toBe(true);
    const componente = result.getValue();
    expect(componente.insumoId).toBe(insumo.id);
    expect(componente.descripcion).toBe('Teclado USB');
    expect(componente.numeroSerie).toBe('SN-1');
    expect(componenteRepo.save).toHaveBeenCalledTimes(1);
    expect(componenteRepo.save).toHaveBeenCalledWith(componente);
  });

  it('familia propia del tenant sin catálogo global (TORNILLO) se vincula sin consultar MASTER', async () => {
    const insumo = makeInsumo('fam-propia');
    const { equipoId, componenteRepo, useCase } = armar(insumo, makeFamilia(true, 'TORNILLO'));

    const result = await useCase.execute({ equipoId, insumoId: insumo.id });

    expect(result.isOk()).toBe(true);
    expect(componenteRepo.save).toHaveBeenCalledTimes(1);
  });

  it('permite N componentes del mismo tipo por equipo (sin restricción de unicidad)', async () => {
    const insumo = makeInsumo('fam-1');
    const { equipoId, componenteRepo, useCase } = armar(insumo, makeFamilia(true, 'MOUSE'));

    const r1 = await useCase.execute({ equipoId, insumoId: insumo.id });
    const r2 = await useCase.execute({ equipoId, insumoId: insumo.id });

    expect(r1.isOk()).toBe(true);
    expect(r2.isOk()).toBe(true);
    expect(r1.getValue().id).not.toBe(r2.getValue().id);
    expect(componenteRepo.save).toHaveBeenCalledTimes(2);
  });

  it('no depende del catálogo MASTER: el constructor solo recibe cuatro colaboradores', () => {
    expect(AgregarComponenteUseCase.length).toBe(4);
  });

  describe('preparar() (ADR-7)', () => {
    it('valida y construye el componente SIN guardarlo; execute() es preparar() + save()', async () => {
      const insumo = makeInsumo('fam-1');
      const { equipoId, componenteRepo, useCase } = armar(insumo, makeFamilia(true, 'MOUSE'));

      const preparado = await useCase.preparar({ equipoId, insumoId: insumo.id });

      expect(preparado.isOk()).toBe(true);
      expect(componenteRepo.save).not.toHaveBeenCalled();

      const guardado = await useCase.execute({ equipoId, insumoId: insumo.id });
      expect(guardado.isOk()).toBe(true);
      expect(componenteRepo.save).toHaveBeenCalledWith(guardado.getValue());
    });

    it('con unidadId la entidad lleva la unidad y numeroSerie NULL, aunque el body traiga uno', async () => {
      const insumo = makeInsumo('fam-1');
      const { equipoId, useCase } = armar(insumo, makeFamilia(true, 'MOUSE'));

      const preparado = await useCase.preparar({
        equipoId,
        insumoId: insumo.id,
        unidadId: 'unidad-1',
        numeroSerie: 'IGNORADO',
      });

      expect(preparado.getValue().unidadId).toBe('unidad-1');
      expect(preparado.getValue().numeroSerie).toBeNull();
    });

    it('sin unidadId conserva el serial de texto y unidadId NULL', async () => {
      const insumo = makeInsumo('fam-1');
      const { equipoId, useCase } = armar(insumo, makeFamilia(true, 'MOUSE'));

      const preparado = await useCase.preparar({
        equipoId,
        insumoId: insumo.id,
        numeroSerie: 'SN-9',
      });

      expect(preparado.getValue().unidadId).toBeNull();
      expect(preparado.getValue().numeroSerie).toBe('SN-9');
    });

    it('un fallo de validacion no escribe nada', async () => {
      const { componenteRepo, useCase } = armar(null, null);

      const preparado = await useCase.preparar({ equipoId: 'x', insumoId: 'no-existe' });

      expect(preparado.isFail()).toBe(true);
      expect(componenteRepo.save).not.toHaveBeenCalled();
    });
  });
});
