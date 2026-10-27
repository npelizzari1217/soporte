import { Result } from '../../shared/domain/result';
import { DestinoIa } from '../domain/config-ia';
import { FallaModeloIaError, IModeloIa, PedidoIa } from '../domain/modelo-ia.port';

/** Plazo total de una consulta al proveedor. */
export const PLAZO_MS_MODELO_IA = 20_000;

/** Firma mínima de `fetch` que usa el adaptador; los tests la reemplazan. */
export type FetchIa = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Motivo saneado por código HTTP. Se guarda y se muestra a ROOT, así que nunca incluye el cuerpo de
 * la respuesta del proveedor: algunos proveedores repiten ahí el pedido o parte de la clave.
 */
function motivoPorEstado(estado: number): string {
  if (estado === 400) return 'El proveedor rechazó el pedido: revise el modelo configurado.';
  if (estado === 401 || estado === 403) return 'El proveedor rechazó la clave.';
  if (estado === 404) return 'El proveedor no encontró la URL o el modelo configurados.';
  if (estado === 429) return 'El proveedor limitó las consultas o se agotó la cuota de la clave.';
  return `El proveedor respondió con un error (HTTP ${estado}).`;
}

/** Une la URL base con `chat/completions`, con o sin barra final. */
export function urlChatCompletions(base: string): string {
  return `${base.replace(/\/+$/, '')}/chat/completions`;
}

/** Extrae el texto de `choices[0].message.content` sin confiar en la forma de la respuesta. */
function textoDeRespuesta(cuerpo: unknown): string | null {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null;
  const choices = (cuerpo as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const primero: unknown = choices[0];
  if (typeof primero !== 'object' || primero === null) return null;
  const mensaje = (primero as { message?: unknown }).message;
  if (typeof mensaje !== 'object' || mensaje === null) return null;
  const contenido = (mensaje as { content?: unknown }).content;
  if (typeof contenido !== 'string') return null;
  const texto = contenido.trim();
  return texto.length > 0 ? texto : null;
}

/**
 * OpenAiCompatibleModeloIa — consulta un endpoint de chat completions compatible con OpenAI (Gemini,
 * DeepSeek, OpenAI), como el agente de sesitec (odd/asistente-ia-ayuda, S2). La clave viaja solo en
 * el encabezado `Authorization`; ningún motivo de falla la incluye.
 */
export class OpenAiCompatibleModeloIa implements IModeloIa {
  constructor(
    private readonly fetchIa: FetchIa = (url, init) => fetch(url, init),
    private readonly plazoMs: number = PLAZO_MS_MODELO_IA,
  ) {}

  /**
   * @param destino URL base, modelo y clave en claro
   * @param pedido mensajes, temperatura y tope de fichas
   * @returns el texto de la respuesta, o una falla con motivo saneado
   */
  async completar(
    destino: DestinoIa,
    pedido: PedidoIa,
  ): Promise<Result<string, FallaModeloIaError>> {
    const falla = (motivo: string) =>
      Result.fail<string, FallaModeloIaError>(new FallaModeloIaError(motivo));

    let respuesta: Response;
    try {
      respuesta = await this.fetchIa(urlChatCompletions(destino.url), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${destino.clave}`,
        },
        body: JSON.stringify({
          model: destino.modelo,
          messages: pedido.mensajes.map((m) => ({ role: m.rol, content: m.contenido })),
          temperature: pedido.temperatura,
          max_tokens: pedido.maxTokens,
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(this.plazoMs),
      });
    } catch (err) {
      const esPlazo =
        err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      return falla(
        esPlazo
          ? 'El proveedor no respondió a tiempo.'
          : 'No se pudo conectar con el proveedor: revise la URL.',
      );
    }

    if (!respuesta.ok) return falla(motivoPorEstado(respuesta.status));

    let cuerpo: unknown;
    try {
      cuerpo = await respuesta.json();
    } catch {
      return falla('El proveedor devolvió una respuesta que no se pudo leer.');
    }
    const texto = textoDeRespuesta(cuerpo);
    return texto === null ? falla('El proveedor devolvió una respuesta vacía.') : Result.ok(texto);
  }
}
