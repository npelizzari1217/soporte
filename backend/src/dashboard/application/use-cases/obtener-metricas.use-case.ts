import { IDashboardRepository, MetricaFiltro } from '../../domain/ports/i-dashboard.repository';
import { ICicloClienteRepository } from '../../../tickets/domain/ports/i-ciclo-cliente.repository';
import { IEncuestaSatisfaccionRepository } from '../../../csat/domain/ports/i-encuesta-satisfaccion.repository';
import { CicloClienteEntity } from '../../../tickets/domain/entities/ciclo-cliente.entity';
import { ITareaTicketRepository } from '../../../tickets/domain/ports/i-tarea-ticket.repository';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { medianocheArgentina } from '../../../shared/domain/zona-horaria-argentina';
import { AlcanceListadoTickets } from '../../../tickets/domain/ports/i-ticket.repository';
import {
  AlcanceActorTicket,
  alcanceDeListado,
  alcanceListadoVacio,
} from '../../../tickets/application/services/visibilidad-ticket';

const ROL_TECNICO = 'TECNICO';
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * DTO de entrada de `ObtenerMetricasUseCase`. `actorRol` es el `rol` crudo
 * del JWT (D2) — el controller NO resuelve el scope, solo pasa el rol tal
 * cual; la divergencia "scope self vs. global" vive acá (ADR-P5).
 *
 * `tieneCsatLectura` (WU9.1, ADR-C5) lo calcula el controller con
 * `puedeEjecutar(user, 'CSAT:LECTURA')` — el gateo del KPI de satisfacción
 * es POR CAMPO en el payload de salida, no por el decorador
 * `@RequiereAcciones` del controller (esa ruta sigue gateada solo por
 * `DASHBOARD:LECTURA`, que es un permiso distinto). Default `false`: quien
 * no pase el flag explícito no ve el dato.
 */
export interface ObtenerMetricasDto {
  actorId: string;
  actorRol: string | null;
  /** Ciclo explícito (histórico). Sin valor → se resuelve el ciclo ACTIVO. */
  cicloId?: string;
  tieneCsatLectura?: boolean;
  /**
   * Permisos por tipo del actor (odd/permisos-por-tipo-ticket, D5 e): las métricas agregan solo los
   * tickets que el actor ve. `permisosPorTipo: null` = sin restricción (ROOT y ADMINISTRADOR).
   */
  alcance: AlcanceActorTicket;
}

/**
 * Tareas completadas por un usuario en el período del dashboard (odd/tareas-con-tecnico T4, CA6).
 * El crédito es de quien completó la tarea (`completada_por_id`), no del técnico asignado.
 * `nombre` y `apellido` salen de master; `null` si el usuario ya no existe allí.
 */
export interface TareasCompletadasTecnico {
  usuarioId: string;
  nombre: string | null;
  apellido: string | null;
  completadas: number;
}

/** DTO de salida — snapshot de métricas del dashboard (D1). */
export interface MetricasResult {
  abiertos: number;
  cerrados: number;
  tiempoPromedioResolucionHoras: number | null;
  cargaPorAgente: { asignadoId: string; abiertos: number }[];
  cumplimientoSla: {
    cerradosConSla: number;
    cerradosATiempo: number;
    /** `cerradosATiempo / cerradosConSla`. `null` si `cerradosConSla=0`. */
    porcentaje: number | null;
  };
  /** `aTiempo / conMeta`; `null` si `conMeta=0` (sdd/sla-primera-respuesta-y-pausa). */
  cumplimientoPrimeraRespuesta: { conMeta: number; aTiempo: number; porcentaje: number | null };
  /** Horas HÁBILES entre la creación y la primera respuesta; `null` sin datos. */
  tiempoPromedioPrimeraRespuestaHoras: number | null;
  distribucionPorTipo: { tipoId: string; total: number }[];
  distribucionPorPrioridad: { prioridadId: string; total: number }[];
  /**
   * Tareas completadas por técnico en el período del ciclo, evaluado sobre `completada_en`, en
   * orden descendente de cantidad. Con alcance de TECNICO, a lo sumo la fila propia.
   */
  tareasCompletadasPorTecnico: TareasCompletadasTecnico[];
  /**
   * KPI de satisfacción (WU9.1, ADR-C5). Presente SOLO si el actor tiene
   * `CSAT:LECTURA` — con `tieneCsatLectura=false` estas dos claves quedan
   * AUSENTES del objeto (no `undefined`: ausentes), para que un cliente que
   * inspeccione el JSON serializado no reciba ninguna pista del dato.
   */
  csatPromedio?: number | null;
  csatRespuestas?: number;
}

