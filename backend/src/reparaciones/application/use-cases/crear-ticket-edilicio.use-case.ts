import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { TicketCreadoEvent } from '../../../tickets/domain/events/ticket-creado.event';
import { NumeradorTicket } from '../../../tickets/domain/services/numerador-ticket.service';
import { ResolverCicloActivoParaCreacion } from '../../../tickets/application/services/resolver-ciclo-activo.service';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { IEstadoRepository } from '../../../tickets/domain/ports/i-estado.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { SolicitanteInvalidoError } from '../../../tickets/domain/errors/tickets.errors';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';

/** Código fijo del tipo de ticket resuelto por este use case (F3-E1). */
const TIPO_CODIGO_EDILICIA = 'EDILICIA';

/**
 * DTO de entrada de `CrearTicketEdilicioUseCase`.
 *
 * NO recibe `tipoId` (mismo criterio que `CrearTicketCompraDto`): el tipo se
 * resuelve internamente por código ('EDILICIA', catálogo FIJO sembrado en
 * Fase 1) — este use case SIEMPRE crea tickets edilicios.
 *
 * `solicitanteId`/`autorId` = JWT.sub. `anio` lo resuelve el controller
 * (server-side, nunca el cliente HTTP).
 *
 * Ref design: "Firmas TS clave" (CrearTicketEdilicioDto).
 */
export interface CrearTicketEdilicioDto {
  titulo: string;
  descripcion?: string | null;
  prioridadId: string;
  /** Ubicación física de la reparación, texto libre (opcional). */
  ubicacion?: string | null;
  solicitanteId: string;
  clienteId: string;
  autorId: string;
  anio: number;
}

/**
 * CrearTicketEdilicioUseCase — creación atómica de un ticket edilicio
 * (F3-E1, ADR-3).
 *
 * Extiende el patrón de `CrearTicketCompraUseCase` agregando la creación del
 * satélite `ticket_edilicia` en la MISMA transacción (`ubicacion` es texto
 * libre, opcional — sin catálogo que validar, ex-Ubicacion removido):
 * 1. Valida que el solicitante exista en el tenant (`IUsuarioMasterChecker`).
 * 2. Resuelve el ciclo ACTIVO del tenant (nunca lo decide el caller).
 * 3. Resuelve el tipo EDILICIA por código (catálogo FIJO — su ausencia es
 *    un fallo de infraestructura, `throw` defensivo).
 * 4. Resuelve el estado NUEVO y el tipo de operación CAMBIO_ESTADO
 *    (catálogos FIJOS, mismo criterio).
 * 5. **DENTRO de la transacción**: genera el `numero` (prefijo EDI, ADR-4,
 *    ya resuelto), crea `TicketEntity` + `OperacionTicketEntity` de
 *    apertura + `TicketEdiliciaEntity` satélite (porcentajeAvance=0,
 *    personalAsignadoId=null), y persiste las 3 entidades.
 * 6. **POST-COMMIT** (`txRunner.alCommitear`, mismo criterio que
 *    `CrearTicketUseCase` — GATE G3/defecto #244): publica `TicketCreadoEvent`
 *    para que `AplicarSlaListener` calcule `sla_vence_at`. Un ticket edilicio
 *    es un ticket como cualquier otro a efectos de SLA; antes de este fix
 *    nunca se publicaba el evento y `sla_vence_at` quedaba `null` siempre.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1. Ref design: ADR-3, ADR-4.
 * Tarea: T8.1, T8.2. Defecto: #244.
 */
export class CrearTicketEdilicioUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'save'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly ticketEdiliciaRepo: Pick<ITicketEdiliciaRepository, 'save'>,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findIdByCodigo'>,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findByCodigo'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'existeEnTenant'>,
    private readonly numerador: Pick<NumeradorTicket, 'generarNumero'>,
    private readonly resolverCicloActivo: Pick<ResolverCicloActivoParaCreacion, 'resolver'>,
    private readonly eventPublisher: IDomainEventPublisher,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(
    dto: CrearTicketEdilicioDto,
  ): Promise<Result<{ ticket: TicketEntity; ticketEdilicia: TicketEdiliciaEntity }, DomainError>> {
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

    // 3-4. Catálogos FIJOS garantizados por el seed (Fase 1) — su ausencia
    //    es un bug de infraestructura, no un error del caller: throw defensivo.
    const tipoEdilicia = await this.tipoTicketRepo.findByCodigo(TIPO_CODIGO_EDILICIA);
    if (!tipoEdilicia) {
      throw new Error(
        `Catálogo de tipos de ticket inconsistente: no existe el tipo "${TIPO_CODIGO_EDILICIA}" en el tenant activo.`,
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

    // 5. Sección crítica: numeración (advisory lock, ADR-5 Fase 2) +
    //    persistencia atómica de ticket + operación + satélite.
    const resultado = await this.txRunner.run(async () => {
      const numeroResult = await this.numerador.generarNumero(
        tipoEdilicia.id,
        tipoEdilicia.codigo,
        dto.anio,
      );
      if (numeroResult.isFail()) {
        return Result.fail<
          { ticket: TicketEntity; ticketEdilicia: TicketEdiliciaEntity },
          DomainError
        >(numeroResult.getError());
      }

      const ticket = TicketEntity.create({
        numero: numeroResult.getValue(),
        titulo: dto.titulo,
        descripcion: dto.descripcion ?? null,
        tipoId: tipoEdilicia.id,
        estadoId: estadoNuevoId,
        prioridadId: dto.prioridadId,
        cicloId: cicloActivo.id,
        ticketReferenciaId: null,
        solicitanteId: dto.solicitanteId,
      });

      const operacionApertura = OperacionTicketEntity.create({
        ticketId: ticket.id,
        tipoOperacionId: tipoOperacionAperturaId,
        descripcion: null,
        estadoAnteriorId: null,
        estadoNuevoId: estadoNuevoId,
        autorId: dto.autorId,
        esInterno: false,
        metadata: null,
      });

      const ticketEdilicia = TicketEdiliciaEntity.create({
        ticketId: ticket.id,
        ubicacion: dto.ubicacion ?? null,
      });

      await this.ticketRepo.save(ticket);
      await this.operacionRepo.save(operacionApertura);
      await this.ticketEdiliciaRepo.save(ticketEdilicia);

      return Result.ok<{ ticket: TicketEntity; ticketEdilicia: TicketEdiliciaEntity }, DomainError>(
        {
          ticket,
          ticketEdilicia,
        },
      );
    });

    // 6. DIFERIDO A POST-COMMIT vía `txRunner.alCommitear()` — mismo criterio
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
    }

    return resultado;
  }
}
