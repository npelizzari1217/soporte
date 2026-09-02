import { Result } from '../../../shared/domain/result';
import { ZonaHoraria } from '../../../shared/domain/zona-horaria';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ClienteNoEncontradoError } from '../../domain/errors/clientes.errors';

/**
 * Comando de entrada de `ConfigurarZonaHorariaClienteUseCase`.
 *
 * `zonaHoraria` ya pasó por el borde (`ConfigurarZonaHorariaClienteDto`,
 * `@IsZonaHorariaValida()`) antes de llegar acá — mismo criterio que
 * `CrearClienteDto.zonaHoraria` en `crear-cliente.use-case.ts`. Un candidato
 * inválido revienta acá vía `ZonaHoraria.crear()` (no es un `Result`, ver el
 * JSDoc de `ZonaHoraria.crear` en `zona-horaria.ts`: "es precondición del
 * caller, no una desviación de negocio"). No hay una capa de defensa en
 * profundidad separada para esto: el `ValidationPipe` global de
 * `app.module.ts` ya rechaza un candidato inválido con 400 antes de que la
 * request llegue al caso de uso (verificado con
 * `configurar-zona-horaria-cliente.e2e.spec.ts`, HTTP real). Historial de por
 * qué en `openspec/changes/zona-horaria-por-tenant/tasks.md` (C2b-fix).
 */
export interface ConfigurarZonaHorariaClienteCommand {
  clienteId: string;
  zonaHoraria: string;
}

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
 * 2. Construye el VO `ZonaHoraria` a partir del candidato (ver el JSDoc de
 *    `ConfigurarZonaHorariaClienteCommand.zonaHoraria` sobre por qué no hay
 *    `try/catch` acá).
 * 3. Aplica la zona en la entidad y persiste (upsert).
 */
export class ConfigurarZonaHorariaClienteUseCase {
  constructor(private readonly clienteRepo: IClienteRepository) {}

  async execute(
    command: ConfigurarZonaHorariaClienteCommand,
  ): Promise<Result<ClienteEntity, ClienteNoEncontradoError>> {
    const cliente = await this.clienteRepo.findById(command.clienteId);
    if (!cliente) {
      return Result.fail(new ClienteNoEncontradoError(command.clienteId));
    }

    const zona = ZonaHoraria.crear(command.zonaHoraria);
    cliente.configurarZonaHoraria(zona);
    await this.clienteRepo.save(cliente);
    return Result.ok(cliente);
  }
}
