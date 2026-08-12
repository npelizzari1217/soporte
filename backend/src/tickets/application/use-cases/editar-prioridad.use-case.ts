import { DomainError, Result } from '../../../shared/domain/result';
import { PrioridadEntity } from '../../domain/entities/prioridad.entity';
import {
  PrioridadNoEncontradaError,
  PrioridadCodigoDuplicadaError,
} from '../../domain/errors/tickets.errors';
import { IPrioridadRepository } from '../../domain/ports/i-prioridad.repository';

/**
 * DTO de entrada de `EditarPrioridadUseCase` (T2, PR11) — PATCH semántico.
 * `slaHoras`/`slaActivo` (SLA movido de `sla_config` a `prioridades`):
 * `undefined` no toca el valor; `slaHoras: null` limpia el SLA explícitamente.
 */
export interface EditarPrioridadDto {
  id: string;
  codigo?: string;
  nombre?: string;
  color?: string | null;
  orden?: number;
  slaHoras?: number | null;
  slaActivo?: boolean;
}

/**
 * EditarPrioridadUseCase — edita `codigo`/`nombre`/`color`/`orden` de una
 * prioridad existente (T2, PR11). Si `codigo` cambia, revalida unicidad
 * (excluyendo la propia entidad). Re-enviar el codigo actual sin cambios NO
 * dispara revalidación.
 *
 * Ref spec: sdd/tickets-core/spec T2. Tarea: T11.2.
 */
export class EditarPrioridadUseCase {
  constructor(
    private readonly prioridadRepo: Pick<
      IPrioridadRepository,
      'findById' | 'findByCodigo' | 'save'
    >,
  ) {}

  async execute(dto: EditarPrioridadDto): Promise<Result<PrioridadEntity, DomainError>> {
    const prioridad = await this.prioridadRepo.findById(dto.id);
    if (!prioridad) {
      return Result.fail(new PrioridadNoEncontradaError(dto.id));
    }

    if (dto.codigo !== undefined && dto.codigo !== prioridad.codigo) {
      const existente = await this.prioridadRepo.findByCodigo(dto.codigo);
      if (existente && existente.id !== prioridad.id) {
        return Result.fail(new PrioridadCodigoDuplicadaError(dto.codigo));
      }
    }

    prioridad.actualizar({
      codigo: dto.codigo,
      nombre: dto.nombre,
      color: dto.color,
      orden: dto.orden,
      slaHoras: dto.slaHoras,
      slaActivo: dto.slaActivo,
    });
    await this.prioridadRepo.save(prioridad);

    return Result.ok(prioridad);
  }
}
