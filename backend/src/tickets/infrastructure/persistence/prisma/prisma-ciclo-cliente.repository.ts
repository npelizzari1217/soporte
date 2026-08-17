/**
 * PrismaCicloClienteRepository — implementación del puerto ICicloClienteRepository.
 *
 * Reglas:
 * - Obtiene el cliente vía TenantContext (nunca PrismaService directo).
 * - findById() incluye ciclos soft-deleted.
 * - findActive() retorna solo activo=true con deletedAt IS NULL — consumido
 *   por ResolverCicloActivoParaCreacion (T4).
 *
 * Tarea: T5.6
 */
import { Injectable } from '@nestjs/common';
import type { CicloCliente as PrismaCicloCliente } from '.prisma/tenant';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ICicloClienteRepository } from '../../../domain/ports/i-ciclo-cliente.repository';
import { CicloClienteEntity } from '../../../domain/entities/ciclo-cliente.entity';

@Injectable()
export class PrismaCicloClienteRepository implements ICicloClienteRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  private static toDomain(row: PrismaCicloCliente): CicloClienteEntity {
    return CicloClienteEntity.reconstitute(
      {
        cicloVigenteId: row.cicloVigenteId,
        nombre: row.nombre,
        fechaInicio: row.fechaInicio,
        fechaFin: row.fechaFin,
        activo: row.activo,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  async findById(id: string): Promise<CicloClienteEntity | null> {
    const row = await this.client.cicloCliente.findUnique({ where: { id } });
    return row ? PrismaCicloClienteRepository.toDomain(row) : null;
  }

  async findActive(): Promise<CicloClienteEntity | null> {
    // `orderBy` total (WU-02, ADR-T8): el índice único parcial
    // `ciclos_cliente_unico_activo_idx` (migración 20260817140000) vuelve
    // esto un match de a lo sumo 1 fila en el camino normal, pero el
    // `orderBy` es defensa en profundidad — determinístico incluso si el
    // índice se relajara. `fechaInicio` no es única entre ciclos, así que el
    // desempate por `id` no es opcional: sin él el orden sigue siendo parcial.
    const row = await this.client.cicloCliente.findFirst({
      where: { activo: true, deletedAt: null },
      orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
    });
    return row ? PrismaCicloClienteRepository.toDomain(row) : null;
  }

  async findAll(): Promise<CicloClienteEntity[]> {
    const rows = await this.client.cicloCliente.findMany({
      orderBy: { fechaInicio: 'desc' },
    });
    return rows.map(PrismaCicloClienteRepository.toDomain);
  }

  async save(ciclo: CicloClienteEntity): Promise<void> {
    await this.client.cicloCliente.upsert({
      where: { id: ciclo.id },
      create: {
        id: ciclo.id,
        cicloVigenteId: ciclo.cicloVigenteId,
        nombre: ciclo.nombre,
        fechaInicio: ciclo.fechaInicio,
        fechaFin: ciclo.fechaFin,
        activo: ciclo.activo,
        createdAt: ciclo.createdAt,
        deletedAt: ciclo.deletedAt,
      },
      update: {
        cicloVigenteId: ciclo.cicloVigenteId,
        nombre: ciclo.nombre,
        fechaInicio: ciclo.fechaInicio,
        fechaFin: ciclo.fechaFin,
        activo: ciclo.activo,
        deletedAt: ciclo.deletedAt,
      },
    });
  }
}
