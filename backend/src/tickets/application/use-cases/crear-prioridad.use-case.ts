import { DomainError, Result } from '../../../shared/domain/result';
import { PrioridadEntity } from '../../domain/entities/prioridad.entity';
import { PrioridadCodigoDuplicadaError } from '../../domain/errors/tickets.errors';
import { IPrioridadRepository } from '../../domain/ports/i-prioridad.repository';

/** DTO de entrada de `CrearPrioridadUseCase` (T2, PR11). */
export interface CrearPrioridadDto {
  codigo: string;
  nombre: string;
  color?: string | null;
  orden: number;
}

/**
 * CrearPrioridadUseCase — alta de una prioridad EDITABLE por el
 * ADMINISTRADOR del tenant (T2, PR11). A diferencia de `TipoTicket`, las
 * prioridades no participan en la numeración de tickets (ADR-4) — sin
 * validación de colisión de prefijo, solo unicidad de `codigo`.
 *
 * Ref spec: sdd/tickets-core/spec T2. Tarea: T11.2.
 */
export class CrearPrioridadUseCase {
  constructor(
    private readonly prioridadRepo: Pick<IPrioridadRepository, 'findByCodigo' | 'save'>,
  ) {}

  async execute(dto: CrearPrioridadDto): Promise<Result<PrioridadEntity, DomainError>> {
    const existente = await this.prioridadRepo.findByCodigo(dto.codigo);
    if (existente) {
      return Result.fail(new PrioridadCodigoDuplicadaError(dto.codigo));
    }

    const prioridad = PrioridadEntity.create({
      codigo: dto.codigo,
      nombre: dto.nombre,
      color: dto.color ?? null,
      orden: dto.orden,
      activo: true,
    });
    await this.prioridadRepo.save(prioridad);

    return Result.ok(prioridad);
  }
}
