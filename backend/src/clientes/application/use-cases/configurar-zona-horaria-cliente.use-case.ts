import { Result } from '../../../shared/domain/result';
import { ZonaHoraria } from '../../../shared/domain/zona-horaria';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import {
  ClienteNoEncontradoError,
  ZonaHorariaInvalidaError,
} from '../../domain/errors/clientes.errors';

/**
 * Comando de entrada de `ConfigurarZonaHorariaClienteUseCase`.
 */
export interface ConfigurarZonaHorariaClienteCommand {
  clienteId: string;
  zonaHoraria: string;
}

/** Errores esperados (Result.fail) de `ConfigurarZonaHorariaClienteUseCase`. */
export type ConfigurarZonaHorariaClienteError = ClienteNoEncontradoError | ZonaHorariaInvalidaError;

/**
 * ConfigurarZonaHorariaClienteUseCase — cambia la zona operativa de un
 * cliente (sdd/zona-horaria-por-tenant, C2b). Ruta SEPARADA de la edición
 * comercial (`EditarClienteUseCase`), mismo criterio que la configuración de
 * CSAT (D1): un flag de configuración no comparte el patch parcial de los
 * datos comerciales.
 *
 * ABM de clientes exclusivo de ROOT (gateado por `GlobalAdminGuard` a nivel
 * de `ClientesController`).
 *
 * 1. `findById` → `null` = `ClienteNoEncontradoError`.
 * 2. Construye el VO `ZonaHoraria` a partir del candidato — si no es válido
 *    (`esZonaValida`), `Result.fail(ZonaHorariaInvalidaError)` ANTES de tocar
 *    la entidad: el cliente conserva su zona anterior. En producción esto no
 *    debería ocurrir (el borde ya lo rechaza, ver `ZonaHorariaInvalidaError`),
 *    pero el caso de uso no confía ciegamente en el caller.
 * 3. Aplica la zona en la entidad y persiste (upsert).
 */
export class ConfigurarZonaHorariaClienteUseCase {
  constructor(private readonly clienteRepo: IClienteRepository) {}

  async execute(
    command: ConfigurarZonaHorariaClienteCommand,
  ): Promise<Result<ClienteEntity, ConfigurarZonaHorariaClienteError>> {
    const cliente = await this.clienteRepo.findById(command.clienteId);
    if (!cliente) {
      return Result.fail(new ClienteNoEncontradoError(command.clienteId));
    }

    let zona: ZonaHoraria;
    try {
      zona = ZonaHoraria.crear(command.zonaHoraria);
    } catch {
      return Result.fail(new ZonaHorariaInvalidaError(command.zonaHoraria));
    }

    cliente.configurarZonaHoraria(zona);
    await this.clienteRepo.save(cliente);
    return Result.ok(cliente);
  }
}
