import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TicketCreadoEvent } from '../../domain/events/ticket-creado.event';
import { TicketAsignadoEvent } from '../../domain/events/ticket-asignado.event';
import { NumeradorTicket } from '../../domain/services/numerador-ticket.service';
import { ResolverCicloActivoParaCreacion } from '../services/resolver-ciclo-activo.service';
import { ResolverAsignacionAutomatica } from '../services/resolver-asignacion-automatica.service';
import { operacionesDeApertura } from '../services/operaciones-apertura';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { IPrioridadRepository } from '../../domain/ports/i-prioridad.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';
import {
  SolicitanteInvalidoError,
  TipoTicketNoEncontradoError,
  PrioridadNoEncontradaError,
  TicketReferenciaInvalidaError,
} from '../../domain/errors/tickets.errors';

/**
 * DTO de entrada de `CrearTicketUseCase`.
 *
 * - `solicitanteId`/`autorId`: ambos son el `sub` del JWT (T4 — "solicitante
 *   = autor del token"); se mantienen separados en el DTO porque
 *   conceptualmente son roles distintos (quién pide vs. quién audita).
 * - `clienteId`: `cliente_id` del JWT — usado SOLO para la validación
 *   cross-DB del solicitante (`IUsuarioMasterChecker`); NUNCA determina el
 *   tenant de persistencia (eso ya lo resolvió `TenantContext`/`TenantGuard`).
 * - `anio`: resuelto por el controller (server-side, nunca por el cliente
 *   HTTP) — año en curso para el numerador (T5).
 *
 * Ref design: "Firmas TS clave" (CrearTicketDto).
 */
export interface CrearTicketDto {
  titulo: string;
  descripcion?: string | null;
  tipoId: string;
  prioridadId: string;
  ticketReferenciaId?: string | null;
  solicitanteId: string;
  clienteId: string;
  autorId: string;
  anio: number;
}

/**
 * CrearTicketUseCase — creación de un ticket nuevo (T4, T5, T11).
 *
 * Flujo:
 * 1. Valida que el solicitante exista en el tenant (`IUsuarioMasterChecker`).
 * 2. Resuelve el ciclo ACTIVO del tenant (nunca lo decide el caller, T4).
 * 3. Valida que `tipoId` exista en el catálogo del tenant (T4).
 * 4. Valida que `prioridadId` exista en el catálogo del tenant (T4).
 * 5. Si viene `ticketReferenciaId`, valida que exista en el mismo tenant (T11).
 * 6. Resuelve el estado NUEVO y el tipo de operación CAMBIO_ESTADO (catálogos
 *    FIJOS garantizados por el seed de provisioning, ADR-1 — su ausencia es
 *    un fallo de infraestructura, no un error esperado del caller: `throw`).
 *    Y, en la misma fase de solo lectura, la regla de asignación automática
 *    del tipo (`ResolverAsignacionAutomatica`): nunca hace fallar el alta; si
 *    asigna, el ticket nace ASIGNADO con su responsable (ADR-2/ADR-3).
 * 7. **DENTRO de la transacción** (`ITenantTransactionRunner.run`, requisito
 *    de ADR-5): genera el `numero` (`NumeradorTicket.generarNumero`, que
 *    internamente adquiere el advisory lock vía `findLastSecuencia`), crea
 *    `TicketEntity` + `OperacionTicketEntity` de apertura, y persiste ambas.
 *    El advisory lock SOLO serializa la sección crítica si `findLastSecuencia`
 *    y `save()` corren en la MISMA transacción — por eso todo el paso 7 vive
 *    dentro de `txRunner.run(...)`, a diferencia de las validaciones 1-6 que
 *    son de solo lectura y corren ANTES (fail-fast, sin pagar el costo del
 *    lock en requests inválidos).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/tickets-core/spec T4, T5, T11. Ref design: ADR-4, ADR-5,
 * ADR-8. Tarea: T6.1, T6.2.
 */
