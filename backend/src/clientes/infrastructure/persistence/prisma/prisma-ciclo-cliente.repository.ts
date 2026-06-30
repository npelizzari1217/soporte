/**
 * PrismaCicloClienteRepository (admin) — implementación del puerto ICicloClienteRepository
 * para operaciones de administración de ciclos del tenant.
 *
 * Diferencia vs tickets/infrastructure/.../prisma-ciclo-cliente.repository.ts:
 * - Ese implementa ICicloClienteRepository de tickets/domain (findById, findActive, findAll, save).
 * - Este implementa ICicloClienteRepository de clientes/domain (findAll, findById, save, activarCiclo).
 * - Agrega la operación atómica activarCiclo (transacción Prisma).
 *
 * Reglas:
 * - Obtiene el client via TenantContext (nunca PrismaService directo).
 * - activarCiclo(): desactiva todos + activa el objetivo en una sola $transaction.
 * - save(): para ciclos nuevos, genera un cicloVigenteId placeholder (el mismo id del ciclo)
 *   ya que el schema tenant requiere este campo (soft-ref a master, sin FK real).
 *
 * Tarea: T2.13
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

  /** Convierte PrismaCicloCliente → CicloClienteEntity (admin) — mapper inline. */
  private static toDomain(row: PrismaCicloCliente): CicloClienteEntity {
    return CicloClienteEntity.reconstitute(
      {
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

  /**
   * Retorna todos los ciclos del tenant (excluye soft-deleted).
   * El tenant es el resuelto por TenantContext.
   */
  async findAll(): Promise<CicloClienteEntity[]> {
    const rows = await this.client.cicloCliente.findMany({
      where: { deletedAt: null },
      orderBy: { fechaInicio: 'desc' },
    });
    return rows.map(PrismaCicloClienteRepository.toDomain);
  }

  /**
   * Busca ciclo por ID en el tenant activo.
   * Retorna null si no existe (incluye ciclos de otros tenants = no existen en esta DB).
   */
  async findById(id: string): Promise<CicloClienteEntity | null> {
    const row = await this.client.cicloCliente.findUnique({ where: { id } });
    return row ? PrismaCicloClienteRepository.toDomain(row) : null;
  }

  /**
   * Persiste un ciclo nuevo en el tenant.
   *
   * cicloVigenteId: el schema tenant lo requiere (NOT NULL, sin FK real).
   * Para ciclos creados via admin panel (sin referencia master), usamos el
   * propio id del ciclo como placeholder estable. La unicidad del placeholder
   * es garantizada por el id del ciclo (UUIDv7).
   */
  async save(ciclo: CicloClienteEntity): Promise<void> {
    await this.client.cicloCliente.upsert({
      where: { id: ciclo.id },
      create: {
        id: ciclo.id,
        // Placeholder: soft-ref a master. Sin FK real → cualquier UUID es válido.
        // Se usa el propio id para que sea determinístico y único.
        cicloVigenteId: ciclo.id,
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
   * Activa el ciclo con el id dado y desactiva TODOS los demás del tenant
   * en una única transacción atómica de Postgres.
   *
   * Estrategia: Prisma $transaction con 2 operaciones batch:
   * 1. updateMany: activo=false para todos los ciclos no soft-deleted del tenant
   * 2. update: activo=true para el ciclo objetivo
   *
   * Retorna false si el ciclo no fue encontrado (updateMany no verifica existencia).
   * El uso case llama findById antes de activarCiclo para garantizar la existencia.
   */
  async activarCiclo(id: string): Promise<boolean> {
    const [, updated] = await this.client.$transaction([
      // Paso 1: desactivar todos los ciclos del tenant
      this.client.cicloCliente.updateMany({
        where: { deletedAt: null },
        data: { activo: false },
      }),
      // Paso 2: activar el ciclo objetivo
      this.client.cicloCliente.updateMany({
        where: { id, deletedAt: null },
        data: { activo: true },
      }),
    ]);

    return updated.count > 0;
  }
}
