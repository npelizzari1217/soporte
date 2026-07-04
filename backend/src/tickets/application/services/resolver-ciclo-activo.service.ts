import { Result } from '../../../shared/domain/result';
import { SinCicloActivoError } from '../../domain/errors/tickets.errors';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';

/**
 * ResolverCicloActivoParaCreacion — colaborador de aplicación compartido
 * (ADR-1, design-fase4.md) que resuelve el ciclo ACTIVO del tenant para
 * los 4 flujos de creación de tickets (genérico, compras, edilicia, soporte).
 *
 * Por qué un colaborador de aplicación y no un servicio de dominio: necesita
 * un puerto de repositorio (I/O), lo que lo saca del dominio puro (ADR-1).
 * Por qué compartido y no inline en cada use case: DRY — la regla "el ciclo
 * de un ticket nuevo es el activo del tenant" vive en un solo lugar; si
 * cambia la política, se toca un solo archivo en vez de 4.
 *
 * Usa `ICicloClienteRepository` del lado **tickets** (`CICLO_CLIENTE_REPOSITORY`),
 * NO el repo admin de `clientes` (ADR-4-Repo) — evita acoplar compras/
 * reparaciones/equipos al módulo `clientes`.
 *
 * No lanza: todo fallo esperado (sin ciclo activo) se modela con
 * `Result.fail(SinCicloActivoError)`, nunca con `throw` (error-handling skill).
 *
 * Ref design: openspec/changes/ciclos-master-tenant/design-fase4.md ADR-1
 * Tarea: 1.3 (Fase 4, PR1)
 */
export class ResolverCicloActivoParaCreacion {
  constructor(private readonly cicloRepo: ICicloClienteRepository) {}

  /** Retorna el ciclo activo del tenant, o SinCicloActivoError si no hay ninguno. */
  async resolver(): Promise<Result<CicloClienteEntity, SinCicloActivoError>> {
    const activo = await this.cicloRepo.findActive();
    if (!activo) {
      return Result.fail(new SinCicloActivoError());
    }
    return Result.ok(activo);
  }
}
