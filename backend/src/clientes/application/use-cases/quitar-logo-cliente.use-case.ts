import { Result } from '../../../shared/domain/result';
import { IFileStorage } from '../../../shared/domain/ports/i-file-storage';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ClienteNoEncontradoError } from '../../domain/errors/clientes.errors';

/**
 * QuitarLogoClienteUseCase — quita el logo de un cliente (sdd/logo-por-cliente,
 * WU2). Exclusivo ROOT (gateado por `GlobalAdminGuard` en
 * `ClienteLogoController`).
 *
 * Idempotente (spec, regla 11): quitar el logo de un cliente que ya no tiene
 * uno reporta éxito igual, SIN tocar el storage ni persistir una escritura
 * vacía.
 *
 * Cuando sí hay logo: limpia las 3 props juntas en la entidad
 * (`quitarLogo()`), persiste, y borra la key del storage BEST-EFFORT (mismo
 * criterio que el reemplazo, design.md D5) — si el `delete()` falla, la
 * operación igual reporta éxito.
 */
export class QuitarLogoClienteUseCase {
  constructor(
    private readonly clienteRepo: IClienteRepository,
    private readonly fileStorage: IFileStorage,
  ) {}

  async execute(clienteId: string): Promise<Result<void, ClienteNoEncontradoError>> {
    const cliente = await this.clienteRepo.findById(clienteId);
    if (!cliente) {
      return Result.fail(new ClienteNoEncontradoError(clienteId));
    }

    const keyActual = cliente.logoStorageKey;
    if (!keyActual) {
      return Result.ok(undefined);
    }

    cliente.quitarLogo();
    await this.clienteRepo.save(cliente);

    try {
      await this.fileStorage.delete(keyActual);
    } catch {
      // Best-effort (design.md D5): un huérfano en disco no es un error
      // observable. La fila ya quedó sin logo.
    }

    return Result.ok(undefined);
  }
}
