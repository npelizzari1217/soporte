import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { BaseTicketStateMachine } from '../../domain/state-machine/base-ticket-state-machine';
import { TicketEstadoCambiado } from '../../domain/events/ticket-estado-cambiado.event';
import { esEstadoNotificable } from '../../domain/policies/estados-notificables.policy';
import { maskEmailsInText } from '../../domain/mask-email-like';
import {
  EstadoCatalogoNoEncontradoError,
  FechaCierreRequeridaError,
  ObservacionNoPermitidaError,
  TicketNoEncontradoError,
  TipoOperacionNoEncontradoError,
  TransicionInvalidaError,
} from '../../domain/errors/tickets.errors';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
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
 *   Ignorada para otros destinos (SIN_SOLUCION usa now() servidor).
 *
 * Ref design: ADR-2, ADR-6, ADR-7
 * Ref tasks: P2.T6, P3.T7 — Change tickets-maquina-estados-observaciones
 */
export interface CrearObservacionDto {
  ticketId: string;
  texto: string;
  autorId: string;
  /**
   * UUID del tenant/cliente (del JWT, poblado por el controller — patrón
   * `CrearTicketDto.clienteId`, D5). Viaja en `TicketEstadoCambiado.tenantId`
   * cuando la observación dispara una auto-transición notificable.
   */
  clienteId: string;
  estadoDestinoCodigo?: 'EN_PROGRESO' | 'RESUELTO' | 'SUSPENDIDO' | 'SIN_SOLUCION';
  /** Requerido solo cuando estadoDestinoCodigo === 'RESUELTO'. Fecha de cierre del ticket. */
  fechaCierre?: Date;
}

/**
 * Datos mínimos del cambio de estado para publicar `TicketEstadoCambiado`
 * DESPUÉS de que la transacción resuelva (post-commit, design §6.B, D6).
 * Se arma DENTRO del callback del `txRunner.run` (donde `ticket`/`estadoActual`/
 * `estadoDestino` están en scope) pero NO se publica ahí — solo se retorna.
 */
interface CambioEstadoParaPublicar {
  estadoAnteriorId: string;
  estadoNuevoId: string;
  estadoAnteriorCodigo: string;
  estadoNuevoCodigo: string;
  solicitanteId: string;
  tipoId: string;
  numero: string;
  tituloTicket: string;
}

