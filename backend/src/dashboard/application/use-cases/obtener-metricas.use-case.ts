import { IDashboardRepository, MetricaFiltro } from '../../domain/ports/i-dashboard.repository';
import { ICicloClienteRepository } from '../../../tickets/domain/ports/i-ciclo-cliente.repository';

const ROL_TECNICO = 'TECNICO';

/**
 * DTO de entrada de `ObtenerMetricasUseCase`. `actorRol` es el `rol` crudo
 * del JWT (D2) — el controller NO resuelve el scope, solo pasa el rol tal
 * cual; la divergencia "scope self vs. global" vive acá (ADR-P5).
 */
export interface ObtenerMetricasDto {
  actorId: string;
  actorRol: string | null;
  /** Ciclo explícito (histórico). Sin valor → se resuelve el ciclo ACTIVO. */
  cicloId?: string;
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
  distribucionPorTipo: { tipoId: string; total: number }[];
  distribucionPorPrioridad: { prioridadId: string; total: number }[];
}

const METRICAS_VACIAS: MetricasResult = {
  abiertos: 0,
  cerrados: 0,
  tiempoPromedioResolucionHoras: null,
  cargaPorAgente: [],
  cumplimientoSla: { cerradosConSla: 0, cerradosATiempo: 0, porcentaje: null },
  distribucionPorTipo: [],
  distribucionPorPrioridad: [],
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
 *   ADMINISTRADOR/COLABORADOR ven el tenant completo (`asignadoId`
 *   undefined). El gate de acceso (excluir USUARIO) es responsabilidad del
 *   controller/guard (`ticket:ver_todos`, D3) — este use case asume que el
 *   actor ya pasó ese gate.
 * - % de cumplimiento SLA: `cerradosATiempo / cerradosConSla`; `null` si
 *   `cerradosConSla=0` (evita `NaN`/división por cero cuando no hay
 *   cerrados con SLA aplicable).
 *
 * Ref spec: sdd/premium/spec D1, D2. Ref design: ADR-P5. Tarea: D2.
 */
export class ObtenerMetricasUseCase {
  constructor(
    private readonly dashboardRepo: IDashboardRepository,
    private readonly cicloClienteRepo: Pick<ICicloClienteRepository, 'findActive'>,
  ) {}

  async execute(dto: ObtenerMetricasDto): Promise<MetricasResult> {
    const cicloEfectivoId = dto.cicloId ?? (await this.cicloClienteRepo.findActive())?.id;

    if (!cicloEfectivoId) {
      return METRICAS_VACIAS;
    }

    const asignadoId = dto.actorRol === ROL_TECNICO ? dto.actorId : undefined;
    const filtro: MetricaFiltro = { cicloId: cicloEfectivoId, asignadoId };

    const [
      conteo,
      tiempoPromedio,
      cargaPorAgente,
      sla,
      distribucionPorTipo,
      distribucionPorPrioridad,
    ] = await Promise.all([
      this.dashboardRepo.conteoPorEstadoAgrupado(filtro),
      this.dashboardRepo.tiempoPromedioResolucionHoras(filtro),
      this.dashboardRepo.cargaPorAgente(filtro),
      this.dashboardRepo.cumplimientoSla(filtro),
      this.dashboardRepo.distribucionPorTipo(filtro),
      this.dashboardRepo.distribucionPorPrioridad(filtro),
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
      distribucionPorTipo,
      distribucionPorPrioridad,
    };
  }
}
