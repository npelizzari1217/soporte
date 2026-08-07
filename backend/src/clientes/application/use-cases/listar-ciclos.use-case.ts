import { DomainError, Result } from '../../../shared/domain/result';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';

/** Shape de salida de `ListarCiclosUseCase`: los ciclos del tenant + cuál está vigente. */
export interface ListarCiclosResult {
  ciclos: CicloClienteEntity[];
  /** id del ciclo con `activo=true`, o `null` si ninguno lo está (R22: máximo uno). */
  cicloActivoId: string | null;
}

/**
 * ListarCiclosUseCase — lista TODOS los ciclos adoptados por el tenant
 * (incluyendo inactivos) y resuelve cuál es el vigente (`activo=true`).
 * Cierra el gap G4 (sdd/beta-frontend/spec §3): desbloquea el filtro de
 * ciclo en tickets/dashboard y la vista de administración de ciclos.
 * Cualquier usuario autenticado del tenant puede listarlo (sin
 * `@RequirePermissions` en el controller) — es necesario para filtros de
 * todos los roles, no solo el ADMINISTRADOR que gestiona ciclos.
 *
 * Ref spec: sdd/beta-frontend/spec §3 G4. Ref design: ADR-5.
 */
export class ListarCiclosUseCase {
  constructor(private readonly cicloClienteRepo: Pick<ICicloClienteRepository, 'findAll'>) {}

  async execute(): Promise<Result<ListarCiclosResult, DomainError>> {
    const ciclos = await this.cicloClienteRepo.findAll();
    const cicloActivo = ciclos.find((ciclo) => ciclo.activo) ?? null;
    return Result.ok({ ciclos, cicloActivoId: cicloActivo?.id ?? null });
  }
}
