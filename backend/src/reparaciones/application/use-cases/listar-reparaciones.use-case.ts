import { DomainError, Result } from '../../../shared/domain/result';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IUbicacionRepository } from '../../domain/ports/i-ubicacion.repository';
import { ICicloClienteRepository } from '../../../tickets/domain/ports/i-ciclo-cliente.repository';
import { ReparacionListItemResponseDto } from '../../interface/dtos/reparaciones.dto';

/**
 * ListarReparacionesUseCase — caso de uso de consulta para los tickets edilicios
 * de un ciclo del tenant.
 *
 * Obtiene todos los TicketEdiliciaEntity del tenant y para cada uno resuelve
 * el ticket base (ITicketRepository.findById) y la ubicación
 * (IUbicacionRepository.findById). Construye ReparacionListItemResponseDto
 * con todos los campos necesarios para el listado del frontend.
 *
 * Filtro por ciclo (Fase 4, ciclos-master-tenant, ADR-5):
 * - `cicloId` explícito (histórico) → filtra por ese ciclo, sin consultar el activo.
 * - Sin `cicloId` → usa el ciclo ACTIVO del tenant como filtro por defecto.
 * - Sin `cicloId` y sin ciclo activo → `Result.ok([])` sin llamar `findAll` (evita
 *   traer todo el catálogo de satélites para descartarlo después).
 *
 * Los satélites sin ticket base asociado (registros huérfanos) se omiten.
 * ubicacionNombre es null si la ubicación no se encuentra.
 *
 * Nota: el DTO se construye aquí porque ReparacionListItemResponseDto agrega
 * campos derivados (ubicacionNombre) que requieren el join con UbicacionEntity,
 * evitando transferir objetos compuestos al controller.
 *
 * Ref design: openspec/changes/ciclos-master-tenant/design-fase4.md ADR-5
 * Tarea: feat/tickets-list-mvp; 4.5/4.6 (Fase 4, PR4)
 */
export class ListarReparacionesUseCase {
  constructor(
    private readonly ediliciaRepo: ITicketEdiliciaRepository,
    private readonly ticketRepo: ITicketRepository,
    private readonly ubicacionRepo: IUbicacionRepository,
    private readonly cicloRepo: Pick<ICicloClienteRepository, 'findActive'>,
  ) {}

  async execute(cicloId?: string): Promise<Result<ReparacionListItemResponseDto[], DomainError>> {
    const cicloEfectivo = cicloId ?? (await this.cicloRepo.findActive())?.id ?? null;
    if (!cicloEfectivo) {
      return Result.ok([]);
    }

    const ediliciaSatelites = await this.ediliciaRepo.findAll();
    const items: ReparacionListItemResponseDto[] = [];

    for (const edilicia of ediliciaSatelites) {
      const ticket = await this.ticketRepo.findById(edilicia.ticketId);
      if (!ticket || ticket.cicloId !== cicloEfectivo) {
        // Registro huérfano o fuera del ciclo filtrado: omitir silenciosamente
        continue;
      }

      const ubicacion = await this.ubicacionRepo.findById(edilicia.ubicacionId);

      items.push({
        id: edilicia.id,
        ticketId: edilicia.ticketId,
        numero: ticket.numero,
        titulo: ticket.titulo,
        estadoId: ticket.estadoId,
        ubicacionId: edilicia.ubicacionId,
        ubicacionNombre: ubicacion ? ubicacion.nombre : null,
        porcentajeAvance: edilicia.porcentajeAvance,
        createdAt: edilicia.createdAt.toISOString(),
        updatedAt: edilicia.updatedAt.toISOString(),
      });
    }

    return Result.ok(items);
  }
}
