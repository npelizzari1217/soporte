/**
 * PrismaDashboardRepository — implementación del puerto
 * `IDashboardRepository` (D1). Agregaciones read-only sobre `tickets` del
 * tenant activo.
 *
 * Reglas:
 * - Obtiene el cliente Prisma del tenant activo vía `TenantContext.getClient()`.
 * - "Abiertos" = `fechaCierre IS NULL`; "cerrados" = `fechaCierre IS NOT NULL`
 *   (`fechaCierre` se setea al alcanzar RESUELTO o CERRADO,
 *   `TransicionarEstadoUseCase`, T12 — es la señal de "ya resuelto/cerrado"
 *   independiente de si luego transicionó de RESUELTO→CERRADO).
 * - Deviación de bajo riesgo vs. el design ("$queryRaw tipado"): se usan
 *   `count`/`groupBy`/`findMany` tipados de Prisma en vez de SQL crudo —
 *   mismo resultado, sin el riesgo de mantenimiento de SQL a mano y sin
 *   perder tipado (`any` prohibido). El promedio de resolución (horas) se
 *   calcula en memoria sobre las dos columnas (`createdAt`/`fechaCierre`)
 *   porque Prisma no expone aritmética de fechas portable sin `$queryRaw`.
 * - `tickets.fecha_cierre` es `@db.Timestamptz` (sdd/corregir-fecha-cierre-tickets,
 *   WU1) — guarda el instante real de cierre, igual que `createdAt`. La resta
 *   es una duración instante-a-instante genuina y NUNCA se clampea a cero: un
 *   resultado negativo solo puede significar datos corruptos (mal backfill,
 *   cierre anterior a la creación), y taparlo con `Math.max(0, ...)` lo
 *   disfrazaría de promedio plausible (design D4).
 *
 * Tarea: D4.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '.prisma/tenant';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { TIPO_CODIGO_PREVENTIVO } from '../../../../tickets/domain/tipos-ticket.constants';
import { CalcularSlaHabilVenceService } from '../../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { ICalendarioLaboralSemanalRepository } from '../../../../calendario-laboral/domain/ports/i-calendario-laboral-semanal.repository';
import { IFeriadosLaboralesRepository } from '../../../../calendario-laboral/domain/ports/i-feriados-laborales.repository';
import { promedioHorasHabiles } from '../../../domain/services/promedio-horas-habiles';
import {
  CargaAgente,
  ConteoAbiertosCerrados,
  CumplimientoPrimeraRespuestaCrudo,
  CumplimientoSlaCrudo,
  DistribucionPorPrioridad,
  DistribucionPorTipo,
  IDashboardRepository,
  MetricaFiltro,
} from '../../../domain/ports/i-dashboard.repository';

const MS_POR_HORA = 1000 * 60 * 60;

@Injectable()
export class PrismaDashboardRepository implements IDashboardRepository {
  private readonly calculo = new CalcularSlaHabilVenceService();

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly calendarioRepo: Pick<ICalendarioLaboralSemanalRepository, 'obtener'>,
    private readonly feriadosRepo: Pick<IFeriadosLaboralesRepository, 'obtener'>,
  ) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  /** Cláusula `where` base combinable (AND): ciclo + asignado (D2), excluye soft-deleted. */
  private buildWhere(filtro: MetricaFiltro): Prisma.TicketWhereInput {
    return {
      deletedAt: null,
      ...(filtro.cicloId && { cicloId: filtro.cicloId }),
      ...(filtro.asignadoId && { asignadoId: filtro.asignadoId }),
    };
  }

  async conteoPorEstadoAgrupado(filtro: MetricaFiltro): Promise<ConteoAbiertosCerrados> {
    const where = this.buildWhere(filtro);
    const [abiertos, cerrados] = await Promise.all([
      this.client.ticket.count({ where: { ...where, fechaCierre: null } }),
      this.client.ticket.count({ where: { ...where, fechaCierre: { not: null } } }),
    ]);
    return { abiertos, cerrados };
  }

  async tiempoPromedioResolucionHoras(filtro: MetricaFiltro): Promise<number | null> {
    const rows = await this.client.ticket.findMany({
      where: { ...this.buildWhere(filtro), fechaCierre: { not: null } },
      select: { createdAt: true, fechaCierre: true },
    });
    if (rows.length === 0) {
      return null;
    }

    const totalHoras = rows.reduce((acumulado, row) => {
      // fechaCierre no es null acá (filtrado en el where), el `!` es seguro.
      // Duración instante-a-instante real; sin clamp (ver comentario de clase).
      const horas = (row.fechaCierre!.getTime() - row.createdAt.getTime()) / MS_POR_HORA;
      return acumulado + horas;
    }, 0);

    return totalHoras / rows.length;
  }

  async cargaPorAgente(filtro: MetricaFiltro): Promise<CargaAgente[]> {
    const grupos = await this.client.ticket.groupBy({
      by: ['asignadoId'],
      where: { ...this.buildWhere(filtro), fechaCierre: null, asignadoId: { not: null } },
      _count: { _all: true },
    });
    // `asignadoId: { not: null }` en el where garantiza que nunca es null acá.
    return grupos.map((grupo) => ({
      asignadoId: grupo.asignadoId as string,
      abiertos: grupo._count._all,
    }));
  }

  /**
   * Los preventivos no entran a las métricas de SLA (`dashboard-metricas-sla` R4). Se filtra por el
   * tipo, no por la meta: un preventivo puede tener comentarios públicos de un técnico.
   */
  private readonly sinPreventivos: Prisma.TicketWhereInput = {
    tipo: { codigo: { not: TIPO_CODIGO_PREVENTIVO } },
  };

  /**
   * Cumplimiento de resolución por tiempo activo (`dashboard-metricas-sla` R1, ADR-7). Cuatro `count`
   * en paralelo con field references de Prisma 7 (sin `$queryRaw`):
   * - incorporados (`sla_acumulado_s` no nulo): cuenta el cumplimiento fijado en la resolución. Un
   *   reabierto tiene `fechaCierre` y `sla_cumplido` nulos mientras su reloj corre: queda afuera.
   * - previos (`sla_acumulado_s` nulo, nunca incorporados): `fechaCierre <= slaVenceAt`.
   * Nunca lee `vencido`, que es la marca del barrido.
   */
  async cumplimientoSla(filtro: MetricaFiltro): Promise<CumplimientoSlaCrudo> {
    const base: Prisma.TicketWhereInput = {
      ...this.buildWhere(filtro),
      ...this.sinPreventivos,
      fechaCierre: { not: null },
    };
    const incorporados: Prisma.TicketWhereInput = {
      ...base,
      slaAcumuladoS: { not: null },
      slaCumplido: { not: null },
    };
    const previos: Prisma.TicketWhereInput = {
      ...base,
      slaAcumuladoS: null,
      slaVenceAt: { not: null },
    };

    const [incorporadosTotal, incorporadosATiempo, previosTotal, previosATiempo] =
      await Promise.all([
        this.client.ticket.count({ where: incorporados }),
        this.client.ticket.count({ where: { ...incorporados, slaCumplido: true } }),
        this.client.ticket.count({ where: previos }),
        this.client.ticket.count({
          where: { ...previos, fechaCierre: { lte: this.client.ticket.fields.slaVenceAt } },
        }),
      ]);

    return {
      cerradosConSla: incorporadosTotal + previosTotal,
      cerradosATiempo: incorporadosATiempo + previosATiempo,
    };
  }

  /**
   * Universo: tickets con meta que ya respondieron o ya vencieron. Cumplido si la respuesta fue en o
   * antes del vencimiento. Los rellenados sin meta no entran acá (sí en el tiempo medio).
   */
  async cumplimientoPrimeraRespuesta(
    filtro: MetricaFiltro,
  ): Promise<CumplimientoPrimeraRespuestaCrudo> {
    const conMeta: Prisma.TicketWhereInput = {
      ...this.buildWhere(filtro),
      ...this.sinPreventivos,
      primeraRespuestaVenceAt: { not: null },
      OR: [{ primeraRespuestaAt: { not: null } }, { primeraRespuestaVenceAt: { lt: new Date() } }],
    };
    const [total, aTiempo] = await Promise.all([
      this.client.ticket.count({ where: conMeta }),
      this.client.ticket.count({
        where: {
          ...conMeta,
          primeraRespuestaAt: { lte: this.client.ticket.fields.primeraRespuestaVenceAt },
        },
      }),
    ]);
    return { conMeta: total, aTiempo };
  }

  async tiempoPromedioPrimeraRespuestaHoras(filtro: MetricaFiltro): Promise<number | null> {
    const filas = await this.client.ticket.findMany({
      where: {
        ...this.buildWhere(filtro),
        ...this.sinPreventivos,
        primeraRespuestaAt: { not: null },
      },
      select: { createdAt: true, primeraRespuestaAt: true },
    });
    if (filas.length === 0) return null;

    // Calendario y feriados una sola vez por consulta, no por fila.
    const [calendario, feriados] = await Promise.all([
      this.calendarioRepo.obtener(),
      this.feriadosRepo.obtener(),
    ]);
    return promedioHorasHabiles(
      // `primeraRespuestaAt` no es null acá (filtrado en el where).
      filas.map((f) => ({ desde: f.createdAt, hasta: f.primeraRespuestaAt! })),
      this.calculo,
      calendario,
      feriados,
    );
  }

  async distribucionPorTipo(filtro: MetricaFiltro): Promise<DistribucionPorTipo[]> {
    const grupos = await this.client.ticket.groupBy({
      by: ['tipoId'],
      where: this.buildWhere(filtro),
      _count: { _all: true },
    });
    return grupos.map((grupo) => ({ tipoId: grupo.tipoId, total: grupo._count._all }));
  }

  async distribucionPorPrioridad(filtro: MetricaFiltro): Promise<DistribucionPorPrioridad[]> {
    const grupos = await this.client.ticket.groupBy({
      by: ['prioridadId'],
      where: this.buildWhere(filtro),
      _count: { _all: true },
    });
    return grupos.map((grupo) => ({ prioridadId: grupo.prioridadId, total: grupo._count._all }));
  }
}
