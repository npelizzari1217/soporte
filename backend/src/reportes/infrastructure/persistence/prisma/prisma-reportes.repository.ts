/**
 * PrismaReportesRepository — implementación de IReportesRepository.
 *
 * Queries de solo lectura (SELECT puros) sobre el tenant DB resuelto por TenantContext.
 * NUNCA hace INSERT/UPDATE/DELETE.
 *
 * Estrategia de queries:
 * - ticketsPorSolicitante / ticketsPorAsignado: Prisma groupBy (simple, tipado).
 * - ticketsPorTipo: $queryRawUnsafe con LEFT JOIN desde tipos_ticket → todos los tipos (incluso 0).
 * - ticketsPorEstado: $queryRawUnsafe con LEFT JOIN desde estados → todos los estados (incluso 0).
 * - tiempoResolucionPromedioDias: $queryRawUnsafe con AVG y JOIN a estados por codigo.
 * - cicloActivo: findFirst con activo=true.
 *
 * Invariantes:
 * - Todos los queries tienen WHERE deleted_at IS NULL en tickets.
 * - $queryRawUnsafe usa SQL parametrizado ($1, $2, ...) — seguro contra SQL injection.
 * - COUNT(*) se castea a ::int en SQL para evitar BigInt en Node.js.
 * - AVG(fecha_cierre - created_at::date) calcula días: fecha_cierre es @db.Date,
 *   created_at es @db.Timestamptz. La diferencia DATE - DATE retorna INTEGER en Postgres.
 *
 * Nota sobre tipos: los clientes Prisma generados (.prisma/tenant) no se importan
 * aquí para evitar dependencia en artefactos de build. En su lugar, usamos la interfaz
 * mínima IPrismaClient que declara los métodos que necesitamos y casteamos el resultado
 * de TenantContext.getClient() a esa interfaz.
 *
 * Tarea: T4.11 (PR4, admin-general)
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import {
  IReportesRepository,
  TicketsPorSolicitanteRow,
  TicketsPorAsignadoRow,
  TicketsPorTipoRow,
  TicketsPorEstadoRow,
  TiempoResolucionResult,
} from '../../../domain/ports/i-reportes.repository';

// ─── Shapes de raw queries ────────────────────────────────────────────────────

interface RawTipoRow {
  tipo_codigo: string;
  total: number;
}

interface RawEstadoRow {
  estado_codigo: string;
  total: number;
}

interface RawTiempoRow {
  promedio_dias: number | null;
  total_resueltos: number;
}

/**
 * IPrismaClient — interfaz mínima que describe las operaciones que
 * PrismaReportesRepository necesita del cliente Prisma del tenant.
 *
 * Declarada localmente para evitar importar `.prisma/tenant` (artefacto generado).
 * Debe mantenerse sincronizada con la API real del TenantPrismaClient.
 */
