import { describe, it, expect, vi } from 'vitest';
import { AgregarComponenteUseCase } from './agregar-componente.use-case';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { InsumoEntity } from '../../../insumos/domain/entities/insumo.entity';
import { FamiliaInsumoEntity } from '../../../insumos/domain/entities/familia-insumo.entity';
import {
  EquipoNoEncontradoError,
  TipoComponenteCodigoRequeridoError,
  TipoComponenteInactivoError,
  RepuestoSinTipoEnCatalogoError,
  InsumoRepuestoInexistenteError,
  InsumoNoEsRepuestoError,
  FamiliaRepuestoDeshabilitadaError,
} from '../../domain/errors/equipos.errors';

/**
 * T12.4 [U][RED] — AgregarComponenteUseCase: tipo inactivo/inexistente →
 * TipoComponenteInactivoError; N del mismo tipo permitido.
 *
 * WU-3 (sdd/repuestos-vinculo-componente) agrega el vínculo opcional
 * `insumoId`: vincular un repuesto DERIVA `tipoComponenteCodigo` de la
 * familia del insumo (no se elige por separado), y solo se pueden vincular
 * repuestos (`FamiliaInsumo.esRepuesto = true`), no consumibles.
 *
 * PR4b (sdd/tipos-componente-master): la verificación de "tipo activo" pasa
 * de `ITipoComponenteRepository` (catálogo tenant, eliminado) a
 * `ITipoComponenteMasterChecker.estaActivo(codigo)` (catálogo MASTER cross-DB).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2.
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
    tipoComponenteMasterChecker?: unknown;
    componenteRepo?: unknown;
    insumoRepo?: unknown;
    familiaInsumoRepo?: unknown;
  }) {
    return new AgregarComponenteUseCase(
      (overrides.equipoRepo ?? { findById: vi.fn() }) as never,
      (overrides.tipoComponenteMasterChecker ?? { estaActivo: vi.fn() }) as never,
      (overrides.componenteRepo ?? { save: vi.fn() }) as never,
      (overrides.insumoRepo ?? { findById: vi.fn() }) as never,
      (overrides.familiaInsumoRepo ?? { findById: vi.fn() }) as never,
    );
  }

  it('falla con EquipoNoEncontradoError si el equipo no existe', async () => {
    const equipoRepo = { findById: vi.fn().mockResolvedValue(null) };
    const useCase = makeUseCase({ equipoRepo });

    const result = await useCase.execute({
      equipoId: 'no-existe',
      tipoComponenteCodigo: 'RAM',
      insumoId: null,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
  });

  /**
   * Hallazgo de la revisión automática: el `else` que devuelve
   * `TipoComponenteCodigoRequeridoError` (camino de texto libre sin
   * `insumoId` NI `tipoComponenteCodigo`) es la rama que existe para cuando
   * la validación de presentación (`@ValidateIf` del DTO HTTP) no corrió —
   * y no tenía ningún test propio.
   */
  it('falla con TipoComponenteCodigoRequeridoError si no vienen ni insumoId ni tipoComponenteCodigo', async () => {
    const equipo = makeEquipo();
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = { save: vi.fn() };
    const useCase = makeUseCase({ equipoRepo, componenteRepo });

    const result = await useCase.execute({
      equipoId: equipo.id,
      insumoId: null,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoComponenteCodigoRequeridoError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('falla con TipoComponenteInactivoError si el tipo está inactivo (o no existe) en MASTER — camino de texto libre', async () => {
    const equipo = makeEquipo();
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const tipoComponenteMasterChecker = { estaActivo: vi.fn().mockResolvedValue(false) };
    const componenteRepo = { save: vi.fn() };
    const useCase = makeUseCase({ equipoRepo, tipoComponenteMasterChecker, componenteRepo });

    const result = await useCase.execute({
      equipoId: equipo.id,
      tipoComponenteCodigo: 'RAM',
      insumoId: null,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoComponenteInactivoError);
    expect(tipoComponenteMasterChecker.estaActivo).toHaveBeenCalledWith('RAM');
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('permite agregar N componentes del mismo tipo (sin restricción de unicidad) — camino de texto libre', async () => {
    const equipo = makeEquipo();
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const tipoComponenteMasterChecker = { estaActivo: vi.fn().mockResolvedValue(true) };
    const componenteRepo = { save: vi.fn() };
    const insumoRepo = { findById: vi.fn() };
    const useCase = makeUseCase({
      equipoRepo,
      tipoComponenteMasterChecker,
      componenteRepo,
      insumoRepo,
    });

    const resultado1 = await useCase.execute({
      equipoId: equipo.id,
      tipoComponenteCodigo: 'RAM',
      insumoId: null,
      descripcion: 'Slot 1',
      numeroSerie: null,
      capacidad: '8GB',
    });
    const resultado2 = await useCase.execute({
      equipoId: equipo.id,
      tipoComponenteCodigo: 'RAM',
      insumoId: null,
      descripcion: 'Slot 2',
      numeroSerie: null,
      capacidad: '8GB',
    });

    expect(resultado1.isOk()).toBe(true);
    expect(resultado2.isOk()).toBe(true);
    expect(resultado1.getValue().insumoId).toBeNull();
    expect(componenteRepo.save).toHaveBeenCalledTimes(2);
    // El camino de texto libre no consulta el catálogo de insumos.
    expect(insumoRepo.findById).not.toHaveBeenCalled();
  });

  it('vincular un repuesto deriva tipoComponenteCodigo de la familia del insumo', async () => {
    const equipo = makeEquipo();
    const familia = makeFamilia(true, 'MOUSE');
    const insumo = makeInsumo(familia.id);
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const tipoComponenteMasterChecker = { estaActivo: vi.fn().mockResolvedValue(true) };
    const componenteRepo = { save: vi.fn() };
    const insumoRepo = { findById: vi.fn().mockResolvedValue(insumo) };
    const familiaInsumoRepo = { findById: vi.fn().mockResolvedValue(familia) };
    const useCase = makeUseCase({
      equipoRepo,
      tipoComponenteMasterChecker,
      componenteRepo,
      insumoRepo,
      familiaInsumoRepo,
    });

    const result = await useCase.execute({
      equipoId: equipo.id,
      // Se manda un código distinto a propósito: tiene que ser IGNORADO — el
      // vínculo con el repuesto es la única fuente del tipo (decisión #1).
      tipoComponenteCodigo: 'CODIGO-QUE-NO-DEBERIA-USARSE',
      insumoId: insumo.id,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().tipoComponenteCodigo).toBe('MOUSE');
    expect(result.getValue().insumoId).toBe(insumo.id);
    expect(tipoComponenteMasterChecker.estaActivo).toHaveBeenCalledWith('MOUSE');
  });

  it('vincular un consumible (familia esRepuesto=false) falla con InsumoNoEsRepuestoError', async () => {
    const equipo = makeEquipo();
    const familia = makeFamilia(false, 'TONER');
    const insumo = makeInsumo(familia.id);
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = { save: vi.fn() };
    const insumoRepo = { findById: vi.fn().mockResolvedValue(insumo) };
    const familiaInsumoRepo = { findById: vi.fn().mockResolvedValue(familia) };
    const useCase = makeUseCase({ equipoRepo, componenteRepo, insumoRepo, familiaInsumoRepo });

    const result = await useCase.execute({
      equipoId: equipo.id,
      insumoId: insumo.id,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(InsumoNoEsRepuestoError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('vincular un insumoId inexistente falla con InsumoRepuestoInexistenteError', async () => {
    const equipo = makeEquipo();
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = { save: vi.fn() };
    const insumoRepo = { findById: vi.fn().mockResolvedValue(null) };
    const useCase = makeUseCase({ equipoRepo, componenteRepo, insumoRepo });

    const result = await useCase.execute({
      equipoId: equipo.id,
      insumoId: 'no-existe',
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  /**
   * Hallazgo de la revisión automática: `PrismaInsumoRepository.findById` NO
   * filtra por `activo` (`findUnique` crudo), así que sin este chequeo en el
   * use case un repuesto dado de baja se vinculaba igual. Mismo criterio que
   * `ModeloEquipoDeshabilitadoError`: la fila existe, la base acepta el
   * vínculo sin chistar, y el chequeo tiene que vivir acá.
   */
  it('vincular un insumo INACTIVO falla con InsumoRepuestoInexistenteError (aunque la fila exista)', async () => {
    const equipo = makeEquipo();
    const familia = makeFamilia(true, 'MOUSE');
    const insumo = makeInsumo(familia.id, false);
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = { save: vi.fn() };
    const insumoRepo = { findById: vi.fn().mockResolvedValue(insumo) };
    const familiaInsumoRepo = { findById: vi.fn().mockResolvedValue(familia) };
    const useCase = makeUseCase({ equipoRepo, componenteRepo, insumoRepo, familiaInsumoRepo });

    const result = await useCase.execute({
      equipoId: equipo.id,
      insumoId: insumo.id,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  /**
   * `activo` y `deletedAt` son columnas INDEPENDIENTES: `softDelete()` no toca
   * `activo`, así que este insumo llega con `activo: true` y el guard de
   * arriba no lo detendría. El catálogo del select nunca lo ofrece —
   * `findAllActive` filtra `deletedAt: null`—, pero un formulario abierto
   * mientras el administrador lo borra llega igual, y la FK no lo atrapa
   * porque la fila existe.
   */
  it('vincular un insumo BORRADO logicamente falla, aunque siga activo', async () => {
    const equipo = makeEquipo();
    const familia = makeFamilia(true, 'MOUSE');
    const insumo = makeInsumo(familia.id, true);
    insumo.softDelete();
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = { save: vi.fn() };
    const insumoRepo = { findById: vi.fn().mockResolvedValue(insumo) };
    const familiaInsumoRepo = { findById: vi.fn().mockResolvedValue(familia) };
    const useCase = makeUseCase({ equipoRepo, componenteRepo, insumoRepo, familiaInsumoRepo });

    const result = await useCase.execute({
      equipoId: equipo.id,
      insumoId: insumo.id,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  /**
   * Del lado de la familia, con el error que corresponde: una familia borrada
   * deja al repuesto sin catálogo que lo respalde, y eso no es "ser un
   * consumible". `CrearInsumoUseCase` ya fijó ese criterio — "elegir una
   * familia dada de baja no es una opción distinta de elegir una que nunca
   * existió"— y este caso lo sigue.
   */
  it('vincular un repuesto de una familia BORRADA logicamente falla como inexistente', async () => {
    const equipo = makeEquipo();
    const familia = makeFamilia(true, 'MOUSE');
    familia.softDelete();
    const insumo = makeInsumo(familia.id, true);
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = { save: vi.fn() };
    const insumoRepo = { findById: vi.fn().mockResolvedValue(insumo) };
    const familiaInsumoRepo = { findById: vi.fn().mockResolvedValue(familia) };
    const useCase = makeUseCase({ equipoRepo, componenteRepo, insumoRepo, familiaInsumoRepo });

    const result = await useCase.execute({
      equipoId: equipo.id,
      insumoId: insumo.id,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  /** Gemelo invertido de los tres anteriores: un insumo ACTIVO y vigente de una familia repuesto habilitada funciona. */
  it('vincular un insumo ACTIVO de una familia repuesto habilitada permite agregar el componente', async () => {
    const equipo = makeEquipo();
    const familia = makeFamilia(true, 'MOUSE');
    const insumo = makeInsumo(familia.id, true);
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const tipoComponenteMasterChecker = { estaActivo: vi.fn().mockResolvedValue(true) };
    const componenteRepo = { save: vi.fn() };
    const insumoRepo = { findById: vi.fn().mockResolvedValue(insumo) };
    const familiaInsumoRepo = { findById: vi.fn().mockResolvedValue(familia) };
    const useCase = makeUseCase({
      equipoRepo,
      tipoComponenteMasterChecker,
      componenteRepo,
      insumoRepo,
      familiaInsumoRepo,
    });

    const result = await useCase.execute({
      equipoId: equipo.id,
      insumoId: insumo.id,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });

    expect(result.isOk()).toBe(true);
    expect(componenteRepo.save).toHaveBeenCalledTimes(1);
  });

  /**
   * Mismo hallazgo que el de `insumo.activo`, pero para `familia.activo`: la
   * familia también se lee con un `findUnique` crudo, así que sin este
   * chequeo una familia de repuesto deshabilitada seguía aceptando vínculos.
   */
  it('vincular un repuesto de una familia INACTIVA falla con FamiliaRepuestoDeshabilitadaError (aunque esRepuesto sea true)', async () => {
    const equipo = makeEquipo();
    const familia = makeFamilia(true, 'MOUSE', false);
    const insumo = makeInsumo(familia.id, true);
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = { save: vi.fn() };
    const insumoRepo = { findById: vi.fn().mockResolvedValue(insumo) };
    const familiaInsumoRepo = { findById: vi.fn().mockResolvedValue(familia) };
    const useCase = makeUseCase({ equipoRepo, componenteRepo, insumoRepo, familiaInsumoRepo });

    const result = await useCase.execute({
      equipoId: equipo.id,
      insumoId: insumo.id,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FamiliaRepuestoDeshabilitadaError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  /** Gemelo invertido del test anterior: una familia repuesto ACTIVA funciona. */
  it('vincular un repuesto de una familia repuesto ACTIVA permite agregar el componente', async () => {
    const equipo = makeEquipo();
    const familia = makeFamilia(true, 'MOUSE', true);
    const insumo = makeInsumo(familia.id, true);
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const tipoComponenteMasterChecker = { estaActivo: vi.fn().mockResolvedValue(true) };
    const componenteRepo = { save: vi.fn() };
    const insumoRepo = { findById: vi.fn().mockResolvedValue(insumo) };
    const familiaInsumoRepo = { findById: vi.fn().mockResolvedValue(familia) };
    const useCase = makeUseCase({
      equipoRepo,
      tipoComponenteMasterChecker,
      componenteRepo,
      insumoRepo,
      familiaInsumoRepo,
    });

    const result = await useCase.execute({
      equipoId: equipo.id,
      insumoId: insumo.id,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });

    expect(result.isOk()).toBe(true);
    expect(componenteRepo.save).toHaveBeenCalledTimes(1);
  });

  /**
   * LIMITACIÓN DELIBERADA de WU-3, fijada acá con un test: la validación de
   * "tipo activo" sigue siendo contra el catálogo MASTER
   * (`ITipoComponenteMasterChecker`), sin cambios. Si la familia del
   * repuesto vinculado no tiene su código sembrado en MASTER —una familia
   * propia del tenant, ej. "TORNILLO"—, el vínculo se rechaza con el MISMO
   * `TipoComponenteInactivoError` que un código de texto libre inexistente.
   * Levantar esta restricción es WU-5: cambia de dónde sale la autoridad del
   * catálogo. Acá se documenta y se fija la conducta, no se resuelve.
   */
  it('vincular un repuesto de una familia sin código en MASTER falla nombrando el REPUESTO, no el tipo (límite documentado, WU-5 lo resuelve)', async () => {
    const equipo = makeEquipo();
    const familia = makeFamilia(true, 'TORNILLO');
    const insumo = makeInsumo(familia.id);
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const tipoComponenteMasterChecker = { estaActivo: vi.fn().mockResolvedValue(false) };
    const componenteRepo = { save: vi.fn() };
    const insumoRepo = { findById: vi.fn().mockResolvedValue(insumo) };
    const familiaInsumoRepo = { findById: vi.fn().mockResolvedValue(familia) };
    const useCase = makeUseCase({
      equipoRepo,
      tipoComponenteMasterChecker,
      componenteRepo,
      insumoRepo,
      familiaInsumoRepo,
    });

    const result = await useCase.execute({
      equipoId: equipo.id,
      insumoId: insumo.id,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(RepuestoSinTipoEnCatalogoError);
    expect(tipoComponenteMasterChecker.estaActivo).toHaveBeenCalledWith('TORNILLO');
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });
});
