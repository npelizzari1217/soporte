import { IClienteRepository } from '../../clientes/domain/ports/i-cliente.repository';
import { Result } from '../../shared/domain/result';
import {
  ClaveCifradoIaAusenteError,
  ClaveIaFaltanteError,
  ClienteIaNoEncontradoError,
  UrlIaInvalidaError,
} from '../domain/asistente.errors';
import { IAsistenteIaConfigRepository } from '../domain/asistente-ia-config-repository.port';
import { EstadoConfigIa, estadoConfigIa, validarUrlIa } from '../domain/config-ia';
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
  | ClaveIaFaltanteError
  | ClaveCifradoIaAusenteError;

/**
 * ConfigurarIaClienteUseCase — alta o edición de la configuración de IA de un cliente (S4, S7).
 *
 * 1. El cliente debe existir.
 * 2. La URL se valida y se guarda normalizada (`validarUrlIa`).
 * 3. Clave:
 *    - provista → se cifra con AAD `ia:{clienteId}`;
 *    - omitida con IA ya configurada → se conserva el ciphertext guardado TAL CUAL, sin descifrarlo:
 *      así no hace falta la clave en claro para cambiar el modelo, y una clave que dejó de
 *      descifrar se puede reemplazar sin pasar por un error;
 *    - omitida sin IA configurada → `ClaveIaFaltanteError` (no hay nada que conservar).
 * 4. Cifrar lanza si falta `EMAIL_CRYPTO_KEY`: ocurre ANTES de escribir, así que no se guarda nada y
 *    se informa `ClaveCifradoIaAusenteError`.
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

    let claveCifrada: string;
    if (command.clave === undefined) {
      const actual = await this.configs.buscarPorCliente(command.clienteId);
      if (!actual) return falla(new ClaveIaFaltanteError());
      claveCifrada = actual.claveCifrada;
    } else {
      try {
        claveCifrada = this.claves.cifrar(command.clienteId, command.clave);
      } catch {
        return falla(new ClaveCifradoIaAusenteError());
      }
    }

    const guardada = await this.configs.guardar({
      clienteId: command.clienteId,
      url: url.getValue(),
      modelo: command.modelo.trim(),
      claveCifrada,
    });
    return Result.ok(estadoConfigIa(guardada));
  }
}
