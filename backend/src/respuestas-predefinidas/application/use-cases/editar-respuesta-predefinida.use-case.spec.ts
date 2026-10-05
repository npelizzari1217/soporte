import { describe, expect, it, vi } from 'vitest';
import { EditarRespuestaPredefinidaUseCase } from './editar-respuesta-predefinida.use-case';
import { RespuestaPredefinidaEntity } from '../../domain/entities/respuesta-predefinida.entity';
import {
  RespuestaPredefinidaNoEncontradaError,
  RespuestaPredefinidaTituloDuplicadoError,
} from '../../domain/errors/respuestas-predefinidas.errors';

describe('EditarRespuestaPredefinidaUseCase', () => {
  function buildRepo(
    respuesta: RespuestaPredefinidaEntity | null,
    colisionante: RespuestaPredefinidaEntity | null = null,
  ) {
    return {
      findById: vi.fn().mockResolvedValue(respuesta),
      findByTitulo: vi.fn().mockResolvedValue(colisionante),
      save: vi.fn().mockResolvedValue(undefined),
    };
  }
  const nueva = (titulo: string, id: string) =>
    RespuestaPredefinidaEntity.create({ titulo, texto: 'x', activo: true }, id);

  it('edita el texto sin revalidar el título', async () => {
    const repo = buildRepo(nueva('Saludo', 'id-1'));
    const result = await new EditarRespuestaPredefinidaUseCase(repo).execute({
      id: 'id-1',
      texto: 'Nuevo',
    });

    expect(result.getValue().texto).toBe('Nuevo');
    expect(repo.findByTitulo).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('rechaza con NoEncontrada si el id no existe', async () => {
    const result = await new EditarRespuestaPredefinidaUseCase(buildRepo(null)).execute({
      id: 'x',
      texto: 'y',
    });
    expect(result.getError()).toBeInstanceOf(RespuestaPredefinidaNoEncontradaError);
  });

  it('rechaza con TituloDuplicado si el nuevo título choca con OTRA respuesta', async () => {
    const repo = buildRepo(nueva('Saludo', 'id-1'), nueva('Cierre', 'id-2'));
    const result = await new EditarRespuestaPredefinidaUseCase(repo).execute({
      id: 'id-1',
      titulo: 'cierre',
    });

    expect(result.getError()).toBeInstanceOf(RespuestaPredefinidaTituloDuplicadoError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('cambiar solo las mayúsculas del propio título es válido (colisiona consigo misma)', async () => {
    const propia = nueva('Saludo', 'id-1');
    const repo = buildRepo(propia, propia);
    const result = await new EditarRespuestaPredefinidaUseCase(repo).execute({
      id: 'id-1',
      titulo: 'SALUDO',
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().titulo).toBe('SALUDO');
  });
});
