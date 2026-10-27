import { IClienteRepository } from '../../clientes/domain/ports/i-cliente.repository';
import { Result } from '../../shared/domain/result';
import {
  ClaveCifradoIaAusenteError,
  ClaveIaFaltanteError,
  ClaveIaInvalidaError,
  ClienteIaNoEncontradoError,
  ModeloIaInvalidoError,
  UrlIaInvalidaError,
} from '../domain/asistente.errors';
import {
  IAsistenteIaConfigRepository,
  ResultadoVerificacionIa,
} from '../domain/asistente-ia-config-repository.port';
import {
  EstadoConfigIa,
  estadoConfigIa,
  validarClaveIa,
  validarModeloIa,
  validarUrlIa,
} from '../domain/config-ia';

import { IModeloIa } from '../domain/modelo-ia.port';
import { ClaveIaCifrada } from './clave-ia-cifrada';
import { verificarProveedorIa } from './verificar-proveedor-ia';

/** Marca del mensaje que `AesGcmSecretCipher` lanza cuando falta o es inválida la clave. */
const MARCA_CLAVE_CIFRADO_AUSENTE = 'EMAIL_CRYPTO_KEY';

export interface ConfigurarIaClienteCommand {
  clienteId: string;
  url: string;
  modelo: string;
  /** `undefined` = conservar la clave ya guardada. */
  clave?: string;
}

export type ConfigurarIaClienteError =
  | ClienteIaNoEncontradoError
  | UrlIaInvalidaError
  | ModeloIaInvalidoError
  | ClaveIaInvalidaError
  | ClaveIaFaltanteError
  | ClaveCifradoIaAusenteError;

/**
 * ConfigurarIaClienteUseCase — alta o edición de la configuración de IA de un cliente (S4, S7).
 *
 * 1. El cliente debe existir.
 * 2. La URL, el modelo y la clave se validan y se guardan normalizados (`validarUrlIa`,
 *    `validarModeloIa`, `validarClaveIa`): los topes se miden sobre el valor recortado.
 * 3. Clave:
 *    - provista → se cifra con AAD `ia:{clienteId}`;
 *    - omitida con IA ya configurada → se conserva el ciphertext guardado TAL CUAL; guardar no
 *      depende de descifrarlo, así que una clave que dejó de descifrar no impide guardar (la
 *      prueba del paso 5 sí la descifra, y si no puede, lo registra como falla);
 *    - omitida sin IA configurada → `ClaveIaFaltanteError` (no hay nada que conservar).
 * 4. Cifrar lanza si falta `EMAIL_CRYPTO_KEY`: ocurre ANTES de escribir, así que no se guarda nada y
 *    se informa `ClaveCifradoIaAusenteError`. Cualquier otra excepción se propaga tal cual: un 503
 *    que culpa a la clave del servidor por un error distinto mandaría a buscar en el lugar
 *    equivocado.
 *
 * 5. Después de guardar, prueba el proveedor con una consulta mínima y registra el resultado, como
 *    "Probar". Un rechazo NO deshace el guardado: queda la configuración y el motivo a la vista. Sin
 *    esto, un modelo retirado por el proveedor (caso real: `gemini-2.5-flash-lite`, 2026-10-27) se
 *    guardaba sin aviso y el asistente caía al respaldo sin que nadie lo notara.
 */
export class ConfigurarIaClienteUseCase {
  constructor(
    private readonly clientes: Pick<IClienteRepository, 'findById'>,
    private readonly configs: Pick<
      IAsistenteIaConfigRepository,
      'buscarPorCliente' | 'guardar' | 'guardarVerificacion'
    >,
    private readonly claves: Pick<ClaveIaCifrada, 'cifrar' | 'descifrar'>,
    private readonly modelo: IModeloIa,
  ) {}

  /**
   * @param command cliente, URL, modelo y clave opcional
   * @returns el estado guardado, sin la clave
   */
  async execute(
    command: ConfigurarIaClienteCommand,
  ): Promise<Result<EstadoConfigIa, ConfigurarIaClienteError>> {
    const falla = (error: ConfigurarIaClienteError) =>
      Result.fail<EstadoConfigIa, ConfigurarIaClienteError>(error);

    if (!(await this.clientes.findById(command.clienteId))) {
      return falla(new ClienteIaNoEncontradoError(command.clienteId));
    }

    const url = validarUrlIa(command.url);
    if (url.isFail()) return falla(url.getError());
    const modelo = validarModeloIa(command.modelo);
    if (modelo.isFail()) return falla(modelo.getError());

    let claveCifrada: string;
    // Clave en claro para la prueba posterior: la recién cargada, o `null` si se conserva la guardada.
    let claveEnClaro: string | null = null;
    if (command.clave === undefined) {
      const actual = await this.configs.buscarPorCliente(command.clienteId);
      if (!actual) return falla(new ClaveIaFaltanteError());
      claveCifrada = actual.claveCifrada;
    } else {
      const clave = validarClaveIa(command.clave);
      if (clave.isFail()) return falla(clave.getError());
      try {
        claveCifrada = this.claves.cifrar(command.clienteId, clave.getValue());
        claveEnClaro = clave.getValue();
      } catch (error) {
        if (error instanceof Error && error.message.includes(MARCA_CLAVE_CIFRADO_AUSENTE)) {
          return falla(new ClaveCifradoIaAusenteError());
        }
        throw error;
      }
    }

    const guardada = await this.configs.guardar({
      clienteId: command.clienteId,
      url: url.getValue(),
      modelo: modelo.getValue(),
      claveCifrada,
    });

    const resultado = await this.probar(command.clienteId, guardada, claveEnClaro);
    const verificada = await this.configs.guardarVerificacion(command.clienteId, resultado);
    // `null`: la IA se quitó entre el guardado y la prueba; se informa lo que se guardó.
    return Result.ok(estadoConfigIa(verificada ?? guardada));
  }

  /** Prueba lo guardado; una clave conservada que no descifra es una falla con su motivo. */
  private async probar(
    clienteId: string,
    guardada: { url: string; modelo: string; claveCifrada: string },
    claveEnClaro: string | null,
  ): Promise<ResultadoVerificacionIa> {
    let clave = claveEnClaro;
    if (clave === null) {
      const descifrada = this.claves.descifrar(clienteId, guardada.claveCifrada);
      if (descifrada.isFail()) return { ok: false, motivo: descifrada.getError().message };
      clave = descifrada.getValue();
    }
    return verificarProveedorIa(this.modelo, { url: guardada.url, modelo: guardada.modelo, clave });
  }
}
