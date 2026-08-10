/**
 * crear-tipo-componente.use-case.spec.ts — TDD RED→GREEN (sdd/tipos-componente-master, PR2).
 *
 * ROOT da de alta un tipo de componente en el catálogo MASTER. Valida
 * duplicado por `codigo` normalizado (`trim().toUpperCase()`) antes de
 * intentar crear la entidad.
 */
import { describe, expect, it, vi } from 'vitest';
import { CrearTipoComponenteUseCase } from './crear-tipo-componente.use-case';
import { ITipoComponenteMasterRepository } from '../../domain/ports/i-tipo-componente-master.repository';
import { TipoComponente } from '../../domain/entities/tipo-componente.entity';
import {
  CodigoTipoComponenteDuplicadoError,
  CodigoTipoComponenteInvalidoError,
} from '../../domain/errors/tipos-componente.errors';

function buildRepoMock(): Pick<ITipoComponenteMasterRepository, 'findByCodigo' | 'save'> {
  return {
    findByCodigo: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe('CrearTipoComponenteUseCase', () => {
  it('crea el tipo de componente y lo persiste cuando el código no existe', async () => {
    const repo = buildRepoMock();
    (repo.findByCodigo as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new CrearTipoComponenteUseCase(repo);

    const result = await useCase.execute({ codigo: 'cpu', nombre: 'Procesador' });

    expect(result.isOk()).toBe(true);
    const tipo = result.getValue();
    expect(tipo.codigo).toBe('CPU');
    expect(tipo.nombre).toBe('Procesador');
    expect(tipo.activo).toBe(true);
    expect(repo.findByCodigo).toHaveBeenCalledWith('CPU');
    expect(repo.save).toHaveBeenCalledWith(tipo);
  });

  it('retorna Result.fail(CodigoTipoComponenteDuplicadoError) sin persistir cuando el código ya existe', async () => {
    const repo = buildRepoMock();
    const existente = TipoComponente.create({ codigo: 'CPU', nombre: 'Procesador' }).getValue();
    (repo.findByCodigo as ReturnType<typeof vi.fn>).mockResolvedValue(existente);
    const useCase = new CrearTipoComponenteUseCase(repo);

    const result = await useCase.execute({ codigo: 'cpu', nombre: 'Procesador duplicado' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CodigoTipoComponenteDuplicadoError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('retorna Result.fail(CodigoTipoComponenteInvalidoError) sin persistir cuando el código normalizado queda vacío', async () => {
    const repo = buildRepoMock();
    (repo.findByCodigo as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new CrearTipoComponenteUseCase(repo);

    const result = await useCase.execute({ codigo: '   ', nombre: 'Procesador' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CodigoTipoComponenteInvalidoError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
