import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { NumeradorTicket } from '../../domain/services/numerador-ticket.service';
import { ResolverCicloActivoParaCreacion } from '../services/resolver-ciclo-activo.service';
import {
  EstadoCatalogoNoEncontradoError,
  SolicitanteInvalidoError,
  TipoOperacionNoEncontradoError,
  TipoTicketNoEncontradoError,
} from '../../domain/errors/tickets.errors';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';

/**
 * DTO de entrada para la creación de un ticket.
 *
 * - `tipoId`: UUID del tipo de ticket (FK → tipos_ticket).
 * - `clienteId`: viene del JWT claim; se usa para validar la pertenencia del
 *   solicitante al tenant sin pasar el JWT directamente al use case.
 * - `autorId`: viene del JWT claim; se registra en la operacion de timeline.
 * - `anio`: año para el numerador (del ciclo vigente o año en curso).
 * - `fechaCreacion`: override explícito de created_at (ADR-5). Permite fechas
 *   pasadas y futuras sin restricción de rango. La validación de formato ocurre
 *   en la capa HTTP. Si se omite, se usa now() (comportamiento por defecto).
 *
 * SIN `cicloId` (Fase 4, ciclos-master-tenant, ADR-3): el ciclo del ticket
 * nuevo lo determina el servidor (ciclo ACTIVO del tenant), nunca el cliente.
 * Ver `ResolverCicloActivoParaCreacion`.
 */
export interface CrearTicketDto {
  titulo: string;
  descripcion?: string | null;
  tipoId: string;
  prioridadId: string;
  solicitanteId: string;
  /** UUID del cliente (tenant), extraído del JWT. */
  clienteId: string;
  /** UUID del autor que realiza la acción, extraído del JWT. */
  autorId: string;
  /** Año para la generación del número legible. */
  anio: number;
  /**
   * Override explícito de created_at (ADR-5). Permite fechas pasadas y futuras.
   * Si se omite, created_at = now() por @default(now()) de Prisma.
   */
  fechaCreacion?: Date;
}

/**
 * CrearTicketUseCase — caso de uso para la creación de un ticket nuevo.
 *
 * Flujo:
 * 1. Valida que el `solicitante_id` existe en master.usuarios y pertenece al tenant.
 * 2. Resuelve el ciclo ACTIVO del tenant (Fase 4, ADR-1/ADR-2) — si no hay
 *    ninguno activo, rechaza con `SinCicloActivoError` (409 en el controller).
 * 3. Resuelve el tipoCodigo ('SOPORTE', 'COMPRAS', 'EDILICIA') desde el tipoId.
 * 4. Resuelve el estado ABIERTO del catálogo del tenant.
 * 5. Resuelve el id del tipo de operación CAMBIO_ESTADO.
 * 6. Genera el número legible vía NumeradorTicket.
 * 7. Crea la TicketEntity (UUIDv7 interno) con `cicloId = cicloActivo.id`.
 * 8. Crea la OperacionTicketEntity de apertura (estado_anterior=NULL, estado_nuevo=ABIERTO).
 * 9. Persiste ambas entidades en la MISMA transacción vía ITenantTransactionRunner.
 * 10. Retorna Result.ok(ticket).
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:tickets-core/Estado inicial ABIERTO]
 * Ref spec: [SPEC:tickets-core/Validación soft refs cross-DB]
 * Ref design: openspec/changes/ciclos-master-tenant/design-fase4.md ADR-1/ADR-2
 * Tarea: 3.C.2, 2.2 (Fase 4, PR2)
 */
export class CrearTicketUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly operacionRepo: IOperacionTicketRepository,
    private readonly estadoRepo: IEstadoRepository,
    private readonly usuarioMasterChecker: IUsuarioMasterChecker,
    private readonly tipoTicketRepo: ITipoTicketRepository,
    private readonly tipoOperacionRepo: ITipoOperacionRepository,
    private readonly numerador: Pick<NumeradorTicket, 'generarNumero'>,
    private readonly resolverCicloActivo: Pick<ResolverCicloActivoParaCreacion, 'resolver'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: CrearTicketDto): Promise<Result<TicketEntity, DomainError>> {
    // 1. Validar que el solicitante existe en master y pertenece al tenant
    const solicitanteValido = await this.usuarioMasterChecker.existeEnTenant(
      dto.solicitanteId,
      dto.clienteId,
    );
    if (!solicitanteValido) {
      return Result.fail(new SolicitanteInvalidoError(dto.solicitanteId));
    }

    // 2. Resolver el ciclo ACTIVO del tenant (Fase 4, ADR-1): el servidor
    //    determina el cicloId, nunca el cliente. Sin activo → 409 (controller).
    const cicloResult = await this.resolverCicloActivo.resolver();
    if (cicloResult.isFail()) {
      return Result.fail(cicloResult.getError());
    }
    const cicloActivo = cicloResult.getValue();

    // 3. Resolver tipoCodigo para el numerador y la máquina de estados
    const tipoCodigo = await this.tipoTicketRepo.findCodigoById(dto.tipoId);
    if (!tipoCodigo) {
      return Result.fail(new TipoTicketNoEncontradoError(dto.tipoId));
    }

    // 4. Resolver estado ABIERTO del catálogo del tenant
    const estadoAbierto = await this.estadoRepo.findByCodigo('ABIERTO');
    if (!estadoAbierto) {
      return Result.fail(new EstadoCatalogoNoEncontradoError('ABIERTO'));
    }

    // 5. Resolver el id del tipo de operación CAMBIO_ESTADO
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('CAMBIO_ESTADO');
    if (!tipoOperacionId) {
      return Result.fail(new TipoOperacionNoEncontradoError('CAMBIO_ESTADO'));
    }

    // 6. Generar número legible — puede fallar (secuencia agotada, tipo desconocido)
    const numeroResult = await this.numerador.generarNumero(dto.tipoId, tipoCodigo, dto.anio);
    if (numeroResult.isFail()) {
      return Result.fail(numeroResult.getError());
    }
    const numero = numeroResult.getValue();

    // 7. Crear la entidad Ticket (UUIDv7 generado internamente por BaseEntity)
    //    El tercer argumento es el override de createdAt (ADR-5): si se provee,
    //    sobreescribe _createdAt en el factory. El mapper incluirá createdAt en
    //    el INSERT pero no en el UPDATE (ver TicketMapper.toPersistence, T3.8).
    //    cicloId = cicloActivo.id (Fase 4, ADR-1): ignora cualquier valor previo,
    //    el servidor es la única autoridad sobre el ciclo del ticket nuevo.
    const ticket = TicketEntity.create(
      {
        numero,
        titulo: dto.titulo,
        descripcion: dto.descripcion ?? null,
        tipoId: dto.tipoId,
        estadoId: estadoAbierto.id,
        prioridadId: dto.prioridadId,
        cicloId: cicloActivo.id,
        solicitanteId: dto.solicitanteId,
        asignadoId: null,
        fechaCierre: null,
      },
      undefined,
      dto.fechaCreacion,
    );

    // 8. Crear la operación de apertura: CAMBIO_ESTADO NULL → ABIERTO
    const operacion = OperacionTicketEntity.create({
      ticketId: ticket.id,
      tipoOperacionId,
      descripcion: null,
      estadoAnteriorId: null,
      estadoNuevoId: estadoAbierto.id,
      autorId: dto.autorId,
      metadata: null,
    });

    // 9. Persistir ticket + operacion en la misma transacción (atómico)
    await this.txRunner.run(async () => {
      await this.ticketRepo.save(ticket);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(ticket);
  }
}
