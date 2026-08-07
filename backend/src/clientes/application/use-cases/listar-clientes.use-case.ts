import { DomainError, Result } from '../../../shared/domain/result';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';

/**
 * ListarClientesUseCase — lista TODOS los clientes (tenants) de la
 * plataforma. Cierra el gap G3 parcial (sdd/beta-frontend/spec §3): admin de
 * plataforma y switcher de ROOT. Restringido a ROOT en la capa de
 * presentación (`GlobalAdminGuard` en `ClientesController`, ya exclusivo de
 * `is_global_admin` para TODO el controller) — este use case no revalida el
 * actor porque no recibe ninguno (a diferencia de `CrearClienteUseCase`, que
 * sí lo hace como defensa en profundidad al mutar estado).
 *
 * Ref spec: sdd/beta-frontend/spec §3 G3 (parcial — clientes). Ref design: ADR-5.
 */
export class ListarClientesUseCase {
  constructor(private readonly clienteRepo: Pick<IClienteRepository, 'findAll'>) {}

  async execute(): Promise<Result<ClienteEntity[], DomainError>> {
    const clientes = await this.clienteRepo.findAll();
    return Result.ok(clientes);
  }
}