const METRICAS_VACIAS_BASE: Omit<MetricasResult, 'csatPromedio' | 'csatRespuestas'> = {
  abiertos: 0,
  cerrados: 0,
  tiempoPromedioResolucionHoras: null,
  cargaPorAgente: [],
  cumplimientoSla: { cerradosConSla: 0, cerradosATiempo: 0, porcentaje: null },
  cumplimientoPrimeraRespuesta: { conMeta: 0, aTiempo: 0, porcentaje: null },
  tiempoPromedioPrimeraRespuestaHoras: null,
  distribucionPorTipo: [],
  distribucionPorPrioridad: [],
  tareasCompletadasPorTecnico: [],
};

/**
 * ObtenerMetricasUseCase — agregaciones read-only del dashboard con scope
 * por rol (D1/D2).
 *
 * - Ciclo efectivo: `cicloId` explícito (histórico) tiene prioridad; si no
 *   viene, se resuelve el ciclo ACTIVO del tenant (mismo criterio que
 *   `ListarTicketsUseCase`, T7). Sin cicloId explícito NI activo →
 *   métricas vacías, sin consultar el repo.
 * - Scope de rol (D2, ADR-P5): `actorRol === 'TECNICO'` fuerza
 *   `asignadoId = actorId` en TODAS las métricas (incluida `cargaPorAgente`,
 *   que naturalmente retorna como máximo una fila — la propia).
 *   ADMINISTRADOR/COLABORADOR no fijan `asignadoId`. El gate de acceso
 *   (`DASHBOARD:LECTURA`) es responsabilidad del controller/guard — este use
 *   case asume que el actor ya pasó ese gate.
 * - Alcance por tipo (odd/permisos-por-tipo-ticket, S6, D5 e): TODAS las
 *   métricas —por ticket, CSAT y tareas completadas— agregan solo los tickets
 *   que el actor ve, con la misma regla que el listado (`alcanceDeListado`).
 *   Se combina en AND con el scope de TECNICO: un TECNICO ve las métricas de
 *   los tickets que tiene asignados Y que son de tipos con `LECTURA` (por ser
 *   el responsable, la regla de fila ya los cubre). Sin ningún tipo con
 *   `LECTURA` → métricas vacías, sin consultar.
 * - % de cumplimiento SLA: `cerradosATiempo / cerradosConSla`; `null` si
 *   `cerradosConSla=0` (evita `NaN`/división por cero cuando no hay
 *   cerrados con SLA aplicable).
 * - Tareas completadas por técnico (odd/tareas-con-tecnico T4, CA6): el período es el rango de
 *   días del ciclo en hora argentina, de las 00:00 ART de `fechaInicio` a las 00:00 ART del día
 *   siguiente a `fechaFin` (03:00 UTC, T11), aplicado a `completada_en` y no al
 *   ciclo del ticket: una tarea completada este ciclo sobre un ticket de un ciclo anterior cuenta
 *   en este. El alcance de TECNICO fija `completada_por_id = actorId`, el mismo criterio que
 *   `asignadoId` en las métricas por ticket. Las métricas por ticket no cambian.
 *
 * Ref spec: sdd/premium/spec D1, D2. Ref design: ADR-P5. Tarea: D2.
 */
export class ObtenerMetricasUseCase {
  constructor(
    private readonly dashboardRepo: IDashboardRepository,
    private readonly cicloClienteRepo: Pick<ICicloClienteRepository, 'findActive' | 'findById'>,
    private readonly csatRepo: Pick<IEncuestaSatisfaccionRepository, 'resumenPorScope'>,
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'contarCompletadasPorTecnico'>,
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'resolverNombres'>,
  ) {}

