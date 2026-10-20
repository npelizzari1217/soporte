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
import {
  SectorTicketInexistenteError,
  SolicitanteInvalidoError,
  TipoTicketNoEncontradoError,
  TipoTicketNoPermitidoEnAltaError,
} from '../../../tickets/domain/errors/tickets.errors';
import { ISectorRepository } from '../../../sectores/domain/ports/i-sector.repository';
import {
  TIPO_CODIGO_EDILICIA,
  TIPO_CODIGO_PREVENTIVO,
} from '../../../tickets/domain/tipos-ticket.constants';
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';

/**
 * DTO de entrada de `CrearTicketEdilicioUseCase`.
 *
 * `tipoId` es opcional: sin él, el tipo es 'EDILICIA' (catálogo FIJO sembrado en Fase 1). Con
 * él, tiene que ser un tipo ACTIVO del módulo EDILICIA que no sea PREVENTIVO, que lo genera solo el
 * barrido (odd/tasks/tipos-ticket-por-modulo.md, S2).
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
  /** Tipo elegido en el alta; ausente o `null` = EDILICIA. */
  tipoId?: string | null;
  /** Ubicación física de la reparación, texto libre (opcional). Va al satélite. */
  ubicacion?: string | null;
  /**
   * Sector del cliente (odd/ubicacion-sector-ticket). Va al ticket, como en cualquier otro módulo.
   * La Ubicación general del ticket NO se carga en Edilicia: Edilicia usa su propia `ubicacion`.
   */
  sectorId?: string | null;
  solicitanteId: string;
  clienteId: string;
  autorId: string;
  anio: number;
}

/**
 * Resultado del alta: el ticket base, su satélite y el nombre del sector elegido (o `null` si no
 * se eligió), ya conocido por la validación — así la respuesta del alta no necesita otra consulta.
 */
