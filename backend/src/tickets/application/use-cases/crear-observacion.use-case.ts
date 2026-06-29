import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { BaseTicketStateMachine } from '../../domain/state-machine/base-ticket-state-machine';
import {
  EstadoCatalogoNoEncontradoError,
  FechaResolucionRequeridaError,
  ObservacionNoPermitidaError,
  TicketNoEncontradoError,
  TipoOperacionNoEncontradoError,
  TransicionInvalidaError,
} from '../../domain/errors/tickets.errors';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';

/**
 * Códigos de estado que bloquean la creación de observaciones.
 * Incluye los terminales activos y los congelados legacy.
 *
 * Ref spec: Scenario "Observación bloqueada en estado terminal" (tickets-core/spec.md)
 * Ref design: ADR-2
 */
const TERMINAL_STATES_BLOCK_OBSERVACION = new Set<string>([
  'RESUELTO',
  'SIN_SOLUCION',
  'RECHAZADO', // terminales activos
  'CERRADO',
  'CANCELADO',
  'PENDIENTE_APROBACION', // congelados legacy
]);

/**
 * DTO de entrada para crear una observación técnica sobre un ticket.
 *
 * - `ticketId`: UUID del ticket al que se añade la observación.
 * - `texto`: contenido de la observación (no vacío).
 * - `autorId`: UUID del usuario que registra la observación (del JWT).
 * - `estadoDestinoCodigo`: si el ticket está en APROBADO, disparará auto-transición
 *   al estado indicado. Default EN_PROGRESO cuando se omite. Ignorado si el ticket
 *   no está en APROBADO. Valores válidos: EN_PROGRESO, RESUELTO, SUSPENDIDO, SIN_SOLUCION.
 * - `fechaCierre`: REQUERIDA cuando estadoDestinoCodigo === 'RESUELTO'.
 *   Ignorada para otros destinos. (TODO-PR3: rename a fecha_cierre en entidad)
 *
 * Ref design: ADR-2, ADR-7
 * Ref tasks: P2.T6 — Change tickets-maquina-estados-observaciones / PR2
 */
export interface CrearObservacionDto {
  ticketId: string;
  texto: string;
  autorId: string;
  estadoDestinoCodigo?: 'EN_PROGRESO' | 'RESUELTO' | 'SUSPENDIDO' | 'SIN_SOLUCION';
  /**
   * Requerido solo cuando estadoDestinoCodigo === 'RESUELTO'.
   * TODO-PR3: rename a fechaCierre cuando TicketEntity.setFechaResolucion → setFechaCierre.
   */
  fechaCierre?: Date;
}

/**
 * CrearObservacionUseCase — caso de uso para registrar una observación técnica.
 *
 * Flujo (toda la operación dentro de una sola transacción vía ITenantTransactionRunner):
 * 1. Cargar el ticket por id → 404 si no existe.
 * 2. Cargar estado actual del ticket → 500 si no está en catálogo (corrupción).
 * 3. Validar que el estado no sea terminal → ObservacionNoPermitidaError 422 si lo es.
 * 4. Resolver tipoOperacionId de OBSERVACION → 500 si no existe (catálogo no sembrado).
 * 5. Crear OperacionTicketEntity tipo OBSERVACION (estadoAnteriorId/NuevoId null).
 * 6. Si el estado actual es APROBADO:
 *    a. Resolver estado destino (default EN_PROGRESO si no se indica).
 *    b. Validar arco via BaseTicketStateMachine → TransicionInvalidaError 422 si inválido.
 *    c. Si destino RESUELTO: validar fechaCierre presente → FechaResolucionRequeridaError 422.
 *       Llamar ticket.setFechaResolucion(dto.fechaCierre). (TODO-PR3: rename)
 *    d. Si destino SIN_SOLUCION: ticket.setFechaResolucion(new Date()). (TODO-PR3: rename)
 *    e. Cargar estado destino desde catálogo → 500 si no existe.
 *    f. ticket.updateEstado(estadoDestino.id).
 *    g. Resolver tipoOperacionId de CAMBIO_ESTADO → 500 si no existe.
 *    h. Crear OperacionTicketEntity tipo CAMBIO_ESTADO.
 * 7. Persistir en la misma transacción:
 *    - Si auto-transición: ticketRepo.save + operacionRepo.save(obs) + operacionRepo.save(cambio)
 *    - Si no auto-transición: solo operacionRepo.save(obs)
 * 8. Retorna Result.ok(ticket).
 *
 * NOTA ADR-2: NO llama a TransicionarEstadoUseCase (evitar txRunner anidado no atómico).
 * La lógica de transición se reproduce inline dentro del mismo txRunner.run().
 *
 * Sin throw para errores de dominio esperados — todos retornan Result.fail().
 * Errores de infraestructura (DB) sí burbujean como throw para rollback de transacción.
 *
 * Ref spec: Req Observaciones del técnico (tickets-core/spec.md)
 * Ref design: ADR-2, ADR-7
 * Ref tasks: P2.T6 — Change tickets-maquina-estados-observaciones / PR2
 */
