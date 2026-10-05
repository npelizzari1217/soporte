import { describe, expect, it, vi } from 'vitest';
import { CrearRespuestaPredefinidaUseCase } from './crear-respuesta-predefinida.use-case';
import { RespuestaPredefinidaEntity } from '../../domain/entities/respuesta-predefinida.entity';
import { RespuestaPredefinidaTituloDuplicadoError } from '../../domain/errors/respuestas-predefinidas.errors';

describe('CrearRespuestaPredefinidaUseCase', () => {
  it('crea la respuesta activa cuando el título no está en uso', async () => {
    const repo = { findByTitulo: vi.fn().mockResolvedValue(null), save: vi.fn() };
    const result = await new CrearRespuestaPredefinidaUseCase(repo).execute({
      titulo: 'Saludo',
      texto: 'Hola',
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(true);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('rechaza con TituloDuplicado si ya existe (activa o desactivada)', async () => {
    const existente = RespuestaPredefinidaEntity.create({
      titulo: 'saludo',
      texto: 'x',
      activo: false,
    });
    const repo = { findByTitulo: vi.fn().mockResolvedValue(existente), save: vi.fn() };

    const result = await new CrearRespuestaPredefinidaUseCase(repo).execute({
      titulo: 'Saludo',
      texto: 'Hola',
    });

    expect(result.getError()).toBeInstanceOf(RespuestaPredefinidaTituloDuplicadoError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
