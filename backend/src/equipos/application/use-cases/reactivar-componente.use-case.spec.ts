import { describe, it, expect, vi } from 'vitest';
import { ReactivarComponenteUseCase } from './reactivar-componente.use-case';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import {
  ComponenteNoEncontradoError,
  ComponenteYaActivoError,
} from '../../domain/errors/equipos.errors';

describe('ReactivarComponenteUseCase', () => {
  function makeComponente() {
    return ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      tipoComponenteCodigo: 'RAM',
      insumoId: null,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    }).getValue();
  }

  it('falla con ComponenteNoEncontradoError si no existe', async () => {
    const componenteRepo = { findById: vi.fn().mockResolvedValue(null), save: vi.fn() };
    const useCase = new ReactivarComponenteUseCase(componenteRepo as never);

    const result = await useCase.execute({ equipoId: 'equipo-1', componenteId: 'no-existe' });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ComponenteNoEncontradoError);
  });

  it('falla con ComponenteNoEncontradoError si el componente pertenece a OTRO equipo', async () => {
    const componente = makeComponente();
    componente.softDelete();
    const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), save: vi.fn() };
    const useCase = new ReactivarComponenteUseCase(componenteRepo as never);

    const result = await useCase.execute({ equipoId: 'equipo-2', componenteId: componente.id });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ComponenteNoEncontradoError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('falla con ComponenteYaActivoError si el componente ya está activo', async () => {
    const componente = makeComponente();
    const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), save: vi.fn() };
    const useCase = new ReactivarComponenteUseCase(componenteRepo as never);

    const result = await useCase.execute({ equipoId: 'equipo-1', componenteId: componente.id });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ComponenteYaActivoError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('reactiva el componente dado de baja (limpia deletedAt) y persiste', async () => {
    const componente = makeComponente();
    componente.softDelete();
    const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), save: vi.fn() };
    const useCase = new ReactivarComponenteUseCase(componenteRepo as never);

    const result = await useCase.execute({ equipoId: 'equipo-1', componenteId: componente.id });
    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(true);
    expect(result.getValue().deletedAt).toBeNull();
    expect(componenteRepo.save).toHaveBeenCalledWith(componente);
  });
});
