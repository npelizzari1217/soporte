import { describe, expect, it, vi } from 'vitest';
import { ConfigurarPoliticaTfaUseCase } from './configurar-politica-tfa.use-case';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ClienteNoEncontradoError } from '../../domain/errors/clientes.errors';

function buildRepoMock(overrides: Partial<IClienteRepository> = {}): IClienteRepository {
  return {
    findById: vi.fn(),
    findByDbName: vi.fn(),
    findBySlug: vi.fn(),
    congelarSlug: vi.fn(),
    fijarRequiere2fa: vi.fn(),
    obtenerRequiere2fa: vi.fn(),
    cambiarSlugSiNoCongelado: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

describe('ConfigurarPoliticaTfaUseCase', () => {
  it('fija la politica solo del cliente recibido, sin save ni lectura de la entidad (C1, C2)', async () => {
    const repo = buildRepoMock({ fijarRequiere2fa: vi.fn().mockResolvedValue(true) });
    const result = await new ConfigurarPoliticaTfaUseCase(repo).execute({
      clienteId: 'c-actor',
      requiere2fa: true,
    });

    expect(result.getValue()).toEqual({ requiere2fa: true });
    expect(repo.fijarRequiere2fa).toHaveBeenCalledTimes(1);
    expect(repo.fijarRequiere2fa).toHaveBeenCalledWith('c-actor', true);
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('desactivar escribe false y no hace nada mas: ni sesiones ni 2FA existentes (C4, C5)', async () => {
    // El caso de uso solo recibe el repositorio de clientes: no hay donde revocar sesiones
    // ni borrar el 2FA de nadie. Que la unica escritura sea `fijarRequiere2fa` lo prueba.
    const repo = buildRepoMock({ fijarRequiere2fa: vi.fn().mockResolvedValue(true) });
    const result = await new ConfigurarPoliticaTfaUseCase(repo).execute({
      clienteId: 'c1',
      requiere2fa: false,
    });

    expect(result.getValue()).toEqual({ requiere2fa: false });
    expect(repo.fijarRequiere2fa).toHaveBeenCalledWith('c1', false);
    expect(repo.delete).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('cliente inexistente: ClienteNoEncontradoError al fijar y al leer', async () => {
    const repo = buildRepoMock({
      fijarRequiere2fa: vi.fn().mockResolvedValue(false),
      obtenerRequiere2fa: vi.fn().mockResolvedValue(null),
    });
    const useCase = new ConfigurarPoliticaTfaUseCase(repo);

    const fijar = await useCase.execute({ clienteId: 'x', requiere2fa: true });
    const leer = await useCase.obtener('x');

    expect(fijar.getError()).toBeInstanceOf(ClienteNoEncontradoError);
    expect(leer.getError()).toBeInstanceOf(ClienteNoEncontradoError);
  });

  it('obtener devuelve la politica vigente', async () => {
    const repo = buildRepoMock({ obtenerRequiere2fa: vi.fn().mockResolvedValue(true) });
    const result = await new ConfigurarPoliticaTfaUseCase(repo).obtener('c1');
    expect(result.getValue()).toEqual({ requiere2fa: true });
  });
});
