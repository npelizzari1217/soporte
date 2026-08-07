import { Result } from '../../../shared/domain/result';
import { MembresiaEntity } from '../../domain/entities/membresia.entity';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IRoleRepository } from '../../domain/ports/i-role.repository';
import { MembresiaNoEncontradaError, RolNoEncontradoError } from '../../domain/errors/auth.errors';

/**
 * Input de `CambiarRolUsuarioTenantUseCase`. `clienteId` es OBLIGATORIO y
 * SIEMPRE lo deriva el controller de `actor.cliente_id` (JWT del
 * ADMINISTRADOR) — es el mecanismo de aislamiento: la búsqueda de la
 * membresía SIEMPRE está scopeada a este cliente.
 */
export interface CambiarRolUsuarioTenantInput {
  clienteId: string;
  usuarioId: string;
  rolCodigo: string;
}

export type CambiarRolUsuarioTenantError = RolNoEncontradoError | MembresiaNoEncontradaError;

/**
 * CambiarRolUsuarioTenantUseCase — `PATCH /usuarios/:id/rol` (gestión mínima
 * de usuarios, sdd/beta-frontend/spec §5). Permiso `usuario:gestionar` +
 * `rol:asignar` (ADMINISTRADOR), enforced por el controller.
 *
 * Valida el `rolCodigo` ANTES de buscar la membresía (fail-fast, mismo
 * criterio que `CrearUsuarioTenantUseCase`). Busca la membresía por
 * `(usuarioId, clienteId)` — si no existe, `MembresiaNoEncontradaError`
 * (404): un ADMINISTRADOR de otro cliente nunca distingue "usuario
 * inexistente" de "usuario existe pero en otro tenant" (aislamiento
 * estricto, spec §5).
 *
 * Ref spec: sdd/beta-frontend/spec §5.
 */
export class CambiarRolUsuarioTenantUseCase {
  constructor(
    private readonly membresiaRepo: Pick<IMembresiaRepository, 'findByUsuarioYCliente' | 'save'>,
    private readonly roleRepo: Pick<IRoleRepository, 'findByCodigo'>,
  ) {}

  async execute(
    input: CambiarRolUsuarioTenantInput,
  ): Promise<Result<MembresiaEntity, CambiarRolUsuarioTenantError>> {
    const rol = await this.roleRepo.findByCodigo(input.rolCodigo);
    if (!rol) {
      return Result.fail(new RolNoEncontradoError(input.rolCodigo));
    }

    const membresia = await this.membresiaRepo.findByUsuarioYCliente(
      input.usuarioId,
      input.clienteId,
    );
    if (!membresia) {
      return Result.fail(new MembresiaNoEncontradaError());
    }

    membresia.cambiarRol(rol.id);
    await this.membresiaRepo.save(membresia);

    return Result.ok(membresia);
  }
}
