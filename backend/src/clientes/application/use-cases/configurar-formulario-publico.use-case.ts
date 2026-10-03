import { Result } from '../../../shared/domain/result';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import {
  ClienteNoEncontradoError,
  OnlyRootCanConfigurarFormularioError,
  SlugCongeladoError,
  SlugDuplicadoError,
  SlugInvalidoError,
  SlugRequeridoError,
} from '../../domain/errors/clientes.errors';

/**
 * Comando de entrada de `ConfigurarFormularioPublicoUseCase`. Ambos campos son
 * opcionales (patch parcial); al menos uno viene informado desde el DTO.
 */
export interface ConfigurarFormularioPublicoCommand {
  clienteId: string;
  slug?: string;
  habilitado?: boolean;
}

/** Actor que invoca el caso de uso (se revalida `isGlobalAdmin`). */
export interface ConfigurarFormularioPublicoActor {
  isGlobalAdmin: boolean;
}

export type ConfigurarFormularioPublicoError =
  | OnlyRootCanConfigurarFormularioError
  | ClienteNoEncontradoError
  | SlugInvalidoError
  | SlugCongeladoError
  | SlugRequeridoError
  | SlugDuplicadoError;

/**
 * ConfigurarFormularioPublicoUseCase — carga el slug y prende/apaga el
 * formulario publico de un cliente (sdd/formulario-publico-qr, WU-2; D7 y D12).
 * Ruta SEPARADA de la edicion comercial, igual que `ConfigurarCsatCliente`.
 *
 * Orden (nada se escribe hasta que toda la validacion en memoria paso):
 * 1. El actor debe ser ROOT (defensa en profundidad sobre `GlobalAdminGuard`).
 * 2. `findById` → `null` = `ClienteNoEncontradoError`. Va ANTES del CAS: con un
 *    cliente inexistente `cambiarSlugSiNoCongelado` devolveria `CONGELADO`
 *    (0 filas) y el caller veria un 409 engañoso en lugar de un 404.
 * 3. Valida en la entidad el slug nuevo y la habilitacion (un slug igual al
 *    actual no es un cambio, asi que no toca el CAS ni falla por congelado).
 * 4. Escribe el slug con el CAS del repositorio (`CONGELADO`/`DUPLICADO` se
 *    traducen a errores de dominio) y despues persiste la habilitacion.
 */
export class ConfigurarFormularioPublicoUseCase {
  constructor(private readonly clienteRepo: IClienteRepository) {}

  async execute(
    command: ConfigurarFormularioPublicoCommand,
    actor: ConfigurarFormularioPublicoActor,
  ): Promise<Result<ClienteEntity, ConfigurarFormularioPublicoError>> {
    if (!actor.isGlobalAdmin) {
      return Result.fail(new OnlyRootCanConfigurarFormularioError());
    }

    const cliente = await this.clienteRepo.findById(command.clienteId);
    if (!cliente) {
      return Result.fail(new ClienteNoEncontradoError(command.clienteId));
    }

    const cambiaSlug = command.slug !== undefined && command.slug !== cliente.slug;
    if (cambiaSlug) {
      const slug = cliente.configurarSlug(command.slug as string);
      if (slug.isFail()) return Result.fail(slug.getError());
    }

    if (command.habilitado !== undefined) {
      const habilitar = cliente.habilitarFormulario(command.habilitado);
      if (habilitar.isFail()) return Result.fail(habilitar.getError());
    }

    if (cambiaSlug) {
      const cambio = await this.clienteRepo.cambiarSlugSiNoCongelado(
        cliente.id,
        command.slug as string,
      );
      if (cambio === 'CONGELADO') return Result.fail(new SlugCongeladoError());
      if (cambio === 'DUPLICADO') return Result.fail(new SlugDuplicadoError());
    }

    if (command.habilitado !== undefined) {
      await this.clienteRepo.save(cliente);
    }
    return Result.ok(cliente);
  }
}
