import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketCreadoEvent } from '../../../tickets/domain/events/ticket-creado.event';
import { TicketAsignadoEvent } from '../../../tickets/domain/events/ticket-asignado.event';
import { NumeradorTicket } from '../../../tickets/domain/services/numerador-ticket.service';
import { ResolverCicloActivoParaCreacion } from '../../../tickets/application/services/resolver-ciclo-activo.service';
import { ResolverAsignacionAutomatica } from '../../../tickets/application/services/resolver-asignacion-automatica.service';
import { operacionesDeApertura } from '../../../tickets/application/services/operaciones-apertura';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../../tickets/domain/ports/i-estado.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { SolicitanteInvalidoError } from '../../../tickets/domain/errors/tickets.errors';
import { TicketSoporteEntity } from '../../domain/entities/ticket-soporte.entity';
import { ITicketSoporteRepository } from '../../domain/ports/i-ticket-soporte.repository';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { EquipoInvalidoError } from '../../domain/errors/equipos.errors';

/** Código fijo del tipo de ticket resuelto por este use case (F3-Q4). */
const TIPO_CODIGO_SOPORTE = 'SOPORTE';

/**
 * DTO de entrada de `CrearTicketSoporteUseCase`.
 *
 * NO recibe `tipoId` (mismo criterio que `CrearTicketCompraDto`/
 * `CrearTicketEdilicioDto`): el tipo se resuelve internamente por código
 * ('SOPORTE', catálogo FIJO sembrado en Fase 1). `equipoId` es OPCIONAL
 * (F3-Q4): `null`/ausente = ticket de soporte sin equipo asociado (ej. red,
 * accesos).
 *
 * Ref design: "Firmas TS clave" (CrearTicketSoporteDto).
 */
export interface CrearTicketSoporteDto {
  titulo: string;
  descripcion?: string | null;
  prioridadId: string;
  equipoId?: string | null;
  descripcionProblema?: string | null;
  /** Exactamente uno de `solicitanteId` y `solicitanteExternoId` (espeja el CHECK de `tickets`). */
  solicitanteId?: string | null;
  /** Solicitante externo del formulario público (ya persistido en el tenant). */
  solicitanteExternoId?: string | null;
  /**
   * Qué hacer si `equipoId` no existe, está de baja o eliminado una vez tomado el lock.
   * `RECHAZAR` (default): falla con `EquipoInvalidoError`. `OMITIR`: crea el ticket sin equipo.
   * Lo usa el formulario público, donde el QR pudo quedar viejo entre la apertura y la confirmación.
   */
  equipoInvalido?: 'RECHAZAR' | 'OMITIR';
  clienteId: string;
  autorId: string;
  anio: number;
}

/**
 * CrearTicketSoporteUseCase — creación atómica de un ticket de soporte IT
 * (F3-Q4, ADR-3).
 *
 * Extiende el patrón de `CrearTicketCompraUseCase`/`CrearTicketEdilicioUseCase`
 * agregando la validación OPCIONAL de `equipoId`:
 * 1. Valida que el solicitante exista en el tenant (`IUsuarioMasterChecker`).
 * 2. Resuelve el ciclo ACTIVO del tenant.
 * 3. **DENTRO de la transacción**, si `equipoId` fue provisto: toma el LE
 *    `FOR SHARE` del equipo (antes del advisory de numeración) y valida que exista, esté `activo` y no
 *    eliminado — `Result.fail(EquipoInvalidoError)` si no. Si es `null`/
 *    ausente, el ticket se crea igual (F3-Q4, soporte de red/accesos sin
 *    equipo) — SIN consultar el repo de equipos.
 * 4. Resuelve el tipo SOPORTE por código (catálogo FIJO — su ausencia es un
 *    fallo de infraestructura, `throw` defensivo).
 * 5. Resuelve el estado NUEVO y el tipo de operación CAMBIO_ESTADO.
 * 6. **DENTRO de la transacción**: genera el `numero` (prefijo SOP, ADR-4),
 *    crea `TicketEntity` + `OperacionTicketEntity` de apertura +
 *    `TicketSoporteEntity` satélite, y persiste las 3 entidades.
 * 7. **POST-COMMIT** (`txRunner.alCommitear`, mismo criterio que
 *    `CrearTicketUseCase` — GATE G3/defecto #244): publica `TicketCreadoEvent`
 *    para que `AplicarSlaListener` calcule `sla_vence_at`. Un ticket de
 *    soporte es un ticket como cualquier otro a efectos de SLA; antes de
 *    este fix nunca se publicaba el evento y `sla_vence_at` quedaba `null`
 *    siempre.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q4. Ref design: ADR-3, ADR-4.
 * Tarea: T13.1, T13.2. Defecto: #244.
 */
