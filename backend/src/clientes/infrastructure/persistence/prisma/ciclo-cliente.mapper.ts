/**
 * CicloClienteMapper — convierte entre Prisma CicloCliente (tenant) y
 * CicloClienteEntity.
 *
 * Importa de '.prisma/tenant' solo porque está en infrastructure/ (fitness
 * rule de ESLint lo permite acá exclusivamente).
 *
 * Tarea: T9.6 (PR9 — Ciclos)
 */
import type { CicloCliente as PrismaCicloCliente } from '.prisma/tenant';
import { CicloClienteEntity } from '../../../domain/entities/ciclo-cliente.entity';

export class CicloClienteMapper {
  static toDomain(row: PrismaCicloCliente): CicloClienteEntity {
    return CicloClienteEntity.reconstitute(
      {
        nombre: row.nombre,
        fechaInicio: row.fechaInicio,
        fechaFin: row.fechaFin,
        activo: row.activo,
        cicloVigenteId: row.cicloVigenteId,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }
}
