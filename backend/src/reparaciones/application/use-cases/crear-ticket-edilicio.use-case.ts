import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
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
import { IUbicacionRepository } from '../../domain/ports/i-ubicacion.repository';
import { UbicacionInvalidaError } from '../../domain/errors/reparaciones.errors';

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
  /** UUID de la ubicación física de la reparación. Debe existir, estar activa y no eliminada. */
  ubicacionId: string;
  solicitanteId: string;
  clienteId: string;
  autorId: string;
  anio: number;
}

/**
 * CrearTicketEdilicioUseCase — creación atómica de un ticket edilicio
 * (F3-E1, ADR-3).
 *
 * Extiende el patrón de `CrearTicketCompraUseCase` agregando la validación
 * de `ubicacionId` (existente, activa, no eliminada) y la creación del
 * satélite `ticket_edilicia` en la MISMA transacción:
 * 1. Valida que el solicitante exista en el tenant (`IUsuarioMasterChecker`).
 * 2. Resuelve el ciclo ACTIVO del tenant (nunca lo decide el caller).
 * 3. Valida `ubicacionId`: debe existir, estar `activo` y no eliminada —
 *    si no, `Result.fail(UbicacionInvalidaError)`.
 * 4. Resuelve el tipo EDILICIA por código (catálogo FIJO — su ausencia es
 *    un fallo de infraestructura, `throw` defensivo).
 * 5. Resuelve el estado NUEVO y el tipo de operación CAMBIO_ESTADO
 *    (catálogos FIJOS, mismo criterio).
 * 6. **DENTRO de la transacción**: genera el `numero` (prefijo EDI, ADR-4,
 *    ya resuelto), crea `TicketEntity` + `OperacionTicketEntity` de
 *    apertura + `TicketEdiliciaEntity` satélite (porcentajeAvance=0,
 *    personalAsignadoId=null), y persiste las 3 entidades.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1. Ref design: ADR-3, ADR-4.
 * Tarea: T8.1, T8.2.
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
    private readonly ubicacionRepo: Pick<IUbicacionRepository, 'findById'>,
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

    // 3. Validar ubicacionId: debe existir, estar activa y no eliminada.
    const ubicacion = await this.ubicacionRepo.findById(dto.ubicacionId);
    if (!ubicacion || !ubicacion.activo || ubicacion.isDeleted()) {
      return Result.fail(new UbicacionInvalidaError(dto.ubicacionId));
    }

    // 4-5. Catálogos FIJOS garantizados por el seed (Fase 1) — su ausencia
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

    // 6. Sección crítica: numeración (advisory lock, ADR-5 Fase 2) +
    //    persistencia atómica de ticket + operación + satélite.
    return this.txRunner.run(async () => {
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
        ubicacionId: dto.ubicacionId,
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
  }
}