export class CrearTicketSoporteUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'save'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly ticketSoporteRepo: Pick<ITicketSoporteRepository, 'save'>,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findIdByCodigo'>,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findByCodigo'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'existeEnTenant'>,
    private readonly numerador: Pick<NumeradorTicket, 'generarNumero'>,
    private readonly resolverCicloActivo: Pick<ResolverCicloActivoParaCreacion, 'resolver'>,
    private readonly resolverAsignacion: Pick<ResolverAsignacionAutomatica, 'resolver'>,
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'bloquearParaOperarPiezas'>,
    private readonly eventPublisher: IDomainEventPublisher,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(
    dto: CrearTicketSoporteDto,
  ): Promise<Result<{ ticket: TicketEntity; ticketSoporte: TicketSoporteEntity }, DomainError>> {
    // 1. Exactamente un origen: usuario de master o solicitante externo. Que falten los dos o
    //    lleguen los dos es un error de programación del caller (el CHECK de `tickets` lo rechazaría).
    const solicitanteId = dto.solicitanteId ?? null;
    const solicitanteExternoId = dto.solicitanteExternoId ?? null;
    if ((solicitanteId === null) === (solicitanteExternoId === null)) {
      throw new Error(
        'CrearTicketSoporteUseCase: exactamente uno de solicitanteId y solicitanteExternoId debe estar presente.',
      );
    }

    // Solicitante válido en el tenant (cross-DB, master.usuarios). El externo no pasa por acá:
    // lo respalda la FK de `tickets.solicitante_externo_id`.
    if (solicitanteId !== null) {
      const solicitanteValido = await this.usuarioMasterChecker.existeEnTenant(
        solicitanteId,
        dto.clienteId,
      );
      if (!solicitanteValido) {
        return Result.fail(new SolicitanteInvalidoError(solicitanteId));
      }
    }

    // 2. Ciclo ACTIVO del tenant — el servidor lo determina, nunca el cliente.
    const cicloResult = await this.resolverCicloActivo.resolver();
    if (cicloResult.isFail()) {
      return Result.fail(cicloResult.getError());
    }
    const cicloActivo = cicloResult.getValue();

    // 4-5. Catálogos FIJOS garantizados por el seed (Fase 1) — su ausencia
    //    es un bug de infraestructura, no un error del caller: throw defensivo.
    const tipoSoporte = await this.tipoTicketRepo.findByCodigo(TIPO_CODIGO_SOPORTE);
    if (!tipoSoporte) {
      throw new Error(
        `Catálogo de tipos de ticket inconsistente: no existe el tipo "${TIPO_CODIGO_SOPORTE}" en el tenant activo.`,
      );
    }
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

    // Regla de asignación del tipo: sin regla o regla rota → null y el alta sigue como siempre;
    // un fallo de consulta del tenant se propaga (ver el resolver). Resuelve fuera de la tx.
    const asignacion = await this.resolverAsignacion.resolver(tipoSoporte, dto.clienteId);
    const estadoInicialId = asignacion?.estadoAsignadoId ?? estadoNuevoId;

    // 6. Sección crítica: numeración (advisory lock, ADR-5 Fase 2) +
    //    persistencia atómica de ticket + operación + satélite.
    const resultado = await this.txRunner.run(async () => {
      // 3. equipoId OPCIONAL (F3-Q4): solo se valida si fue provisto. LE `FOR SHARE` del equipo
      //    (ADR-2/S5): primer lock de la transacción, ANTES del advisory de numeración. Así un
      //    ticket nunca queda asociado a un equipo cuya baja comiteó entre la validación y el
      //    alta. Falla sin escribir, así que devolver el `Result.fail` es seguro.
      //    Con `equipoInvalido: 'OMITIR'` un equipo inválido no falla: el ticket nace sin equipo.
      let equipoId = dto.equipoId ?? null;
      if (equipoId) {
        const equipo = await this.equipoRepo.bloquearParaOperarPiezas(equipoId);
        if (!equipo || !equipo.activo || equipo.isDeleted()) {
          if (dto.equipoInvalido !== 'OMITIR') {
            return Result.fail<
              { ticket: TicketEntity; ticketSoporte: TicketSoporteEntity },
              DomainError
            >(new EquipoInvalidoError(equipoId));
          }
          equipoId = null;
        }
      }

      const numeroResult = await this.numerador.generarNumero(
        tipoSoporte.id,
        tipoSoporte.codigo,
        dto.anio,
      );
      if (numeroResult.isFail()) {
        return Result.fail<
          { ticket: TicketEntity; ticketSoporte: TicketSoporteEntity },
          DomainError
        >(numeroResult.getError());
      }

      const ticket = TicketEntity.create({
        numero: numeroResult.getValue(),
        titulo: dto.titulo,
        descripcion: dto.descripcion ?? null,
        tipoId: tipoSoporte.id,
        estadoId: estadoInicialId,
        prioridadId: dto.prioridadId,
        cicloId: cicloActivo.id,
        ticketReferenciaId: null,
        solicitanteId,
        solicitanteExternoId,
      });

      // La regla asigna ANTES del primer `save()`: el ticket nace ASIGNADO.
      if (asignacion) ticket.assignTo(asignacion.asignadoId);

      // La apertura conserva el autor del dto; la ASIGNACION es de AUTOR_SISTEMA.
      const operaciones = operacionesDeApertura({
        ticketId: ticket.id,
        tipoId: tipoSoporte.id,
        estadoInicialId,
        tipoOperacionAperturaId,
        autorId: dto.autorId,
        asignacion,
      });

      const ticketSoporte = TicketSoporteEntity.create({
        ticketId: ticket.id,
        equipoId,
        descripcionProblema: dto.descripcionProblema ?? null,
      });

      await this.ticketRepo.save(ticket);
      for (const operacion of operaciones) {
        await this.operacionRepo.save(operacion);
      }
      await this.ticketSoporteRepo.save(ticketSoporte);

      return Result.ok<{ ticket: TicketEntity; ticketSoporte: TicketSoporteEntity }, DomainError>({
        ticket,
        ticketSoporte,
      });
    });

    // 7. DIFERIDO A POST-COMMIT vía `txRunner.alCommitear()` — mismo criterio
    // que `CrearTicketUseCase` (defecto #244): publica TicketCreadoEvent para
    // que el módulo SLA calcule sla_vence_at (AplicarSlaUseCase).
    // `PrismaTenantTransactionRunner` envuelve cada callback en su propio
    // try/catch y loguea si el publisher falla, así que el callback publica
    // directo, sin try/catch propio (log-and-swallow, ADR-6).
    if (resultado.isOk()) {
      const { ticket } = resultado.getValue();
      this.txRunner.alCommitear(() => {
        this.eventPublisher.publish(
          new TicketCreadoEvent({
            ticketId: ticket.id,
            prioridadId: ticket.prioridadId,
          }),
        );
      });
      // `ticket.asignado` solo si la regla asignó, después de `ticket.creado` y también por
      // `alCommitear`: un ROLLBACK no deja ningún evento de un ticket inexistente.
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
