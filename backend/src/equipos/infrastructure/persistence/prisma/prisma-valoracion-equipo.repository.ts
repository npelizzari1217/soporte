/**
 * PrismaValoracionEquipoRepository — implementación del puerto IValoracionEquipoRepository
 * (odd/tasks/historial-valor-residual.md).
 *
 * Obtiene el cliente del tenant activo vía `TenantContext.getClient()`: dentro de `txRunner.run()`
 * es el cliente transaccional, así que `registrar()` comparte la transacción del guardado del
 * equipo.
 */
import { Injectable } from '@nestjs/common';
import type { ValoracionEquipo as PrismaValoracionEquipo } from '.prisma/tenant';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IValoracionEquipoRepository } from '../../../domain/ports/i-valoracion-equipo.repository';
import {
  esOrigenValoracionEquipo,
  NuevaValoracionEquipo,
  ValoracionEquipo,
} from '../../../domain/entities/valoracion-equipo';

/**
 * Fila de la base → valoración de dominio. `importe` es `Decimal` en Prisma (DECIMAL(14,2)) y pasa
 * a `number`, igual que en `EquipoInformaticoMapper`.
 *
 * @throws Error si `origen` no está en el catálogo: el CHECK de la base lo impide, así que es un
 *   estado imposible y no se disfraza de un origen válido.
 */
function aDominio(row: PrismaValoracionEquipo): ValoracionEquipo {
  if (!esOrigenValoracionEquipo(row.origen)) {
    throw new Error(`ValoracionEquipo ${row.id}: origen fuera del catálogo (${row.origen}).`);
  }
  return {
    id: row.id,
    equipoId: row.equipoId,
    fecha: row.fecha,
    importe: Number(row.importe),
    origen: row.origen,
    usuarioId: row.usuarioId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaValoracionEquipoRepository implements IValoracionEquipoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async registrar(valoracion: NuevaValoracionEquipo): Promise<void> {
    // Las ediciones del mismo equipo están serializadas por el lock LE de `EditarEquipoUseCase`,
    // y un alta no compite con nadie por su equipo: el upsert no corre carreras sobre el UNIQUE.
    await this.client.valoracionEquipo.upsert({
      where: { equipoId_fecha: { equipoId: valoracion.equipoId, fecha: valoracion.fecha } },
      create: {
        equipoId: valoracion.equipoId,
        fecha: valoracion.fecha,
        importe: valoracion.importe,
        origen: 'MANUAL',
        usuarioId: valoracion.usuarioId,
      },
      update: {
        importe: valoracion.importe,
        origen: 'MANUAL',
        usuarioId: valoracion.usuarioId,
      },
    });
  }

  async listarPorEquipo(equipoId: string): Promise<ValoracionEquipo[]> {
    const rows = await this.client.valoracionEquipo.findMany({
      where: { equipoId },
      orderBy: { fecha: 'asc' },
    });
    return rows.map(aDominio);
  }
}
