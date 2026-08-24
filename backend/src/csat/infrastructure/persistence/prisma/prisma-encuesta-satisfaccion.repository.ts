/**
 * PrismaEncuestaSatisfaccionRepository — implementación del puerto
 * `IEncuestaSatisfaccionRepository` (TENANT, `encuestas_satisfaccion`).
 *
 * `resumenPorScope` usa `$queryRaw` con `DISTINCT ON (ticket_id)` (ADR-C8):
 * Prisma no expone `DISTINCT ON` vía su query builder tipado. Un ticket
 * reabierto y recalificado aporta SOLO su respuesta más reciente al
 * promedio — la subquery ordena `(ticket_id, respondida_en DESC)` y el
 * índice del mismo nombre la sirve directo. `::float8`/`::int` en el SELECT
 * externo para que `pg` devuelva number JS nativo, no string/bigint.
 *
 * Ref design: ADR-C8. Tarea: 5.3.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '.prisma/tenant';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import {
  IEncuestaSatisfaccionRepository,
  ResumenCsat,
} from '../../../domain/ports/i-encuesta-satisfaccion.repository';
import { EncuestaSatisfaccionEntity } from '../../../domain/entities/encuesta-satisfaccion.entity';
import { MetricaFiltro } from '../../../../dashboard/domain/ports/i-dashboard.repository';
import { EncuestaSatisfaccionMapper } from './encuesta-satisfaccion.mapper';

@Injectable()
export class PrismaEncuestaSatisfaccionRepository implements IEncuestaSatisfaccionRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  /** Siempre INSERT — una respuesta de encuesta no se edita (design, "Contratos"). */
  async guardar(respuesta: EncuestaSatisfaccionEntity): Promise<void> {
    const data = EncuestaSatisfaccionMapper.toPersistence(respuesta);
    await this.client.encuestaSatisfaccion.create({ data });
  }

  async ultimaDeTicket(ticketId: string): Promise<EncuestaSatisfaccionEntity | null> {
    const row = await this.client.encuestaSatisfaccion.findFirst({
      where: { ticketId },
      orderBy: { respondidaEn: 'desc' },
    });
    return row ? EncuestaSatisfaccionMapper.toDomain(row) : null;
  }

  /** Cláusula combinable (AND) sobre `tickets`, mismo criterio que `PrismaDashboardRepository`. */
  private condicionesDeScope(filtro: MetricaFiltro): Prisma.Sql {
    const condiciones: Prisma.Sql[] = [
      Prisma.sql`e.deleted_at IS NULL`,
      Prisma.sql`t.deleted_at IS NULL`,
    ];

    if (filtro.cicloId !== undefined) {
      condiciones.push(Prisma.sql`t.ciclo_id = ${filtro.cicloId}::uuid`);
    }
    if (filtro.asignadoId !== undefined) {
      condiciones.push(Prisma.sql`t.asignado_id = ${filtro.asignadoId}::uuid`);
    }

    return Prisma.join(condiciones, ' AND ');
  }

  async resumenPorScope(filtro: MetricaFiltro): Promise<ResumenCsat> {
    const condiciones = this.condicionesDeScope(filtro);

    const filas = await this.client.$queryRaw<
      Array<{ promedio: number | null; respuestas: number }>
    >`
      SELECT
        AVG(u.puntaje)::float8 AS promedio,
        COUNT(*)::int AS respuestas
      FROM (
        SELECT DISTINCT ON (e.ticket_id) e.puntaje
        FROM encuestas_satisfaccion e
        JOIN tickets t ON t.id = e.ticket_id
        WHERE ${condiciones}
        ORDER BY e.ticket_id, e.respondida_en DESC
      ) u
    `;

    const fila = filas[0];
    return {
      promedio: fila?.promedio ?? null,
      respuestas: fila?.respuestas ?? 0,
    };
  }
}
