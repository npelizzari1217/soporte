import { describe, it, expect, vi } from 'vitest';
import { EditarComponenteUseCase } from './editar-componente.use-case';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import {
  ComponenteDadoDeBajaError,
  ComponenteNoEncontradoError,
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
      descripcion: 'Original',
      numeroSerie: 'SN-1',
      capacidad: '8GB',
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

    const result = await useCase.execute({ equipoId: 'equipo-1', componenteId: componente.id, descripcion: 'X' });
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

    const result = await useCase.execute({ equipoId: 'equipo-1', componenteId: componente.id, tipoComponenteCodigo: '' });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoComponenteCodigoRequeridoError);
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
      equipoId: 'equipo-1', componenteId: componente.id,
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
      equipoId: 'equipo-1', componenteId: componente.id,
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
      equipoId: 'equipo-1', componenteId: componente.id,
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
