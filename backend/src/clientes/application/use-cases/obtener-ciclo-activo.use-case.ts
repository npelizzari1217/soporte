import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';

/**
 * ObtenerCicloActivoUseCase — retorna el ciclo activo del tenant resuelto,
 * o `null` si no hay ninguno (ADR-8, GET /ciclos/activo).
 *
 * Accesible a todos los roles del tenant — no valida permisos, eso lo
 * decide el controller (sin PermissionsGuard en esta ruta).
 *
 * Spec ref: ciclos-master-tenant/design ADR-8
 * Tarea: T3.7
 */
export class ObtenerCicloActivoUseCase {
  constructor(private readonly cicloRepo: ICicloClienteRepository) {}

  async execute(): Promise<CicloClienteEntity | null> {
    return this.cicloRepo.findActive();
  }
}
