import { ITenantTransactionRunner } from '../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TicketEntity } from '../../tickets/domain/entities/ticket.entity';
import { ITicketRepository, TicketFiltros } from '../../tickets/domain/ports/i-ticket.repository';
import { SincronizarTramoTecnicoService } from '../application/sincronizar-tramo-tecnico.service';
import { IDomainEventPublisher } from '../../shared/domain/ports/i-domain-event-publisher';
import { TicketEstadoModificadoEvent } from '../../tickets/domain/events/ticket-estado-modificado.event';

/**
 * TicketRepositoryConTramos — `ITicketRepository` que mantiene los tramos del técnico en cada
 * guardado (odd/tasks/tiempo-tecnico.md, T3, diseño L9).
 *
 * Es el punto único por el que pasan TODAS las escrituras del responsable (`asignado_id`) y del
 * estado de un ticket: el alta (con regla de asignación, incluidas las de equipos, edilicia,
 * preventivo, formulario público y API), la asignación manual, asignar y poner en proceso, el
 * avance por tareas y las transiciones. `TicketsModule` lo registra como `TICKET_REPOSITORY`, así
 * que ningún camino nuevo queda afuera mientras guarde por el repositorio. La guarda estructural
 * `escritores-asignado.spec.ts` falla si aparece una escritura del responsable o del estado que no
 * pase por acá.
 *
 * `save` corre en `txRunner.run`, que es re-entrante: dentro de la transacción del caso de uso
 * participa de ella; fuera, abre una propia. Lee la situación previa con la fila bloqueada, guarda
 * y sincroniza el tramo, todo en la misma transacción: un rollback no deja un tramo huérfano.
 *
 * Por ser ese punto único, también publica `ticket.estado_modificado` cuando un ticket existente
 * cambia de estado, después del commit (odd/tasks/defectos-ayuda.md, S6).
 *
 * El resto de los métodos delega sin cambios.
 */
export class TicketRepositoryConTramos implements ITicketRepository {
  constructor(
    private readonly inner: ITicketRepository,
    private readonly tramos: Pick<SincronizarTramoTecnicoService, 'leerPrevio' | 'sincronizar'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run' | 'alCommitear'>,
    private readonly eventPublisher: Pick<IDomainEventPublisher, 'publish'>,
  ) {}

  findById(id: string): Promise<TicketEntity | null> {
    return this.inner.findById(id);
  }

  findByIds(ids: string[]): Promise<Map<string, TicketEntity>> {
    return this.inner.findByIds(ids);
  }

  findByNumero(numero: string): Promise<TicketEntity | null> {
    return this.inner.findByNumero(numero);
  }

  findLastSecuencia(tipoId: string, anio: number): Promise<number> {
    return this.inner.findLastSecuencia(tipoId, anio);
  }

  findAll(filtros?: TicketFiltros): Promise<TicketEntity[]> {
    return this.inner.findAll(filtros);
  }

  count(filtros?: TicketFiltros): Promise<number> {
    return this.inner.count(filtros);
  }

  esVisiblePara(ticketId: string, actorId: string): Promise<boolean> {
    return this.inner.esVisiblePara(ticketId, actorId);
  }

  bloquear(id: string): Promise<void> {
    return this.inner.bloquear(id);
  }

  /**
   * Guarda el ticket y, en la misma transacción, abre o cierra su tramo si cambiaron el
   * responsable o el estado. Si cambió el estado de un ticket existente, publica
   * `ticket.estado_modificado` al confirmar la transacción.
   *
   * @param ticket Ticket a persistir.
   */
  async save(ticket: TicketEntity): Promise<void> {
    await this.txRunner.run(async () => {
      const previo = await this.tramos.leerPrevio(ticket.id);
      await this.inner.save(ticket);
      await this.tramos.sincronizar(ticket.id, previo);
      if (previo !== null && previo.estadoId !== ticket.estadoId) {
        this.txRunner.alCommitear(() =>
          this.eventPublisher.publish(new TicketEstadoModificadoEvent({ ticketId: ticket.id })),
        );
      }
    });
  }

  delete(id: string): Promise<void> {
    return this.inner.delete(id);
  }

  borrarSiActivo(id: string, ahora: Date): Promise<boolean> {
    return this.inner.borrarSiActivo(id, ahora);
  }

  recuperarSiBorrado(id: string, ahora: Date): Promise<boolean> {
    return this.inner.recuperarSiBorrado(id, ahora);
  }
}
