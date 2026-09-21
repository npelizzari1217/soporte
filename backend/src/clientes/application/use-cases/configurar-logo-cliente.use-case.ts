import { uuidv7 } from 'uuidv7';
import { Result } from '../../../shared/domain/result';
import { IFileStorage } from '../../../shared/domain/ports/i-file-storage';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ClienteNoEncontradoError } from '../../domain/errors/clientes.errors';

/**
 * Comando de entrada de `ConfigurarLogoClienteUseCase`.
 */
export interface ConfigurarLogoClienteCommand {
  clienteId: string;
  buffer: Buffer;
  mimeType: string;
}

/**
 * ConfigurarLogoClienteUseCase — sube o reemplaza el logo de un cliente
 * (sdd/logo-por-cliente, WU2). Exclusivo ROOT (gateado por `GlobalAdminGuard`
 * en `ClienteLogoController`).
 *
 * Orden de escritura (design.md D5), en este orden exacto:
 * 1. Genera una key NUEVA (`clientes/{clienteId}/{uuid}`, design.md D8 —
 *    server-side, ningún byte del cliente entra en la ruta).
 * 2. Sube el binario a `IFileStorage` bajo esa key.
 * 3. Persiste la fila (`ClienteEntity.actualizarLogo()` + `repo.save()`).
 * 4. Borra la key ANTERIOR del storage, BEST-EFFORT: si `delete()` falla, la
 *    operación igual reporta éxito — un huérfano en disco es más barato que
 *    una fila apuntando a la nada (design.md D5).
 *
 * `mimeType`/tamaño ya fueron validados por `validarLogoCliente` (pipe,
 * interface) antes de llegar acá.
 */
export class ConfigurarLogoClienteUseCase {
  constructor(
    private readonly clienteRepo: IClienteRepository,
    private readonly fileStorage: IFileStorage,
  ) {}

  async execute(
    command: ConfigurarLogoClienteCommand,
  ): Promise<Result<ClienteEntity, ClienteNoEncontradoError>> {
    const cliente = await this.clienteRepo.findById(command.clienteId);
    if (!cliente) {
      return Result.fail(new ClienteNoEncontradoError(command.clienteId));
    }

    const keyAnterior = cliente.logoStorageKey;
    const nuevaKey = `clientes/${command.clienteId}/${uuidv7()}`;

    await this.fileStorage.upload(nuevaKey, command.buffer, command.mimeType);
    cliente.actualizarLogo(nuevaKey, command.mimeType, new Date());
    await this.clienteRepo.save(cliente);

    if (keyAnterior) {
      try {
        await this.fileStorage.delete(keyAnterior);
      } catch {
        // Best-effort (design.md D5): un huérfano en disco no es un error
        // observable. El logo nuevo ya quedó persistido y es correcto.
      }
    }

    return Result.ok(cliente);
  }
}
