import { ConfigIa, DatosConfigIa } from './config-ia';

/**
 * Persistencia de la configuración de IA de cada cliente (master, `asistente_ia_config`). Guarda y
 * devuelve la clave CIFRADA: cifrar y descifrar es tarea de `ClaveIaCifrada`.
 */
export interface IAsistenteIaConfigRepository {
  /** Configuración del cliente, o `null` si no tiene IA. Nunca devuelve la de otro cliente. */
  buscarPorCliente(clienteId: string): Promise<ConfigIa | null>;
  /**
   * Crea o reemplaza URL, modelo y clave del cliente. Limpia el resultado de la última prueba: una
   * verificación de la configuración anterior no dice nada de la nueva.
   */
  guardar(datos: DatosConfigIa): Promise<ConfigIa>;
  /**
   * Registra el resultado de "Probar" sin tocar la configuración. Un éxito fija `verificadoAt` y
   * limpia el motivo; una falla solo escribe el motivo (`verificadoAt` es el último ÉXITO).
   * `null` si el cliente ya no tiene IA (se quitó mientras tanto).
   */
  guardarVerificacion(
    clienteId: string,
    resultado: ResultadoVerificacionIa,
  ): Promise<ConfigIa | null>;
  /** Quita la configuración. Idempotente: quitar una que no existe no falla. */
  quitar(clienteId: string): Promise<void>;
}

/** Resultado de probar el proveedor, con el motivo ya saneado. */
export interface ResultadoVerificacionIa {
  ok: boolean;
  /** Motivo saneado; `null` cuando `ok` es `true`. */
  motivo: string | null;
}

export const ASISTENTE_IA_CONFIG_REPOSITORY = Symbol('IAsistenteIaConfigRepository');
