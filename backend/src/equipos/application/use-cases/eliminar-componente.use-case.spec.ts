import { describe, it, expect, vi } from 'vitest';
import { EliminarComponenteUseCase } from './eliminar-componente.use-case';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { ComponenteNoEncontradoError } from '../../domain/errors/equipos.errors';

describe('EliminarComponenteUseCase', () => {
  it('aplica soft delete si el componente existe', async () => {
    const componente = ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      tipoComponenteId: 'tipo-ram',
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    }).getValue();
    const componenteRepo = { findById: vi.fn().mockResolvedValue(componente), delete: vi.fn() };
    const useCase = new EliminarComponenteUseCase(componenteRepo as never);

    const result = await useCase.execute({ componenteId: componente.id });
    expect(result.isOk()).toBe(true);
    expect(componenteRepo.delete).toHaveBeenCalledWith(componente.id);
  });

  it('falla con ComponenteNoEncontradoError si no existe', async () => {
    const componenteRepo = { findById: vi.fn().mockResolvedValue(null), delete: vi.fn() };
    const useCase = new EliminarComponenteUseCase(componenteRepo as never);

    const result = await useCase.execute({ componenteId: 'no-existe' });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ComponenteNoEncontradoError);
  });
});
