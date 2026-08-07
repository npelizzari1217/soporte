import { DomainError, Result } from '../../../shared/domain/result';
import { SlaConfigEntity } from '../../domain/entities/sla-config.entity';
import { SlaConfigNoEncontradaError, HorasInvalidasError } from '../../domain/errors/sla.errors';
import { ISlaConfigRepository } from '../../domain/ports/i-sla-config.repository';

/** DTO de entrada de `EditarSlaConfigUseCase` (S1) — PATCH semántico. */
export interface EditarSlaConfigDto {
  id: string;
  horas?: number;
  activo?: boolean;
}

/**
 * EditarSlaConfigUseCase — edita `horas`/`activo` de una fila `sla_config`
 * existente (S1). NO crea/elimina filas — el catálogo de configs nace en el
 * seed de provisioning (una por prioridad FIJA).
 *
 * Ref spec: sdd/premium/spec S1. Tarea: SA4/SA5.
 */
export class EditarSlaConfigUseCase {
  constructor(private readonly repo: Pick<ISlaConfigRepository, 'findById' | 'save'>) {}

  async execute(dto: EditarSlaConfigDto): Promise<Result<SlaConfigEntity, DomainError>> {
    const config = await this.repo.findById(dto.id);
    if (!config) {
      return Result.fail(new SlaConfigNoEncontradaError(dto.id));
    }

    if (dto.horas !== undefined) {
      try {
        config.editarHoras(dto.horas);
      } catch (error) {
        if (error instanceof HorasInvalidasError) {
          return Result.fail(error);
        }
        throw error;
      }
    }

    if (dto.activo !== undefined) {
      if (dto.activo) {
        config.activar();
      } else {
        config.desactivar();
      }
    }

    await this.repo.save(config);

    return Result.ok(config);
  }
}
