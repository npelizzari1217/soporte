import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { TipoOperacionNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { IUbicacionRepository } from '../../domain/ports/i-ubicacion.repository';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { UbicacionInvalidaError } from '../../domain/errors/reparaciones.errors';

/**
 * DTO para eliminar una ubicación (soft delete con cascada lógica).
 */
export interface EliminarUbicacionDto {
  /** UUID de la ubicación a eliminar. */
  ubicacionId: string;
  /** UUID del autor de la acción (extraído del JWT). */
  autorId: string;
}

/**
 * EliminarUbicacionUseCase — elimina lógicamente una ubicación y sus descendientes.
 *
 * Flujo:
 * 1. Carga la ubicación raíz → UbicacionInvalidaError si no existe o ya eliminada.
 * 2. Resuelve el tipo de operación UBICACION_ELIMINADA (pre-tx).
 * 3. Dentro de la transacción (atomicidad total):
 *    a. CTE recursiva findSubtree → raíz + todos los descendientes no soft-deleted.
 *    b. Para cada ubicación del árbol: busca los tickets edilicios afectados.
 *    c. Deduplicación: si un ticket referencia padre e hijo → solo 1 operación.
 *    d. Soft-deleta todas las ubicaciones del árbol (loop).
 *    e. Persiste una OperacionTicket UBICACION_ELIMINADA por ticket afectado.
 * 4. Retorna Result.ok(void).
 *
 * Mejora vs. BFS (PR-14b): findSubtree usa WITH RECURSIVE dentro de la misma tx,
 * eliminando la ventana de inconsistencia entre el BFS externo y el delete transaccional.
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:reparaciones/Soft delete cascada]
 * Tarea: 5.B.7 / 5.B.8 / PR-15a (CTE + deuda seed UBICACION_ELIMINADA)
 */
export class EliminarUbicacionUseCase {
  constructor(
    private readonly ubicacionRepo: IUbicacionRepository,
    private readonly ticketEdiliciaRepo: ITicketEdiliciaRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: EliminarUbicacionDto): Promise<Result<void, DomainError>> {
    // 1. Cargar la ubicación raíz (pre-tx: validación temprana, evita entrar a la tx innecesariamente)
    const ubicacionRaiz = await this.ubicacionRepo.findById(dto.ubicacionId);
    if (!ubicacionRaiz || ubicacionRaiz.isDeleted()) {
      return Result.fail(new UbicacionInvalidaError(dto.ubicacionId));
    }

    // 2. Resolver el tipo de operación antes de entrar a la tx (read-only catalog lookup).
    //    UBICACION_ELIMINADA fue sembrado en PR-15a (deuda de PR-14b resuelta).
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('UBICACION_ELIMINADA');
    if (!tipoOperacionId) {
      return Result.fail(new TipoOperacionNoEncontradoError('UBICACION_ELIMINADA'));
    }

    // 3. Persistir todo dentro de la misma transacción (read + delete + operaciones: atómico)
    await this.txRunner.run(async () => {
      // a. CTE recursiva: obtiene raíz + todos los descendientes no soft-deleted en una query
      //    Dentro de la tx garantiza que no hay cambios concurrentes en el árbol.
      const todasLasUbicaciones = await this.ubicacionRepo.findSubtree(dto.ubicacionId);

      // b. Recolectar tickets edilicios afectados por cada ubicación del árbol
      const ticketsByUbicacion = await Promise.all(
        todasLasUbicaciones.map((ub) => this.ticketEdiliciaRepo.findByUbicacionId(ub.id)),
      );

      // c. Aplanar y deduplicar por ticketId (un ticket puede referenciar padre e hijo)
      const ticketIdVistos = new Set<string>();
      const operacionesARegistrar = ticketsByUbicacion
        .flat()
        .filter((te) => {
          if (ticketIdVistos.has(te.ticketId)) return false;
          ticketIdVistos.add(te.ticketId);
          return true;
        })
        .map((te) =>
          OperacionTicketEntity.create({
            ticketId: te.ticketId,
            tipoOperacionId,
            descripcion: `La ubicación "${ubicacionRaiz.nombre}" fue eliminada. El ticket puede requerir reasignación de ubicación.`,
            estadoAnteriorId: null,
            estadoNuevoId: null,
            autorId: dto.autorId,
            metadata: { ubicacionEliminadaId: dto.ubicacionId },
          }),
        );

      // d. Soft-delete de todas las ubicaciones del árbol (raíz + descendientes)
      for (const ubicacion of todasLasUbicaciones) {
        await this.ubicacionRepo.delete(ubicacion.id);
      }

      // e. Registro de eventos en los tickets afectados (deduplicados)
      for (const operacion of operacionesARegistrar) {
        await this.operacionRepo.save(operacion);
      }
    });

    return Result.ok(undefined);
  }
}