  async execute(dto: ObtenerMetricasDto): Promise<MetricasResult> {
    const tieneCsatLectura = dto.tieneCsatLectura ?? false;
    const vacias: MetricasResult = {
      ...METRICAS_VACIAS_BASE,
      ...(tieneCsatLectura ? { csatPromedio: null, csatRespuestas: 0 } : {}),
    };
    const alcance = alcanceDeListado(dto.alcance);
    if (alcanceListadoVacio(alcance)) {
      return vacias;
    }

    const cicloActivo = dto.cicloId ? null : await this.cicloClienteRepo.findActive();
    const cicloEfectivoId = dto.cicloId ?? cicloActivo?.id;

    if (!cicloEfectivoId) {
      return vacias;
    }

    const asignadoId = dto.actorRol === ROL_TECNICO ? dto.actorId : undefined;
    const filtro: MetricaFiltro = {
      cicloId: cicloEfectivoId,
      asignadoId,
      ...(alcance && { alcance }),
    };
    // El ciclo explícito se busca para conocer sus fechas; el activo ya se tiene.
    const ciclo = dto.cicloId
      ? this.cicloClienteRepo.findById(dto.cicloId)
      : Promise.resolve(cicloActivo);

    const [
      conteo,
      tiempoPromedio,
      cargaPorAgente,
      sla,
      primeraRespuesta,
      tiempoPrimeraRespuesta,
      distribucionPorTipo,
      distribucionPorPrioridad,
      csat,
      tareasCompletadasPorTecnico,
    ] = await Promise.all([
      this.dashboardRepo.conteoPorEstadoAgrupado(filtro),
      this.dashboardRepo.tiempoPromedioResolucionHoras(filtro),
      this.dashboardRepo.cargaPorAgente(filtro),
      this.dashboardRepo.cumplimientoSla(filtro),
      this.dashboardRepo.cumplimientoPrimeraRespuesta(filtro),
      this.dashboardRepo.tiempoPromedioPrimeraRespuestaHoras(filtro),
      this.dashboardRepo.distribucionPorTipo(filtro),
      this.dashboardRepo.distribucionPorPrioridad(filtro),
      // ADR-C5: solo se consulta el repo CSAT si el actor tiene el permiso —
      // evita el costo de la query cuando el dato ni siquiera se va a mostrar.
      tieneCsatLectura ? this.csatRepo.resumenPorScope(filtro) : Promise.resolve(null),
      this.tareasCompletadasPorTecnico(ciclo, asignadoId, alcance),
    ]);

    return {
      abiertos: conteo.abiertos,
      cerrados: conteo.cerrados,
      tiempoPromedioResolucionHoras: tiempoPromedio,
      cargaPorAgente,
      cumplimientoSla: {
        cerradosConSla: sla.cerradosConSla,
        cerradosATiempo: sla.cerradosATiempo,
        porcentaje: sla.cerradosConSla > 0 ? sla.cerradosATiempo / sla.cerradosConSla : null,
      },
      cumplimientoPrimeraRespuesta: {
        conMeta: primeraRespuesta.conMeta,
        aTiempo: primeraRespuesta.aTiempo,
        porcentaje:
          primeraRespuesta.conMeta > 0 ? primeraRespuesta.aTiempo / primeraRespuesta.conMeta : null,
      },
      tiempoPromedioPrimeraRespuestaHoras: tiempoPrimeraRespuesta,
      distribucionPorTipo,
      distribucionPorPrioridad,
      tareasCompletadasPorTecnico,
      ...(csat ? { csatPromedio: csat.promedio, csatRespuestas: csat.respuestas } : {}),
    };
  }

  /**
   * Tareas completadas en el período del ciclo, con el nombre de cada usuario resuelto en un solo
   * lote contra master. Un ciclo explícito inexistente da una lista vacía.
   */
  private async tareasCompletadasPorTecnico(
    cicloPendiente: Promise<CicloClienteEntity | null>,
    completadaPorId: string | undefined,
    alcance: AlcanceListadoTickets | null,
  ): Promise<TareasCompletadasTecnico[]> {
    const ciclo = await cicloPendiente;
    if (!ciclo) return [];

    const grupos = await this.tareaRepo.contarCompletadasPorTecnico({
      // Las fechas del ciclo son días calendario argentinos (`@db.Date`), y `completada_en` es un
      // instante: los bordes son la medianoche argentina, no la UTC (T11). `fecha_fin` incluye el
      // día entero.
      desde: medianocheArgentina(ciclo.fechaInicio),
      hasta: medianocheArgentina(new Date(ciclo.fechaFin.getTime() + MS_POR_DIA)),
      completadaPorId,
      ...(alcance && { alcance }),
    });
    if (grupos.length === 0) return [];

    const nombres = await this.usuarioMasterChecker.resolverNombres(
      grupos.map((g) => g.completadaPorId),
    );
    // El repositorio ya devuelve el orden descendente; se conserva tal cual.
    return grupos.map((g) => {
      const usuario = nombres.get(g.completadaPorId);
      return {
        usuarioId: g.completadaPorId,
        nombre: usuario?.nombre ?? null,
        apellido: usuario?.apellido ?? null,
        completadas: g.completadas,
      };
    });
  }
}
