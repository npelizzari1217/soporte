/**
 * PrismaCicloClienteRepository — implementación del puerto
 * ICicloClienteRepository para ciclos adoptados por el tenant.
 *
 * Reglas:
 * - Obtiene el client vía `TenantContext.getClient()` (nunca PrismaService
 *   directo) — respeta el aislamiento por request de R15/R12. Primer
 *   consumidor real de `TenantContext.getClient()` fuera de un test (R15).
 * - `activarCiclo()`: desactiva TODOS + activa el objetivo en una sola
 *   `$transaction` (R22 — invariante: máximo un `activo=true` por tenant).
 * - `save()`: persiste `cicloVigenteId` REAL (link al catálogo master
 *   elegido, R21) — snapshot inmutable, el `update` no lo vuelve a tocar.
 *
 * Tarea: T9.6 (PR9 — Ciclos)
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ICicloClienteRepository } from '../../../domain/ports/i-ciclo-cliente.repository';
import { CicloClienteEntity } from '../../../domain/entities/ciclo-cliente.entity';
import { CicloClienteMapper } from './ciclo-cliente.mapper';

@Injectable()
export class PrismaCicloClienteRepository implements ICicloClienteRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<CicloClienteEntity | null> {
    const row = await this.client.cicloCliente.findUnique({ where: { id } });
    return row ? CicloClienteMapper.toDomain(row) : null;
  }

  async findActivos(): Promise<CicloClienteEntity[]> {
    const rows = await this.client.cicloCliente.findMany({
      where: { activo: true, deletedAt: null },
    });
    return rows.map(CicloClienteMapper.toDomain);
  }

  async findAll(): Promise<CicloClienteEntity[]> {
    const rows = await this.client.cicloCliente.findMany({
      orderBy: { fechaInicio: 'desc' },
    });
    return rows.map(CicloClienteMapper.toDomain);
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
      },
      update: {
        nombre: ciclo.nombre,
        fechaInicio: ciclo.fechaInicio,
        fechaFin: ciclo.fechaFin,
        activo: ciclo.activo,
        updatedAt: ciclo.updatedAt,
        deletedAt: ciclo.deletedAt,
      },
    });
  }

  /**
   * Activa `id` y desactiva TODOS los demás ciclos del tenant en una única
   * transacción atómica de Postgres (R22).
   *
   * Retorna `false` si el `updateMany` de activación no afectó ninguna fila
   * (el ciclo no existe / ya estaba soft-deleted) — carrera extrema entre el
   * `findById` del use case y esta transacción.
   */
  async activarCiclo(id: string): Promise<boolean> {
    const [, activated] = await this.client.$transaction([
      this.client.cicloCliente.updateMany({
        where: { deletedAt: null },
        data: { activo: false },
      }),
      this.client.cicloCliente.updateMany({
        where: { id, deletedAt: null },
        data: { activo: true },
      }),
    ]);

    return activated.count > 0;
  }
}
