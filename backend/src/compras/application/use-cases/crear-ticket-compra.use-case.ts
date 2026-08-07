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
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';

/** Código fijo del tipo de ticket resuelto por este use case (F3-C1). */
const TIPO_CODIGO_COMPRAS = 'COMPRAS';

/**
 * DTO de entrada de `CrearTicketCompraUseCase`.
 *
 * A diferencia de `CrearTicketDto` (núcleo `tickets/`), NO recibe `tipoId`:
 * el tipo se resuelve internamente por código ('COMPRAS', catálogo FIJO
 * sembrado en Fase 1) — este use case SIEMPRE crea tickets de compra.
 *
 * `solicitanteId`/`autorId` = JWT.sub (mismo criterio que `CrearTicketDto`).
 * `anio` lo resuelve el controller (server-side, nunca el cliente HTTP).
 *
 * Ref design: "Firmas TS clave" (CrearTicketCompraDto).
 */
export interface CrearTicketCompraDto {
  titulo: string;
  descripcion?: string | null;
  prioridadId: string;
  solicitanteId: string;
  clienteId: string;
  autorId: string;
  anio: number;
}

/**
 * CrearTicketCompraUseCase — creación atómica de un ticket de compra
 * (F3-C1, ADR-3).
 *
 * Extiende el patrón de `CrearTicketUseCase` (núcleo) agregando la
 * creación del satélite `ticket_compra` en la MISMA transacción:
 * 1. Valida que el solicitante exista en el tenant (`IUsuarioMasterChecker`).
 * 2. Resuelve el ciclo ACTIVO del tenant (nunca lo decide el caller).
 * 3. Resuelve el tipo COMPRAS por código (catálogo FIJO — su ausencia es
 *    un fallo de infraestructura, `throw` defensivo).
 * 4. Resuelve el estado NUEVO y el tipo de operación CAMBIO_ESTADO
 *    (catálogos FIJOS, mismo criterio).
 * 5. **DENTRO de la transacción** (`ITenantTransactionRunner.run`): genera
 *    el `numero` (prefijo COM, ADR-4, ya resuelto — reusa `NumeradorTicket`
 *    sin cambios), crea `TicketEntity` + `OperacionTicketEntity` de
 *    apertura + `TicketCompraEntity` satélite (aprobación = null), y
 *    persiste las 3 entidades.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C1. Ref design: ADR-3, ADR-4.
 * Tarea: T4.1, T4.2.
 */
export class CrearTicketCompraUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'save'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly ticketCompraRepo: Pick<ITicketCompraRepository, 'save'>,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findIdByCodigo'>,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findByCodigo'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'existeEnTenant'>,
    private readonly numerador: Pick<NumeradorTicket, 'generarNumero'>,
    private readonly resolverCicloActivo: Pick<ResolverCicloActivoParaCreacion, 'resolver'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(
    dto: CrearTicketCompraDto,
  ): Promise<Result<{ ticket: TicketEntity; ticketCompra: TicketCompraEntity }, DomainError>> {
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
    const tipoCompras = await this.tipoTicketRepo.findByCodigo(TIPO_CODIGO_COMPRAS);
    if (!tipoCompras) {
      throw new Error(
        `Catálogo de tipos de ticket inconsistente: no existe el tipo "${TIPO_CODIGO_COMPRAS}" en el tenant activo.`,
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
    return this.txRunner.run(async () => {
      const numeroResult = await this.numerador.generarNumero(
        tipoCompras.id,
        tipoCompras.codigo,
        dto.anio,
      );
      if (numeroResult.isFail()) {
        return Result.fail<{ ticket: TicketEntity; ticketCompra: TicketCompraEntity }, DomainError>(
          numeroResult.getError(),
        );
      }

      const ticket = TicketEntity.create({
        numero: numeroResult.getValue(),
        titulo: dto.titulo,
        descripcion: dto.descripcion ?? null,
        tipoId: tipoCompras.id,
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

      const ticketCompra = TicketCompraEntity.create({ ticketId: ticket.id });

      await this.ticketRepo.save(ticket);
      await this.operacionRepo.save(operacionApertura);
      await this.ticketCompraRepo.save(ticketCompra);

      return Result.ok<{ ticket: TicketEntity; ticketCompra: TicketCompraEntity }, DomainError>({
        ticket,
        ticketCompra,
      });
    });
  }
}
