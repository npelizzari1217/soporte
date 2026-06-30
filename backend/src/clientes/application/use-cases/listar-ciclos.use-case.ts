import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';

/**
 * ListarCiclosUseCase — retorna todos los ciclos del tenant resuelto.
 *
 * El aislamiento de tenant es garantizado por TenantContext (inyectado en el
 * PrismaCicloClienteAdminRepository). El use case solo delega al puerto.
 *
 * Acceso: usuarios con permiso `ciclo:gestionar` (controlado por PermissionsGuard
 * en el controller). El operador accede via X-Tenant-Id → resuelto por TenantGuard.
 *
 * Spec ref: clientes-tenancy/GET /ciclos
 * Tarea: T2.8
 */
export class ListarCiclosUseCase {
  constructor(private readonly cicloRepo: ICicloClienteRepository) {}

  async execute(): Promise<CicloClienteEntity[]> {
    return this.cicloRepo.findAll();
  }
}
