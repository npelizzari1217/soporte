import { Result } from '../../shared/domain/result';
import { ConsultaAsistenteInvalidaError } from '../domain/asistente.errors';
import { IAsistenteIaConfigRepository } from '../domain/asistente-ia-config-repository.port';
import { buscarFragmentos, FragmentoPuntuado } from '../domain/busqueda-ayuda';
import {
  FuenteRespuesta,
  RESPUESTA_SIN_RESULTADOS,
  RespuestaAsistente,
  validarConsulta,
} from '../domain/consulta-asistente';
import { IFuenteAyuda } from '../domain/fuente-ayuda.port';
import { IModeloIa, PedidoIa } from '../domain/modelo-ia.port';
import { ClaveIaCifrada } from './clave-ia-cifrada';

export interface ConsultarAsistenteCommand {
  consulta: string;
  /** Cliente activo del actor; `null` (ROOT sin cliente) responde siempre en modo de respaldo. */
  clienteId: string | null;
  /** Con `KB:VER_TODOS` busca también en los artículos no publicados, como el listado de la Ayuda. */
  veTodosLosArticulos: boolean;
}

/** Temperatura de la respuesta (como en sesitec): baja, para que no invente. */
export const TEMPERATURA_ASISTENTE = 0.2;
/**
 * Tope de fichas de la respuesta. El largo real lo acota el prompt (120 palabras); el tope es amplio
 * a propósito: en Gemini 2.5 las fichas de razonamiento cuentan contra `max_tokens`, y con un tope
 * ajustado la respuesta llega vacía y el asistente cae siempre al respaldo sin que nadie lo note.
 * El proveedor cobra las fichas usadas, no el tope.
 */
export const MAX_TOKENS_ASISTENTE = 2048;
/** Largo máximo del texto de respaldo, cortado en el último espacio. */
export const LARGO_MAXIMO_RESPALDO = 700;

/**
 * Instrucciones del modelo (S2, S6). Portadas del prompt de sesitec y pasadas a español neutro con
 * "usted": responder solo con el contexto, breve, en texto plano y sin inventar.
 */
export const INSTRUCCIONES_ASISTENTE = [
  'Usted es el asistente de la Ayuda del sistema de soporte técnico.',
  'Responda en español neutro, tratando a la persona de "usted".',
  'Use SOLO la información del contexto. No invente pantallas, botones, pasos ni datos.',
  'Si el contexto no alcanza para responder, dígalo y sugiera crear un ticket.',
  'Responda en un máximo de 120 palabras, en texto plano, sin markdown ni listas con símbolos.',
].join('\n');

/** Arma el pedido al modelo con los fragmentos numerados como contexto. */
export function armarPedido(consulta: string, fragmentos: FragmentoPuntuado[]): PedidoIa {
  const contexto = fragmentos
    .map((f, i) => `[${i + 1}] ${f.articuloTitulo} — ${f.seccion}\n${f.texto}`)
    .join('\n\n');
  return {
    mensajes: [
      { rol: 'system', contenido: INSTRUCCIONES_ASISTENTE },
      { rol: 'user', contenido: `Contexto:\n${contexto}\n\nConsulta: ${consulta}` },
    ],
    temperatura: TEMPERATURA_ASISTENTE,
    maxTokens: MAX_TOKENS_ASISTENTE,
  };
}

/** Recorta el texto de respaldo en el último espacio antes del tope. */
export function recortarRespaldo(texto: string): string {
  if (texto.length <= LARGO_MAXIMO_RESPALDO) return texto;
  const corte = texto.lastIndexOf(' ', LARGO_MAXIMO_RESPALDO);
  return `${texto.slice(0, corte > 0 ? corte : LARGO_MAXIMO_RESPALDO)}…`;
}

/** Artículos citados, sin repetir y en el orden de los fragmentos. */
function fuentesDe(fragmentos: FragmentoPuntuado[]): FuenteRespuesta[] {
  const vistas = new Map<string, FuenteRespuesta>();
  for (const f of fragmentos) {
    if (!vistas.has(f.articuloId)) {
      vistas.set(f.articuloId, { articuloId: f.articuloId, titulo: f.articuloTitulo });
    }
  }
  return [...vistas.values()];
}

/**
 * ConsultarAsistenteUseCase — responde una consulta con la Ayuda (S1, S2, S3, S6).
 *
 * 1. Busca los fragmentos más parecidos entre los artículos que la persona puede ver.
 * 2. Sin fragmentos: lo dice y sugiere crear un ticket (`sin_resultados`), sin llamar al proveedor.
 * 3. Si el cliente tiene IA y su clave descifra, el modelo redacta la respuesta con esos fragmentos y
 *    se citan los artículos usados (`ia`).
 * 4. Sin IA, con una clave que no descifra o ante cualquier falla del proveedor: devuelve el
 *    fragmento más parecido (`respaldo`). La persona nunca ve un error por culpa del proveedor; quien
 *    administra lo ve en "Probar".
 */
export class ConsultarAsistenteUseCase {
  constructor(
    private readonly fuente: IFuenteAyuda,
    private readonly configs: Pick<IAsistenteIaConfigRepository, 'buscarPorCliente'>,
    private readonly claves: Pick<ClaveIaCifrada, 'descifrar'>,
    private readonly modelo: IModeloIa,
  ) {}

  /**
   * @param command consulta, cliente activo y alcance de lectura del actor
   * @returns la respuesta con su modo y sus fuentes, o `ConsultaAsistenteInvalidaError`
   */
  async execute(
    command: ConsultarAsistenteCommand,
  ): Promise<Result<RespuestaAsistente, ConsultaAsistenteInvalidaError>> {
    const consulta = validarConsulta(command.consulta);
    if (consulta.isFail()) return Result.fail(consulta.getError());

    const articulos = await this.fuente.listarArticulos(!command.veTodosLosArticulos);
    const fragmentos = buscarFragmentos(articulos, consulta.getValue());
    if (fragmentos.length === 0) {
      return Result.ok({
        respuesta: RESPUESTA_SIN_RESULTADOS,
        modo: 'sin_resultados',
        fuentes: [],
      });
    }

    const redactada = await this.redactarConIa(command.clienteId, consulta.getValue(), fragmentos);
    if (redactada !== null) {
      return Result.ok({ respuesta: redactada, modo: 'ia', fuentes: fuentesDe(fragmentos) });
    }

    const mejor = fragmentos[0];
    return Result.ok({
      respuesta: recortarRespaldo(mejor.texto),
      modo: 'respaldo',
      fuentes: fuentesDe([mejor]),
    });
  }

  /** La respuesta del modelo, o `null` si el cliente no tiene IA o no se pudo obtener. */
  private async redactarConIa(
    clienteId: string | null,
    consulta: string,
    fragmentos: FragmentoPuntuado[],
  ): Promise<string | null> {
    if (clienteId === null) return null;
    const config = await this.configs.buscarPorCliente(clienteId);
    if (!config) return null;
    const clave = this.claves.descifrar(clienteId, config.claveCifrada);
    if (clave.isFail()) return null;

    const respuesta = await this.modelo.completar(
      { url: config.url, modelo: config.modelo, clave: clave.getValue() },
      armarPedido(consulta, fragmentos),
    );
    return respuesta.isOk() ? respuesta.getValue() : null;
  }
}
