/**
 * TicketsPorTipoUseCase — agrega tickets del ciclo dado por tipo de flujo.
 *
 * Los 3 tipos fijos (SOPORTE, COMPRAS, EDILICIA) siempre están en la respuesta,
 * incluso con totalTickets=0. El repositorio hace el LEFT JOIN internamente;
 * el use case mapea la respuesta al DTO de salida.
 *
 * Ciclo: si no se provee cicloId, usa el ciclo activo del tenant.
 * Sin ciclo activo y sin cicloId → lanza NoCicloActivoError (→ HTTP 422).
 *
 * Spec ref: reportes/ReporteTicketsPorTipo
 * Tarea: T4.6 (PR4, admin-general)
 */
import { IReportesRepository } from '../../domain/ports/i-reportes.repository';
import { NoCicloActivoError } from '../../domain/errors/reportes.errors';

export interface TicketsPorTipoDto {
  cicloId?: string;
}

export interface TipoConTickets {
  tipo: string;
  totalTickets: number;
}

export class TicketsPorTipoUseCase {
  constructor(private readonly reportesRepository: IReportesRepository) {}

  async execute(dto: TicketsPorTipoDto): Promise<TipoConTickets[]> {
    const cicloId = await this.resolveCicloId(dto.cicloId);
    const rows = await this.reportesRepository.ticketsPorTipo(cicloId);

    return rows.map((row) => ({
      tipo: row.tipoCodigo,
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