export class CrearObservacionUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly estadoRepo: IEstadoRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: CrearObservacionDto): Promise<Result<TicketEntity, DomainError>> {
    return this.txRunner.run(async () => {
      // 1. Cargar ticket → 404 si no existe (también cubre ticket de otro tenant)
      const ticket = await this.ticketRepo.findById(dto.ticketId);
      if (!ticket) {
        return Result.fail(new TicketNoEncontradoError(dto.ticketId));
      }

      // 2. Cargar estado actual desde el catálogo del tenant
      //    Null aquí indica corrupción de datos (estadoId del ticket no en catálogo) → 500
      const estadoActual = await this.estadoRepo.findById(ticket.estadoId);
      if (!estadoActual) {
        return Result.fail(new EstadoCatalogoNoEncontradoError(ticket.estadoId));
      }

      // 3. Validar que el estado no sea terminal ni congelado
      if (TERMINAL_STATES_BLOCK_OBSERVACION.has(estadoActual.codigo)) {
        return Result.fail(new ObservacionNoPermitidaError(estadoActual.codigo));
      }

      // 4. Resolver tipoOperacionId de OBSERVACION
      const tipoObservacionId = await this.tipoOperacionRepo.findIdByCodigo('OBSERVACION');
      if (!tipoObservacionId) {
        return Result.fail(new TipoOperacionNoEncontradoError('OBSERVACION'));
      }

      // 5. Crear OperacionTicketEntity tipo OBSERVACION
      //    estadoAnteriorId/estadoNuevoId = null (no es un cambio de estado en sí)
      const observacion = OperacionTicketEntity.create({
        ticketId: ticket.id,
        tipoOperacionId: tipoObservacionId,
        descripcion: dto.texto,
        estadoAnteriorId: null,
        estadoNuevoId: null,
        autorId: dto.autorId,
        metadata: null,
      });

      // 6. Auto-transición desde APROBADO (ADR-2)
      let cambioEstado: OperacionTicketEntity | null = null;

      if (estadoActual.codigo === 'APROBADO') {
        // Resolver estado destino: default EN_PROGRESO si no se especifica
        const destino = dto.estadoDestinoCodigo ?? 'EN_PROGRESO';

        // Validar arco via BaseTicketStateMachine (sin factory — siempre base, ADR-2)
        const machine = new BaseTicketStateMachine();
        if (!machine.puedeTransicionar(estadoActual.codigo, destino, {})) {
          return Result.fail(new TransicionInvalidaError(estadoActual.codigo, destino));
        }

        // Gestión de fecha de cierre según estado destino (provisional hasta PR3)
        if (destino === 'RESUELTO') {
          // fechaCierre REQUERIDA del caller cuando destino es RESUELTO
          if (!dto.fechaCierre) {
            return Result.fail(new FechaResolucionRequeridaError());
          }
          // TODO-PR3: rename ticket.setFechaResolucion → ticket.setFechaCierre
          ticket.setFechaResolucion(dto.fechaCierre);
        } else if (destino === 'SIN_SOLUCION') {
          // now() servidor para SIN_SOLUCION
          // TODO-PR3: rename ticket.setFechaResolucion → ticket.setFechaCierre
          ticket.setFechaResolucion(new Date());
        }
        // SUSPENDIDO y EN_PROGRESO: no modifican fechaResolucion

        // Cargar estado destino del catálogo
        const estadoDestino = await this.estadoRepo.findByCodigo(destino);
        if (!estadoDestino) {
          // destino no existe en catálogo (seed incompleto) → 500
          return Result.fail(new EstadoCatalogoNoEncontradoError(destino));
        }

        // Actualizar estadoId del ticket (mutación de entidad)
        ticket.updateEstado(estadoDestino.id);

        // Resolver tipoOperacionId de CAMBIO_ESTADO
        const tipoCambioEstadoId = await this.tipoOperacionRepo.findIdByCodigo('CAMBIO_ESTADO');
        if (!tipoCambioEstadoId) {
          return Result.fail(new TipoOperacionNoEncontradoError('CAMBIO_ESTADO'));
        }

        // Crear OperacionTicketEntity tipo CAMBIO_ESTADO
        cambioEstado = OperacionTicketEntity.create({
          ticketId: ticket.id,
          tipoOperacionId: tipoCambioEstadoId,
          descripcion: null,
          estadoAnteriorId: estadoActual.id,
          estadoNuevoId: estadoDestino.id,
          autorId: dto.autorId,
          metadata: null,
        });
      }

      // 7. Persistir dentro de la misma transacción (atómico)
      //    Si cambioEstado existe: ticketRepo.save + obs + cambioEstado
      //    Si no: solo obs (ticket permanece sin cambios)
      if (cambioEstado) {
        await this.ticketRepo.save(ticket);
      }
      await this.operacionRepo.save(observacion);
      if (cambioEstado) {
        await this.operacionRepo.save(cambioEstado);
      }

      return Result.ok(ticket);
    });
  }
}
