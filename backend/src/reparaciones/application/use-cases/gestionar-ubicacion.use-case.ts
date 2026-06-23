import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { TipoOperacionNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { UbicacionEntity } from '../../domain/entities/ubicacion.entity';
import { IUbicacionRepository } from '../../domain/ports/i-ubicacion.repository';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { PadreUbicacionEliminadoError, UbicacionInvalidaError } from '../../domain/errors/reparaciones.errors';

/**
 * DTO para crear una nueva ubicación física.
 */
export interface CrearUbicacionDto {
  /** Nombre del espacio físico. */
  nombre: string;
  /** Descripción adicional (opcional). */
  descripcion?: string | null;
  /** UUID del nodo padre (null = nodo raíz). */
  padreId?: string | null;
}

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
 * GestionarUbicacionUseCase — gestiona la creación y baja lógica de ubicaciones físicas.
 *
 * === crear(dto) ===
 * Flujo:
 * 1. Si padreId provisto: valida que el padre existe y no fue eliminado (PadreUbicacionEliminadoError).
 * 2. Crea la UbicacionEntity (activo=true, UUIDv7).
 * 3. Persiste en la misma transacción.
 * 4. Retorna Result.ok(ubicacion).
 *
 * === eliminar(dto) ===
 * Flujo:
 * 1. Carga la ubicación a eliminar → UbicacionInvalidaError si no existe.
 * 2. Recolecta TODOS los descendientes (BFS via findByPadreId — cascada lógica).
 * 3. Para cada ubicación en el árbol (padre + todos los hijos): busca los tickets afectados.
 * 4. Resuelve el tipo de operación COMENTARIO.
 * 5. Dentro de la transacción:
 *    a. Soft-deleta todas las ubicaciones del árbol.
 *    b. Para cada ticket afectado: crea y persiste una OperacionTicket COMENTARIO.
 * 6. Retorna Result.ok(void).
 *
 * Cascada lógica: la baja se propaga solo en la capa de aplicación (NOT triggers DB).
 * El registro de eventos en tickets afectados es best-effort dentro de la misma tx.
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:reparaciones/Ubicaciones jerárquicas, Soft delete cascada]
 * Tarea: 5.B.7 / 5.B.8
 */
export class GestionarUbicacionUseCase {
  constructor(
    private readonly ubicacionRepo: IUbicacionRepository,
    private readonly ticketEdiliciaRepo: ITicketEdiliciaRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  /**
   * Crea una nueva ubicación física.
   *
   * Si se provee padreId, valida que el padre exista y no esté eliminado.
   * Los nodos raíz (sin padreId) no requieren validación.
   */
  async crear(dto: CrearUbicacionDto): Promise<Result<UbicacionEntity, DomainError>> {
    // 1. Validar el padre si se proveyó
    if (dto.padreId) {
      const padre = await this.ubicacionRepo.findById(dto.padreId);
      if (!padre || padre.isDeleted()) {
        return Result.fail(new PadreUbicacionEliminadoError(dto.padreId));
      }
    }

    // 2. Crear la entidad (activo=true por defecto, UUIDv7 generado por BaseEntity)
    const ubicacion = UbicacionEntity.create({
      nombre: dto.nombre,
      descripcion: dto.descripcion ?? null,
      padreId: dto.padreId ?? null,
    });

    // 3. Persistir en transacción
    await this.txRunner.run(async () => {
      await this.ubicacionRepo.save(ubicacion);
    });

    return Result.ok(ubicacion);
  }

  /**
   * Elimina lógicamente una ubicación y todos sus descendientes (cascada BFS).
   *
   * Para cada ubicación del árbol eliminado, registra una operación COMENTARIO
   * en los tickets edilicios que la referencian.
   */
  async eliminar(dto: EliminarUbicacionDto): Promise<Result<void, DomainError>> {
    // 1. Cargar la ubicación raíz a eliminar
    const ubicacionRaiz = await this.ubicacionRepo.findById(dto.ubicacionId);
    if (!ubicacionRaiz || ubicacionRaiz.isDeleted()) {
      return Result.fail(new UbicacionInvalidaError(dto.ubicacionId));
    }

    // 2. Recolectar TODOS los descendientes via BFS (cascada lógica)
    const todasLasUbicaciones: UbicacionEntity[] = [ubicacionRaiz];
    const cola: UbicacionEntity[] = [ubicacionRaiz];

    while (cola.length > 0) {
      const actual = cola.shift()!;
      const hijos = await this.ubicacionRepo.findByPadreId(actual.id);
      for (const hijo of hijos) {
        todasLasUbicaciones.push(hijo);
        cola.push(hijo);
      }
    }

    // 3. Recolectar tickets afectados por cada ubicación del árbol
    //    Necesitamos el tipoOperacion antes de entrar en la tx (read-only query)
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('COMENTARIO');
    if (!tipoOperacionId) {
      return Result.fail(new TipoOperacionNoEncontradoError('COMENTARIO'));
    }

    const ticketsAfectados = await Promise.all(
      todasLasUbicaciones.map((ub) =>
        this.ticketEdiliciaRepo.findByUbicacionId(ub.id),
      ),
    );

    // Aplanar y deduplicar por ticketId (un ticket no puede aparecer dos veces)
    const ticketIdVistos = new Set<string>();
    const operacionesARegistrar = ticketsAfectados
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

    // 4. Persistir todo dentro de la misma transacción (atómico)
    await this.txRunner.run(async () => {
      // a. Soft-delete de todas las ubicaciones del árbol
      for (const ubicacion of todasLasUbicaciones) {
        await this.ubicacionRepo.delete(ubicacion.id);
      }
      // b. Registro de eventos en los tickets afectados
      for (const operacion of operacionesARegistrar) {
        await this.operacionRepo.save(operacion);
      }
    });

    return Result.ok(undefined);
  }
}