/** Shape de retorno interno del callback del `txRunner.run` (design §6.B). */
interface ExecuteTxOutcome {
  result: Result<TicketEntity, DomainError>;
  publicar: CambioEstadoParaPublicar | null;
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
 *    c. Si destino RESUELTO: validar fechaCierre presente → FechaCierreRequeridaError 422.
 *       Llamar ticket.setFechaCierre(dto.fechaCierre). (TODO-PR3: rename)
 *    d. Si destino SIN_SOLUCION: ticket.setFechaCierre(new Date()). (TODO-PR3: rename)
 *    e. Cargar estado destino desde catálogo → 500 si no existe.
 *    f. ticket.updateEstado(estadoDestino.id).
 *    g. Resolver tipoOperacionId de CAMBIO_ESTADO → 500 si no existe.
 *    h. Crear OperacionTicketEntity tipo CAMBIO_ESTADO.
 * 7. Persistir en la misma transacción:
 *    - Si auto-transición: ticketRepo.save + operacionRepo.save(obs) + operacionRepo.save(cambio)
 *    - Si no auto-transición: solo operacionRepo.save(obs)
 * 8. POST-COMMIT (PR4, design §6.B, D6, fuera del txRunner.run): si hubo
 *    auto-transición a un estado notificable, resuelve `tipoCodigo` vía
 *    `ITipoTicketRepository.findCodigoById` y publica `TicketEstadoCambiado`.
 *    NUNCA dentro de la transacción (R6/R10).
 * 9. Retorna Result.ok(ticket) (o el fail correspondiente).
 *
 * NOTA ADR-2: NO llama a TransicionarEstadoUseCase (evitar txRunner anidado no atómico).
 * La lógica de transición se reproduce inline dentro del mismo txRunner.run().
 *
 * Sin throw para errores de dominio esperados — todos retornan Result.fail().
 * Errores de infraestructura (DB) DENTRO de txRunner.run() sí burbujean como
 * throw para que la transacción rollback-ee (comportamiento nativo del
 * runner — no se toca acá). Errores de infraestructura POST-commit (el
 * lookup de `tipoCodigo` vía `tipoTicketRepo.findCodigoById` o el
 * `publisher.publish` del §8) son un caso DISTINTO: la tx ya resolvió y el
 * ticket + las operaciones YA están persistidos, así que un throw ahí nunca
 * puede "revertir" nada — solo tumbaría una respuesta que debería ser 200/201.
 * Por eso ese tramo se envuelve en try/catch (log-and-swallow, Judgment Day
 * PR4 Ronda 1): el error se loguea (vía el puerto `ILogger`, inyectado —
 * NUNCA `@nestjs/common` Logger directo en application/, clean-arch/SKILL.md;
 * fix de Judgment Day PR4 Ronda 2) y `execute()` retorna igual el
 * `Result.ok` ya obtenido del `txRunner.run`.
 *
 * Ref spec: Req Observaciones del técnico (tickets-core/spec.md), Requirement 3 (PR4)
 * Ref design: ADR-2, ADR-7, §6.B, D6
 * Ref tasks: P2.T6 — Change tickets-maquina-estados-observaciones / PR2; 4.6-4.8 (PR4)
 */
export class CrearObservacionUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly estadoRepo: IEstadoRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly txRunner: ITenantTransactionRunner,
    private readonly tipoTicketRepo: ITipoTicketRepository,
    private readonly publisher: IDomainEventPublisher,
    private readonly logger: ILogger,
  ) {}

  async execute(dto: CrearObservacionDto): Promise<Result<TicketEntity, DomainError>> {
    const outcome = await this.txRunner.run<ExecuteTxOutcome>(async () => {
      // 1. Cargar ticket → 404 si no existe (también cubre ticket de otro tenant)
      const ticket = await this.ticketRepo.findById(dto.ticketId);
      if (!ticket) {
        return { result: Result.fail(new TicketNoEncontradoError(dto.ticketId)), publicar: null };
      }

      // 2. Cargar estado actual desde el catálogo del tenant
      //    Null aquí indica corrupción de datos (estadoId del ticket no en catálogo) → 500
      const estadoActual = await this.estadoRepo.findById(ticket.estadoId);
      if (!estadoActual) {
        return {
          result: Result.fail(new EstadoCatalogoNoEncontradoError(ticket.estadoId)),
          publicar: null,
        };
      }

      // 3. Validar que el estado no sea terminal ni congelado
      if (TERMINAL_STATES_BLOCK_OBSERVACION.has(estadoActual.codigo)) {
        return {
          result: Result.fail(new ObservacionNoPermitidaError(estadoActual.codigo)),
          publicar: null,
        };
      }

      // 4. Resolver tipoOperacionId de OBSERVACION
      const tipoObservacionId = await this.tipoOperacionRepo.findIdByCodigo('OBSERVACION');
      if (!tipoObservacionId) {
        return {
          result: Result.fail(new TipoOperacionNoEncontradoError('OBSERVACION')),
          publicar: null,
        };
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
      let publicar: CambioEstadoParaPublicar | null = null;

      if (estadoActual.codigo === 'APROBADO') {
        // Resolver estado destino: default EN_PROGRESO si no se especifica
        const destino = dto.estadoDestinoCodigo ?? 'EN_PROGRESO';

        // Validar arco via BaseTicketStateMachine (sin factory — siempre base, ADR-2)
        const machine = new BaseTicketStateMachine();
        if (!machine.puedeTransicionar(estadoActual.codigo, destino, {})) {
          return {
            result: Result.fail(new TransicionInvalidaError(estadoActual.codigo, destino)),
            publicar: null,
          };
        }

        // Gestión de fechaCierre según estado destino (ADR-6, PR3):
        //   - RESUELTO: requerida del caller.
        //   - SIN_SOLUCION: now() servidor.
        //   - SUSPENDIDO / EN_PROGRESO: no modifican fechaCierre.
        if (destino === 'RESUELTO') {
          if (!dto.fechaCierre) {
            return { result: Result.fail(new FechaCierreRequeridaError()), publicar: null };
          }
          ticket.setFechaCierre(dto.fechaCierre);
        } else if (destino === 'SIN_SOLUCION') {
          ticket.setFechaCierre(new Date()); // now() servidor
        }
        // SUSPENDIDO y EN_PROGRESO: no modifican fechaCierre

        // Cargar estado destino del catálogo
        const estadoDestino = await this.estadoRepo.findByCodigo(destino);
        if (!estadoDestino) {
          // destino no existe en catálogo (seed incompleto) → 500
          return {
            result: Result.fail(new EstadoCatalogoNoEncontradoError(destino)),
            publicar: null,
          };
        }

        // Actualizar estadoId del ticket (mutación de entidad)
        ticket.updateEstado(estadoDestino.id);

        // Resolver tipoOperacionId de CAMBIO_ESTADO
        const tipoCambioEstadoId = await this.tipoOperacionRepo.findIdByCodigo('CAMBIO_ESTADO');
        if (!tipoCambioEstadoId) {
          return {
            result: Result.fail(new TipoOperacionNoEncontradoError('CAMBIO_ESTADO')),
            publicar: null,
          };
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

        // Datos para publicar POST-COMMIT (design §6.B) — solo se ARMAN acá,
        // donde ticket/estadoActual/estadoDestino están en scope. La
        // publicación real ocurre DESPUÉS de que txRunner.run() resuelva.
        publicar = {
          estadoAnteriorId: estadoActual.id,
          estadoNuevoId: estadoDestino.id,
          estadoAnteriorCodigo: estadoActual.codigo,
          estadoNuevoCodigo: estadoDestino.codigo,
          solicitanteId: ticket.solicitanteId,
          tipoId: ticket.tipoId,
          numero: ticket.numero,
          tituloTicket: ticket.titulo,
        };
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

      return { result: Result.ok(ticket), publicar };
    });

    // 8. POST-COMMIT (fuera de la tx, design §6.B/D6): publicar solo si hubo
    //    auto-transición a un estado notificable Y la transacción resolvió OK.
    //    Nunca dentro de txRunner.run() (R6/R10).
    const paraPublicar = outcome.publicar;
    if (
      paraPublicar &&
      outcome.result.isOk() &&
      esEstadoNotificable(paraPublicar.estadoNuevoCodigo)
    ) {
      // Guard defensivo (Judgment Day PR4 Ronda 1, CRITICAL): la tx YA
      // committeó acá — el ticket y las OperacionTicket ya están persistidos.
      // Si `findCodigoById` o `publisher.publish` rechazan/lanzan (DB caída,
      // timeout, pool agotado), NUNCA debe propagarse: el controller no tiene
      // catch genérico y un throw acá se traduciría en un 500 crudo pese a
      // que la operación ya fue exitosa — peor, un retry del cliente
      // duplicaría la OBSERVACION. Fire-and-forget real: se loguea y se
      // sigue, sin exponer datos sensibles (solo el mensaje del error).
      try {
        const tipoCodigo = await this.tipoTicketRepo.findCodigoById(paraPublicar.tipoId);
        if (tipoCodigo) {
          this.publisher.publish(
            new TicketEstadoCambiado(
              dto.ticketId,
              paraPublicar.numero,
              paraPublicar.tituloTicket,
              tipoCodigo,
              paraPublicar.estadoAnteriorId,
              paraPublicar.estadoNuevoId,
              paraPublicar.estadoAnteriorCodigo,
              paraPublicar.estadoNuevoCodigo,
              paraPublicar.solicitanteId,
              dto.autorId,
              dto.clienteId,
              new Date(),
            ),
          );
        }
      } catch (err) {
        // PII: el mensaje puede traer un email embebido (rechazo SMTP, error
        // de una capa inferior) — se enmascara con maskEmailsInText() antes
        // de loguearlo (mismo patrón que NotificarCambioEstadoListener,
        // Judgment Day PR3 Ronda 2 issue 3 Juez A). El stack SÍ se loguea
        // crudo: son frames de código, bajo riesgo de PII, y ayudan a
        // debuggear la causa real del fallo post-commit.
        const motivo = err instanceof Error ? maskEmailsInText(err.message) : 'Error desconocido';
        const stack = err instanceof Error ? err.stack : undefined;
        this.logger.error(
          `Fallo POST-commit al resolver/publicar TicketEstadoCambiado para el ticket ` +
            `"${dto.ticketId}": ${motivo}. La observación y el cambio de estado ya ` +
            `committeados NO se ven afectados.`,
          stack,
        );
      }
    }

    return outcome.result;
  }
}
