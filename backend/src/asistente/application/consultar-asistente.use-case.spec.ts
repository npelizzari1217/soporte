import { Result } from '../../shared/domain/result';
import {
  ClaveIaIndescifrableError,
  ConsultaAsistenteInvalidaError,
} from '../domain/asistente.errors';
import { ArticuloAyuda } from '../domain/busqueda-ayuda';
import { ConfigIa, DestinoIa, URL_IA_POR_DEFECTO } from '../domain/config-ia';
import { RESPUESTA_SIN_RESULTADOS } from '../domain/consulta-asistente';
import { FallaModeloIaError, IModeloIa, PedidoIa } from '../domain/modelo-ia.port';
import {
  ConsultarAsistenteUseCase,
  INSTRUCCIONES_ASISTENTE,
  LARGO_MAXIMO_RESPALDO,
  recortarRespaldo,
} from './consultar-asistente.use-case';

const publicado: ArticuloAyuda = {
  id: 'a-tickets',
  titulo: 'Tickets',
  contenido: '## Crear un ticket\nDesde Tickets > Nuevo, complete el asunto y presione Guardar.',
};
const interno: ArticuloAyuda = {
  id: 'a-interno',
  titulo: 'Procedimiento interno',
  contenido: '## Escalar un ticket\nEl técnico escala el ticket al supervisor de guardia.',
};

/** Fuente que respeta la visibilidad y registra con qué alcance se la consultó. */
function fuente() {
  const pedidos: boolean[] = [];
  return {
    pedidos,
    listarArticulos: async (soloPublicados: boolean) => {
      pedidos.push(soloPublicados);
      return soloPublicados ? [publicado] : [publicado, interno];
    },
  };
}

const config: ConfigIa = {
  clienteId: 'c1',
  url: URL_IA_POR_DEFECTO,
  modelo: 'gemini-2.5-flash',
  claveCifrada: 'v1:guardada',
  verificadoAt: null,
  verificacionError: null,
};
const conIa = { buscarPorCliente: async (id: string) => (id === 'c1' ? config : null) };
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

const comando = (consulta: string, clienteId: string | null = 'c1', veTodos = false) => ({
  consulta,
  clienteId,
  veTodosLosArticulos: veTodos,
});

