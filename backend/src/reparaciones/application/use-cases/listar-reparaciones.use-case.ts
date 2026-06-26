import { DomainError, Result } from '../../../shared/domain/result';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IUbicacionRepository } from '../../domain/ports/i-ubicacion.repository';
import { ReparacionListItemResponseDto } from '../../interface/dtos/reparaciones.dto';

/**
 * ListarReparacionesUseCase — caso de uso de consulta para todos los tickets edilicios.
 *
 * Obtiene todos los TicketEdiliciaEntity del tenant y para cada uno resuelve
 * el ticket base (ITicketRepository.findById) y la ubicación
 * (IUbicacionRepository.findById). Construye ReparacionListItemResponseDto
 * con todos los campos necesarios para el listado del frontend.
 *
 * Los satélites sin ticket base asociado (registros huérfanos) se omiten.
 * ubicacionNombre es null si la ubicación no se encuentra.
 *
 * Nota: el DTO se construye aquí porque ReparacionListItemResponseDto agrega
 * campos derivados (ubicacionNombre) que requieren el join con UbicacionEntity,
 * evitando transferir objetos compuestos al controller.
 *
 * Tarea: feat/tickets-list-mvp
 */
export class ListarReparacionesUseCase {
  constructor(
    private readonly ediliciaRepo: ITicketEdiliciaRepository,
    private readonly ticketRepo: ITicketRepository,
    private readonly ubicacionRepo: IUbicacionRepository,
  ) {}

  async execute(): Promise<Result<ReparacionListItemResponseDto[], DomainError>> {
    const ediliciaSatelites = await this.ediliciaRepo.findAll();
    const items: ReparacionListItemResponseDto[] = [];

    for (const edilicia of ediliciaSatelites) {
      const ticket = await this.ticketRepo.findById(edilicia.ticketId);
      if (!ticket) {
        // Registro huérfano: omitir silenciosamente
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
