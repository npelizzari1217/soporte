import { ClienteEntity } from '../../clientes/domain/entities/cliente.entity';
import { Result } from '../../shared/domain/result';
import {
  ClaveCifradoIaAusenteError,
  ClaveIaIndescifrableError,
  ClaveIaFaltanteError,
  ClienteIaNoEncontradoError,
  UrlIaInvalidaError,
} from '../domain/asistente.errors';
import { ResultadoVerificacionIa } from '../domain/asistente-ia-config-repository.port';
import { ConfigIa, DatosConfigIa, DestinoIa, URL_IA_POR_DEFECTO } from '../domain/config-ia';
import { FallaModeloIaError, IModeloIa } from '../domain/modelo-ia.port';
import { ConfigurarIaClienteUseCase } from './configurar-ia-cliente.use-case';

const cliente = ClienteEntity.create(
  { nombre: 'Cliente', razonSocial: null, cuit: null, dbName: 'soporte_x', activo: true },
  'c1',
);

/** Repositorio en memoria: lo que `guardar` recibe es lo que queda guardado. */
function repoEnMemoria(inicial: ConfigIa | null = null) {
  let actual = inicial;
  const guardados: DatosConfigIa[] = [];
  const verificaciones: ResultadoVerificacionIa[] = [];
  return {
    guardados,
    verificaciones,
    actual: () => actual,
    buscarPorCliente: async () => actual,
    guardar: async (datos: DatosConfigIa) => {
      guardados.push(datos);
      actual = { ...datos, verificadoAt: null, verificacionError: null };
      return actual;
    },
    guardarVerificacion: async (_id: string, resultado: ResultadoVerificacionIa) => {
      verificaciones.push(resultado);
      if (!actual) return null;
      actual = resultado.ok
        ? { ...actual, verificadoAt: new Date('2026-10-27T12:00:00Z'), verificacionError: null }
        : { ...actual, verificacionError: resultado.motivo };
      return actual;
    },
  };
}

/** Cifra y descifra de forma visible: `cifrada(c1,clave)` ↔ `clave`. */
const cifrador = {
  cifrar: (clienteId: string, clave: string) => `cifrada(${clienteId},${clave})`,
  descifrar: (clienteId: string, payload: string) => {
    const m = /^cifrada\(([^,]+),(.*)\)$/.exec(payload);
    return m && m[1] === clienteId
      ? Result.ok<string, ClaveIaIndescifrableError>(m[2])
      : Result.fail<string, ClaveIaIndescifrableError>(new ClaveIaIndescifrableError());
  },
};

/** Proveedor falso: registra cada destino probado y responde lo que fije el test. */
function modelo(respuesta: Result<string, FallaModeloIaError> = Result.ok('OK')) {
  const destinos: DestinoIa[] = [];
  const m: IModeloIa = {
    completar: async (destino) => {
      destinos.push(destino);
      return respuesta;
    },
  };
  return { m, destinos };
}
const conCliente = { findById: async (id: string) => (id === 'c1' ? cliente : null) };

