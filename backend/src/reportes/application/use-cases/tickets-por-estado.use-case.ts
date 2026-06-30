/**
 * TicketsPorEstadoUseCase — agrega tickets del ciclo dado por estado.
 *
 * Todos los estados del catálogo están en la respuesta (incluso con 0).
 * El repositorio hace el LEFT JOIN desde estados para garantizar completeness.
 * Incluye estados terminales: RESUELTO, SIN_SOLUCION, RECHAZADO.
 *
 * Ciclo: si no se provee cicloId, usa el ciclo activo del tenant.
 * Sin ciclo activo y sin cicloId → lanza NoCicloActivoError (→ HTTP 422).
 *
 * Spec ref: reportes/ReporteTicketsPorEstado
 * Tarea: T4.8 (PR4, admin-general)
 */
import { IReportesRepository } from '../../domain/ports/i-reportes.repository';
import { NoCicloActivoError } from '../../domain/errors/reportes.errors';

export interface TicketsPorEstadoDto {
  cicloId?: string;
}

export interface EstadoConTickets {
  estado: string;
  totalTickets: number;
}

export class TicketsPorEstadoUseCase {
  constructor(private readonly reportesRepository: IReportesRepository) {}

  async execute(dto: TicketsPorEstadoDto): Promise<EstadoConTickets[]> {
    const cicloId = await this.resolveCicloId(dto.cicloId);
    const rows = await this.reportesRepository.ticketsPorEstado(cicloId);

    return rows.map((row) => ({
      estado: row.estadoCodigo,
      totalTickets: row.total,
    }));
  }

  private async resolveCicloId(cicloId?: string): Promise<string> {
    if (cicloId) return cicloId;

    const activoId = await this.reportesRepository.cicloActivo();
    if (!activoId) throw new NoCicloActivoError();
    return activoId;
  }
}
