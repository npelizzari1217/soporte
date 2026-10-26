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
import { IAsistenteIaConfigRepository } from '../domain/asistente-ia-config-repository.port';
import {
  EstadoConfigIa,
  estadoConfigIa,
  validarClaveIa,
  validarModeloIa,
  validarUrlIa,
} from '../domain/config-ia';

/** Marca del mensaje que `AesGcmSecretCipher` lanza cuando falta o es inválida la clave. */
const MARCA_CLAVE_CIFRADO_AUSENTE = 'EMAIL_CRYPTO_KEY';
import { ClaveIaCifrada } from './clave-ia-cifrada';

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
 *    - omitida con IA ya configurada → se conserva el ciphertext guardado TAL CUAL, sin descifrarlo:
 *      así no hace falta la clave en claro para cambiar el modelo, y una clave que dejó de
 *      descifrar se puede reemplazar sin pasar por un error;
 *    - omitida sin IA configurada → `ClaveIaFaltanteError` (no hay nada que conservar).
 * 4. Cifrar lanza si falta `EMAIL_CRYPTO_KEY`: ocurre ANTES de escribir, así que no se guarda nada y
 *    se informa `ClaveCifradoIaAusenteError`. Cualquier otra excepción se propaga tal cual: un 503
 *    que culpa a la clave del servidor por un error distinto mandaría a buscar en el lugar
 *    equivocado.
 *
 * Guardar no prueba el proveedor: probar es una llamada paga y lenta, y va por "Probar".
 */
export class ConfigurarIaClienteUseCase {
  constructor(
    private readonly clientes: Pick<IClienteRepository, 'findById'>,
    private readonly configs: Pick<IAsistenteIaConfigRepository, 'buscarPorCliente' | 'guardar'>,
    private readonly claves: Pick<ClaveIaCifrada, 'cifrar'>,
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
    if (command.clave === undefined) {
      const actual = await this.configs.buscarPorCliente(command.clienteId);
      if (!actual) return falla(new ClaveIaFaltanteError());
      claveCifrada = actual.claveCifrada;
    } else {
      const clave = validarClaveIa(command.clave);
      if (clave.isFail()) return falla(clave.getError());
      try {
        claveCifrada = this.claves.cifrar(command.clienteId, clave.getValue());
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
    return Result.ok(estadoConfigIa(guardada));
  }
}
