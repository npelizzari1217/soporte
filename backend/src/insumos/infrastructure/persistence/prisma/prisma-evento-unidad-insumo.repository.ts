/**
 * PrismaEventoUnidadInsumoRepository — implementación del puerto
 * `IEventoUnidadInsumoRepository`. Obtiene el cliente vía
 * `TenantContext.getClient()` y NO abre `$transaction`: participa de la que
 * haya abierto el caso de uso.
 *
 * Ref design: openspec/changes/repuestos-numero-de-serie/design.md, ADR-9.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IEventoUnidadInsumoRepository } from '../../../domain/ports/i-evento-unidad-insumo.repository';
import { EventoUnidadInsumoEntity } from '../../../domain/entities/evento-unidad-insumo.entity';
import { EventoUnidadInsumoMapper } from './evento-unidad-insumo.mapper';

@Injectable()
export class PrismaEventoUnidadInsumoRepository implements IEventoUnidadInsumoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  /**
   * `create` y no `upsert`: la bitácora es append-only, un id o un
   * `movimiento_id` repetidos tienen que rebotar (P2002) y no pisar nada.
   *
   * @param evento Evento de dominio nuevo.
   */
  async insert(evento: EventoUnidadInsumoEntity): Promise<void> {
    await this.client.eventoUnidadInsumo.create({
      data: EventoUnidadInsumoMapper.toPersistence(evento),
    });
  }

  /**
   * `ORDER BY created_at, id`: `created_at` es `clock_timestamp()` y el id
   * UUIDv7 desempata de forma monótona si dos eventos caen en el mismo instante.
   *
   * @param unidadId Id de la unidad.
   * @returns Los eventos de la unidad, del más antiguo al más reciente.
   */
  async listarPorUnidad(unidadId: string): Promise<EventoUnidadInsumoEntity[]> {
    const rows = await this.client.eventoUnidadInsumo.findMany({
      where: { unidadId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => EventoUnidadInsumoMapper.toDomain(row));
  }
}
