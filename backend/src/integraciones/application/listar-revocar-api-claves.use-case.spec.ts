import { ApiClave } from '../domain/api-clave';
import { ListarApiClavesUseCase } from './listar-api-claves.use-case';
import { RevocarApiClaveUseCase } from './revocar-api-clave.use-case';

function clave(id: string, clienteId: string): ApiClave {
  return {
    id,
    clienteId,
    usuarioId: 'u-1',
    nombre: `clave ${id}`,
    prefijo: 'sop_abcd1234',
    hash: 'f'.repeat(64),
    permisos: ['TICKETS:LECTURA'],
    creadaPorId: 'admin-1',
    creadaAt: new Date('2026-10-10T12:00:00Z'),
    ultimoUsoAt: new Date('2026-10-11T08:00:00Z'),
    revocadaAt: null,
  };
}

describe('ListarApiClavesUseCase', () => {
  it('devuelve solo las claves del cliente y nunca el hash ni el usuario', async () => {
    const todas = [clave('a', 'c-1'), clave('b', 'c-2')];
    const useCase = new ListarApiClavesUseCase({
      listarPorCliente: async (clienteId) => todas.filter((c) => c.clienteId === clienteId),
    });

    const lista = await useCase.execute('c-1');

    expect(lista).toEqual([
      {
        id: 'a',
        nombre: 'clave a',
        prefijo: 'sop_abcd1234',
        permisos: ['TICKETS:LECTURA'],
        creadaAt: new Date('2026-10-10T12:00:00Z'),
        ultimoUsoAt: new Date('2026-10-11T08:00:00Z'),
        revocadaAt: null,
      },
    ]);
    expect(JSON.stringify(lista)).not.toContain('ffffffff');
  });
});

describe('RevocarApiClaveUseCase', () => {
  function armar() {
    const claves = [clave('a', 'c-1')];
    const useCase = new RevocarApiClaveUseCase({
      revocar: async (clienteId, id, ahora) => {
        const c = claves.find((x) => x.id === id && x.clienteId === clienteId);
        if (!c) return false;
        c.revocadaAt ??= ahora;
        return true;
      },
    });
    return { claves, useCase };
  }

  it('revoca y es idempotente: la segunda vez sigue siendo exito y conserva la fecha', async () => {
    const { claves, useCase } = armar();
    const primera = new Date('2026-10-12T00:00:00Z');

    expect((await useCase.execute('c-1', 'a', primera)).isOk()).toBe(true);
    expect((await useCase.execute('c-1', 'a', new Date('2026-10-13T00:00:00Z'))).isOk()).toBe(true);

    expect(claves[0].revocadaAt).toEqual(primera);
  });

  it('una clave de otro cliente o inexistente da el mismo error y no se toca', async () => {
    const { claves, useCase } = armar();

    const ajena = await useCase.execute('c-2', 'a');
    const inexistente = await useCase.execute('c-1', 'zzz');

    expect(ajena.getError().code).toBe('API_CLAVE_NO_ENCONTRADA');
    expect(inexistente.getError().code).toBe('API_CLAVE_NO_ENCONTRADA');
    expect(claves[0].revocadaAt).toBeNull();
  });
});