export interface TicketEdilicioCreado {
  ticket: TicketEntity;
  ticketEdilicia: TicketEdiliciaEntity;
  sectorNombre: string | null;
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
 * 2b. Si viene `sectorId`, valida que exista (no se exige activo) →
 *    `SectorTicketInexistenteError` (odd/ubicacion-sector-ticket).
 * 3. Resuelve el tipo: el elegido en `tipoId` (validado por `resolverTipo`) o, sin él, EDILICIA
 *    por código (catálogo FIJO — su ausencia es un fallo de infraestructura, `throw` defensivo).
 * 4. Resuelve el estado NUEVO y el tipo de operación CAMBIO_ESTADO
 *    (catálogos FIJOS, mismo criterio).
 * 5. **DENTRO de la transacción**: genera el `numero` con el prefijo del tipo resuelto (EDI
 *    para EDILICIA, ADR-4), crea `TicketEntity` + `OperacionTicketEntity` de
 *    apertura + `TicketEdiliciaEntity` satélite, y persiste las 3
 *    entidades.
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
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findByCodigo' | 'findById'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'existeEnTenant'>,
    private readonly numerador: Pick<NumeradorTicket, 'generarNumero'>,
    private readonly resolverCicloActivo: Pick<ResolverCicloActivoParaCreacion, 'resolver'>,
    private readonly resolverAsignacion: Pick<ResolverAsignacionAutomatica, 'resolver'>,
    private readonly eventPublisher: IDomainEventPublisher,
    private readonly txRunner: ITenantTransactionRunner,
    private readonly sectorRepo: Pick<ISectorRepository, 'findById'>,
  ) {}

  async execute(dto: CrearTicketEdilicioDto): Promise<Result<TicketEdilicioCreado, DomainError>> {
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

    // 2b. sectorId opcional: tiene que existir (un sector desactivado sigue siendo válido).
    let sectorNombre: string | null = null;
    if (dto.sectorId) {
      const sector = await this.sectorRepo.findById(dto.sectorId);
      if (!sector) {
        return Result.fail(new SectorTicketInexistenteError(dto.sectorId));
      }
      sectorNombre = sector.nombre;
    }

    // 3. Tipo elegido, o EDILICIA por defecto.
    const tipoResult = await this.resolverTipo(dto.tipoId ?? null);
    if (tipoResult.isFail()) {
      return Result.fail(tipoResult.getError());
    }
    const tipo = tipoResult.getValue();

    // 4. Catálogos FIJOS garantizados por el seed (Fase 1) — su ausencia
    //    es un bug de infraestructura, no un error del caller: throw defensivo.
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
    // Regla de asignación del tipo: sin regla o regla rota → null y el alta sigue como siempre;
    // un fallo de consulta del tenant se propaga (ver el resolver). Resuelve fuera de la tx.
    const asignacion = await this.resolverAsignacion.resolver(tipo, dto.clienteId);
    const estadoInicialId = asignacion?.estadoAsignadoId ?? estadoNuevoId;

    const resultado = await this.txRunner.run(async () => {
      const numeroResult = await this.numerador.generarNumero(tipo.id, tipo.codigo, dto.anio);
      if (numeroResult.isFail()) {
        return Result.fail<TicketEdilicioCreado, DomainError>(numeroResult.getError());
      }

      const ticket = TicketEntity.create({
        numero: numeroResult.getValue(),
        titulo: dto.titulo,
        descripcion: dto.descripcion ?? null,
        tipoId: tipo.id,
        estadoId: estadoInicialId,
        prioridadId: dto.prioridadId,
        cicloId: cicloActivo.id,
        ticketReferenciaId: null,
        solicitanteId: dto.solicitanteId,
        // La Ubicación general queda en null a propósito: Edilicia usa la del satélite.
        sectorId: dto.sectorId ?? null,
      });

      // La regla asigna ANTES del primer `save()`: el ticket nace ASIGNADO.
      if (asignacion) ticket.assignTo(asignacion.asignadoId);

      // La apertura conserva el autor del dto; la ASIGNACION es de AUTOR_SISTEMA.
      const operaciones = operacionesDeApertura({
        ticketId: ticket.id,
        tipoId: tipo.id,
        estadoInicialId,
        tipoOperacionAperturaId,
        autorId: dto.autorId,
        asignacion,
      });

      const ticketEdilicia = TicketEdiliciaEntity.create({
        ticketId: ticket.id,
        ubicacion: dto.ubicacion ?? null,
      });

      await this.ticketRepo.save(ticket);
      for (const operacion of operaciones) {
        await this.operacionRepo.save(operacion);
      }
      await this.ticketEdiliciaRepo.save(ticketEdilicia);

      return Result.ok<TicketEdilicioCreado, DomainError>({
        ticket,
        ticketEdilicia,
        sectorNombre,
      });
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

  /**
   * Resuelve el tipo del alta. Sin `tipoId`, EDILICIA: su ausencia es un bug de infraestructura y
   * va como throw defensivo. Con `tipoId`, valida que el alta edilicia lo admita.
   */
  private async resolverTipo(
    tipoId: string | null,
  ): Promise<Result<TipoTicketEntity, DomainError>> {
    if (tipoId === null) {
      const tipoEdilicia = await this.tipoTicketRepo.findByCodigo(TIPO_CODIGO_EDILICIA);
      if (!tipoEdilicia) {
        throw new Error(
          `Catálogo de tipos de ticket inconsistente: no existe el tipo "${TIPO_CODIGO_EDILICIA}" en el tenant activo.`,
        );
      }
      return Result.ok(tipoEdilicia);
    }

    // `findById` devuelve también los dados de baja: para un alta, uno inactivo es inexistente.
    const tipo = await this.tipoTicketRepo.findById(tipoId);
    if (!tipo || tipo.isDeleted() || !tipo.activo) {
      return Result.fail(new TipoTicketNoEncontradoError(tipoId));
    }
    if (tipo.modulo !== 'EDILICIA' || tipo.codigo === TIPO_CODIGO_PREVENTIVO) {
      return Result.fail(new TipoTicketNoPermitidoEnAltaError(tipo.codigo, 'EDILICIA'));
    }
    return Result.ok(tipo);
  }
}