export class CrearTicketUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly estadoRepo: IEstadoRepository,
    private readonly tipoTicketRepo: ITipoTicketRepository,
    private readonly prioridadRepo: IPrioridadRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly usuarioMasterChecker: IUsuarioMasterChecker,
    private readonly numerador: Pick<NumeradorTicket, 'generarNumero'>,
    private readonly resolverCicloActivo: Pick<ResolverCicloActivoParaCreacion, 'resolver'>,
    private readonly resolverAsignacion: Pick<ResolverAsignacionAutomatica, 'resolver'>,
    private readonly eventPublisher: IDomainEventPublisher,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: CrearTicketDto): Promise<Result<TicketEntity, DomainError>> {
    // 1. Solicitante válido en el tenant (cross-DB, master.usuarios).
    const solicitanteValido = await this.usuarioMasterChecker.existeEnTenant(
      dto.solicitanteId,
      dto.clienteId,
    );
    if (!solicitanteValido) {
      return Result.fail(new SolicitanteInvalidoError(dto.solicitanteId));
    }

    // 2. Ciclo ACTIVO del tenant — el servidor lo determina, nunca el cliente.
    const cicloResult = await this.resolverCicloActivo.resolver();
    if (cicloResult.isFail()) {
      return Result.fail(cicloResult.getError());
    }
    const cicloActivo = cicloResult.getValue();

    // 3. tipoId debe existir en el catálogo del tenant (T4).
    const tipoTicket = await this.tipoTicketRepo.findById(dto.tipoId);
    if (!tipoTicket) {
      return Result.fail(new TipoTicketNoEncontradoError(dto.tipoId));
    }

    // 4. prioridadId debe existir en el catálogo del tenant (T4).
    const prioridad = await this.prioridadRepo.findById(dto.prioridadId);
    if (!prioridad) {
      return Result.fail(new PrioridadNoEncontradaError(dto.prioridadId));
    }

    // 5. ticketReferenciaId opcional ("continúa de #X") debe existir en el
    //    mismo tenant — un ticket soft-deleted se trata como inexistente,
    //    igual que en `ObtenerTicketUseCase` (T11).
    if (dto.ticketReferenciaId) {
      const referenciado = await this.ticketRepo.findById(dto.ticketReferenciaId);
      if (!referenciado || referenciado.isDeleted()) {
        return Result.fail(new TicketReferenciaInvalidaError(dto.ticketReferenciaId));
      }
    }

    // 6. Catálogos FIJOS garantizados por el seed (ADR-1) — su ausencia es
    //    un bug de infraestructura, no un error del caller: throw defensivo.
    const estadoNuevoId = await this.estadoRepo.findIdByCodigo('NUEVO');
    if (!estadoNuevoId) {
      throw new Error(
        'Catálogo de estados inconsistente: no existe el estado "NUEVO" en el tenant activo.',
      );
    }
    const tipoOperacionAperturaId = await this.tipoOperacionRepo.findIdByCodigo('CAMBIO_ESTADO');
    if (!tipoOperacionAperturaId) {
      throw new Error(
        'Catálogo de tipo_operacion inconsistente: no existe "CAMBIO_ESTADO" en el tenant activo.',
      );
    }

    // 6b. Regla de asignación del tipo (ADR-2): sin regla o regla rota → null y el alta sigue
    //     como siempre. Un fallo de consulta del tenant se propaga (ver el resolver).
    const asignacion = await this.resolverAsignacion.resolver(tipoTicket, dto.clienteId);
    const estadoInicialId = asignacion?.estadoAsignadoId ?? estadoNuevoId;

    // 7. Sección crítica: numeración (advisory lock, ADR-5) + persistencia,
    //    atómica en la MISMA transacción.
    const resultado = await this.txRunner.run(async () => {
      const numeroResult = await this.numerador.generarNumero(
        dto.tipoId,
        tipoTicket.codigo,
        dto.anio,
      );
      if (numeroResult.isFail()) {
        return Result.fail<TicketEntity, DomainError>(numeroResult.getError());
      }

      const ticket = TicketEntity.create({
        numero: numeroResult.getValue(),
        titulo: dto.titulo,
        descripcion: dto.descripcion ?? null,
        tipoId: dto.tipoId,
        estadoId: estadoInicialId,
        prioridadId: dto.prioridadId,
        cicloId: cicloActivo.id,
        ticketReferenciaId: dto.ticketReferenciaId ?? null,
        solicitanteId: dto.solicitanteId,
      });

      // La regla asigna ANTES del primer `save()` (ADR-3): el ticket nace ASIGNADO.
      if (asignacion) ticket.assignTo(asignacion.asignadoId);

      const operaciones = operacionesDeApertura({
        ticketId: ticket.id,
        tipoId: dto.tipoId,
        estadoInicialId,
        tipoOperacionAperturaId,
        autorId: dto.autorId,
        asignacion,
      });

      await this.ticketRepo.save(ticket);
      for (const operacion of operaciones) {
        await this.operacionRepo.save(operacion);
      }

      return Result.ok<TicketEntity, DomainError>(ticket);
    });

    // 8. DIFERIDO A POST-COMMIT vía `txRunner.alCommitear()` (Fase 4, S2 —
    // GATE G3, aditivo; corregido en sdd/preventivo WU-5 por el defecto de
    // re-entrancia): publica TicketCreadoEvent para que el módulo SLA calcule
    // sla_vence_at (AplicarSlaUseCase). No se publica directo acá porque este
    // punto del código NO es post-commit real cuando `this.txRunner` corre
    // RE-ENTRANTE, anidado dentro de la transacción de OTRO caller (ej.
    // GenerarPreventivosUseCase, ADR-PV5): `txRunner.run()` re-entrante
    // participa de esa transacción externa en vez de comitear, así que
    // publicar acá saldría con la transacción todavía abierta. `alCommitear()`
    // encola en la transacción MÁS EXTERNA sin importar el nivel de
    // anidamiento; bajo HTTP (sin anidamiento) el efecto observable es
    // idéntico al de antes: corre apenas comitea. Mismo criterio ADR-6 que
    // TransicionarEstadoUseCase/CrearComentarioUseCase: log-and-swallow — un
    // fallo del publisher NUNCA revierte la creación ya committeada. El
    // log-and-swallow ya no lo hace este use case: `PrismaTenantTransactionRunner`
    // envuelve cada callback de `alCommitear()` en su propio try/catch y
    // loguea (mensaje enmascarado) si el publisher falla, así que el
    // callback publica directo, sin try/catch propio.
    if (resultado.isOk()) {
      const ticket = resultado.getValue();
      this.txRunner.alCommitear(() => {
        this.eventPublisher.publish(
          new TicketCreadoEvent({
            ticketId: ticket.id,
            prioridadId: dto.prioridadId,
          }),
        );
      });
      // N1: `ticket.asignado` solo si la regla asignó, después de `ticket.creado`, y también por
      // `alCommitear`: un ROLLBACK del plan (preventivo) no deja ningún evento de un ticket inexistente.
      if (asignacion) {
        this.txRunner.alCommitear(() => {
          this.eventPublisher.publish(
            new TicketAsignadoEvent({
              ticketId: ticket.id,
              asignadoId: asignacion.asignadoId,
              origen: 'REGLA_TIPO',
              autorId: null,
            }),
          );
        });
      }
    }

    return resultado;
  }
}
