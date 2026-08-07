import { DomainError, Result } from '../../../shared/domain/result';
import { IUsuarioClienteModuloRepository } from '../../domain/ports/i-usuario-cliente-modulo.repository';

/**
 * Input de `ObtenerModulosUsuarioTenantUseCase`. `clienteId` es OBLIGATORIO y
 * SIEMPRE lo deriva el controller de `actor.cliente_id` (JWT) — aislamiento
 * estricto (spec §5): solo se consultan los módulos dentro del cliente del
 * token.
 */
export interface ObtenerModulosUsuarioTenantInput {
  clienteId: string;
  usuarioId: string;
}

/**
 * ObtenerModulosUsuarioTenantUseCase — `GET /usuarios/:id/modulos` (feature
 * 5.2 CAPA 4). Permiso `usuario:gestionar`, enforced por el controller.
 *
 * Thin: resuelve los módulos actualmente asignados al usuario en el cliente
 * del token (`findModulosByUsuarioYCliente`) para prellenar el control de
 * asignación en el front. No falla (usuario sin módulos → `[]`).
 */
export class ObtenerModulosUsuarioTenantUseCase {
  constructor(
    private readonly modulosRepo: Pick<
      IUsuarioClienteModuloRepository,
      'findModulosByUsuarioYCliente'
    >,
  ) {}

  async execute(input: ObtenerModulosUsuarioTenantInput): Promise<Result<string[], DomainError>> {
    const modulos = await this.modulosRepo.findModulosByUsuarioYCliente(
      input.usuarioId,
      input.clienteId,
    );
    return Result.ok(modulos);
  }
}