describe('ConsultarAsistenteUseCase', () => {
  it('con IA: redacta con los fragmentos encontrados y cita sus artículos', async () => {
    const { m, llamadas } = modelo(Result.ok('Vaya a Tickets > Nuevo y complete el asunto.'));
    const r = await new ConsultarAsistenteUseCase(fuente(), conIa, descifra, m).execute(
      comando('¿Cómo creo un ticket?'),
    );

    expect(r.getValue()).toEqual({
      respuesta: 'Vaya a Tickets > Nuevo y complete el asunto.',
      modo: 'ia',
      fuentes: [{ articuloId: 'a-tickets', titulo: 'Tickets' }],
    });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].destino).toEqual({
      url: URL_IA_POR_DEFECTO,
      modelo: 'gemini-2.5-flash',
      clave: 'AIzaClave',
    });
    const { mensajes, temperatura, maxTokens } = llamadas[0].pedido;
    // Valores de la spec (S2), no las constantes: un cambio de la constante tiene que romper esto.
    expect(temperatura).toBe(0.2);
    // Amplio por las fichas de razonamiento de Gemini 2.5 (ver MAX_TOKENS_ASISTENTE).
    expect(maxTokens).toBeGreaterThanOrEqual(2048);
    expect(mensajes[0]).toEqual({ rol: 'system', contenido: INSTRUCCIONES_ASISTENTE });
    expect(mensajes[1].contenido).toBe(
      'Contexto:\n[1] Tickets — Crear un ticket\n' +
        'Desde Tickets > Nuevo, complete el asunto y presione Guardar.\n\n' +
        'Consulta: ¿Cómo creo un ticket?',
    );
  });

  it('pasa como contexto como mucho 3 fragmentos (S2)', async () => {
    const muchas: ArticuloAyuda = {
      id: 'a-muchas',
      titulo: 'Tickets en detalle',
      contenido: [1, 2, 3, 4, 5]
        .map((n) => `## Ticket parte ${n}\nTexto del ticket ${n}.`)
        .join('\n'),
    };
    const { m, llamadas } = modelo(Result.ok('Respuesta.'));
    const conMuchas = { listarArticulos: async () => [muchas] };
    await new ConsultarAsistenteUseCase(conMuchas, conIa, descifra, m).execute(comando('ticket'));

    const contexto = llamadas[0].pedido.mensajes[1].contenido;
    expect(contexto).toContain('[3] ');
    expect(contexto).not.toContain('[4] ');
  });

  it('sin IA configurada: devuelve el fragmento más parecido sin llamar a ningún proveedor', async () => {
    const { m, llamadas } = modelo(Result.ok('no debería usarse'));
    const sinIa = { buscarPorCliente: async () => null };
    const r = await new ConsultarAsistenteUseCase(fuente(), sinIa, descifra, m).execute(
      comando('¿Cómo creo un ticket?'),
    );

    expect(r.getValue()).toEqual({
      respuesta: 'Desde Tickets > Nuevo, complete el asunto y presione Guardar.',
      modo: 'respaldo',
      fuentes: [{ articuloId: 'a-tickets', titulo: 'Tickets' }],
    });
    expect(llamadas).toEqual([]);
  });

  it('si el proveedor falla, responde con el respaldo y no con un error', async () => {
    const { m } = modelo(Result.fail(new FallaModeloIaError('El proveedor rechazó la clave.')));
    const r = await new ConsultarAsistenteUseCase(fuente(), conIa, descifra, m).execute(
      comando('¿Cómo creo un ticket?'),
    );
    expect(r.getValue().modo).toBe('respaldo');
    expect(r.getValue().respuesta).not.toContain('proveedor');
  });

  it('si la clave no descifra, responde con el respaldo sin llamar al proveedor', async () => {
    const { m, llamadas } = modelo(Result.ok('no debería usarse'));
    const noDescifra = {
      descifrar: () =>
        Result.fail<string, ClaveIaIndescifrableError>(new ClaveIaIndescifrableError()),
    };
    const r = await new ConsultarAsistenteUseCase(fuente(), conIa, noDescifra, m).execute(
      comando('¿Cómo creo un ticket?'),
    );
    expect(r.getValue().modo).toBe('respaldo');
    expect(llamadas).toEqual([]);
  });

  it('sin cliente activo (ROOT) responde con el respaldo', async () => {
    const { m, llamadas } = modelo(Result.ok('no debería usarse'));
    const r = await new ConsultarAsistenteUseCase(fuente(), conIa, descifra, m).execute(
      comando('¿Cómo creo un ticket?', null),
    );
    expect(r.getValue().modo).toBe('respaldo');
    expect(llamadas).toEqual([]);
  });

  it('sin nada parecido en la Ayuda: lo dice, sugiere un ticket y no llama al proveedor', async () => {
    const { m, llamadas } = modelo(Result.ok('no debería usarse'));
    const r = await new ConsultarAsistenteUseCase(fuente(), conIa, descifra, m).execute(
      comando('facturación electrónica AFIP'),
    );
    expect(r.getValue()).toEqual({
      respuesta: RESPUESTA_SIN_RESULTADOS,
      modo: 'sin_resultados',
      fuentes: [],
    });
    expect(llamadas).toEqual([]);
  });

  it('sin KB:VER_TODOS no busca en los artículos internos', async () => {
    const f = fuente();
    const { m } = modelo(Result.ok('x'));
    const r = await new ConsultarAsistenteUseCase(f, conIa, descifra, m).execute(
      comando('escalar al supervisor'),
    );
    expect(f.pedidos).toEqual([true]);
    expect(r.getValue().modo).toBe('sin_resultados');
  });

  it('con KB:VER_TODOS busca también en los artículos internos', async () => {
    const f = fuente();
    const { m } = modelo(Result.ok('Se escala al supervisor de guardia.'));
    const r = await new ConsultarAsistenteUseCase(f, conIa, descifra, m).execute(
      comando('escalar al supervisor', 'c1', true),
    );
    expect(f.pedidos).toEqual([false]);
    expect(r.getValue().fuentes).toEqual([
      { articuloId: 'a-interno', titulo: 'Procedimiento interno' },
    ]);
  });

  it('una consulta vacía falla sin leer la Ayuda', async () => {
    const f = fuente();
    const { m } = modelo(Result.ok('x'));
    const r = await new ConsultarAsistenteUseCase(f, conIa, descifra, m).execute(comando('   '));
    expect(r.getError()).toBeInstanceOf(ConsultaAsistenteInvalidaError);
    expect(f.pedidos).toEqual([]);
  });
});

describe('recortarRespaldo', () => {
  it('deja intacto un texto corto', () => {
    expect(recortarRespaldo('Texto corto.')).toBe('Texto corto.');
  });

  it('corta un texto largo en el último espacio antes del tope y agrega puntos suspensivos', () => {
    const texto = 'palabra '.repeat(200).trim();
    const recortado = recortarRespaldo(texto);
    expect(recortado.endsWith('palabra…')).toBe(true);
    expect(recortado.length).toBeLessThanOrEqual(LARGO_MAXIMO_RESPALDO + 1);
  });
});