interface IPrismaClient {
  ticket: {
    groupBy(args: {
      by: string[];
      where: Record<string, unknown>;
      _count: Record<string, boolean>;
    }): Promise<Array<Record<string, unknown>>>;
  };
  cicloCliente: {
    findFirst(args: {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    }): Promise<Record<string, unknown> | null>;
  };
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

@Injectable()
export class PrismaReportesRepository implements IReportesRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): IPrismaClient {
    return this.tenantContext.getClient() as IPrismaClient;
  }

  /**
   * Tickets agrupados por solicitante_id.
   * Solo retorna filas con al menos 1 ticket (groupBy sin LEFT JOIN).
   * El app layer enriquece con nombres.
   */
  async ticketsPorSolicitante(cicloId: string): Promise<TicketsPorSolicitanteRow[]> {
    const rows = await this.client.ticket.groupBy({
      by: ['solicitanteId'],
      where: {
        cicloId,
        deletedAt: null,
      },
      _count: { id: true },
    });

    return rows.map((row: Record<string, unknown>) => ({
      solicitanteId: row['solicitanteId'] as string,
      total: (row['_count'] as Record<string, number>)['id'],
    }));
  }

  /**
   * Tickets agrupados por asignado_id.
   * null = tickets sin asignar (agrupados juntos).
   * El app layer enriquece con nombres para los no-null.
   */
  async ticketsPorAsignado(cicloId: string): Promise<TicketsPorAsignadoRow[]> {
    const rows = await this.client.ticket.groupBy({
      by: ['asignadoId'],
      where: {
        cicloId,
        deletedAt: null,
      },
      _count: { id: true },
    });

    return rows.map((row: Record<string, unknown>) => ({
      asignadoId: (row['asignadoId'] as string | null) ?? null,
      total: (row['_count'] as Record<string, number>)['id'],
    }));
  }

  /**
   * Tickets agrupados por tipo (LEFT JOIN desde tipos_ticket).
   * Siempre incluye los 3 tipos (SOPORTE, COMPRAS, EDILICIA) incluso con 0.
   * Usa $queryRawUnsafe con SQL parametrizado para evitar SQL injection.
   * COUNT se castea a ::int para evitar BigInt de Postgres en Node.js.
   */
  async ticketsPorTipo(cicloId: string): Promise<TicketsPorTipoRow[]> {
    const rows = await this.client.$queryRawUnsafe<RawTipoRow[]>(
      `SELECT
         tt.codigo       AS tipo_codigo,
         COUNT(t.id)::int AS total
       FROM tipos_ticket tt
       LEFT JOIN tickets t
         ON t.tipo_id    = tt.id
        AND t.ciclo_id   = $1::uuid
        AND t.deleted_at IS NULL
       WHERE tt.deleted_at IS NULL
       GROUP BY tt.id, tt.codigo
       ORDER BY tt.codigo ASC`,
      cicloId,
    );

    return rows.map((row: RawTipoRow) => ({
      tipoCodigo: row.tipo_codigo,
      total: Number(row.total),
    }));
  }

  /**
   * Tickets agrupados por estado (LEFT JOIN desde estados).
   * Incluye TODOS los estados del catálogo (incluyendo terminales) con 0 si no hay tickets.
   * COUNT se castea a ::int para evitar BigInt de Postgres en Node.js.
   */
  async ticketsPorEstado(cicloId: string): Promise<TicketsPorEstadoRow[]> {
    const rows = await this.client.$queryRawUnsafe<RawEstadoRow[]>(
      `SELECT
         e.codigo        AS estado_codigo,
         COUNT(t.id)::int AS total
       FROM estados e
       LEFT JOIN tickets t
         ON t.estado_id  = e.id
        AND t.ciclo_id   = $1::uuid
        AND t.deleted_at IS NULL
       WHERE e.deleted_at IS NULL
       GROUP BY e.id, e.codigo
       ORDER BY e.orden ASC, e.codigo ASC`,
      cicloId,
    );

    return rows.map((row: RawEstadoRow) => ({
      estadoCodigo: row.estado_codigo,
      total: Number(row.total),
    }));
  }

  /**
   * Tiempo promedio de resolución en días.
   *
   * Calcula AVG(fecha_cierre - created_at::date) para tickets RESUELTO o SIN_SOLUCION.
   * - Excluye RECHAZADO (nunca trabajados — distorsionan el promedio).
   * - Solo incluye tickets con fecha_cierre IS NOT NULL.
   * - fecha_cierre es @db.Date; created_at es @db.Timestamptz.
   *   created_at::date extrae la parte de fecha en la zona horaria del servidor.
   *   La diferencia DATE - DATE retorna INTEGER (número de días) en Postgres.
   * - AVG sobre enteros retorna NUMERIC en Postgres → casteamos a ::float8 para
   *   obtener un número flotante en Node.js.
   * - Si no hay filas elegibles, AVG retorna NULL y COUNT retorna 0 (no error).
   */
  async tiempoResolucionPromedioDias(cicloId: string): Promise<TiempoResolucionResult> {
    const rows = await this.client.$queryRawUnsafe<RawTiempoRow[]>(
      `SELECT
         AVG(t.fecha_cierre - t.created_at::date)::float8 AS promedio_dias,
         COUNT(t.id)::int                                  AS total_resueltos
       FROM tickets t
       JOIN estados e ON t.estado_id = e.id
       WHERE t.ciclo_id     = $1::uuid
         AND t.deleted_at   IS NULL
         AND e.codigo       IN ('RESUELTO', 'SIN_SOLUCION')
         AND t.fecha_cierre IS NOT NULL`,
      cicloId,
    );

    const row = rows[0];
    return {
      promedioDias: row?.promedio_dias ?? null,
      totalResueltos: Number(row?.total_resueltos ?? 0),
    };
  }

  /**
   * Retorna el ID del ciclo activo del tenant (ciclos_cliente.activo=TRUE).
   * null si no existe ninguno.
   */
  async cicloActivo(): Promise<string | null> {
    const ciclo = await this.client.cicloCliente.findFirst({
      where: { activo: true, deletedAt: null },
      select: { id: true },
    });
    return (ciclo?.['id'] as string | undefined) ?? null;
  }
}
