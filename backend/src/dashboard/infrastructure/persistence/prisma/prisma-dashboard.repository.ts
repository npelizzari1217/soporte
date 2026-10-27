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
 *   `count`/`groupBy`/`aggregate` tipados de Prisma en vez de SQL crudo —
 *   mismo resultado, sin el riesgo de mantenimiento de SQL a mano y sin
 *   perder tipado (`any` prohibido).
 * - Los dos tiempos medios (odd/promedios-dashboard-habiles) son un `AVG` en SQL
 *   sobre segundos hábiles ya guardados por ticket (`resolucion_habil_s`,
 *   `primera_respuesta_habil_s`): ninguna fila viaja a memoria y cambiar el
 *   calendario no recalcula el historial.
 *
 * Tarea: D4.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '.prisma/tenant';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { TIPO_CODIGO_PREVENTIVO } from '../../../../tickets/domain/tipos-ticket.constants';
import { whereAlcanceListado } from '../../../../tickets/infrastructure/persistence/prisma/alcance-listado.prisma';
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

const SEGUNDOS_POR_HORA = 3600;

/** Promedio en horas de un `AVG` en segundos; `null` (sin filas) sigue siendo `null`, no 0 h. */
const enHoras = (promedioS: number | null): number | null =>
  promedioS === null ? null : promedioS / SEGUNDOS_POR_HORA;

@Injectable()
export class PrismaDashboardRepository implements IDashboardRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  /**
   * Cláusula `where` base combinable (AND): ciclo + asignado (D2) + alcance por tipo del actor
   * (odd/permisos-por-tipo-ticket, D5 e), excluye soft-deleted. El alcance va en un `AND` propio:
   * `cumplimientoPrimeraRespuesta` usa el `OR` de la raíz.
   */
  private buildWhere(filtro: MetricaFiltro): Prisma.TicketWhereInput {
    return {
      deletedAt: null,
      ...(filtro.cicloId && { cicloId: filtro.cicloId }),
      ...(filtro.asignadoId && { asignadoId: filtro.asignadoId }),
      ...(filtro.alcance && { AND: [whereAlcanceListado(filtro.alcance)] }),
    };
  }

  /**
   * Un ticket sin fecha de cierre está abierto, salvo el CANCELADO: nunca recibe esa fecha y no es
   * trabajo pendiente (odd/tasks/defectos-ayuda.md, S4).
   */
  private readonly abierto = {
    fechaCierre: null,
    estado: { codigo: { not: 'CANCELADO' } },
  } satisfies Prisma.TicketWhereInput;

  async conteoPorEstadoAgrupado(filtro: MetricaFiltro): Promise<ConteoAbiertosCerrados> {
    const where = this.buildWhere(filtro);
    const [abiertos, cerrados] = await Promise.all([
      this.client.ticket.count({ where: { ...where, ...this.abierto } }),
      this.client.ticket.count({ where: { ...where, fechaCierre: { not: null } } }),
    ]);
    return { abiertos, cerrados };
  }

  /**
   * `AVG(resolucion_habil_s)`: tiempo hábil sin pausas hasta RESUELTO. Un reabierto tiene la columna
   * en NULL mientras no se vuelva a resolver y queda afuera. Sin preventivos.
   */
  async tiempoPromedioResolucionHoras(filtro: MetricaFiltro): Promise<number | null> {
    const { _avg } = await this.client.ticket.aggregate({
      where: {
        ...this.buildWhere(filtro),
        ...this.sinPreventivos,
        resolucionHabilS: { not: null },
      },
      _avg: { resolucionHabilS: true },
    });
    return enHoras(_avg.resolucionHabilS);
  }

  async cargaPorAgente(filtro: MetricaFiltro): Promise<CargaAgente[]> {
    const grupos = await this.client.ticket.groupBy({
      by: ['asignadoId'],
      where: { ...this.buildWhere(filtro), ...this.abierto, asignadoId: { not: null } },
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

  /** `AVG(primera_respuesta_habil_s)`, guardado al registrarse la primera respuesta. Sin preventivos. */
  async tiempoPromedioPrimeraRespuestaHoras(filtro: MetricaFiltro): Promise<number | null> {
    const { _avg } = await this.client.ticket.aggregate({
      where: {
        ...this.buildWhere(filtro),
        ...this.sinPreventivos,
        primeraRespuestaHabilS: { not: null },
      },
      _avg: { primeraRespuestaHabilS: true },
    });
    return enHoras(_avg.primeraRespuestaHabilS);
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
