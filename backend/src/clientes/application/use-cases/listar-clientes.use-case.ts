import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';

/**
 * ListarClientesUseCase — retorna todos los clientes activos (deleted_at IS NULL).
 *
 * Acceso: solo usuarios con `is_global_admin = true` (controlado por GlobalAdminGuard
 * en el controller, no en el use case).
 *
 * Lógica de filtrado en capa de aplicación:
 * - El repositorio devuelve todos los clientes (incluidos soft-deleted).
 * - El use case filtra por `deletedAt === null` para excluir borradores lógicos.
 *
 * Spec ref: clientes-tenancy/GET /clientes
 * Tarea: T2.3
 */
export class ListarClientesUseCase {
  constructor(private readonly clienteRepo: IClienteRepository) {}

  async execute(): Promise<ClienteEntity[]> {
    const todos = await this.clienteRepo.findAll();
    return todos.filter((c) => c.deletedAt === null);
  }
}
