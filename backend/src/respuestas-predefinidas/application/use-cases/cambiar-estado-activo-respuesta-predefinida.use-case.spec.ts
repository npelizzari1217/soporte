import { describe, expect, it, vi } from 'vitest';
import { CambiarEstadoActivoRespuestaPredefinidaUseCase } from './cambiar-estado-activo-respuesta-predefinida.use-case';
import { RespuestaPredefinidaEntity } from '../../domain/entities/respuesta-predefinida.entity';
import { RespuestaPredefinidaNoEncontradaError } from '../../domain/errors/respuestas-predefinidas.errors';

describe('CambiarEstadoActivoRespuestaPredefinidaUseCase', () => {
  const nueva = (activo: boolean) =>
    RespuestaPredefinidaEntity.create({ titulo: 'Saludo', texto: 'x', activo }, 'id-1');

  it('desactiva y persiste', async () => {
    const repo = { findById: vi.fn().mockResolvedValue(nueva(true)), save: vi.fn() };
    const result = await new CambiarEstadoActivoRespuestaPredefinidaUseCase(repo).execute({
      id: 'id-1',
      activo: false,
    });

    expect(result.getValue().activo).toBe(false);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('reactiva una desactivada', async () => {
    const repo = { findById: vi.fn().mockResolvedValue(nueva(false)), save: vi.fn() };
    const result = await new CambiarEstadoActivoRespuestaPredefinidaUseCase(repo).execute({
      id: 'id-1',
      activo: true,
    });

    expect(result.getValue().activo).toBe(true);
  });

  it('rechaza con NoEncontrada si el id no existe', async () => {
    const repo = { findById: vi.fn().mockResolvedValue(null), save: vi.fn() };
    const result = await new CambiarEstadoActivoRespuestaPredefinidaUseCase(repo).execute({
      id: 'x',
      activo: false,
    });

    expect(result.getError()).toBeInstanceOf(RespuestaPredefinidaNoEncontradaError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
