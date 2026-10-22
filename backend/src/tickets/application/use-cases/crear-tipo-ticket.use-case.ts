import { moduloTieneAltaDeTipo } from '../../domain/tipos-ticket.constants';
import { DomainError, Result } from '../../../shared/domain/result';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import {
  TipoTicketCodigoDuplicadoError,
  PrefijoTipoTicketColisionError,
  TipoTicketDesconocidoError,
  ModuloTipoTicketInvalidoError,
  ModuloSinAltaDeTipoError,
  TipoOrigenPermisosNoEncontradoError,
  TipoOrigenPermisosDeOtroModuloError,
} from '../../domain/errors/tickets.errors';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { IPermisoTipoTicketRepository } from '../../domain/ports/i-permiso-tipo-ticket.repository';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { NumeradorTicket } from '../../domain/services/numerador-ticket.service';
import { esModuloValido } from '../../../shared/domain/modulos';

/** DTO de entrada de `CrearTipoTicketUseCase` (T2, PR11). */
export interface CrearTipoTicketDto {
  codigo: string;
  nombre: string;
  /** Módulo funcional dueño del tipo (B2, requerido — separación estricta). */
  modulo: string;
  /**
   * Tipo existente, del mismo módulo, cuyos permisos por usuario recibe el tipo nuevo
   * (odd/tasks/permisos-por-tipo-ticket.md, S4). Ausente o `null`: el tipo nace cerrado.
   */
  copiarPermisosDeTipoId?: string | null;
}

/**
 * CrearTipoTicketUseCase — alta de un tipo de ticket EDITABLE por el
 * ADMINISTRADOR del tenant (T2, PR11).
 *
 * Flujo:
 * 1. Valida que `codigo` no esté en uso (activo O soft-deleted — el UNIQUE
 *    de schema no tiene índice parcial por `deleted_at`) → 422.
 * 2. Deriva el prefijo de numeración (`NumeradorTicket.derivarPrefijo`,
 *    ADR-4). Si el `codigo` es degenerado (sin caracteres alfanuméricos)
 *    → 422, mismo error que usa el numerador en tiempo de creación de
 *    tickets (fail-fast, no dejar un tipo inutilizable en el catálogo).
 * 3. Valida que ese prefijo NO colisione con el de ningún tipo ACTIVO
 *    existente del tenant → 422. Cierra en el punto de alta el riesgo
 *    aceptado en design ADR-4 (colisión de prefijo → violaría el UNIQUE de
 *    `tickets.numero` recién en tiempo de uso real, ya visto como bug real
 *    en e2e de PR8/PR9/PR10).
 * 4. Si se pide copiar permisos, valida que el tipo de origen exista y sea del mismo módulo → 422
 *    (odd/tasks/permisos-por-tipo-ticket.md, S4).
 * 5. Crea la entidad (`activo=true`) y, en la MISMA transacción, copia las filas por tipo del
 *    origen: si la copia falla, el tipo no queda creado. Sin origen, el tipo nace cerrado: nadie
 *    salvo ADMINISTRADOR y ROOT lo ve hasta que se le asignen permisos.
 *
 * Ref spec: sdd/tickets-core/spec T2, T5. Ref design: ADR-4. Tarea: T11.1.
 */
export class CrearTipoTicketUseCase {
  constructor(
    private readonly tipoTicketRepo: Pick<
      ITipoTicketRepository,
      'findByCodigo' | 'findById' | 'findAllActive' | 'save'
    >,
    private readonly permisosRepo: Pick<IPermisoTipoTicketRepository, 'copiarDeTipo'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
  ) {}

  async execute(dto: CrearTipoTicketDto): Promise<Result<TipoTicketEntity, DomainError>> {
    if (!esModuloValido(dto.modulo)) {
      return Result.fail(new ModuloTipoTicketInvalidoError(dto.modulo));
    }
    if (!moduloTieneAltaDeTipo(dto.modulo)) {
      return Result.fail(new ModuloSinAltaDeTipoError(dto.modulo));
    }

    const existente = await this.tipoTicketRepo.findByCodigo(dto.codigo);
    if (existente) {
      return Result.fail(new TipoTicketCodigoDuplicadoError(dto.codigo));
    }

    const prefijo = NumeradorTicket.derivarPrefijo(dto.codigo);
    if (!prefijo) {
      return Result.fail(new TipoTicketDesconocidoError(dto.codigo));
    }

    const activos = await this.tipoTicketRepo.findAllActive();
    const colisionante = activos.find((t) => NumeradorTicket.derivarPrefijo(t.codigo) === prefijo);
    if (colisionante) {
      return Result.fail(
        new PrefijoTipoTicketColisionError(dto.codigo, colisionante.codigo, prefijo),
      );
    }

    const origenId = dto.copiarPermisosDeTipoId ?? null;
    if (origenId !== null) {
      const origen = await this.tipoTicketRepo.findById(origenId);
      if (!origen) {
        return Result.fail(new TipoOrigenPermisosNoEncontradoError(origenId));
      }
      if (origen.modulo !== dto.modulo) {
        return Result.fail(new TipoOrigenPermisosDeOtroModuloError(origen.modulo, dto.modulo));
      }
    }

    const tipo = TipoTicketEntity.create({
      codigo: dto.codigo,
      nombre: dto.nombre,
      modulo: dto.modulo,
      activo: true,
    });
    await this.txRunner.run(async () => {
      await this.tipoTicketRepo.save(tipo);
      if (origenId !== null) {
        await this.permisosRepo.copiarDeTipo(origenId, tipo.id);
      }
    });

    return Result.ok(tipo);
  }
}
