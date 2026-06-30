/**
 * TiempoResolucionUseCase — calcula el tiempo promedio de resolución en días.
 *
 * Calcula AVG(fecha_cierre - created_at::date) en días para tickets RESUELTO
 * o SIN_SOLUCION del ciclo dado. Excluye RECHAZADO y tickets sin fecha_cierre.
 *
 * Sin tickets resueltos → { promedioDias: null, totalResueltos: 0 } (no error).
 * Granularidad: DÍA (fecha_cierre es @db.Date en el schema). Decisión D2.
 *
 * Ciclo: si no se provee cicloId, usa el ciclo activo del tenant.
 * Sin ciclo activo y sin cicloId → lanza NoCicloActivoError (→ HTTP 422).
 *
 * Spec ref: reportes/ReporteTiempoResolucion; Decisión D2
 * Tarea: T4.10 (PR4, admin-general)
 */
import { IReportesRepository } from '../../domain/ports/i-reportes.repository';
import { NoCicloActivoError } from '../../domain/errors/reportes.errors';

export interface TiempoResolucionDto {
  cicloId?: string;
}

export interface TiempoResolucionResult {
  promedioDias: number | null;
  totalResueltos: number;
}

export class TiempoResolucionUseCase {
  constructor(private readonly reportesRepository: IReportesRepository) {}

  async execute(dto: TiempoResolucionDto): Promise<TiempoResolucionResult> {
    const cicloId = await this.resolveCicloId(dto.cicloId);
    return this.reportesRepository.tiempoResolucionPromedioDias(cicloId);
  }

  private async resolveCicloId(cicloId?: string): Promise<string> {
    if (cicloId) return cicloId;

    const activoId = await this.reportesRepository.cicloActivo();
    if (!activoId) throw new NoCicloActivoError();
    return activoId;
  }
}
