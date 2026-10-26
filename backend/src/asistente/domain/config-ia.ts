import { Result } from '../../shared/domain/result';
import { UrlIaInvalidaError } from './asistente.errors';

/** Largo máximo de la URL del proveedor: el de la columna `asistente_ia_config.url` (VARCHAR 2048). */
export const LARGO_MAXIMO_URL_IA = 2048;
/** Largo máximo del modelo: el de la columna `asistente_ia_config.modelo` (VARCHAR 100). */
export const LARGO_MAXIMO_MODELO_IA = 100;
/**
 * Largo máximo de la clave en claro. La columna es TEXT; el tope evita guardar por error un texto
 * pegado entero. Las claves de Gemini y de los proveedores compatibles con OpenAI miden menos de 200.
 */
export const LARGO_MAXIMO_CLAVE_IA = 500;

/** URL de chat completions compatible con OpenAI de Gemini: el proveedor por defecto (S4). */
export const URL_IA_POR_DEFECTO = 'https://generativelanguage.googleapis.com/v1beta/openai/';
/** Modelo que la pantalla propone al configurar un cliente por primera vez. */
export const MODELO_IA_POR_DEFECTO = 'gemini-2.5-flash';

/**
 * Configuración de IA persistida de un cliente. La clave viaja CIFRADA: cifrar y descifrar es tarea
 * de `ClaveIaCifrada`, no del repositorio ni de los casos de uso.
 */
export interface ConfigIa {
  clienteId: string;
  url: string;
  modelo: string;
  claveCifrada: string;
  /** Último éxito de "Probar". */
  verificadoAt: Date | null;
  /** Motivo saneado de la última falla de "Probar", o `null`. */
  verificacionError: string | null;
}

/** Lo que se escribe al configurar: URL, modelo y clave cifrada. */
export type DatosConfigIa = Pick<ConfigIa, 'clienteId' | 'url' | 'modelo' | 'claveCifrada'>;

/** Destino ya descifrado, listo para llamar al proveedor. Nunca sale del backend. */
export interface DestinoIa {
  url: string;
  modelo: string;
  clave: string;
}

/**
 * Estado expuesto por la API. NO incluye la clave bajo ninguna forma (ni enmascarada ni su largo):
 * un campo que no existe en el tipo no se puede filtrar por accidente.
 */
export interface EstadoConfigIa {
  configurado: boolean;
  url: string | null;
  modelo: string | null;
  verificadoAt: Date | null;
  verificacionError: string | null;
}

/** Estado de un cliente sin IA: responde con la Ayuda directamente (modo de respaldo). */
export const ESTADO_IA_SIN_CONFIGURAR: EstadoConfigIa = {
  configurado: false,
  url: null,
  modelo: null,
  verificadoAt: null,
  verificacionError: null,
};

/** Proyección de la configuración persistida al estado público, campo a campo. */
export function estadoConfigIa(config: ConfigIa | null): EstadoConfigIa {
  if (!config) return ESTADO_IA_SIN_CONFIGURAR;
  return {
    configurado: true,
    url: config.url,
    modelo: config.modelo,
    verificadoAt: config.verificadoAt,
    verificacionError: config.verificacionError,
  };
}

/**
 * Valida y normaliza la URL del proveedor: absoluta, HTTPS (la clave viaja en un encabezado), sin
 * credenciales embebidas y dentro del largo de la columna. Devuelve el `href` normalizado.
 *
 * No se resuelve DNS contra redes internas, a diferencia de los webhooks: la URL la carga solo ROOT,
 * el mismo actor de confianza que configura el servidor SMTP de cada cliente.
 */
export function validarUrlIa(valor: string): Result<string, UrlIaInvalidaError> {
  const texto = valor.trim();
  if (texto.length === 0 || texto.length > LARGO_MAXIMO_URL_IA) {
    return Result.fail(new UrlIaInvalidaError());
  }
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return Result.fail(new UrlIaInvalidaError());
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') {
    return Result.fail(new UrlIaInvalidaError());
  }
  if (url.href.length > LARGO_MAXIMO_URL_IA) return Result.fail(new UrlIaInvalidaError());
  return Result.ok(url.href);
}
