/**
 * TicketsPorUsuarioUseCase — agrega tickets del ciclo dado por solicitante y por asignado.
 *
 * Retorna DOS vistas: porSolicitante y porAsignado (Decisión D3, PR4 tasks).
 * Los UUIDs del tenant DB se enriquecen con nombres de master.usuarios vía
 * query separada a IUsuarioRepository (sin JOIN cross-DB).
 *
 * Ciclo: si no se provee cicloId, usa el ciclo activo del tenant.
 * Sin ciclo activo y sin cicloId → lanza NoCicloActivoError (→ HTTP 422).
 *
 * Spec ref: reportes/ReporteTicketsPorUsuario
 * Tarea: T4.4 (PR4, admin-general)
 */
import { IReportesRepository } from '../../domain/ports/i-reportes.repository';
import { IUsuarioRepository } from '../../../auth/domain/ports/i-usuario.repository';
import { NoCicloActivoError } from '../../domain/errors/reportes.errors';

export interface TicketsPorUsuarioDto {
  cicloId?: string;
}

export interface UsuarioConTickets {
  usuarioId: string | null;
  nombre: string;
  totalTickets: number;
}

export interface TicketsPorUsuarioResult {
  porSolicitante: UsuarioConTickets[];
  porAsignado: UsuarioConTickets[];
}

export class TicketsPorUsuarioUseCase {
  constructor(
    private readonly reportesRepository: IReportesRepository,
    private readonly usuarioRepository: IUsuarioRepository,
  ) {}

  async execute(dto: TicketsPorUsuarioDto): Promise<TicketsPorUsuarioResult> {
    const cicloId = await this.resolveCicloId(dto.cicloId);

    const [solicitanteRows, asignadoRows] = await Promise.all([
      this.reportesRepository.ticketsPorSolicitante(cicloId),
      this.reportesRepository.ticketsPorAsignado(cicloId),
    ]);

    const [porSolicitante, porAsignado] = await Promise.all([
      this.enrichSolicitantes(solicitanteRows),
      this.enrichAsignados(asignadoRows),
    ]);

    return { porSolicitante, porAsignado };
  }

  private async resolveCicloId(cicloId?: string): Promise<string> {
    if (cicloId) return cicloId;

    const activoId = await this.reportesRepository.cicloActivo();
    if (!activoId) throw new NoCicloActivoError();
    return activoId;
  }

  private async enrichSolicitantes(
    rows: Array<{ solicitanteId: string; total: number }>,
  ): Promise<UsuarioConTickets[]> {
    return Promise.all(
      rows.map(async (row) => {
        const nombre = await this.resolveNombre(row.solicitanteId);
        return { usuarioId: row.solicitanteId, nombre, totalTickets: row.total };
      }),
    );
  }

  private async enrichAsignados(
    rows: Array<{ asignadoId: string | null; total: number }>,
  ): Promise<UsuarioConTickets[]> {
    return Promise.all(
      rows.map(async (row) => {
        if (row.asignadoId === null) {
          return { usuarioId: null, nombre: 'Sin asignar', totalTickets: row.total };
        }
        const nombre = await this.resolveNombre(row.asignadoId);
        return { usuarioId: row.asignadoId, nombre, totalTickets: row.total };
      }),
    );
  }

  /**
   * Resuelve el nombre completo de un usuario del master.
   * Si el usuario no existe (inconsistencia de datos), retorna el ID como fallback.
   */
  private async resolveNombre(userId: string): Promise<string> {
    const usuario = await this.usuarioRepository.findById(userId);
    if (!usuario) return userId;
    return `${usuario.nombre} ${usuario.apellido}`.trim();
  }
}
