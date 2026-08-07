import { Result } from '../../../shared/domain/result';
import { SinCicloActivoError } from '../../domain/errors/tickets.errors';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';

/**
 * ResolverCicloActivoParaCreacion — colaborador de aplicación que resuelve
 * el ciclo ACTIVO del tenant para `CrearTicketUseCase` (PR6, T4: "ciclo_id
 * = ciclo ACTIVO del tenant, resuelto por el servidor, nunca por el
 * cliente").
 *
 * Por qué un colaborador de aplicación y no un método de dominio: necesita
 * un puerto de repositorio (I/O), lo que lo saca del dominio puro.
 *
 * No lanza: el fallo esperado (sin ciclo activo) se modela con
 * `Result.fail(SinCicloActivoError)` (T4 — 409), nunca con `throw`.
 *
 * Ref spec: sdd/tickets-core/spec T4. Ref design: "Archivos afectados" PR5.
 * Tarea: T5.6.
 */
export class ResolverCicloActivoParaCreacion {
  constructor(private readonly cicloRepo: Pick<ICicloClienteRepository, 'findActive'>) {}

  /** Retorna el ciclo activo del tenant, o SinCicloActivoError si no hay ninguno. */
  async resolver(): Promise<Result<CicloClienteEntity, SinCicloActivoError>> {
    const activo = await this.cicloRepo.findActive();
    if (!activo) {
      return Result.fail(new SinCicloActivoError());
    }
    return Result.ok(activo);
  }
}
