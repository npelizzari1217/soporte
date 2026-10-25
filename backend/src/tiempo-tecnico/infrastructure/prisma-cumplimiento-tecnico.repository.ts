/**
 * PrismaCumplimientoTecnicoRepository — implementación de `ICumplimientoTecnicoRepository` sobre
 * `tramos_tecnico_ticket` y `tickets`, en la base del tenant activo (odd/tasks/tiempo-tecnico.md,
 * T4, S8).
 *
 * SQL crudo por el mismo motivo que `PrismaTramoTecnicoRepository` (no depende de que el cliente
 * generado conozca la tabla), y el alcance por tipo con `sqlAlcanceListado`, la misma regla que el
 * resto del dashboard. `::int` en el SELECT para que `pg` devuelva `number` y no `bigint`/`Decimal`.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '.prisma/tenant';
import { TenantContext } from '../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../shared/infrastructure/persistence/prisma-clients';
import { sqlAlcanceListado } from '../../tickets/infrastructure/persistence/prisma/alcance-listado.prisma';
import {
  CumplimientoTecnicoCrudo,
  FiltroCumplimientoTecnico,
  ICumplimientoTecnicoRepository,
} from '../domain/ports/i-cumplimiento-tecnico.repository';

interface FilaCumplimiento {
  tecnico_id: string;
  total: number;
  cumplidos: number;
  promedio_habil_s: number;
}

@Injectable()
export class PrismaCumplimientoTecnicoRepository implements ICumplimientoTecnicoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  /** Retorna el cliente Prisma del tenant activo. Lanza si no hay TenantContext activo. */
  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async resumirPorTecnico(filtro: FiltroCumplimientoTecnico): Promise<CumplimientoTecnicoCrudo[]> {
    const condiciones: Prisma.Sql[] = [
      Prisma.sql`tr.motivo_fin = 'RESUELTO'`,
      Prisma.sql`tr.cumplido IS NOT NULL`,
      Prisma.sql`tr.fin_at >= ${filtro.desde.toISOString()}::timestamptz`,
      Prisma.sql`tr.fin_at < ${filtro.hasta.toISOString()}::timestamptz`,
      // Un ticket borrado conserva sus tramos (L11, A2): se excluyen acá.
      Prisma.sql`t.deleted_at IS NULL`,
    ];
    if (filtro.tecnicoId !== undefined) {
      condiciones.push(Prisma.sql`tr.tecnico_id = ${filtro.tecnicoId}::uuid`);
    }
    if (filtro.alcance !== undefined) {
      condiciones.push(sqlAlcanceListado(filtro.alcance, Prisma.raw('t')));
    }

    const filas = await this.client.$queryRaw<FilaCumplimiento[]>`
      SELECT tr.tecnico_id,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE tr.cumplido)::int AS cumplidos,
             ROUND(AVG(tr.habil_s))::int AS promedio_habil_s
        FROM tramos_tecnico_ticket tr
        JOIN tickets t ON t.id = tr.ticket_id
       WHERE ${Prisma.join(condiciones, ' AND ')}
       GROUP BY tr.tecnico_id
       ORDER BY total DESC, tr.tecnico_id
    `;
    return filas.map((fila) => ({
      tecnicoId: fila.tecnico_id,
      total: fila.total,
      cumplidos: fila.cumplidos,
      promedioHabilS: fila.promedio_habil_s,
    }));
  }
}
