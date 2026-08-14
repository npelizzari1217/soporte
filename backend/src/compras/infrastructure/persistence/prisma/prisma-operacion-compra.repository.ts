/**
 * PrismaOperacionCompraRepository — implementación del puerto
 * `IOperacionCompraRepository` (ADR-C2, ADR-C4, PR-12).
 *
 * **S37 — append-only garantizado por la FIRMA, no por convención**: esta
 * clase expone ÚNICAMENTE `crear()` y `listarPorCompra()` (los dos métodos
 * del puerto). No hay `update`/`delete`/`remove`/`borrar`/`actualizar` en
 * este archivo — `prisma-operacion-compra.repository.spec.ts` (S37) verifica
 * con `Object.getOwnPropertyNames(prototype)` que ningún método del
 * prototipo matchea `/update|delete|remove|borrar|actualizar/i`, así que si
 * mañana alguien agrega `actualizarOperacion` (o cualquier variante), ese
 * test lo frena SIN que nadie edite el test.
 *
 * Mismo patrón que `PrismaOperacionTicketRepository`
 * (`tickets/infrastructure/persistence/prisma/prisma-operacion-ticket.repository.ts`):
 * obtiene el cliente vía `TenantContext.getClient()` (nunca `PrismaService`
 * directo), `crear()` hace SOLO `create` (nunca upsert — cada operación es
 * una fila nueva, nunca se actualiza una ya escrita).
 *
 * `crear()` es invocado SIEMPRE por `RegistrarOperacionCompra` (aplicación,
 * PR-13) dentro de la misma transacción (`ITenantTransactionRunner.run(...)`)
 * que la mutación que registra — si `crear()` falla, la mutación completa
 * hace rollback (S36). Este repositorio no abre transacción propia.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.10 (S35-S37). Ref design:
 * ADR-C2, ADR-C4. Tarea: PR-12.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import {
  CrearOperacionCompraProps,
  IOperacionCompraRepository,
  OperacionCompra,
} from '../../../domain/ports/i-operacion-compra.repository';
import { OperacionCompraMapper } from './operacion-compra.mapper';

@Injectable()
export class PrismaOperacionCompraRepository implements IOperacionCompraRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  /**
   * Inserta una fila nueva en la bitácora (S35: exactamente 1 por mutación
   * exitosa). SOLO `create` — nunca `upsert`/`update`: cada llamada es una
   * operación nueva e inmutable, `id`/`createdAt` los genera la DB
   * (`dbgenerated`/`@default(now())`, ver `operacion-compra.mapper.ts`).
   */
  async crear(props: CrearOperacionCompraProps): Promise<void> {
    const data = OperacionCompraMapper.toPersistence(props);
    await this.client.operacionCompra.create({ data });
  }

  /**
   * Retorna la bitácora completa de una compra (cabecera + ítems), ordenada
   * por `created_at ASC` (cronológico — consumida por `ListarOperacionesCompra`,
   * PR-19). No filtra por `deletedAt`: `OperacionCompra` no tiene esa columna
   * (bitácora append-only, ver schema).
   */
  async listarPorCompra(compraId: string): Promise<OperacionCompra[]> {
    const rows = await this.client.operacionCompra.findMany({
      where: { compraId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(OperacionCompraMapper.toDomain);
  }
}
