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
  solicitanteId: string;
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
 * 3. Si `equipoId` fue provisto: valida que exista, esté `activo` y no
 *    eliminado — `Result.fail(EquipoInvalidoError)` si no. Si es `null`/
 *    ausente, el ticket se crea igual (F3-Q4, soporte de red/accesos sin
 *    equipo) — SIN consultar el repo de equipos.
 * 4. Resuelve el tipo SOPORTE por código (catálogo FIJO — su ausencia es un
 *    fallo de infraestructura, `throw` defensivo).
 * 5. Resuelve el estado NUEVO y el tipo de operación CAMBIO_ESTADO.
 * 6. **DENTRO de la transacción**: genera el `numero` (prefijo SOP, ADR-4),
 *    crea `TicketEntity` + `OperacionTicketEntity` de apertura +
 *    `TicketSoporteEntity` satélite, y persiste las 3 entidades.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q4. Ref design: ADR-3, ADR-4.
 * Tarea: T13.1, T13.2.
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
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findById'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(
    dto: CrearTicketSoporteDto,
  ): Promise<Result<{ ticket: TicketEntity; ticketSoporte: TicketSoporteEntity }, DomainError>> {
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

    // 3. equipoId OPCIONAL (F3-Q4): solo se valida si fue provisto.
    if (dto.equipoId) {
      const equipo = await this.equipoRepo.findById(dto.equipoId);
      if (!equipo || !equipo.activo || equipo.isDeleted()) {
        return Result.fail(new EquipoInvalidoError(dto.equipoId));
      }
    }

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

    // 6. Sección crítica: numeración (advisory lock, ADR-5 Fase 2) +
    //    persistencia atómica de ticket + operación + satélite.
    return this.txRunner.run(async () => {
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

      const ticketSoporte = TicketSoporteEntity.create({
        ticketId: ticket.id,
        equipoId: dto.equipoId ?? null,
        descripcionProblema: dto.descripcionProblema ?? null,
      });

      await this.ticketRepo.save(ticket);
      await this.operacionRepo.save(operacionApertura);
      await this.ticketSoporteRepo.save(ticketSoporte);

      return Result.ok<{ ticket: TicketEntity; ticketSoporte: TicketSoporteEntity }, DomainError>({
        ticket,
        ticketSoporte,
      });
    });
  }
}
