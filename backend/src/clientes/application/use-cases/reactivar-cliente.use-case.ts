import { Result } from '../../../shared/domain/result';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ITenantMigrationRunner } from '../../domain/ports/i-tenant-migration-runner.port';
import { ClienteNoEncontradoError } from '../../domain/errors/clientes.errors';

/**
 * ReactivarClienteUseCase — revierte la baja lógica de un cliente (tenant).
 *
 * `reactivate()` setea `activo=true` + limpia `deletedAt`. Contraparte de
 * `DesactivarClienteUseCase`. Exclusivo ROOT (`GlobalAdminGuard` en
 * `ClientesController`).
 *
 * 1. `findById` → `null` = `ClienteNoEncontradoError`.
 * 2. `migrationRunner.run(dbName)` — fix post-verify C3 (sdd/matriz-permisos-por-usuario,
 *    S19): un tenant INACTIVO durante un deploy que agregó migraciones del
 *    schema tenant (ej. `rename_modulo_soporte_a_tickets`) NUNCA las recibe
 *    (`migrate-tenants.js` solo fan-outea a tenants `activo=true`) — si se
 *    reactiva después sin ponerlo al día, queda con datos/columnas viejas y
 *    el filtrado por módulo devuelve 0 resultados EN SILENCIO. `prisma
 *    migrate deploy` es idempotente (mismo mecanismo que usa el alta de
 *    cliente, PR7): reactivar un tenant que ya estaba al día no hace nada de
 *    más. Corre ANTES de `save()` a propósito — fail-closed: si las
 *    migraciones fallan, el cliente NO queda marcado `activo=true` con un
 *    schema desactualizado (mejor un error visible en la reactivación que un
 *    hueco silencioso después).
 * 3. `reactivate()` + `save()`.
 */
export class ReactivarClienteUseCase {
  constructor(
    private readonly clienteRepo: IClienteRepository,
    private readonly migrationRunner: ITenantMigrationRunner,
  ) {}

  async execute(clienteId: string): Promise<Result<ClienteEntity, ClienteNoEncontradoError>> {
    const cliente = await this.clienteRepo.findById(clienteId);
    if (!cliente) {
      return Result.fail(new ClienteNoEncontradoError(clienteId));
    }

    await this.migrationRunner.run(cliente.dbName);

    cliente.reactivate();
    await this.clienteRepo.save(cliente);
    return Result.ok(cliente);
  }
}
