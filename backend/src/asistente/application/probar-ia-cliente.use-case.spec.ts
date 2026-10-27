import { ClienteEntity } from '../../clientes/domain/entities/cliente.entity';
import { Result } from '../../shared/domain/result';
import {
  ClaveIaIndescifrableError,
  ClienteIaNoEncontradoError,
  IaNoConfiguradaError,
} from '../domain/asistente.errors';
import { ResultadoVerificacionIa } from '../domain/asistente-ia-config-repository.port';
import { ConfigIa, DestinoIa, URL_IA_POR_DEFECTO } from '../domain/config-ia';
import { FallaModeloIaError, IModeloIa, PedidoIa } from '../domain/modelo-ia.port';
import { ProbarIaClienteUseCase } from './probar-ia-cliente.use-case';

const cliente = ClienteEntity.create(
  { nombre: 'Cliente', razonSocial: null, cuit: null, dbName: 'soporte_x', activo: true },
  'c1',
);
const conCliente = { findById: async (id: string) => (id === 'c1' ? cliente : null) };

const guardada: ConfigIa = {
  clienteId: 'c1',
  url: URL_IA_POR_DEFECTO,
  modelo: 'gemini-2.5-flash',
  claveCifrada: 'v1:guardada',
  verificadoAt: null,
  verificacionError: null,
};

function repo(inicial: ConfigIa | null) {
  const verificaciones: ResultadoVerificacionIa[] = [];
  return {
    verificaciones,
    buscarPorCliente: async () => inicial,
    guardarVerificacion: async (_id: string, resultado: ResultadoVerificacionIa) => {
      verificaciones.push(resultado);
      if (!inicial) return null;
      return resultado.ok
        ? { ...inicial, verificadoAt: new Date('2026-10-26T12:00:00Z'), verificacionError: null }
        : { ...inicial, verificacionError: resultado.motivo };
    },
  };
}

const descifra = { descifrar: () => Result.ok<string, ClaveIaIndescifrableError>('AIzaClave') };

function modelo(respuesta: Result<string, FallaModeloIaError>) {
  const llamadas: Array<{ destino: DestinoIa; pedido: PedidoIa }> = [];
  const m: IModeloIa = {
    completar: async (destino, pedido) => {
      llamadas.push({ destino, pedido });
      return respuesta;
    },
  };
  return { m, llamadas };
}

describe('ProbarIaClienteUseCase', () => {
  it('éxito: consulta con la clave descifrada y registra la verificación', async () => {
    const r = repo(guardada);
    const { m, llamadas } = modelo(Result.ok('OK'));
    const estado = await new ProbarIaClienteUseCase(conCliente, r, descifra, m).execute('c1');

    expect(llamadas[0].destino).toEqual({
      url: URL_IA_POR_DEFECTO,
      modelo: 'gemini-2.5-flash',
      clave: 'AIzaClave',
    });
    expect(r.verificaciones).toEqual([{ ok: true, motivo: null }]);
    expect(estado.getValue().verificadoAt).toEqual(new Date('2026-10-26T12:00:00Z'));
    expect(estado.getValue().verificacionError).toBeNull();
  });

  it('falla del proveedor: registra su motivo saneado', async () => {
    const r = repo(guardada);
    const { m } = modelo(Result.fail(new FallaModeloIaError('El proveedor rechazó la clave.')));
    const estado = await new ProbarIaClienteUseCase(conCliente, r, descifra, m).execute('c1');

    expect(r.verificaciones).toEqual([{ ok: false, motivo: 'El proveedor rechazó la clave.' }]);
    expect(estado.getValue().verificacionError).toBe('El proveedor rechazó la clave.');
  });

  it('una clave que no descifra se registra como falla sin llamar al proveedor', async () => {
    const r = repo(guardada);
    const { m, llamadas } = modelo(Result.ok('OK'));
    const noDescifra = {
      descifrar: () =>
        Result.fail<string, ClaveIaIndescifrableError>(new ClaveIaIndescifrableError()),
    };
    await new ProbarIaClienteUseCase(conCliente, r, noDescifra, m).execute('c1');

    expect(llamadas).toEqual([]);
    expect(r.verificaciones).toEqual([
      { ok: false, motivo: 'No se pudo descifrar la clave de IA guardada. Vuelva a cargarla.' },
    ]);
  });

  it('sin configuración falla sin llamar al proveedor ni registrar nada', async () => {
    const r = repo(null);
    const { m, llamadas } = modelo(Result.ok('OK'));
    const estado = await new ProbarIaClienteUseCase(conCliente, r, descifra, m).execute('c1');

    expect(estado.getError()).toBeInstanceOf(IaNoConfiguradaError);
    expect(llamadas).toEqual([]);
    expect(r.verificaciones).toEqual([]);
  });

  it('un cliente inexistente falla sin llamar al proveedor', async () => {
    const r = repo(guardada);
    const { m, llamadas } = modelo(Result.ok('OK'));
    const estado = await new ProbarIaClienteUseCase(conCliente, r, descifra, m).execute('otro');

    expect(estado.getError()).toBeInstanceOf(ClienteIaNoEncontradoError);
    expect(llamadas).toEqual([]);
  });
});
