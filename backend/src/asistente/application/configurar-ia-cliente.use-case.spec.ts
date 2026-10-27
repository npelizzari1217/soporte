import { ClienteEntity } from '../../clientes/domain/entities/cliente.entity';
import {
  ClaveCifradoIaAusenteError,
  ClaveIaFaltanteError,
  ClienteIaNoEncontradoError,
  UrlIaInvalidaError,
} from '../domain/asistente.errors';
import { ConfigIa, DatosConfigIa, URL_IA_POR_DEFECTO } from '../domain/config-ia';
import { ConfigurarIaClienteUseCase } from './configurar-ia-cliente.use-case';

const cliente = ClienteEntity.create(
  { nombre: 'Cliente', razonSocial: null, cuit: null, dbName: 'soporte_x', activo: true },
  'c1',
);

/** Repositorio en memoria: lo que `guardar` recibe es lo que queda guardado. */
function repoEnMemoria(inicial: ConfigIa | null = null) {
  let actual = inicial;
  const guardados: DatosConfigIa[] = [];
  return {
    guardados,
    actual: () => actual,
    buscarPorCliente: async () => actual,
    guardar: async (datos: DatosConfigIa) => {
      guardados.push(datos);
      actual = { ...datos, verificadoAt: null, verificacionError: null };
      return actual;
    },
  };
}

const cifrador = { cifrar: (clienteId: string, clave: string) => `cifrada(${clienteId},${clave})` };
const conCliente = { findById: async (id: string) => (id === 'c1' ? cliente : null) };

describe('ConfigurarIaClienteUseCase', () => {
  it('alta: cifra la clave, normaliza la URL y no devuelve la clave', async () => {
    const repo = repoEnMemoria();
    const r = await new ConfigurarIaClienteUseCase(conCliente, repo, cifrador).execute({
      clienteId: 'c1',
      url: ' https://generativelanguage.googleapis.com/v1beta/openai/ ',
      modelo: ' gemini-2.5-flash ',
      clave: 'AIzaClave',
    });

    expect(r.getValue()).toEqual({
      configurado: true,
      url: URL_IA_POR_DEFECTO,
      modelo: 'gemini-2.5-flash',
      verificadoAt: null,
      verificacionError: null,
    });
    expect(repo.guardados).toEqual([
      {
        clienteId: 'c1',
        url: URL_IA_POR_DEFECTO,
        modelo: 'gemini-2.5-flash',
        claveCifrada: 'cifrada(c1,AIzaClave)',
      },
    ]);
    expect(JSON.stringify(r.getValue())).not.toContain('AIzaClave');
  });

  it('edición sin clave conserva el ciphertext guardado tal cual', async () => {
    const repo = repoEnMemoria({
      clienteId: 'c1',
      url: URL_IA_POR_DEFECTO,
      modelo: 'gemini-2.0-flash',
      claveCifrada: 'v1:guardada',
      verificadoAt: new Date(),
      verificacionError: null,
    });
    const r = await new ConfigurarIaClienteUseCase(conCliente, repo, cifrador).execute({
      clienteId: 'c1',
      url: URL_IA_POR_DEFECTO,
      modelo: 'gemini-2.5-flash',
    });

    expect(r.isOk()).toBe(true);
    expect(repo.actual()?.claveCifrada).toBe('v1:guardada');
    expect(repo.actual()?.modelo).toBe('gemini-2.5-flash');
  });

  it('sin clave y sin configuración previa falla y no guarda nada', async () => {
    const repo = repoEnMemoria();
    const r = await new ConfigurarIaClienteUseCase(conCliente, repo, cifrador).execute({
      clienteId: 'c1',
      url: URL_IA_POR_DEFECTO,
      modelo: 'gemini-2.5-flash',
    });
    expect(r.getError()).toBeInstanceOf(ClaveIaFaltanteError);
    expect(repo.guardados).toEqual([]);
  });

  it('una URL inválida falla y no guarda nada', async () => {
    const repo = repoEnMemoria();
    const r = await new ConfigurarIaClienteUseCase(conCliente, repo, cifrador).execute({
      clienteId: 'c1',
      url: 'http://inseguro.example.com/',
      modelo: 'gemini-2.5-flash',
      clave: 'AIzaClave',
    });
    expect(r.getError()).toBeInstanceOf(UrlIaInvalidaError);
    expect(repo.guardados).toEqual([]);
  });

  it('si cifrar falla (falta EMAIL_CRYPTO_KEY) informa 503 y no guarda nada', async () => {
    const repo = repoEnMemoria();
    const sinClave = {
      cifrar: () => {
        throw new Error('EMAIL_CRYPTO_KEY ausente');
      },
    };
    const r = await new ConfigurarIaClienteUseCase(conCliente, repo, sinClave).execute({
      clienteId: 'c1',
      url: URL_IA_POR_DEFECTO,
      modelo: 'gemini-2.5-flash',
      clave: 'AIzaClave',
    });
    expect(r.getError()).toBeInstanceOf(ClaveCifradoIaAusenteError);
    expect(repo.guardados).toEqual([]);
  });

  it('un error de cifrado que no es la falta de EMAIL_CRYPTO_KEY no se disfraza de 503', async () => {
    const repo = repoEnMemoria();
    const roto = {
      cifrar: () => {
        throw new TypeError('plaintext must be a string');
      },
    };
    await expect(
      new ConfigurarIaClienteUseCase(conCliente, repo, roto).execute({
        clienteId: 'c1',
        url: URL_IA_POR_DEFECTO,
        modelo: 'gemini-2.5-flash',
        clave: 'AIzaClave',
      }),
    ).rejects.toThrow('plaintext must be a string');
    expect(repo.guardados).toEqual([]);
  });

  it('un cliente inexistente falla y no guarda nada', async () => {
    const repo = repoEnMemoria();
    const r = await new ConfigurarIaClienteUseCase(conCliente, repo, cifrador).execute({
      clienteId: 'otro',
      url: URL_IA_POR_DEFECTO,
      modelo: 'gemini-2.5-flash',
      clave: 'AIzaClave',
    });
    expect(r.getError()).toBeInstanceOf(ClienteIaNoEncontradoError);
    expect(repo.guardados).toEqual([]);
  });
});