describe('ConfigurarIaClienteUseCase', () => {
  it('alta: cifra la clave, normaliza la URL y no devuelve la clave', async () => {
    const repo = repoEnMemoria();
    const r = await new ConfigurarIaClienteUseCase(conCliente, repo, cifrador, modelo().m).execute({
      clienteId: 'c1',
      url: ' https://generativelanguage.googleapis.com/v1beta/openai/ ',
      modelo: ' gemini-2.5-flash ',
      clave: 'AIzaClave',
    });

    expect(r.getValue()).toEqual({
      configurado: true,
      url: URL_IA_POR_DEFECTO,
      modelo: 'gemini-2.5-flash',
      verificadoAt: new Date('2026-10-27T12:00:00Z'),
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
    const r = await new ConfigurarIaClienteUseCase(conCliente, repo, cifrador, modelo().m).execute({
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
    const r = await new ConfigurarIaClienteUseCase(conCliente, repo, cifrador, modelo().m).execute({
      clienteId: 'c1',
      url: URL_IA_POR_DEFECTO,
      modelo: 'gemini-2.5-flash',
    });
    expect(r.getError()).toBeInstanceOf(ClaveIaFaltanteError);
    expect(repo.guardados).toEqual([]);
  });

  it('una URL inválida falla y no guarda nada', async () => {
    const repo = repoEnMemoria();
    const r = await new ConfigurarIaClienteUseCase(conCliente, repo, cifrador, modelo().m).execute({
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
      ...cifrador,
      cifrar: () => {
        throw new Error('EMAIL_CRYPTO_KEY ausente');
      },
    };
    const r = await new ConfigurarIaClienteUseCase(conCliente, repo, sinClave, modelo().m).execute({
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
      ...cifrador,
      cifrar: () => {
        throw new TypeError('plaintext must be a string');
      },
    };
    await expect(
      new ConfigurarIaClienteUseCase(conCliente, repo, roto, modelo().m).execute({
        clienteId: 'c1',
        url: URL_IA_POR_DEFECTO,
        modelo: 'gemini-2.5-flash',
        clave: 'AIzaClave',
      }),
    ).rejects.toThrow('plaintext must be a string');
    expect(repo.guardados).toEqual([]);
  });

  describe('guardar prueba el proveedor en el acto', () => {
    const alta = {
      clienteId: 'c1',
      url: URL_IA_POR_DEFECTO,
      modelo: 'gemini-2.5-flash-lite',
      clave: 'AIzaClave',
    };

    it('prueba con la clave recién cargada y devuelve el resultado', async () => {
      const repo = repoEnMemoria();
      const prov = modelo();
      const r = await new ConfigurarIaClienteUseCase(conCliente, repo, cifrador, prov.m).execute(
        alta,
      );

      expect(prov.destinos).toEqual([
        { url: URL_IA_POR_DEFECTO, modelo: 'gemini-2.5-flash-lite', clave: 'AIzaClave' },
      ]);
      expect(repo.verificaciones).toEqual([{ ok: true, motivo: null }]);
      expect(r.getValue().verificadoAt).toEqual(new Date('2026-10-27T12:00:00Z'));
    });

    it('si el proveedor rechaza el modelo, guarda igual y devuelve el motivo', async () => {
      const repo = repoEnMemoria();
      const prov = modelo(
        Result.fail(
          new FallaModeloIaError('El proveedor no encontró la URL o el modelo configurados.'),
        ),
      );
      const r = await new ConfigurarIaClienteUseCase(conCliente, repo, cifrador, prov.m).execute(
        alta,
      );

      expect(repo.actual()?.modelo).toBe('gemini-2.5-flash-lite');
      expect(r.getValue()).toMatchObject({
        configurado: true,
        verificadoAt: null,
        verificacionError: 'El proveedor no encontró la URL o el modelo configurados.',
      });
    });

    it('al cambiar solo el modelo, prueba con la clave guardada', async () => {
      const repo = repoEnMemoria({
        clienteId: 'c1',
        url: URL_IA_POR_DEFECTO,
        modelo: 'gemini-2.5-flash',
        claveCifrada: 'cifrada(c1,AIzaGuardada)',
        verificadoAt: new Date('2026-10-01T00:00:00Z'),
        verificacionError: null,
      });
      const prov = modelo();
      await new ConfigurarIaClienteUseCase(conCliente, repo, cifrador, prov.m).execute({
        clienteId: 'c1',
        url: URL_IA_POR_DEFECTO,
        modelo: 'gemini-3.5-flash',
      });

      expect(prov.destinos).toEqual([
        { url: URL_IA_POR_DEFECTO, modelo: 'gemini-3.5-flash', clave: 'AIzaGuardada' },
      ]);
    });

    it('si la clave guardada no descifra, guarda igual y registra el motivo sin llamar al proveedor', async () => {
      const repo = repoEnMemoria({
        clienteId: 'c1',
        url: URL_IA_POR_DEFECTO,
        modelo: 'gemini-2.5-flash',
        claveCifrada: 'v1:de-otra-clave',
        verificadoAt: null,
        verificacionError: null,
      });
      const prov = modelo();
      const r = await new ConfigurarIaClienteUseCase(conCliente, repo, cifrador, prov.m).execute({
        clienteId: 'c1',
        url: URL_IA_POR_DEFECTO,
        modelo: 'gemini-3.5-flash',
      });

      expect(prov.destinos).toEqual([]);
      expect(r.getValue().verificacionError).toBe(
        'No se pudo descifrar la clave de IA guardada. Vuelva a cargarla.',
      );
    });

    it('un rechazo de validación no llama al proveedor', async () => {
      const repo = repoEnMemoria();
      const prov = modelo();
      await new ConfigurarIaClienteUseCase(conCliente, repo, cifrador, prov.m).execute({
        ...alta,
        url: 'http://inseguro.example.com/',
      });
      expect(prov.destinos).toEqual([]);
      expect(repo.verificaciones).toEqual([]);
    });
  });

  it('un cliente inexistente falla y no guarda nada', async () => {
    const repo = repoEnMemoria();
    const r = await new ConfigurarIaClienteUseCase(conCliente, repo, cifrador, modelo().m).execute({
      clienteId: 'otro',
      url: URL_IA_POR_DEFECTO,
      modelo: 'gemini-2.5-flash',
      clave: 'AIzaClave',
    });
    expect(r.getError()).toBeInstanceOf(ClienteIaNoEncontradoError);
    expect(repo.guardados).toEqual([]);
  });
});
