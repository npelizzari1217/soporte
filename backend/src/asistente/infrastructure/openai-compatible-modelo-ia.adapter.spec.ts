import {
  FetchIa,
  OpenAiCompatibleModeloIa,
  urlChatCompletions,
} from './openai-compatible-modelo-ia.adapter';

const destino = {
  url: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  modelo: 'gemini-2.5-flash',
  clave: 'AIzaSECRETA',
};
const pedido = {
  mensajes: [
    { rol: 'system' as const, contenido: 'Responda breve.' },
    { rol: 'user' as const, contenido: '¿Cómo creo un ticket?' },
  ],
  temperatura: 0.2,
  maxTokens: 300,
};

function respuestaJson(estado: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('urlChatCompletions', () => {
  it('une la base con chat/completions con o sin barra final', () => {
    expect(urlChatCompletions('https://api.deepseek.com')).toBe(
      'https://api.deepseek.com/chat/completions',
    );
    expect(urlChatCompletions(destino.url)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    );
  });
});

describe('OpenAiCompatibleModeloIa', () => {
  it('envía el pedido en formato chat completions y devuelve el texto recortado', async () => {
    let url = '';
    let init: RequestInit = {};
    const fetchIa: FetchIa = async (u, i) => {
      url = u;
      init = i;
      return respuestaJson(200, {
        choices: [{ message: { content: '  Desde Tickets > Nuevo.  ' } }],
      });
    };

    const r = await new OpenAiCompatibleModeloIa(fetchIa).completar(destino, pedido);

    expect(r.getValue()).toBe('Desde Tickets > Nuevo.');
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer AIzaSECRETA');
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'Responda breve.' },
        { role: 'user', content: '¿Cómo creo un ticket?' },
      ],
      temperature: 0.2,
      max_tokens: 300,
    });
  });

  it.each([
    [400, 'El proveedor rechazó el pedido: revise el modelo configurado.'],
    [401, 'El proveedor rechazó la clave.'],
    [403, 'El proveedor rechazó la clave.'],
    [404, 'El proveedor no encontró la URL o el modelo configurados.'],
    [429, 'El proveedor limitó las consultas o se agotó la cuota de la clave.'],
    [500, 'El proveedor respondió con un error (HTTP 500).'],
  ])('HTTP %i da un motivo saneado sin el cuerpo ni la clave', async (estado, motivo) => {
    const fetchIa: FetchIa = async () =>
      respuestaJson(estado, { error: { message: 'API key AIzaSECRETA not valid' } });
    const r = await new OpenAiCompatibleModeloIa(fetchIa).completar(destino, pedido);

    expect(r.getError().message).toBe(motivo);
    expect(r.getError().message).not.toContain('AIzaSECRETA');
  });

  it('un error de red da un motivo de conexión', async () => {
    const fetchIa: FetchIa = async () => {
      throw new TypeError('fetch failed');
    };
    const r = await new OpenAiCompatibleModeloIa(fetchIa).completar(destino, pedido);
    expect(r.getError().message).toBe('No se pudo conectar con el proveedor: revise la URL.');
  });

  it('vencido el plazo, informa que el proveedor no respondió a tiempo', async () => {
    const fetchIa: FetchIa = (_u, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    const r = await new OpenAiCompatibleModeloIa(fetchIa, 10).completar(destino, pedido);
    expect(r.getError().message).toBe('El proveedor no respondió a tiempo.');
  });

  it.each([
    ['sin choices', { choices: [] }],
    ['contenido vacío', { choices: [{ message: { content: '   ' } }] }],
    ['contenido no textual', { choices: [{ message: { content: null } }] }],
  ])('una respuesta %s es una falla', async (_caso, cuerpo) => {
    const fetchIa: FetchIa = async () => respuestaJson(200, cuerpo);
    const r = await new OpenAiCompatibleModeloIa(fetchIa).completar(destino, pedido);
    expect(r.getError().message).toBe('El proveedor devolvió una respuesta vacía.');
  });

  it('un cuerpo que no es JSON es una falla', async () => {
    const fetchIa: FetchIa = async () => new Response('<html>', { status: 200 });
    const r = await new OpenAiCompatibleModeloIa(fetchIa).completar(destino, pedido);
    expect(r.getError().message).toBe('El proveedor devolvió una respuesta que no se pudo leer.');
  });
});
