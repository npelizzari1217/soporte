import { describe, it, expect, vi } from 'vitest';
import { EditarComponenteUseCase } from './editar-componente.use-case';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import {
  ComponenteDadoDeBajaError,
  ComponenteNoEncontradoError,
  ComponenteVinculadoTipoInmutableError,
  TipoComponenteCodigoRequeridoError,
  TipoComponenteInactivoError,
} from '../../domain/errors/equipos.errors';

/**
 * EditarComponenteUseCase — listado enriquecido de componentes (editar).
 * Cubre: no encontrado, dado de baja (rechaza — hay que reactivar primero),
 * cambio de tipo válido/inválido, y PATCH semántico (campos no tocados).
 */
describe('EditarComponenteUseCase', () => {
  function makeComponente() {
    return ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      tipoComponenteCodigo: 'RAM',
      insumoId: null,
      descripcion: 'Original',
      numeroSerie: 'SN-1',
      capacidad: '8GB',
    }).getValue();
  }

  /** Componente VINCULADO a un repuesto del catálogo (WU-3, `insumoId` no nulo). */
  function makeComponenteVinculado() {
    return ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      tipoComponenteCodigo: 'MOUSE',
      insumoId: 'insumo-1',
      descripcion: 'Original',
      numeroSerie: 'SN-1',
      capacidad: null,
    }).getValue();
  }

  it('falla con ComponenteNoEncontradoError si no existe', async () => {
    const componenteRepo = { findById: vi.fn().mockResolvedValue(null), save: vi.fn() };
    const tipoComponenteMasterChecker = { estaActivo: vi.fn() };
    const useCase = new EditarComponenteUseCase(
      componenteRepo as never,
      tipoComponenteMasterChecker as never,
    );

    const result = await useCase.execute({ equipoId: 'equipo-1', componenteId: 'no-existe' });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ComponenteNoEncontradoError);
  });

  it('falla con ComponenteNoEncontradoError si el componente pertenece a OTRO equipo', async () => {
    const componente = makeComponente(); // equipoId: 'equipo-1'
    const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), save: vi.fn() };
    const tipoComponenteMasterChecker = { estaActivo: vi.fn() };
    const useCase = new EditarComponenteUseCase(
      componenteRepo as never,
      tipoComponenteMasterChecker as never,
    );

    const result = await useCase.execute({
      equipoId: 'equipo-2',
      componenteId: componente.id,
      descripcion: 'X',
    });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ComponenteNoEncontradoError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('falla con ComponenteDadoDeBajaError si el componente está dado de baja', async () => {
    const componente = makeComponente();
    componente.softDelete();
    const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), save: vi.fn() };
    const tipoComponenteMasterChecker = { estaActivo: vi.fn() };
    const useCase = new EditarComponenteUseCase(
      componenteRepo as never,
      tipoComponenteMasterChecker as never,
    );

    const result = await useCase.execute({
      equipoId: 'equipo-1',
      componenteId: componente.id,
      descripcion: 'X',
    });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ComponenteDadoDeBajaError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('falla con TipoComponenteCodigoRequeridoError si se provee tipoComponenteCodigo vacío', async () => {
    const componente = makeComponente();
    const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), save: vi.fn() };
    const tipoComponenteMasterChecker = { estaActivo: vi.fn() };
    const useCase = new EditarComponenteUseCase(
      componenteRepo as never,
      tipoComponenteMasterChecker as never,
    );

    const result = await useCase.execute({
      equipoId: 'equipo-1',
      componenteId: componente.id,
      tipoComponenteCodigo: '',
    });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoComponenteCodigoRequeridoError);
  });

  /**
   * Hallazgo de la revisión automática: `EditarComponenteUseCase` aceptaba
   * `tipoComponenteCodigo` sin mirar `insumoId`, así que un PATCH podía
   * guardar la contradicción que `AgregarComponenteUseCase` afirma
   * imposible (un componente "MOUSE" apuntando a un repuesto de familia
   * "TECLADO") — la FK no lo atrapa porque la fila del insumo existe.
   *
   * Va por el payload COMPLETO (los cuatro campos, como los manda SIEMPRE
   * `ComponenteEditDialog.submit()`), no por el atajo de omitir el campo: un
   * test que omite `tipoComponenteCodigo` no ejercita el camino que ningún
   * caller real de este repo produce.
   */
  it('falla con ComponenteVinculadoTipoInmutableError con payload COMPLETO y un tipoComponenteCodigo DISTINTO en un componente VINCULADO', async () => {
    const componente = makeComponenteVinculado(); // tipoComponenteCodigo: 'MOUSE'
    const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), save: vi.fn() };
    const tipoComponenteMasterChecker = { estaActivo: vi.fn() };
    const useCase = new EditarComponenteUseCase(
      componenteRepo as never,
      tipoComponenteMasterChecker as never,
    );

    const result = await useCase.execute({
      equipoId: 'equipo-1',
      componenteId: componente.id,
      tipoComponenteCodigo: 'TECLADO',
      descripcion: 'Original',
      numeroSerie: 'SN-1',
      capacidad: null,
    });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ComponenteVinculadoTipoInmutableError);
    expect(tipoComponenteMasterChecker.estaActivo).not.toHaveBeenCalled();
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  /**
   * Gemelo invertido, también con payload COMPLETO: el MISMO
   * `tipoComponenteCodigo` que ya tiene el componente — el caso real de
   * `ComponenteEditDialog`, que manda este campo en CADA submit aunque el
   * usuario solo haya tocado otro. Mandar el mismo código no es un pedido de
   * cambio: editar otro campo de un componente VINCULADO tiene que seguir
   * funcionando (antes de este arreglo, esto daba 422 — el hallazgo
   * bloqueante).
   */
  it('permite editar un componente VINCULADO con payload COMPLETO y el MISMO tipoComponenteCodigo', async () => {
    const componente = makeComponenteVinculado(); // tipoComponenteCodigo: 'MOUSE'
    const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), save: vi.fn() };
    const tipoComponenteMasterChecker = { estaActivo: vi.fn() };
    const useCase = new EditarComponenteUseCase(
      componenteRepo as never,
      tipoComponenteMasterChecker as never,
    );

    const result = await useCase.execute({
      equipoId: 'equipo-1',
      componenteId: componente.id,
      tipoComponenteCodigo: 'MOUSE',
      descripcion: 'Nueva desc',
      numeroSerie: 'SN-2',
      capacidad: null,
    });
    expect(result.isOk()).toBe(true);
    expect(result.getValue().descripcion).toBe('Nueva desc');
    expect(result.getValue().numeroSerie).toBe('SN-2');
    expect(result.getValue().tipoComponenteCodigo).toBe('MOUSE'); // no cambió
    expect(tipoComponenteMasterChecker.estaActivo).not.toHaveBeenCalled();
    expect(componenteRepo.save).toHaveBeenCalledWith(componente);
  });

  /** Gemelo invertido: un componente SIN vínculo (`insumoId: null`), payload COMPLETO con tipo DISTINTO, sigue pudiendo cambiar de tipo. */
  it('permite cambiar tipoComponenteCodigo con payload COMPLETO en un componente SIN vínculo', async () => {
    const componente = makeComponente(); // insumoId: null, tipoComponenteCodigo: 'RAM'
    const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), save: vi.fn() };
    const tipoComponenteMasterChecker = { estaActivo: vi.fn().mockResolvedValue(true) };
    const useCase = new EditarComponenteUseCase(
      componenteRepo as never,
      tipoComponenteMasterChecker as never,
    );

    const result = await useCase.execute({
      equipoId: 'equipo-1',
      componenteId: componente.id,
      tipoComponenteCodigo: 'CPU',
      descripcion: 'Original',
      numeroSerie: 'SN-1',
      capacidad: '8GB',
    });
    expect(result.isOk()).toBe(true);
    expect(result.getValue().tipoComponenteCodigo).toBe('CPU');
    expect(tipoComponenteMasterChecker.estaActivo).toHaveBeenCalledWith('CPU');
    expect(componenteRepo.save).toHaveBeenCalledWith(componente);
  });

  it('falla con TipoComponenteInactivoError si cambia a un tipo inactivo/inexistente en MASTER', async () => {
    const componente = makeComponente();
    const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), save: vi.fn() };
    const tipoComponenteMasterChecker = { estaActivo: vi.fn().mockResolvedValue(false) };
    const useCase = new EditarComponenteUseCase(
      componenteRepo as never,
      tipoComponenteMasterChecker as never,
    );

    const result = await useCase.execute({
      equipoId: 'equipo-1',
      componenteId: componente.id,
      tipoComponenteCodigo: 'CPU',
    });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoComponenteInactivoError);
    expect(tipoComponenteMasterChecker.estaActivo).toHaveBeenCalledWith('CPU');
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('NO reconsulta MASTER si tipoComponenteCodigo no cambia', async () => {
    const componente = makeComponente();
    const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), save: vi.fn() };
    const tipoComponenteMasterChecker = { estaActivo: vi.fn() };
    const useCase = new EditarComponenteUseCase(
      componenteRepo as never,
      tipoComponenteMasterChecker as never,
    );

    const result = await useCase.execute({
      equipoId: 'equipo-1',
      componenteId: componente.id,
      tipoComponenteCodigo: 'RAM',
    });
    expect(result.isOk()).toBe(true);
    expect(tipoComponenteMasterChecker.estaActivo).not.toHaveBeenCalled();
  });

  it('edita los campos provistos (PATCH semántico) y persiste', async () => {
    const componente = makeComponente();
    const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), save: vi.fn() };
    const tipoComponenteMasterChecker = { estaActivo: vi.fn().mockResolvedValue(true) };
    const useCase = new EditarComponenteUseCase(
      componenteRepo as never,
      tipoComponenteMasterChecker as never,
    );

    const result = await useCase.execute({
      equipoId: 'equipo-1',
      componenteId: componente.id,
      tipoComponenteCodigo: 'CPU',
      descripcion: 'Nueva desc',
      numeroSerie: null,
    });

    expect(result.isOk()).toBe(true);
    const actualizado = result.getValue();
    expect(actualizado.tipoComponenteCodigo).toBe('CPU');
    expect(actualizado.descripcion).toBe('Nueva desc');
    expect(actualizado.numeroSerie).toBeNull();
    expect(actualizado.capacidad).toBe('8GB'); // no tocado (undefined)
    expect(componenteRepo.save).toHaveBeenCalledWith(componente);
  });
});
