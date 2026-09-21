import { Result } from '../../../shared/domain/result';
import { IFileStorage } from '../../../shared/domain/ports/i-file-storage';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import {
  ClienteNoEncontradoError,
  LogoClienteNoEncontradoError,
} from '../../domain/errors/clientes.errors';

/** Binario del logo y su mime almacenado, listos para servir por HTTP. */
export interface LogoClienteData {
  buffer: Buffer;
  mimeType: string;
}

/**
 * VerLogoClienteUseCase — resuelve el binario del logo de un cliente
 * (sdd/logo-por-cliente, WU2).
 *
 * La AUTORIZACIÓN (aislamiento entre inquilinos, ROOT sin restricción) vive
 * en `ClienteLogoController` — el chequeo inline corre ANTES de invocar este
 * use case (design.md, tabla "Autorización: los dos lugares"). Este use case
 * asume que el caller ya tiene permiso y solo resuelve "¿hay logo?".
 *
 * `LogoClienteNoEncontradoError` cubre dos casos, ambos → 404 en la capa de
 * presentación (spec, regla 7): el cliente existe pero nunca cargó un logo,
 * o la fila apunta a una key que `IFileStorage.retrieve()` ya no encuentra
 * (huérfano de lectura — no debería ocurrir en operación normal, pero
 * degrada al mismo 404 en vez de un 500).
 */
export class VerLogoClienteUseCase {
  constructor(
    private readonly clienteRepo: IClienteRepository,
    private readonly fileStorage: IFileStorage,
  ) {}

  async execute(
    clienteId: string,
  ): Promise<Result<LogoClienteData, ClienteNoEncontradoError | LogoClienteNoEncontradoError>> {
    const cliente = await this.clienteRepo.findById(clienteId);
    if (!cliente) {
      return Result.fail(new ClienteNoEncontradoError(clienteId));
    }

    if (!cliente.logoStorageKey || !cliente.logoMimeType) {
      return Result.fail(new LogoClienteNoEncontradoError(clienteId));
    }

    const buffer = await this.fileStorage.retrieve(cliente.logoStorageKey);
    if (!buffer) {
      return Result.fail(new LogoClienteNoEncontradoError(clienteId));
    }

    return Result.ok({ buffer, mimeType: cliente.logoMimeType });
  }
}
